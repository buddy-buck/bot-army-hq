import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import StaticMerge from '../../utils/StaticMerge.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import MiniBot from '../MiniBot.jsx';
import { Beam, Box, Cyl, LM, smooth, std } from './common.jsx';

// A wooden lifeguard-style watchtower on the south-east beach. A bot up top
// scans the horizon with binoculars, now and then pausing to lean in.

const S = SITES.watchtower;
// Face straight out to sea: the outward normal of the island ellipse here.
const FACE = Math.atan2(S.x / 15.6 ** 2, S.z / 16.5 ** 2);
const H = 2.1; // platform height
const LEG_BOT = 0.78;
const LEG_TOP = 0.55;

const M = {
  roof: std('#e94b3c'),
  roofStripe: std('#fdf8ee'),
  ringW: std('#fdf8ee'),
  ringR: std('#e94b3c'),
};
const RING_GEO = new THREE.TorusGeometry(0.17, 0.05, 5, 12);
const BINO_GEO = new THREE.CylinderGeometry(0.042, 0.048, 0.13, 7).rotateX(Math.PI / 2);

function Binoculars() {
  return (
    <group position={[0, 0.8, 0.25]}>
      <mesh geometry={BINO_GEO} material={LM.dark} position={[-0.055, 0, 0]} />
      <mesh geometry={BINO_GEO} material={LM.dark} position={[0.055, 0, 0]} />
      <Box p={[0, 0, -0.01]} s={[0.07, 0.03, 0.05]} m={LM.dark} />
    </group>
  );
}

function Ladder() {
  const a = [0, 0, -1.3];
  const b = [0, H + 0.05, -LEG_TOP - 0.02];
  const rungs = [];
  const n = 7;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const y = a[1] + (b[1] - a[1]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    rungs.push(<Cyl key={i} p={[0, y, z]} rt={0.025} h={0.5} m={LM.plank} seg={4} r={[0, 0, Math.PI / 2]} />);
  }
  return (
    <>
      <Beam a={[-0.25, a[1], a[2]]} b={[-0.25, b[1], b[2]]} r={0.035} m={LM.wood} />
      <Beam a={[0.25, a[1], a[2]]} b={[0.25, b[1], b[2]]} r={0.035} m={LM.wood} />
      {rungs}
    </>
  );
}

export default function Watchtower({ animate }) {
  const y0 = groundY(S.x, S.z);
  const bot = useRef();
  const st = useRef({ yaw: 0, phase: 0, lean: 0, mode: 'scan', left: 6 });
  const legs = useMemo(
    () =>
      [-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => [
          [sx * LEG_BOT, -0.25, sz * LEG_BOT],
          [sx * LEG_TOP, H, sz * LEG_TOP],
        ])
      ),
    []
  );

  useFrame((state, delta) => {
    const b = bot.current;
    if (!b?.pose) return;
    const s = st.current;
    const dt = animate ? Math.min(delta, 0.1) : 0;
    s.left -= dt;
    if (s.left <= 0) {
      if (s.mode === 'scan') {
        s.mode = 'pause';
        s.left = 1.6 + Math.random() * 1.8;
      } else {
        s.mode = 'scan';
        s.left = 5 + Math.random() * 6;
      }
    }
    if (s.mode === 'scan') s.phase += dt * 0.32;
    const leanTo = s.mode === 'pause' ? 1 : 0;
    s.lean += (leanTo - s.lean) * Math.min(1, dt * 3);
    s.yaw = Math.sin(s.phase) * 0.95;
    const t = state.clock.elapsedTime;
    b.pose.rotation.y = s.yaw;
    b.pose.rotation.x = 0.22 * smooth(s.lean);
    b.pose.position.z = 0.06 * s.lean;
    b.head.rotation.x = 0.1 * s.lean + (animate ? 0.03 * Math.sin(t * 0.9) : 0);
    // both hands up to the binoculars
    b.armL.rotation.set(-2.45, 0, 0.38); // in toward the face
    b.armR.rotation.set(-2.45, 0, -0.38);
    // tiny weight shift
    b.footL.position.y = 0.06;
    b.footR.position.y = 0.06;
  });

  return (
    <group position={[S.x, y0, S.z]} rotation={[0, FACE, 0]}>
      <StaticMerge>
        {legs.map(([a, b], i) => (
          <Beam key={i} a={a} b={b} r={0.07} m={LM.wood} seg={6} />
        ))}
        {/* cross braces */}
        <Beam a={[-LEG_BOT * 0.9, 0.3, LEG_BOT * 0.9]} b={[LEG_TOP * 1.05, H * 0.7, LEG_TOP * 1.05]} r={0.035} m={LM.darkWood} />
        <Beam a={[LEG_BOT * 0.9, 0.3, LEG_BOT * 0.9]} b={[-LEG_TOP * 1.05, H * 0.7, LEG_TOP * 1.05]} r={0.035} m={LM.darkWood} />
        <Beam a={[LEG_BOT * 0.9, 0.3, -LEG_BOT * 0.9]} b={[LEG_TOP * 1.05, H * 0.7, LEG_TOP * 1.05]} r={0.035} m={LM.darkWood} />
        <Beam a={[-LEG_BOT * 0.9, 0.3, -LEG_BOT * 0.9]} b={[-LEG_TOP * 1.05, H * 0.7, LEG_TOP * 1.05]} r={0.035} m={LM.darkWood} />
        {/* platform */}
        <Box p={[0, H, 0]} s={[1.35, 0.09, 1.35]} m={LM.plank} />
        {/* rails: front and sides, open at the back for the ladder */}
        <Box p={[0, H + 0.42, 0.66]} s={[1.35, 0.06, 0.06]} m={LM.wood} />
        <Box p={[0.66, H + 0.42, 0]} s={[0.06, 0.06, 1.35]} m={LM.wood} />
        <Box p={[-0.66, H + 0.42, 0]} s={[0.06, 0.06, 1.35]} m={LM.wood} />
        <Box p={[0, H + 0.2, 0.66]} s={[1.35, 0.32, 0.04]} m={LM.white} />
        {/* roof posts and a striped little roof */}
        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} p={[sx * 0.62, H + 0.75, sz * 0.62]} rt={0.035} h={1.5} m={LM.wood} seg={5} />))}
        <mesh position={[0, H + 1.68, 0]} material={M.roof} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[1.12, 0.5, 4]} />
        </mesh>
        <Box p={[0, H + 1.47, 0]} s={[1.5, 0.08, 1.5]} m={M.roofStripe} />
        <Cyl p={[0, H + 2.05, 0]} rt={0.02} h={0.45} m={LM.iron} seg={4} />
        <Box p={[0.14, H + 2.18, 0]} s={[0.26, 0.16, 0.015]} m={M.roof} />
        {/* life ring on the front rail */}
        <group position={[0.36, H + 0.2, 0.71]}>
          <mesh geometry={RING_GEO} material={M.ringW} />
          {[0, 1, 2, 3].map((k) => {
            const a = Math.PI / 4 + (k * Math.PI) / 2;
            return <Box key={k} p={[Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0]} s={[0.09, 0.09, 0.115]} m={M.ringR} r={[0, 0, a]} />;
          })}
        </group>
        <Ladder />
      </StaticMerge>
      <MiniBot ref={bot} color="#e74c3c" position={[0, H + 0.045, 0.05]}>
        <Binoculars />
      </MiniBot>
    </group>
  );
}
