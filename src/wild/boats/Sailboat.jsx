import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GEO, MAT } from '../../components/Bot.jsx';
import MiniBot from '../MiniBot.jsx';
import { world } from '../world.js';
import StaticMerge from '../../utils/StaticMerge.jsx';
import { HALO_GEO, LIGHT_GEO, hullGeo, hullMat, rideWaves, runningLightMats, setRunningLights, std } from './kit.js';

// A little sloop slowly circling far out (r 41 to 53), heeled over a touch,
// sails breathing in the breeze. A bot lies back in the cockpit reading a
// tablet and every so often swipes to the next page. Always out there.

const ID = 'sailboat';
const SCALE = 1.3;
const SPEED = 1.15; // units per second
const R0 = 47;
const R1 = 6;
const radius = (a) => R0 + R1 * Math.sin(a * 2 + 0.8);

const HULL = hullGeo(
  [
    { z: -1.9, w: 0.62, h: 0.42, d: 0.18 },
    { z: -1.0, w: 0.78, h: 0.44, d: 0.3 },
    { z: 0.3, w: 0.76, h: 0.48, d: 0.32 },
    { z: 1.3, w: 0.48, h: 0.54, d: 0.24 },
    { z: 2.15, w: 0.03, h: 0.62, d: 0.06 },
  ],
  { top: '#fdf8ee', bottom: '#19469d', stripe: 0.5, deckColor: '#c99a62' }
);
const KEEL = new THREE.BoxGeometry(0.06, 0.5, 0.7);
const MAST = new THREE.CylinderGeometry(0.035, 0.045, 3.4, 5);
const BOOM = new THREE.CylinderGeometry(0.03, 0.03, 1.9, 5).rotateX(Math.PI / 2);
const tri = (a, b, c) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.computeVertexNormals();
  return g;
};
// mainsail: luff up the mast (local origin at the gooseneck), foot along the boom toward -z
const MAIN = tri([0, 0, 0], [0, 3.0, 0], [0, 0, -1.85]);
// jib: tack at the bow (local origin), head up the forestay, clew aft
const JIB = tri([0, 0, 0], [0, 2.45, -1.2], [0, 0.15, -1.3]);
const COAMING = new THREE.BoxGeometry(1.1, 0.12, 1.5);
const CUSHION = new THREE.BoxGeometry(0.62, 0.16, 1.2);
const BACKREST = new THREE.BoxGeometry(0.62, 0.42, 0.14);

const M = {
  hull: hullMat(),
  mast: std('#d9d4c8', { metalness: 0.3, roughness: 0.4 }),
  sail: new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, side: THREE.DoubleSide, roughness: 0.9 }),
  jib: new THREE.MeshStandardMaterial({ color: '#ffe4a8', flatShading: true, side: THREE.DoubleSide, roughness: 0.9 }),
  teak: std('#a8794a'),
  cushion: std('#2ec4c8', { roughness: 0.9 }),
  screen: new THREE.MeshBasicMaterial({ color: '#9fe3ff' }),
  keel: std('#19469d'),
};
const LIGHT = runningLightMats('#fff4d6');

export default function Sailboat({ sky }) {
  const outer = useRef();
  const inner = useRef();
  const main = useRef();
  const jib = useRef();
  const bot = useRef();
  const st = useRef({ a: Math.random() * Math.PI * 2, swipeAt: 6 + Math.random() * 6, swipe: -1, now: 0 });
  const ride = useRef({ y: 0, pitch: 0, roll: 0 });
  const entry = useRef({ x: 0, z: 0, heading: 0, speed: SPEED, size: 4.5 });
  const flash = useMemo(() => new THREE.Color('#ffffff'), []);
  const base = useMemo(() => new THREE.Color('#9fe3ff'), []);

  const night = (sky?.stars ?? 0) > 0.5;
  useEffect(() => setRunningLights(LIGHT, night), [night]);
  useEffect(() => () => world.boats.delete(ID), []);

  // Lying back with the tablet held up over the chest.
  useEffect(() => {
    const b = bot.current;
    if (!b) return;
    b.armL.rotation.set(-1.0, 0, 0.1);
    b.armR.rotation.set(-1.0, 0, -0.1);
    b.head.rotation.x = 0.35; // chin down, eyes on the screen
    b.footL.position.z = 0.05;
    b.footR.position.set(0.1, 0.06, 0.02);
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const s = st.current;
    s.now += dt;
    const now = s.now;
    const g = outer.current;
    if (!g) return;
    const r = radius(s.a);
    s.a += (SPEED / r) * dt;
    const a = s.a;
    const x = r * Math.cos(a);
    const z = r * Math.sin(a);
    const dr = R1 * 2 * Math.cos(a * 2 + 0.8);
    const tx = dr * Math.cos(a) - r * Math.sin(a);
    const tz = dr * Math.sin(a) + r * Math.cos(a);
    const heading = Math.atan2(tx, tz);
    const t = state.clock.elapsedTime;
    const w = rideWaves(ride.current, x, z, heading, 4 * SCALE, 1.6 * SCALE, t);
    g.position.set(x, w.y, z);
    g.rotation.y = heading;
    const ig = inner.current;
    ig.rotation.x = w.pitch;
    ig.rotation.z = -0.13 + w.roll * 0.6 + Math.sin(now * 0.37) * 0.03; // heeled to starboard in the breeze
    // sails breathe: tiny luffing shiver plus a slow trim swing
    const trim = 0.38 + Math.sin(now * 0.21) * 0.05;
    main.current.rotation.y = -trim + Math.sin(now * 6.3) * 0.012;
    main.current.scale.x = 1 + Math.sin(now * 4.7) * 0.06;
    jib.current.rotation.y = -trim * 0.8 + Math.sin(now * 7.1 + 1) * 0.015;
    jib.current.scale.x = 1 + Math.sin(now * 5.3 + 2) * 0.08;

    // reading: a swipe every 8 to 20 seconds
    const b = bot.current;
    if (b) {
      if (s.swipe < 0 && now > s.swipeAt) s.swipe = now;
      if (s.swipe >= 0) {
        const p = (now - s.swipe) / 0.9;
        if (p >= 1) {
          s.swipe = -1;
          s.swipeAt = now + 8 + Math.random() * 12;
          b.armR.rotation.z = -0.1;
          b.armR.rotation.x = -1.0;
          M.screen.color.copy(base);
        } else {
          const k = Math.sin(p * Math.PI);
          b.armR.rotation.z = -0.1 - k * 0.5; // swipe across the screen (inward)
          b.armR.rotation.x = -1.0 - k * 0.2;
          M.screen.color.copy(base).lerp(flash, k * 0.6);
        }
      }
      b.head.rotation.y = Math.sin(now * 0.3) * 0.08;
      b.pose.position.y = Math.sin(now * 0.8) * 0.005; // breathing
    }

    const e = entry.current;
    e.x = x;
    e.z = z;
    e.heading = heading;
    world.boats.set(ID, e);
  });

  return (
    <group ref={outer}>
      <group ref={inner} scale={SCALE}>
        <StaticMerge version={night ? 1 : 0}>
          <mesh geometry={HULL} material={M.hull} />
          <mesh geometry={KEEL} material={M.keel} position={[0, -0.45, 0.1]} />
          <mesh geometry={COAMING} material={M.teak} position={[0, 0.48, -1.0]} />
          <mesh geometry={MAST} material={M.mast} position={[0, 2.15, 0.55]} />
          <mesh geometry={CUSHION} material={M.cushion} position={[0, 0.52, -0.95]} />
          <mesh geometry={BACKREST} material={M.cushion} position={[0, 0.66, -0.3]} rotation={[0.5, 0, 0]} />
          <mesh geometry={LIGHT_GEO} material={LIGHT.bulb} position={[0, 3.88, 0.55]} />
          <mesh geometry={HALO_GEO} material={LIGHT.halo} position={[0, 3.88, 0.55]} />
        </StaticMerge>
        {/* boom + sails flutter: not merged */}
        <group ref={main} position={[0, 0.85, 0.55]}>
          <mesh geometry={BOOM} material={M.mast} position={[0, 0, -0.95]} />
          <mesh geometry={MAIN} material={M.sail} position={[0, 0.04, 0]} />
        </group>
        <group ref={jib} position={[0, 0.62, 1.95]}>
          <mesh geometry={JIB} material={M.jib} />
        </group>
        {/* the reader lies back on the cushion, head to the bow */}
        <MiniBot
          ref={bot}
          color="#16a085"
          shadow={false}
          scale={0.9}
          position={[0, 0.58, -1.55]}
          rotation={[1.2, Math.PI, 0]}
        >
          {/* tablet held over the chest, screen toward the face */}
          <group position={[0, 0.42, 0.3]} rotation={[-2.05, 0, 0]} scale={1.35}>
            <mesh geometry={GEO.tablet} material={MAT.tablet} />
            <mesh geometry={GEO.screen} material={M.screen} position={[0, 0, 0.011]} />
          </group>
        </MiniBot>
      </group>
    </group>
  );
}
