import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { CREW_COLORS } from '../MiniBot.jsx';
import { BOT_SCALE } from '../../components/Bot.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import { Box, Cyl, LM, canvasTexture, glowMat, glyphTexture, resetBot, std, toWorld, useNightGlow, usePoseOnce } from './common.jsx';

// DJ booth on the south beach: a little stage with turntables, a mixer and
// two speakers that thump on the beat, a DJ bot in headphones, and a light-up
// dance floor to the north where a few crew bots dance. Music notes float up
// from the decks. Off at bedtime: the decks get a cover and the floor goes dark.

// Local frame: +z points north (toward the dance floor), so the default south
// camera looks over the DJ's shoulder at the dancers' faces.
const F = { x: SITES.dj.x, z: SITES.dj.z - 0.35, rotY: Math.PI + 0.12 };
const BPM = 120;
const S = BOT_SCALE;

// Highest ground under a local rectangle, so platforms never get poked through.
function maxGround(x0, x1, z0, z1) {
  let m = 0;
  for (let lx = x0; lx <= x1 + 1e-6; lx += (x1 - x0) / 8) {
    for (let lz = z0; lz <= z1 + 1e-6; lz += (z1 - z0) / 8) {
      const [x, z] = toWorld(F, lx, lz);
      m = Math.max(m, groundY(x, z));
    }
  }
  return m;
}
function minGround(x0, x1, z0, z1) {
  let m = Infinity;
  for (let lx = x0; lx <= x1 + 1e-6; lx += (x1 - x0) / 8) {
    for (let lz = z0; lz <= z1 + 1e-6; lz += (z1 - z0) / 8) {
      const [x, z] = toWorld(F, lx, lz);
      m = Math.min(m, groundY(x, z));
    }
  }
  return m;
}

// Stage (booth + DJ) and dance floor footprints in local units.
const STAGE = { x0: -1.6, x1: 1.6, z0: -1.65, z1: -0.5 };
const FLOOR = { x0: -1.05, x1: 1.05, z0: -0.2, z1: 1.2 };
const STAGE_Y = maxGround(STAGE.x0, STAGE.x1, STAGE.z0, STAGE.z1) + 0.1;
const STAGE_LOW = minGround(STAGE.x0, STAGE.x1, STAGE.z0, STAGE.z1) - 0.08;
const FLOOR_Y = maxGround(FLOOR.x0, FLOOR.x1, FLOOR.z0, FLOOR.z1) + 0.06;
const FLOOR_LOW = minGround(FLOOR.x0, FLOOR.x1, FLOOR.z0, FLOOR.z1) - 0.08;
const TILE_T = 0.04;
const FLOOR_TOP = FLOOR_Y + TILE_T / 2;
const TABLE_Y = STAGE_Y + 0.5; // deck height: the DJ's hands rest on it
const DJ_Z = -1.3;

const COLS = 5;
const ROWS = 4;
const TILE_W = (FLOOR.x1 - FLOOR.x0) / COLS;
const TILE_D = (FLOOR.z1 - FLOOR.z0) / ROWS;
const TILE_GEO = new THREE.BoxGeometry(TILE_W - 0.03, TILE_T, TILE_D - 0.03);
const TILE_MAT = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const TILE_COLORS = ['#ff5fa2', '#ffd23f', '#38d6c6', '#9b7bff', '#ff8a3d', '#4aa8ff'].map((c) => new THREE.Color(c));
const TILE_OFF = new THREE.Color('#2b2a35');

const M = {
  stage: std('#3a3346'),
  booth: std('#2a2733'),
  boothTrim: std('#ff5fa2'),
  speaker: std('#24222b'),
  cone: std('#4a4756', { roughness: 0.5 }),
  vinyl: std('#121216', { roughness: 0.35 }),
  label: std('#ffd23f'),
  platter: std('#9aa0a8', { roughness: 0.4, metalness: 0.4 }),
  cover: std('#3d6b8f', { roughness: 1 }),
  phones: std('#1e1e24'),
  cushion: std('#ff5fa2'),
  truss: std('#c9ccd2', { roughness: 0.4, metalness: 0.5 }),
};

// Glowing panel on the booth front and the sign on the truss.
function signTexture() {
  return canvasTexture('dj-sign', 256, 64, (g, w, h) => {
    g.fillStyle = '#1b1830';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ff5fa2';
    g.lineWidth = 6;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.font = 'bold 36px "Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#7fe3ff';
    g.fillText('♪ BEACH BEATS ♫', w / 2, h / 2 + 2);
  });
}

const NOTE_GLYPHS = ['♪', '♫', '♬', '♪', '♫'];
const NOTE_COLORS = ['#ff5fa2', '#ffd23f', '#38d6c6', '#9b7bff', '#ff8a3d', '#7fe3ff'];
const NOTE_LIFE = 3.4;

// Dancers on the floor (local x, z) and their moves.
const DANCERS = [
  { x: -0.55, z: 0.2, color: CREW_COLORS[5], move: 'bounce', ph: 0 },
  { x: 0.5, z: 0.3, color: CREW_COLORS[2], move: 'wave', ph: 0.25 },
  { x: -0.4, z: 0.9, color: CREW_COLORS[4], move: 'spin', ph: 0.5 },
  { x: 0.55, z: 0.92, color: CREW_COLORS[6], move: 'robot', ph: 0.75 },
];

function Speaker({ x, coneRefs, i }) {
  return (
    <group position={[x, STAGE_Y, -0.95]}>
      <Box p={[0, 0.48, 0]} s={[0.42, 0.96, 0.38]} m={M.speaker} />
      <group ref={(el) => (coneRefs.current[i * 2] = el)} position={[0, 0.3, 0.195]}>
        <Cyl p={[0, 0, 0]} rt={0.15} rb={0.15} h={0.02} m={M.cone} seg={10} r={[Math.PI / 2, 0, 0]} />
        <Cyl p={[0, 0, 0.015]} rt={0.05} rb={0.05} h={0.02} m={LM.dark} seg={8} r={[Math.PI / 2, 0, 0]} />
      </group>
      <group ref={(el) => (coneRefs.current[i * 2 + 1] = el)} position={[0, 0.72, 0.195]}>
        <Cyl p={[0, 0, 0]} rt={0.08} rb={0.08} h={0.02} m={M.cone} seg={8} r={[Math.PI / 2, 0, 0]} />
      </group>
    </group>
  );
}

export default function DJBooth({ animate, night, bedtime, lowPower }) {
  const live = !bedtime;
  const notesN = lowPower ? 5 : 10;

  const dj = useRef({});
  const dancers = [useRef({}), useRef({}), useRef({}), useRef({})];
  const phones = useRef();
  const decks = [useRef(), useRef()];
  const cones = useRef([]);
  const tiles = useRef();
  const beams = [useRef(), useRef(), useRef()];
  const notes = useRef([]);
  const lastBeat = useRef(-1);
  const col = useMemo(() => new THREE.Color(), []);

  const trimMat = useNightGlow('#ff5fa2', live ? night : 0, live ? 0.4 : 0.05, 1.4);
  const knobMat = useNightGlow('#38d6c6', live ? night : 0, live ? 0.6 : 0.05, 1.4);
  const signMat = useMemo(() => new THREE.MeshBasicMaterial({ map: signTexture(), toneMapped: false }), []);
  const beamMats = useMemo(() => ['#ff5fa2', '#38d6c6', '#ffd23f'].map((c) => glowMat(c, 0.1)), []);
  const noteMats = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) =>
        new THREE.SpriteMaterial({ map: glyphTexture(NOTE_GLYPHS[i % NOTE_GLYPHS.length], NOTE_COLORS[i % NOTE_COLORS.length]), transparent: true, depthWrite: false, fog: false })
      ),
    []
  );
  useEffect(() => () => [signMat, ...beamMats, ...noteMats].forEach((m) => m.dispose()), [signMat, beamMats, noteMats]);

  // Tiles need a color slot each before the first frame.
  useLayoutEffect(() => {
    const m = tiles.current;
    if (!m) return;
    const d = new THREE.Object3D();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        d.position.set(FLOOR.x0 + (c + 0.5) * TILE_W, FLOOR_Y, FLOOR.z0 + (r + 0.5) * TILE_D);
        d.updateMatrix();
        m.setMatrixAt(i, d.matrix);
        m.setColorAt(i, TILE_OFF);
      }
    }
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.needsUpdate = true;
    lastBeat.current = -1;
  }, [bedtime]);

  usePoseOnce(animate, bedtime, night);

  useFrame((state) => {
    // Frozen at a nice mid-groove moment with reduced motion.
    const t = animate ? state.clock.elapsedTime : 3.37;
    const b = (t * BPM) / 60; // beats
    const f = b % 1;
    const pulse = Math.exp(-f * 6); // kick on every beat
    const bar = Math.floor(b / 4);

    // Speakers thump.
    for (let i = 0; i < cones.current.length; i++) {
      const c = cones.current[i];
      if (c) c.scale.setScalar(live ? 1 + pulse * (i % 2 ? 0.08 : 0.16) : 1);
    }
    // Records spin.
    for (let i = 0; i < 2; i++) if (decks[i].current) decks[i].current.rotation.y = live ? -t * 3.5 * (i ? 1 : 0.97) : 0;

    // Dance floor tiles: a new pattern each beat.
    const beatI = Math.floor(b);
    const m = tiles.current;
    if (m && beatI !== lastBeat.current) {
      lastBeat.current = beatI;
      const level = 0.55 + 0.45 * night;
      const pattern = bar % 3;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const i = r * COLS + c;
          if (!live) {
            m.setColorAt(i, TILE_OFF);
            continue;
          }
          let k;
          let on = true;
          if (pattern === 0) {
            on = (r + c + beatI) % 2 === 0;
            k = (beatI + r) % TILE_COLORS.length;
          } else if (pattern === 1) {
            k = (c + beatI) % TILE_COLORS.length;
          } else {
            const ring = Math.max(Math.abs(c - 2), Math.abs(r - 1.5) | 0);
            on = ring === beatI % 3;
            k = (ring + bar) % TILE_COLORS.length;
          }
          col.copy(TILE_COLORS[k]).multiplyScalar(on ? level : 0.18 + 0.1 * (1 - night));
          m.setColorAt(i, col);
        }
      }
      m.instanceColor.needsUpdate = true;
    }

    // Light beams sweep over the floor, stronger at night.
    for (let i = 0; i < 3; i++) {
      const bm = beams[i].current;
      if (!bm) continue;
      bm.visible = live;
      bm.rotation.x = 0.35 + Math.sin(t * 0.9 + i * 2.1) * 0.25;
      bm.rotation.z = Math.sin(t * 0.7 + i * 1.3) * 0.35;
      beamMats[i].opacity = (0.05 + 0.2 * night) * (0.75 + pulse * 0.25);
    }

    // DJ: bobbing to the beat, right hand scratching, left on the mixer,
    // both hands up on the first beat of every eighth bar.
    const p = dj.current;
    if (resetBot(p)) {
      p.root.visible = live;
      if (live) {
        const drop = bar % 8 === 0 && b % 4 < 2;
        p.pose.position.y = pulse * 0.03;
        p.pose.rotation.x = 0.1;
        p.head.rotation.x = 0.1 + pulse * 0.22;
        p.head.rotation.z = Math.sin(b * Math.PI * 0.5) * 0.08;
        if (drop) {
          p.armL.rotation.z = -2.6;
          p.armR.rotation.z = 2.6;
          p.armL.rotation.x = Math.sin(t * 8) * 0.15;
          p.armR.rotation.x = -Math.sin(t * 8) * 0.15;
        } else {
          p.armR.rotation.x = -1.05;
          p.armR.rotation.z = 0.25 + Math.sin(t * 14) * 0.12 * (Math.sin(b * Math.PI) > 0 ? 1 : 0.2);
          p.armL.rotation.x = -1.0 + Math.sin(t * 1.3) * 0.08;
          p.armL.rotation.z = -0.15;
        }
        if (phones.current) phones.current.rotation.copy(p.head.rotation);
      }
    }

    // Dancers.
    for (let i = 0; i < 4; i++) {
      const q = dancers[i].current;
      if (!resetBot(q)) continue;
      q.root.visible = live;
      if (!live) continue;
      const d = DANCERS[i];
      const lb = b + d.ph * 4;
      const lf = lb % 1;
      const lp = Math.exp(-lf * 5);
      q.root.position.y = FLOOR_TOP;
      q.root.rotation.y = Math.PI;
      if (d.move === 'bounce') {
        // hop on the beat, fists pumping
        q.root.position.y += Math.sin(lf * Math.PI) * 0.12;
        q.armL.rotation.z = -2.4;
        q.armR.rotation.z = 2.4;
        q.armL.rotation.x = -0.3 + lp * 0.4;
        q.armR.rotation.x = -0.3 + lp * 0.4;
        q.head.rotation.x = lp * 0.2;
      } else if (d.move === 'wave') {
        // side-to-side sway, arms waving overhead
        const sway = Math.sin(lb * Math.PI * 0.5);
        q.pose.rotation.z = sway * 0.18;
        q.root.position.y += Math.abs(Math.sin(lb * Math.PI)) * 0.04;
        q.armL.rotation.z = -2.2 - sway * 0.4;
        q.armR.rotation.z = 2.2 - sway * 0.4;
        q.head.rotation.z = -sway * 0.15;
        q.footL.position.y = 0.06 + Math.max(0, sway) * 0.05;
        q.footR.position.y = 0.06 + Math.max(0, -sway) * 0.05;
      } else if (d.move === 'spin') {
        // groove for three bars, then a happy spin with a hop
        const k = (lb % 16) / 16;
        if (k > 0.75) {
          const s = (k - 0.75) / 0.25;
          q.root.rotation.y = Math.PI + s * s * (3 - 2 * s) * Math.PI * 2;
          q.root.position.y += Math.sin(s * Math.PI) * 0.18;
          q.armL.rotation.z = -1.4;
          q.armR.rotation.z = 1.4;
        } else {
          q.root.position.y += Math.abs(Math.sin(lb * Math.PI)) * 0.05;
          q.pose.rotation.y = Math.sin(lb * Math.PI * 0.5) * 0.3;
          q.armL.rotation.x = -0.9 + Math.sin(lb * Math.PI) * 0.4;
          q.armR.rotation.x = -0.9 - Math.sin(lb * Math.PI) * 0.4;
        }
      } else {
        // the robot: stiff arms snapping to a new angle every beat
        const step = Math.floor(lb) % 4;
        const snap = Math.min(1, lf * 8);
        const A = [-1.57, 0, -1.57, -0.8];
        const B = [0, -1.57, -0.8, -1.57];
        q.armL.rotation.x = A[step] * snap + A[(step + 3) % 4] * (1 - snap);
        q.armR.rotation.x = B[step] * snap + B[(step + 3) % 4] * (1 - snap);
        q.head.rotation.y = (step % 2 ? 0.35 : -0.35) * snap;
        q.pose.rotation.y = (step < 2 ? 0.25 : -0.25) * snap;
      }
    }

    // Music notes drift up from the decks and fade.
    for (let i = 0; i < notes.current.length; i++) {
      const s = notes.current[i];
      if (!s) continue;
      if (!live || i >= notesN) {
        s.visible = false;
        continue;
      }
      const u = (t / NOTE_LIFE + i / notesN) % 1;
      const side = i % 2 ? 1 : -1;
      const seed = i * 1.618;
      s.visible = true;
      s.position.set(side * (0.35 + u * 0.6) + Math.sin(u * 6 + seed) * 0.18, TABLE_Y + 0.25 + u * 1.7, -0.75 + u * 0.7 + Math.cos(u * 4 + seed) * 0.12);
      const grow = Math.min(1, u * 6) * (1 - Math.max(0, (u - 0.7) / 0.3));
      s.scale.setScalar(0.26 * grow + 0.02);
      s.material.opacity = grow;
      s.material.rotation = Math.sin(u * 5 + seed) * 0.35;
    }
  });

  const truss = STAGE_Y + 2.0;
  return (
    <group position={[F.x, 0, F.z]} rotation={[0, F.rotY, 0]}>
      {/* stage under the booth */}
      <Box p={[0, (STAGE_Y + STAGE_LOW) / 2, (STAGE.z0 + STAGE.z1) / 2]} s={[STAGE.x1 - STAGE.x0, STAGE_Y - STAGE_LOW, STAGE.z1 - STAGE.z0]} m={M.stage} />
      <Box p={[0, STAGE_Y - 0.03, STAGE.z1 + 0.02]} s={[STAGE.x1 - STAGE.x0 + 0.02, 0.05, 0.04]} m={trimMat} />

      {/* booth: a deck table with a glowing trim facing the dancers */}
      <Box p={[0, STAGE_Y + (TABLE_Y - STAGE_Y) / 2 - 0.02, -0.75]} s={[1.5, TABLE_Y - STAGE_Y - 0.04, 0.42]} m={M.booth} />
      <Box p={[0, TABLE_Y - 0.02, -0.75]} s={[1.6, 0.05, 0.5]} m={LM.dark} />
      <Box p={[0, STAGE_Y + 0.28, -0.535]} s={[1.3, 0.06, 0.02]} m={trimMat} />
      <mesh position={[0, STAGE_Y + 0.15, -0.53]} material={signMat}>
        <planeGeometry args={[1.1, 0.27]} />
      </mesh>
      {/* turntables and mixer */}
      {[-0.45, 0.45].map((x, i) => (
        <group key={x} position={[x, TABLE_Y, -0.78]}>
          <Box p={[0, 0.02, 0]} s={[0.42, 0.04, 0.38]} m={M.platter} />
          <group ref={decks[i]} position={[0, 0.05, 0]}>
            <Cyl p={[0, 0, 0]} rt={0.16} h={0.015} m={M.vinyl} seg={14} />
            <Cyl p={[0.06, 0.009, 0]} rt={0.045} h={0.01} m={M.label} seg={8} />
          </group>
          <Box p={[0.15, 0.07, -0.12]} s={[0.025, 0.02, 0.18]} r={[0, 0.4, 0]} m={LM.chrome} />
        </group>
      ))}
      <Box p={[0, TABLE_Y + 0.035, -0.78]} s={[0.3, 0.07, 0.34]} m={LM.dark} />
      {[-0.08, 0, 0.08].map((x) => (
        <mesh key={x} position={[x, TABLE_Y + 0.08, -0.72]} material={knobMat}>
          <cylinderGeometry args={[0.02, 0.02, 0.03, 6]} />
        </mesh>
      ))}
      {/* the decks get a cover at bedtime */}
      {!live && <Box p={[0, TABLE_Y + 0.08, -0.77]} s={[1.5, 0.14, 0.46]} m={M.cover} />}

      <Speaker x={-1.3} coneRefs={cones} i={0} />
      <Speaker x={1.3} coneRefs={cones} i={1} />

      {/* light truss with a sign and three sweeping beams */}
      {[-1.5, 1.5].map((x) => (
        <Cyl key={x} p={[x, (STAGE_Y + truss) / 2, -1.45]} rt={0.04} h={truss - STAGE_Y} m={M.truss} />
      ))}
      <Box p={[0, truss, -1.45]} s={[3.1, 0.08, 0.08]} m={M.truss} />
      <mesh position={[0, truss + 0.22, -1.45]} rotation={[0, Math.PI, 0]} material={signMat}>
        <planeGeometry args={[1.5, 0.375]} />
      </mesh>
      <mesh position={[0, truss + 0.22, -1.44]} material={signMat}>
        <planeGeometry args={[1.5, 0.375]} />
      </mesh>
      {[-0.9, 0, 0.9].map((x, i) => (
        <group key={x} position={[x, truss - 0.06, -1.45]}>
          <Cyl p={[0, -0.05, 0]} rt={0.06} rb={0.08} h={0.12} m={LM.dark} seg={8} />
          <group ref={beams[i]}>
            <mesh position={[0, -1.05, 0]} material={beamMats[i]}>
              <coneGeometry args={[0.38, 2.0, 12, 1, true]} />
            </mesh>
          </group>
        </group>
      ))}

      {/* the DJ, with headphones */}
      <MiniBot color={CREW_COLORS[1]} parts={dj} position={[0, STAGE_Y, DJ_Z]} rotationY={0} scale={S}>
        <group ref={phones} position={[0, 0.74, 0]}>
          <mesh position={[0, 0.06, 0]} rotation={[0, 0, 0]} material={M.phones}>
            <torusGeometry args={[0.2, 0.022, 4, 12, Math.PI]} />
          </mesh>
          {[-0.2, 0.2].map((x) => (
            <mesh key={x} position={[x, 0.03, 0]} rotation={[0, 0, Math.PI / 2]} material={M.cushion}>
              <cylinderGeometry args={[0.065, 0.065, 0.05, 8]} />
            </mesh>
          ))}
        </group>
      </MiniBot>

      {/* dance floor */}
      <Box p={[0, (FLOOR_Y - TILE_T / 2 + FLOOR_LOW) / 2, (FLOOR.z0 + FLOOR.z1) / 2]} s={[FLOOR.x1 - FLOOR.x0 + 0.08, FLOOR_Y - TILE_T / 2 - FLOOR_LOW, FLOOR.z1 - FLOOR.z0 + 0.08]} m={M.stage} />
      <instancedMesh ref={tiles} args={[TILE_GEO, TILE_MAT, COLS * ROWS]} />
      {DANCERS.map((d, i) => (
        <MiniBot key={i} color={d.color} parts={dancers[i]} position={[d.x, FLOOR_TOP, d.z]} rotationY={Math.PI} scale={S} />
      ))}

      {/* music notes */}
      {noteMats.map((m, i) => (
        <sprite key={i} ref={(el) => (notes.current[i] = el)} material={m} visible={false} />
      ))}
    </group>
  );
}
