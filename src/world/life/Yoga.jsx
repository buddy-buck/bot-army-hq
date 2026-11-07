import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { CREW_COLORS } from '../MiniBot.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import { aliveClock } from '../../wild/director.js';
import { Box, Cyl, resetBot, smooth, std, toWorld, usePoseOnce } from './common.jsx';

// Sunrise yoga on the west end of the north lounge beach (SITES.yoga).
// From about 5:45 to 8:00 AM island time (IslandLife decides; ?test=yoga
// forces it) a little class unrolls their mats and flows through a slow
// sequence in sync: hands at heart, sun salutation (arms up), forward fold,
// downward dog, warrior II both sides and tree pose. Everyone faces the
// sunrise (east-south-east, where useSunPosition puts the sun at dawn); the
// instructor stands in front on her own mat, facing the class, a beat ahead.
// The rest of the day the mats sit rolled up in a little rack on the sand.

// Sun direction at dawn in useSunPosition: (0.9 cos θ, sin θ, 0.45) with
// θ ≈ 0, so the class faces atan2(0.9, 0.45) (mostly east, a bit south).
const FACE = Math.atan2(0.9, 0.45);
// Frame: +z = toward the sunrise. Nudged a little inland from the site
// center so the back row stays on dry sand.
const F = { x: SITES.yoga.x + 0.2, z: SITES.yoga.z + 0.35, rotY: FACE };

const MAT_LEN = 1.0;
const MAT_W = 0.5;
const MAT_BACK = 0.45; // mat starts this far behind the bot's feet
const UNROLL = 2.6; // seconds to unroll the mats
const LEAD = 0.45; // the instructor moves this much ahead of the class

// Students: local (x, z). Front row of three, back row of two in the gaps.
const STUDENTS = [
  [-0.8, -0.15],
  [0.8, -0.15],
  [0, -0.15],
  [-0.4, -1.15],
  [0.4, -1.15],
];
const TEACHER = [0, 1.05];
const MAT_COLORS = ['#ff9fb8', '#8fd6c8', '#b8a6ff', '#ffd27a', '#9fd0ff'];
const TEACHER_MAT = '#ff7a59';
const MAT_MATS = MAT_COLORS.map((c) => std(c, { roughness: 1 }));
const TEACHER_MAT_MAT = std(TEACHER_MAT, { roughness: 1 });
const HEADBAND = std('#ff5fa2');
const RACK = std('#a8774a');
const BOT_COLORS = [CREW_COLORS[0], CREW_COLORS[3], CREW_COLORS[2], CREW_COLORS[9], CREW_COLORS[4]];
const ROLL_GEO = new THREE.CylinderGeometry(1, 1, 1, 8).rotateZ(Math.PI / 2); // axis along x
const MAT_GEO = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0.5); // sits on y = 0, grows forward from z = 0

// ---------------------------------------------------------------------------
// Poses. Each is a flat array (no allocations per frame):
//   0 py, 1 pz, 2 prx, 3 pry, 4 prz   body (pose group) lift/shift/rotation
//   5 hx, 6 hy                         head
//   7 aLx, 8 aLz, 9 aRx, 10 aRz       arms (x < 0 raises forward; armL -z / armR +z out to the side)
//   11 fLx, 12 fLy, 13 fLz, 14 fRx, 15 fRy, 16 fRz   feet offsets from rest
// ---------------------------------------------------------------------------
const P = (o) => [o.py || 0, o.pz || 0, o.prx || 0, o.pry || 0, o.prz || 0, o.hx || 0, o.hy || 0, o.aLx || 0, o.aLz || 0, o.aRx || 0, o.aRz || 0, o.fLx || 0, o.fLy || 0, o.fLz || 0, o.fRx || 0, o.fRy || 0, o.fRz || 0];
const POSE = {
  namaste: P({ hx: 0.12, aLx: -1.25, aLz: 0.55, aRx: -1.25, aRz: -0.55 }), // hands at heart
  reach: P({ prx: -0.08, hx: -0.35, aLz: -2.9, aRz: 2.9 }), // sun salutation: arms up to the sky
  fold: P({ pz: -0.1, prx: 0.75, hx: 0.3, aLx: -1.05, aRx: -1.05 }), // forward fold, hands to the toes
  dog: P({ py: 0.04, pz: -0.2, prx: 1.15, hx: 0.3, aLx: -2.0, aRx: -2.0 }), // downward dog
  warriorA: P({ py: -0.05, pry: 1.2, hy: -1.15, aLz: -1.5, aRz: 1.5, fLx: -0.13, fRx: 0.13 }), // warrior II
  warriorB: P({ py: -0.05, pry: -1.2, hy: 1.15, aLz: -1.5, aRz: 1.5, fLx: -0.13, fRx: 0.13 }),
  tree: P({ hx: -0.05, aLz: -2.7, aRz: 2.7, fRx: -0.06, fRy: 0.2, fRz: 0.04 }), // tree pose, palms together overhead
};
// [pose, seconds]. Each pose blends in over the first TRANS seconds.
const SEQ = [
  ['namaste', 4],
  ['reach', 4],
  ['fold', 3.5],
  ['dog', 5],
  ['fold', 2.5],
  ['reach', 3.5],
  ['warriorA', 5],
  ['warriorB', 5],
  ['tree', 6],
  ['namaste', 3],
].map(([k, d]) => [POSE[k], d, k]);
const TRANS = 1.6;
const PERIOD = SEQ.reduce((a, s) => a + s[1], 0);
const N = POSE.namaste.length;

// Blend into `out` the class pose at sequence time t (seconds since the
// mats were unrolled; negative = still unrolling, folded over the mat).
function poseAt(t, out) {
  if (t < 0) {
    for (let i = 0; i < N; i++) out[i] = POSE.fold[i];
    return out;
  }
  const cycle = Math.floor(t / PERIOD);
  let u = t - cycle * PERIOD;
  let k = 0;
  while (k < SEQ.length - 1 && u >= SEQ[k][1]) {
    u -= SEQ[k][1];
    k++;
  }
  const cur = SEQ[k][0];
  const prev = k === 0 ? (cycle === 0 ? POSE.fold : SEQ[SEQ.length - 1][0]) : SEQ[k - 1][0];
  const w = smooth(u / TRANS);
  for (let i = 0; i < N; i++) out[i] = prev[i] + (cur[i] - prev[i]) * w;
  out.tree = SEQ[k][2] === 'tree' ? w : 0;
  return out;
}

function applyPose(p, v, breath, wobble) {
  p.pose.position.set(0, v[0] + breath, v[1]);
  p.pose.rotation.set(v[2], v[3], v[4] + wobble);
  p.head.rotation.set(v[5], v[6], 0);
  p.armL.rotation.set(v[7], 0, v[8]);
  p.armR.rotation.set(v[9], 0, v[10]);
  p.footL.position.set(-0.08 + v[11], 0.06 + v[12], v[13]);
  p.footR.position.set(0.08 + v[14], 0.06 + v[15], v[16]);
}

// ---------------------------------------------------------------------------
// Mats
// ---------------------------------------------------------------------------

// A mat in the class frame: back end at (lx, lzBack), running along +z (or
// -z for the instructor's), tilted to follow the sand.
function matFrame(lx, lz, dir) {
  const back = toWorld(F, lx, lz - dir * MAT_BACK);
  const front = toWorld(F, lx, lz + dir * (MAT_LEN - MAT_BACK));
  const yb = groundY(back[0], back[1]);
  const yf = groundY(front[0], front[1]);
  return { x: back[0], z: back[1], y: yb + 0.012, rotY: FACE + (dir < 0 ? Math.PI : 0), tilt: Math.atan2(yb - yf, MAT_LEN) };
}

function Mat({ frame, mat, matRef, rollRef }) {
  return (
    <group position={[frame.x, frame.y, frame.z]} rotation={[0, frame.rotY, 0]}>
      <group rotation={[frame.tilt, 0, 0]}>
        <mesh ref={matRef} geometry={MAT_GEO} material={mat} scale={[MAT_W, 0.02, MAT_LEN]} />
        <mesh ref={rollRef} geometry={ROLL_GEO} material={mat} scale={[MAT_W, 0.03, 0.03]} visible={false} />
      </group>
    </group>
  );
}

// The rest of the day: rolled mats standing in a little rack.
const RACK_POS = toWorld(F, -1.55, 0.3);
function MatRack() {
  const y = groundY(RACK_POS[0], RACK_POS[1]);
  const mats = [...MAT_MATS, TEACHER_MAT_MAT];
  return (
    <group position={[RACK_POS[0], y, RACK_POS[1]]} rotation={[0, FACE, 0]}>
      <Box p={[0, 0.05, 0]} s={[0.62, 0.1, 0.34]} m={RACK} />
      <Box p={[0, 0.42, -0.15]} s={[0.62, 0.05, 0.04]} m={RACK} />
      {[-0.29, 0.29].map((x) => (
        <Box key={x} p={[x, 0.24, -0.15]} s={[0.04, 0.42, 0.04]} m={RACK} />
      ))}
      {mats.map((m, i) => (
        <Cyl key={i} p={[-0.23 + (i % 3) * 0.23, 0.33, i < 3 ? -0.05 : 0.08]} rt={0.075} h={0.5} m={m} seg={8} r={[0.12 * (i < 3 ? -1 : 1), 0, 0]} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------

export default function Yoga({ animate = true, active = false, lowPower = false }) {
  if (!active) return <MatRack />;
  return <YogaClass animate={animate} lowPower={lowPower} />;
}

function YogaClass({ animate, lowPower }) {
  const students = lowPower ? STUDENTS.slice(0, 3) : STUDENTS;
  const n = students.length;
  const parts = useMemo(() => Array.from({ length: n + 1 }, () => ({ current: {} })), [n]);
  const mats = useMemo(() => Array.from({ length: n + 1 }, () => ({ mat: { current: null }, roll: { current: null } })), [n]);
  const frames = useMemo(
    () => [...students.map(([x, z]) => matFrame(x, z, 1)), matFrame(TEACHER[0], TEACHER[1], -1)],
    [students]
  );
  const spots = useMemo(
    () =>
      [...students, TEACHER].map(([x, z], i) => {
        const [wx, wz] = toWorld(F, x, z);
        return { x: wx, z: wz, y: groundY(wx, wz) + 0.02, rotY: FACE + (i === n ? Math.PI : 0) };
      }),
    [students, n]
  );
  const clock = useMemo(() => aliveClock(), []);
  const pv = useMemo(() => new Array(N).fill(0), []);
  usePoseOnce(animate, n);

  useEffect(() => {
    // headband on the instructor's head
    const head = parts[n].current.head;
    if (!head) return undefined;
    const band = new THREE.Mesh(HEADBAND_GEO, HEADBAND);
    band.position.set(0, 0.13, 0);
    band.rotation.x = Math.PI / 2;
    head.add(band);
    return () => head.remove(band);
  }, [parts, n]);

  useFrame((_, delta) => {
    const t = animate ? clock.tick(delta) : UNROLL + 25; // still: warrior II
    // mats unroll first
    const k = smooth(t / UNROLL);
    for (const m of mats) {
      const mat = m.mat.current;
      const roll = m.roll.current;
      if (!mat || !roll) continue;
      mat.scale.z = MAT_LEN * Math.max(0.02, k);
      roll.visible = k < 1;
      const r = 0.075 * (1 - k) + 0.02;
      roll.scale.set(MAT_W, r, r);
      roll.position.set(0, r, MAT_LEN * k);
    }
    for (let i = 0; i <= n; i++) {
      const p = parts[i].current;
      if (!resetBot(p)) continue;
      const s = spots[i];
      p.root.position.set(s.x, s.y, s.z);
      p.root.rotation.y = s.rotY;
      const tt = t - UNROLL + (i === n ? LEAD : 0);
      poseAt(tt, pv);
      const breath = animate ? Math.sin(t * 1.2 + i * 0.3) * 0.008 : 0;
      // a little wobble in tree pose, different for everyone
      const wobble = pv.tree ? Math.sin(t * 1.7 + i * 1.3) * 0.035 * pv.tree : 0;
      applyPose(p, pv, breath, wobble);
    }
  });

  return (
    <group>
      {frames.map((f, i) => (
        <Mat key={i} frame={f} mat={i === n ? TEACHER_MAT_MAT : MAT_MATS[i]} matRef={mats[i].mat} rollRef={mats[i].roll} />
      ))}
      {spots.map((s, i) => (
        <MiniBot key={i} parts={parts[i]} color={i === n ? '#ffffff' : BOT_COLORS[i]} position={[s.x, s.y, s.z]} rotationY={s.rotY} />
      ))}
    </group>
  );
}

const HEADBAND_GEO = new THREE.TorusGeometry(0.175, 0.025, 4, 14);
