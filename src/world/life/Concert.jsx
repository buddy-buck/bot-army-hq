import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { CREW_COLORS } from '../MiniBot.jsx';
import { Box, Cyl, LM, SIT_DROP, canvasTexture, glowMat, resetBot, sitPose, smooth, std, useNightGlow } from './common.jsx';
import { BAND, BAND_LOW, BAND_Y, FLOOR, FLOOR_TOP, S, groove, localGround } from './DJLayout.js';

// The night concert at the DJ booth: a small band stage on the north side of
// the dance floor, facing south (toward the dancers and the default camera).
// The stage, drum kit, amp and sign are always there. When it's dark the band
// shows up (guitar, keytar, drums), colored spotlights sweep the crowd and a
// few more crew bots gather beside the floor to watch. At bedtime it winds
// down to one guitarist strumming quietly on the edge of the stage.
//
// mode: 'off' (day) | 'full' (concert) | 'late' (bedtime wind-down)
// Rendered inside DJBooth's local group (same frame, see DJLayout.js).

const M = {
  stage: std('#3a3346'),
  drum: std('#e5533d'),
  drumHead: std('#f4efe6', { roughness: 0.7 }),
  cymbal: std('#e2b84a', { roughness: 0.35, metalness: 0.6 }),
  stand: std('#9aa0a8', { roughness: 0.4, metalness: 0.5 }),
  amp: std('#24222b'),
  ampGrill: std('#4a4756', { roughness: 0.5 }),
  guitar: std('#e5533d', { roughness: 0.5 }),
  neck: std('#7a5232'),
  keytar: std('#38d6c6', { roughness: 0.5 }),
  keys: std('#fdf8ee'),
  blackKey: std('#1e1e24'),
  truss: std('#c9ccd2', { roughness: 0.4, metalness: 0.5 }),
  stick: std('#d9c79a'),
};

const SPOT_GEO = new THREE.ConeGeometry(0.42, 2.5, 12, 1, true).translate(0, -1.25, 0);
const SPOT_COLORS = ['#ff5fa2', '#38d6c6', '#ffd23f', '#9b7bff'];
const SPOT_X = [-0.75, -0.25, 0.25, 0.75];
const POOL_GEO = new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2);
const STICK_GEO = new THREE.CylinderGeometry(0.012, 0.016, 0.3, 5);
const GLOWSTICK_GEO = new THREE.CapsuleGeometry(0.022, 0.16, 2, 6);

function bandSign() {
  return canvasTexture('dj-band-sign', 256, 64, (g, w, h) => {
    g.fillStyle = '#1b1830';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 6;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.font = 'bold 34px "Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ff8fd0';
    g.fillText('★ BOT BAND ★', w / 2, h / 2 + 2);
  });
}

// Band positions (local). Everyone faces south (rotationY = PI).
const BACK_Z = BAND.z1 - 0.2;
const GUITAR = { x: -0.6, z: BAND.z0 + 0.45 };
const KEYTAR = { x: 0.6, z: BAND.z0 + 0.45 };
const DRUMS = { x: 0, z: BACK_Z };
const STOOL_H = 0.3;
const KIT_Z = DRUMS.z - 0.36;

// Watchers gather on the sand beside the floor, near the stage.
const WATCHERS = [
  { x: FLOOR.x0 - 0.35, z: FLOOR.z1 - 0.3, color: CREW_COLORS[7], move: 'glow' },
  { x: FLOOR.x1 + 0.35, z: FLOOR.z1 - 0.35, color: CREW_COLORS[3], move: 'clap' },
  { x: FLOOR.x0 - 0.3, z: FLOOR.z1 - 1.1, color: CREW_COLORS[9], move: 'clap' },
  { x: FLOOR.x1 + 0.3, z: FLOOR.z1 - 1.15, color: CREW_COLORS[0], move: 'glow' },
].map((w) => ({ ...w, y: localGround(w.x, w.z), face: Math.atan2(0 - w.x, (BAND.z0 + BAND.z1) / 2 - w.z) }));

// Guitar in the player's pose frame: neck up toward the left hand.
function Guitar() {
  return (
    <group position={[0.05, 0.33, 0.2]} rotation={[0, 0, -0.38]}>
      <Cyl p={[0.04, 0, 0]} rt={0.13} h={0.05} m={M.guitar} seg={10} r={[Math.PI / 2, 0, 0]} />
      <Cyl p={[-0.1, 0, 0]} rt={0.1} h={0.05} m={M.guitar} seg={10} r={[Math.PI / 2, 0, 0]} />
      <Cyl p={[-0.03, 0, 0.027]} rt={0.035} h={0.01} m={LM.dark} seg={8} r={[Math.PI / 2, 0, 0]} />
      <Box p={[-0.38, 0, 0.012]} s={[0.42, 0.045, 0.025]} m={M.neck} />
      <Box p={[-0.62, 0, 0.012]} s={[0.08, 0.065, 0.03]} m={LM.dark} />
    </group>
  );
}

// Keytar: a little keyboard slung like a guitar, with a glowing edge.
function Keytar({ glow }) {
  return (
    <group position={[0.04, 0.36, 0.21]} rotation={[0, 0, -0.22]}>
      <Box p={[0.06, 0, 0]} s={[0.46, 0.1, 0.06]} m={M.keytar} />
      <Box p={[0.1, 0.0, 0.032]} s={[0.34, 0.06, 0.01]} m={M.keys} />
      {[-0.04, 0.02, 0.1, 0.16, 0.22].map((x) => (
        <Box key={x} p={[x, 0.015, 0.039]} s={[0.025, 0.03, 0.008]} m={M.blackKey} />
      ))}
      <Box p={[-0.27, 0.0, 0]} s={[0.22, 0.04, 0.04]} m={LM.dark} />
      <Box p={[0.06, -0.052, 0]} s={[0.46, 0.012, 0.062]} m={glow} />
    </group>
  );
}

// Put a mesh in a MiniBot's hand once it has mounted.
function useHandProp(parts, side, make) {
  useEffect(() => {
    const hand = parts.current && parts.current[side];
    if (!hand) return undefined;
    const obj = make();
    hand.add(obj);
    return () => hand.remove(obj);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function stickMesh() {
  const m = new THREE.Mesh(STICK_GEO, M.stick);
  m.position.set(0, -0.13, 0.04);
  m.rotation.x = 2.88;
  return m;
}

function Band({ mode, night, animate, crash }) {
  const gtr = useRef({});
  const key = useRef({});
  const drm = useRef({});
  const keyGlow = useNightGlow('#7fe3ff', night, 0.6, 1.6);
  useHandProp(drm, 'handL', stickMesh);
  useHandProp(drm, 'handR', stickMesh);

  useFrame(() => {
    const { b, pulse, t } = groove;
    const late = mode === 'late';
    const eighth = (b * 2) % 1;

    // Guitar: strums on the 8ths, head nods on the beat; at bedtime the
    // guitarist sits on the stage edge and strums slowly.
    const g = gtr.current;
    if (resetBot(g)) {
      if (late) {
        g.root.position.set(-0.25, BAND_Y - SIT_DROP * S, BAND.z0 + 0.1);
        sitPose(g, t * 1.3);
        const slow = Math.sin(b * Math.PI * 0.5);
        g.armR.rotation.x = -0.6 + slow * 0.18;
        g.head.rotation.x = 0.25;
        g.head.rotation.z = Math.sin(t * 0.6) * 0.12;
      } else {
        g.root.position.set(GUITAR.x, BAND_Y, GUITAR.z);
        g.armR.rotation.x = -0.55 + Math.sin(eighth * Math.PI * 2) * 0.28;
        g.armR.rotation.z = 0.15;
        g.head.rotation.x = pulse * 0.25;
        g.pose.rotation.z = Math.sin(b * Math.PI * 0.5) * 0.06;
        // a rock-star lean back on the first beat of every fourth bar
        if (b % 16 < 1) g.pose.rotation.x = -0.25 * Math.sin((b % 1) * Math.PI);
      }
      g.armL.rotation.x = -1.35;
      g.armL.rotation.z = -0.55;
    }

    // Keytar: sway, right hand tapping 16ths, a fist pump every fourth bar.
    const k = key.current;
    if (resetBot(k)) {
      k.root.visible = !late;
      if (!late) {
        const sway = Math.sin(b * Math.PI * 0.5);
        k.pose.rotation.z = sway * 0.12;
        k.pose.position.y = Math.abs(Math.sin(b * Math.PI)) * 0.04;
        k.head.rotation.z = -sway * 0.15;
        k.armL.rotation.x = -1.3;
        k.armL.rotation.z = -0.45;
        if ((b + 8) % 16 < 1) {
          k.armR.rotation.z = 2.5;
          k.armR.rotation.x = Math.sin(t * 9) * 0.2;
        } else {
          k.armR.rotation.x = -1.05 + Math.abs(Math.sin(b * Math.PI * 4)) * 0.12;
          k.armR.rotation.z = 0.2;
        }
      }
    }

    // Drums: right hand on the hats every 8th, left on the snare on 2 and 4.
    const d = drm.current;
    if (resetBot(d)) {
      d.root.visible = !late;
      if (!late) {
        sitPose(d, 0);
        d.armR.rotation.x = -0.75 - 0.5 * smooth(eighth);
        d.armR.rotation.z = 0.25;
        const sn = (b + 1) % 2; // 0 on beats 2 and 4
        d.armL.rotation.x = -0.75 - 0.6 * smooth(sn / 2);
        d.armL.rotation.z = -0.2;
        d.head.rotation.x = pulse * 0.3;
        d.pose.rotation.x = 0.08 + pulse * 0.05;
      }
    }
    if (crash.current) crash.current.rotation.z = late || !animate ? 0 : Math.exp(-(b % 4) * 3) * 0.3 * Math.sin(t * 30);
  });

  return (
    <group>
      <MiniBot color={CREW_COLORS[8]} parts={gtr} position={[GUITAR.x, BAND_Y, GUITAR.z]} rotationY={Math.PI} scale={S}>
        <Guitar />
      </MiniBot>
      <MiniBot color={CREW_COLORS[2]} parts={key} position={[KEYTAR.x, BAND_Y, KEYTAR.z]} rotationY={Math.PI} scale={S}>
        <Keytar glow={keyGlow} />
      </MiniBot>
      <MiniBot color={CREW_COLORS[6]} parts={drm} position={[DRUMS.x, BAND_Y + STOOL_H - SIT_DROP * S, DRUMS.z]} rotationY={Math.PI} scale={S} />
    </group>
  );
}

// Drum kit, amp, mic stand: stays on stage day and night.
function Gear({ crash }) {
  return (
    <group>
      {/* stool */}
      <Cyl p={[DRUMS.x, BAND_Y + STOOL_H / 2, DRUMS.z]} rt={0.012} h={STOOL_H} m={M.stand} />
      <Cyl p={[DRUMS.x, BAND_Y + STOOL_H, DRUMS.z]} rt={0.11} h={0.04} m={LM.dark} seg={8} />
      {/* kick drum, its head facing the crowd */}
      <group position={[0, BAND_Y + 0.2, KIT_Z]}>
        <Cyl p={[0, 0, 0]} rt={0.2} h={0.18} m={M.drum} seg={12} r={[Math.PI / 2, 0, 0]} />
        <Cyl p={[0, 0, -0.092]} rt={0.17} h={0.01} m={M.drumHead} seg={12} r={[Math.PI / 2, 0, 0]} />
        {/* rack tom on top */}
        <Cyl p={[0.05, 0.28, 0.02]} rt={0.09} h={0.1} m={M.drum} seg={10} r={[0.3, 0, 0]} />
      </group>
      {/* snare and hi-hat */}
      <Cyl p={[0.24, BAND_Y + 0.22, KIT_Z + 0.12]} rt={0.012} h={0.44} m={M.stand} />
      <Cyl p={[0.24, BAND_Y + 0.46, KIT_Z + 0.12]} rt={0.11} h={0.08} m={M.drum} seg={10} />
      <Cyl p={[0.24, BAND_Y + 0.505, KIT_Z + 0.12]} rt={0.1} h={0.01} m={M.drumHead} seg={10} />
      <Cyl p={[0.44, BAND_Y + 0.3, KIT_Z + 0.2]} rt={0.012} h={0.6} m={M.stand} />
      <Cyl p={[0.44, BAND_Y + 0.6, KIT_Z + 0.2]} rt={0.12} rb={0.12} h={0.03} m={M.cymbal} seg={10} />
      {/* crash cymbal (Band shakes it on the one) */}
      <Cyl p={[-0.42, BAND_Y + 0.41, KIT_Z + 0.05]} rt={0.012} h={0.82} m={M.stand} />
      <group ref={crash} position={[-0.42, BAND_Y + 0.82, KIT_Z + 0.05]}>
        <Cyl p={[0, 0, 0]} rt={0.03} rb={0.17} h={0.025} m={M.cymbal} seg={10} />
      </group>
      {/* amp behind the guitarist */}
      <group position={[-0.72, BAND_Y, BACK_Z + 0.02]}>
        <Box p={[0, 0.2, 0]} s={[0.34, 0.4, 0.22]} m={M.amp} />
        <Box p={[0, 0.18, -0.112]} s={[0.28, 0.26, 0.01]} m={M.ampGrill} />
      </group>
      <group position={[0.72, BAND_Y, BACK_Z + 0.02]}>
        <Box p={[0, 0.16, 0]} s={[0.3, 0.32, 0.22]} m={M.amp} />
        <Box p={[0, 0.15, -0.112]} s={[0.24, 0.2, 0.01]} m={M.ampGrill} />
      </group>
      {/* mic stand at the front */}
      <Cyl p={[GUITAR.x + 0.05, BAND_Y + 0.46, BAND.z0 + 0.07]} rt={0.012} h={0.92} m={M.stand} />
      <Cyl p={[GUITAR.x + 0.05, BAND_Y + 0.01, BAND.z0 + 0.07]} rt={0.09} h={0.02} m={M.stand} seg={8} />
      <mesh position={[GUITAR.x + 0.05, BAND_Y + 0.94, BAND.z0 + 0.1]} material={LM.dark}>
        <icosahedronGeometry args={[0.04, 0]} />
      </mesh>
    </group>
  );
}

function Watchers({ lowPower }) {
  const n = lowPower ? 2 : WATCHERS.length;
  const refs = [useRef({}), useRef({}), useRef({}), useRef({})];
  const stickMat = useMemo(() => glowMat('#9dff7a', 0.9), []);
  const stickMat2 = useMemo(() => glowMat('#ff7ad9', 0.9), []);
  useEffect(() => () => [stickMat, stickMat2].forEach((m) => m.dispose()), [stickMat, stickMat2]);
  useHandProp(refs[0], 'handR', () => new THREE.Mesh(GLOWSTICK_GEO, stickMat));
  useHandProp(refs[3], 'handR', () => new THREE.Mesh(GLOWSTICK_GEO, stickMat2));

  useFrame(() => {
    const { b, pulse } = groove;
    for (let i = 0; i < n; i++) {
      const p = refs[i].current;
      if (!resetBot(p)) continue;
      const w = WATCHERS[i];
      const lb = b + i * 0.37;
      p.root.position.y = w.y + Math.abs(Math.sin(lb * Math.PI)) * 0.03;
      p.head.rotation.x = pulse * 0.2;
      if (w.move === 'glow') {
        // glowstick held high, swaying slowly over the head
        const sway = Math.sin(lb * Math.PI * 0.5);
        p.armR.rotation.z = 2.5 + sway * 0.35;
        p.pose.rotation.z = sway * 0.08;
        p.armL.rotation.z = -0.3;
      } else {
        // clapping on 2 and 4
        const c = (b + 1) % 2;
        const close = c < 0.15 ? 1 - c / 0.15 : 0;
        p.armL.rotation.x = -1.2;
        p.armR.rotation.x = -1.2;
        p.armL.rotation.z = -0.35 + close * 0.45;
        p.armR.rotation.z = 0.35 - close * 0.45;
      }
    }
  });

  return (
    <group>
      {WATCHERS.slice(0, n).map((w, i) => (
        <MiniBot key={i} color={w.color} parts={refs[i]} position={[w.x, w.y, w.z]} rotationY={w.face} scale={S} />
      ))}
    </group>
  );
}

export default function Concert({ mode, night, animate, lowPower }) {
  const nSpots = lowPower ? 2 : 4;
  const spots = useRef([]);
  const pools = useRef([]);
  const crash = useRef();
  const trim = useNightGlow('#9b7bff', mode === 'off' ? night * 0.3 : night, 0.15, 1.5);
  const signMat = useMemo(() => new THREE.MeshBasicMaterial({ map: bandSign(), toneMapped: false }), []);
  const spotMats = useMemo(() => SPOT_COLORS.map((c) => glowMat(c, 0.15)), []);
  const poolMats = useMemo(() => SPOT_COLORS.map((c) => glowMat(c, 0.3)), []);
  useEffect(() => () => [signMat, ...spotMats, ...poolMats].forEach((m) => m.dispose()), [signMat, spotMats, poolMats]);

  const full = mode === 'full';
  const top = BAND_Y + 1.75;
  useFrame(() => {
    const { t, pulse } = groove;
    const lit = Math.max(night, 0.65);
    for (let i = 0; i < spots.current.length; i++) {
      const s = spots.current[i];
      const pool = pools.current[i];
      if (!s || !pool) continue;
      const on = full && i < nSpots;
      s.visible = on;
      pool.visible = on;
      if (!on) continue;
      // sweep across the crowd, each its own way
      const k = i % 2 ? -1 : 1;
      const rx = 0.55 + Math.sin(t * 0.8 + i * 1.7) * 0.28;
      const rz = k * (0.2 + Math.sin(t * 0.6 + i * 2.3) * 0.35);
      s.rotation.x = rx;
      s.rotation.z = rz;
      const glow = (0.08 + 0.22 * lit) * (0.7 + 0.3 * pulse);
      spotMats[i].opacity = glow;
      poolMats[i].opacity = glow * 1.6;
      // a pool of light where the beam meets the floor
      const dy = Math.cos(rz) * Math.cos(rx);
      const d = (top - 0.06 - FLOOR_TOP - 0.01) / dy;
      pool.position.set(SPOT_X[i] + Math.sin(rz) * d, FLOOR_TOP + 0.01, BAND.z1 - 0.06 - Math.cos(rz) * Math.sin(rx) * d);
    }
  });

  const midZ = (BAND.z0 + BAND.z1) / 2;
  return (
    <group>
      {/* the stage */}
      <Box p={[0, (BAND_Y + BAND_LOW) / 2, midZ]} s={[BAND.x1 - BAND.x0, BAND_Y - BAND_LOW, BAND.z1 - BAND.z0]} m={M.stage} />
      <Box p={[0, BAND_Y - 0.03, BAND.z0 - 0.01]} s={[BAND.x1 - BAND.x0 + 0.02, 0.05, 0.04]} m={trim} />
      {/* steps up the side */}
      <Box p={[BAND.x1 + 0.1, (BAND_Y + BAND_LOW) / 2 - 0.15, midZ]} s={[0.2, BAND_Y - BAND_LOW - 0.3, 0.42]} m={M.stage} />
      <Box p={[BAND.x1 + 0.28, (BAND_Y + BAND_LOW) / 2 - 0.3, midZ]} s={[0.18, BAND_Y - BAND_LOW - 0.6, 0.42]} m={M.stage} />
      <Box p={[BAND.x1 + 0.44, (BAND_Y + BAND_LOW) / 2 - 0.45, midZ]} s={[0.16, Math.max(0.05, BAND_Y - BAND_LOW - 0.9), 0.42]} m={M.stage} />
      <Gear crash={crash} />

      {/* truss with the band's sign and the spotlights */}
      {[BAND.x0 + 0.06, BAND.x1 - 0.06].map((x) => (
        <Cyl key={x} p={[x, (BAND_Y + top) / 2, BAND.z1 - 0.06]} rt={0.04} h={top - BAND_Y} m={M.truss} />
      ))}
      <Box p={[0, top, BAND.z1 - 0.06]} s={[BAND.x1 - BAND.x0, 0.08, 0.08]} m={M.truss} />
      <mesh position={[0, top + 0.24, BAND.z1 - 0.07]} rotation={[0, Math.PI, 0]} material={signMat}>
        <planeGeometry args={[1.5, 0.375]} />
      </mesh>
      <mesh position={[0, top + 0.24, BAND.z1 - 0.05]} material={signMat}>
        <planeGeometry args={[1.5, 0.375]} />
      </mesh>
      {SPOT_X.map((x, i) => (
        <group key={x} position={[x, top - 0.06, BAND.z1 - 0.06]}>
          <Cyl p={[0, -0.05, 0]} rt={0.06} rb={0.08} h={0.12} m={LM.dark} seg={8} />
          <group ref={(el) => (spots.current[i] = el)} visible={false}>
            <mesh geometry={SPOT_GEO} material={spotMats[i]} />
          </group>
        </group>
      ))}
      {SPOT_X.map((x, i) => (
        <mesh key={x} ref={(el) => (pools.current[i] = el)} geometry={POOL_GEO} material={poolMats[i]} visible={false} />
      ))}

      {mode !== 'off' && <Band mode={mode} night={night} animate={animate} crash={crash} />}
      {full && <Watchers lowPower={lowPower} />}
    </group>
  );
}
