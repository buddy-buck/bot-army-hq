import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { CREW_COLORS } from '../MiniBot.jsx';
import { testOn } from '../../wild/director.js';
import { Box, Cyl, LM, canvasTexture, glowMat, glyphTexture, resetBot, std, useNightGlow, usePoseOnce } from './common.jsx';
import { DJ_Z, F, FLOOR, FLOOR_LOW, FLOOR_TOP, FLOOR_Y, S, STAGE, STAGE_LOW, STAGE_Y, TABLE_Y, TABLE_Z, TILE_T, groove } from './DJLayout.js';
import { DJ_BPM, djBeat, djState, fallbackToIslandBeat, onDJChange, preloadDJ, stopDJ, tapDJ } from './djAudio.js';
import { closeSpotify, onSpotifyChange, preconnectSpotify, spotifyState } from '../../utils/spotify.js';
import Concert from './Concert.jsx';

// DJ booth on the south-east beach, next to the tiki bar (drink, then dance):
// a little stage with turntables, a mixer and two speakers that thump on the
// beat, a DJ bot in headphones, and a big light-up dance floor to the north
// where the crew dances. Music notes float up from the decks.
//
// Tap the booth: a procedurally generated lo-fi loop plays (djAudio.js) and
// everything moves on its beat: the DJ bobs harder, the floor flashes on the
// kicks, more notes fly. Tap again to stop. At night the band stage on the
// far side of the floor turns it into a concert (Concert.jsx).
// Off at bedtime (decks covered, floor dark) unless someone taps for a late
// set. ?test=concert forces the concert on.
//
// Layout and frame: DJLayout.js.

const IDLE_BPM = 100; // the imagined groove when the speakers are quiet
const TEST_CONCERT = testOn('concert');

const COLS = 9;
const ROWS = 5;
const TILE_W = (FLOOR.x1 - FLOOR.x0) / COLS;
const TILE_D = (FLOOR.z1 - FLOOR.z0) / ROWS;
const TILE_GEO = new THREE.BoxGeometry(TILE_W - 0.03, TILE_T, TILE_D - 0.03);
const TILE_MAT = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const TILE_COLORS = ['#ff5fa2', '#ffd23f', '#38d6c6', '#9b7bff', '#ff8a3d', '#4aa8ff'].map((c) => new THREE.Color(c));
const TILE_OFF = new THREE.Color('#2b2a35');
// Invisible, generous tap target around the booth.
const HIT_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });

const M = {
  stage: std('#3a3346'),
  booth: std('#2a2733'),
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
const NOTE_MAX = 12;

// Dancers on the floor (local x, z) and their moves, spread out over the
// big floor with room between them. The first five dance on low-power
// devices too.
const DANCERS = [
  { x: -0.95, z: -0.2, color: CREW_COLORS[5], move: 'bounce', ph: 0 },
  { x: 0.05, z: -0.25, color: CREW_COLORS[2], move: 'wave', ph: 0.25 },
  { x: 1.0, z: -0.15, color: CREW_COLORS[4], move: 'robot', ph: 0.75 },
  { x: -0.5, z: 0.55, color: CREW_COLORS[9], move: 'spin', ph: 0.5 },
  { x: 0.6, z: 0.6, color: CREW_COLORS[6], move: 'bounce', ph: 0.4 },
  { x: -1.75, z: 0.25, color: CREW_COLORS[3], move: 'wave', ph: 0.6 },
  { x: 1.8, z: 0.3, color: CREW_COLORS[8], move: 'robot', ph: 0.15 },
  { x: -1.3, z: 1.3, color: CREW_COLORS[0], move: 'spin', ph: 0.9 },
  { x: 0.05, z: 1.35, color: CREW_COLORS[7], move: 'bounce', ph: 0.3 },
  { x: 1.3, z: 1.25, color: CREW_COLORS[1], move: 'wave', ph: 0.85 },
];

const SPEAKER_Z = -1.3;
function Speaker({ x, coneRefs, i }) {
  return (
    <group position={[x, STAGE_Y, SPEAKER_Z]}>
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

// Kick envelope on the music's actual kicks (beats 0 and 2.5, plus 1.75 on
// odd bars, see djAudio.js), or on every beat for the idle groove.
function kickPulse(b, music) {
  if (!music) return Math.exp(-(b % 1) * 6);
  const bb = b % 4;
  const odd = Math.floor(b / 4) % 2 === 1;
  let last = 0;
  if (odd && bb >= 1.75) last = 1.75;
  if (bb >= 2.5) last = 2.5;
  return Math.exp(-(bb - last) * 5);
}

const onOver = (e) => {
  e.stopPropagation();
  document.body.style.cursor = 'pointer';
};
const onOut = () => {
  document.body.style.cursor = '';
};

export default function DJBooth({ animate, night, bedtime, lowPower }) {
  const [beat, setBeat] = useState(djState.playing);
  const [spotify, setSpotify] = useState(spotifyState.open);
  useEffect(() => {
    preloadDJ();
    const warm = () => preconnectSpotify();
    window.addEventListener('pointerdown', warm, { once: true, passive: true });
    const off = onDJChange(setBeat);
    const offS = onSpotifyChange((st) => setSpotify(st.open));
    // The Spotify player couldn't load (or "Island beat" was tapped).
    window.addEventListener('island:dj-beat', fallbackToIslandBeat);
    return () => {
      off();
      offS();
      window.removeEventListener('island:dj-beat', fallbackToIslandBeat);
      window.removeEventListener('pointerdown', warm);
      if (djState.playing) stopDJ(); // nobody left to switch it off
      closeSpotify();
    };
  }, []);
  // Music is on: the island beat, or the Spotify player is open.
  const music = beat || spotify;

  // At bedtime the booth is closed... unless someone taps it for a late set.
  const live = !bedtime || music || TEST_CONCERT;
  const concert = TEST_CONCERT || night > 0.5;
  const mode = !concert ? 'off' : live ? 'full' : 'late';
  const nDancers = lowPower ? 5 : DANCERS.length;

  const dj = useRef({});
  const dancers = useRef([]);
  const phones = useRef();
  const decks = [useRef(), useRef()];
  const cones = useRef([]);
  const tiles = useRef();
  const beams = [useRef(), useRef(), useRef()];
  const notes = useRef([]);
  const lastBeat = useRef(-1);
  const col = useMemo(() => new THREE.Color(), []);
  if (dancers.current.length !== DANCERS.length) dancers.current = DANCERS.map(() => ({ current: {} }));

  const trimMat = useNightGlow('#ff5fa2', live ? night : 0, live ? 0.4 : 0.05, 1.4);
  const knobMat = useNightGlow('#38d6c6', live ? night : 0, live ? 0.6 : 0.05, 1.4);
  const signMat = useMemo(() => new THREE.MeshBasicMaterial({ map: signTexture(), toneMapped: false }), []);
  const beamMats = useMemo(() => ['#ff5fa2', '#38d6c6', '#ffd23f'].map((c) => glowMat(c, 0.1)), []);
  const noteMats = useMemo(
    () =>
      Array.from({ length: NOTE_MAX }, (_, i) =>
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
  }, [live]);

  usePoseOnce(animate, bedtime, night, music, mode);

  useFrame((state) => {
    // Frozen at a nice mid-groove moment with reduced motion.
    const t = animate ? state.clock.elapsedTime : 3.37;
    // The island beat is synced to its audio clock; Spotify can't be read,
    // so the crew just grooves along at the same tempo.
    const mb = beat && animate ? djBeat() : spotify && animate ? (t * DJ_BPM) / 60 : -1;
    const playing = mb >= 0;
    const b = playing ? mb : (t * IDLE_BPM) / 60; // beats
    const pulse = kickPulse(b, playing);
    const bar = Math.floor(b / 4);
    groove.t = t;
    groove.b = b;
    groove.pulse = pulse;
    groove.music = playing;
    const kick = playing ? 1.6 : 1;

    // Speakers thump.
    for (let i = 0; i < cones.current.length; i++) {
      const c = cones.current[i];
      if (c) c.scale.setScalar(live ? 1 + pulse * (i % 2 ? 0.08 : 0.16) * kick : 1);
    }
    // Records spin.
    for (let i = 0; i < 2; i++) if (decks[i].current) decks[i].current.rotation.y = live ? -t * 3.5 * (i ? 1 : 0.97) : 0;

    // Dance floor tiles: a new pattern each beat; with the music on the whole
    // floor also flashes on the kicks.
    TILE_MAT.color.setScalar(playing ? 0.55 + 0.6 * pulse : 1);
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
            const ring = Math.max(Math.abs(c - (COLS - 1) / 2), Math.abs(r - (ROWS - 1) / 2));
            on = ring === beatI % 4;
            k = (ring + bar) % TILE_COLORS.length;
          }
          col.copy(TILE_COLORS[k]).multiplyScalar(on ? level : 0.18 + 0.1 * (1 - night));
          m.setColorAt(i, col);
        }
      }
      m.instanceColor.needsUpdate = true;
    }

    // Light beams from the booth truss sweep over the floor, stronger at night.
    for (let i = 0; i < 3; i++) {
      const bm = beams[i].current;
      if (!bm) continue;
      bm.visible = live;
      bm.rotation.x = -0.5 - Math.sin(t * 0.9 + i * 2.1) * 0.22;
      bm.rotation.z = Math.sin(t * 0.7 + i * 1.3) * 0.35;
      beamMats[i].opacity = (0.05 + 0.25 * night) * (0.75 + pulse * 0.25);
    }

    // DJ: bobbing to the beat (harder with the music on), right hand
    // scratching, left on the mixer, both hands up on the first beat of every
    // eighth bar.
    const p = dj.current;
    if (resetBot(p)) {
      p.root.visible = live;
      if (live) {
        const drop = bar % 8 === 0 && b % 4 < 2;
        p.pose.position.y = pulse * 0.03 * (playing ? 2.2 : 1);
        p.pose.rotation.x = 0.1 + (playing ? pulse * 0.12 : 0);
        p.pose.rotation.z = playing ? Math.sin(b * Math.PI * 0.5) * 0.07 : 0;
        p.head.rotation.x = 0.1 + pulse * (playing ? 0.42 : 0.22);
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

    // Dancers face the DJ by day and turn to the band during the concert.
    const face = mode === 'full' ? 0 : Math.PI;
    for (let i = 0; i < nDancers; i++) {
      const q = dancers.current[i].current;
      if (!resetBot(q)) continue;
      q.root.visible = live;
      if (!live) continue;
      const d = DANCERS[i];
      const lb = b + d.ph * 4;
      const lf = lb % 1;
      const lp = Math.exp(-lf * 5);
      q.root.position.y = FLOOR_TOP;
      q.root.rotation.y = face;
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
          q.root.rotation.y = face + s * s * (3 - 2 * s) * Math.PI * 2;
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

    // Music notes drift up from the decks and fade; more and faster with
    // the music on.
    const notesN = playing ? (lowPower ? 6 : NOTE_MAX) : lowPower ? 3 : 6;
    const life = playing ? 2.6 : 3.4;
    for (let i = 0; i < notes.current.length; i++) {
      const s = notes.current[i];
      if (!s) continue;
      if (!live || i >= notesN) {
        s.visible = false;
        continue;
      }
      const u = (t / life + i / notesN) % 1;
      const side = i % 2 ? 1 : -1;
      const seed = i * 1.618;
      s.visible = true;
      s.position.set(side * (0.35 + u * 0.6) + Math.sin(u * 6 + seed) * 0.18, TABLE_Y + 0.25 + u * 1.7, TABLE_Z + u * 0.8 + Math.cos(u * 4 + seed) * 0.12);
      const grow = Math.min(1, u * 6) * (1 - Math.max(0, (u - 0.7) / 0.3));
      s.scale.setScalar((playing ? 0.3 : 0.24) * grow + 0.02);
      s.material.opacity = grow;
      s.material.rotation = Math.sin(u * 5 + seed) * 0.35;
    }
  });

  const truss = STAGE_Y + 1.55;
  const trussZ = STAGE.z0 + 0.2;
  return (
    <group position={[F.x, 0, F.z]} rotation={[0, F.rotY, 0]}>
      {/* stage under the booth */}
      <Box p={[0, (STAGE_Y + STAGE_LOW) / 2, (STAGE.z0 + STAGE.z1) / 2]} s={[STAGE.x1 - STAGE.x0, STAGE_Y - STAGE_LOW, STAGE.z1 - STAGE.z0]} m={M.stage} />
      <Box p={[0, STAGE_Y - 0.03, STAGE.z1 + 0.02]} s={[STAGE.x1 - STAGE.x0 + 0.02, 0.05, 0.04]} m={trimMat} />

      {/* booth: a deck table with a glowing trim facing the dancers */}
      <Box p={[0, STAGE_Y + (TABLE_Y - STAGE_Y) / 2 - 0.02, TABLE_Z]} s={[1.5, TABLE_Y - STAGE_Y - 0.04, 0.42]} m={M.booth} />
      <Box p={[0, TABLE_Y - 0.02, TABLE_Z]} s={[1.6, 0.05, 0.5]} m={LM.dark} />
      <Box p={[0, STAGE_Y + 0.28, TABLE_Z + 0.215]} s={[1.3, 0.06, 0.02]} m={trimMat} />
      <mesh position={[0, STAGE_Y + 0.15, TABLE_Z + 0.22]} material={signMat}>
        <planeGeometry args={[1.1, 0.27]} />
      </mesh>
      {/* turntables and mixer */}
      {[-0.45, 0.45].map((x, i) => (
        <group key={x} position={[x, TABLE_Y, TABLE_Z - 0.03]}>
          <Box p={[0, 0.02, 0]} s={[0.42, 0.04, 0.38]} m={M.platter} />
          <group ref={decks[i]} position={[0, 0.05, 0]}>
            <Cyl p={[0, 0, 0]} rt={0.16} h={0.015} m={M.vinyl} seg={14} />
            <Cyl p={[0.06, 0.009, 0]} rt={0.045} h={0.01} m={M.label} seg={8} />
          </group>
          <Box p={[0.15, 0.07, -0.12]} s={[0.025, 0.02, 0.18]} r={[0, 0.4, 0]} m={LM.chrome} />
        </group>
      ))}
      <Box p={[0, TABLE_Y + 0.035, TABLE_Z - 0.03]} s={[0.3, 0.07, 0.34]} m={LM.dark} />
      {[-0.08, 0, 0.08].map((x) => (
        <mesh key={x} position={[x, TABLE_Y + 0.08, TABLE_Z + 0.03]} material={knobMat}>
          <cylinderGeometry args={[0.02, 0.02, 0.03, 6]} />
        </mesh>
      ))}
      {/* the decks get a cover at bedtime */}
      {!live && <Box p={[0, TABLE_Y + 0.08, TABLE_Z - 0.02]} s={[1.5, 0.14, 0.46]} m={M.cover} />}

      <Speaker x={-1.22} coneRefs={cones} i={0} />
      <Speaker x={1.22} coneRefs={cones} i={1} />

      {/* light truss (kept low so it doesn't hide the floor from the south)
          with a sign for the dancers and three sweeping beams */}
      {[-1.42, 1.42].map((x) => (
        <Cyl key={x} p={[x, (STAGE_Y + truss) / 2, trussZ]} rt={0.04} h={truss - STAGE_Y} m={M.truss} />
      ))}
      <Box p={[0, truss, trussZ]} s={[2.92, 0.08, 0.08]} m={M.truss} />
      <mesh position={[0, truss + 0.2, trussZ + 0.01]} material={signMat}>
        <planeGeometry args={[1.2, 0.3]} />
      </mesh>
      {[-0.9, 0, 0.9].map((x, i) => (
        <group key={x} position={[x, truss - 0.06, trussZ]}>
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
          <mesh position={[0, 0.06, 0]} material={M.phones}>
            <torusGeometry args={[0.2, 0.022, 4, 12, Math.PI]} />
          </mesh>
          {[-0.2, 0.2].map((x) => (
            <mesh key={x} position={[x, 0.03, 0]} rotation={[0, 0, Math.PI / 2]} material={M.cushion}>
              <cylinderGeometry args={[0.065, 0.065, 0.05, 8]} />
            </mesh>
          ))}
        </group>
      </MiniBot>

      {/* tap the booth: Spotify player (or the island beat) on / off */}
      <mesh
        position={[0, STAGE_Y + 0.9, (STAGE.z0 + STAGE.z1) / 2]}
        material={HIT_MAT}
        onClick={(e) => {
          if (e.delta > 8) return;
          e.stopPropagation();
          tapDJ();
        }}
        onPointerOver={onOver}
        onPointerOut={onOut}
      >
        <boxGeometry args={[3.5, 2.1, 1.5]} />
      </mesh>

      {/* dance floor */}
      <Box p={[0, (FLOOR_Y - TILE_T / 2 + FLOOR_LOW) / 2, (FLOOR.z0 + FLOOR.z1) / 2]} s={[FLOOR.x1 - FLOOR.x0 + 0.08, FLOOR_Y - TILE_T / 2 - FLOOR_LOW, FLOOR.z1 - FLOOR.z0 + 0.08]} m={M.stage} />
      <instancedMesh ref={tiles} args={[TILE_GEO, TILE_MAT, COLS * ROWS]} />
      {DANCERS.slice(0, nDancers).map((d, i) => (
        <MiniBot key={i} color={d.color} parts={dancers.current[i]} position={[d.x, FLOOR_TOP, d.z]} rotationY={Math.PI} scale={S} />
      ))}

      {/* music notes */}
      {noteMats.map((m, i) => (
        <sprite key={i} ref={(el) => (notes.current[i] = el)} material={m} visible={false} />
      ))}

      {/* the band stage on the far side of the floor (concert at night) */}
      <Concert mode={mode} night={night} animate={animate} lowPower={lowPower} />
    </group>
  );
}
