import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { extraColor } from '../MiniBot.jsx';
import { world } from '../world.js';
import StaticMerge from '../../utils/StaticMerge.jsx';
import { HALO_GEO, LIGHT_GEO, hullGeo, hullMat, rideWaves, runningLightMats, setRunningLights, std } from './kit.js';

// Glass-bottom tour boat: a canopy, two benches of tourist bots looking down
// through a glass floor at tropical fish, and a guide at the bow pointing
// things out. Loops the island at r ~29 (swinging wide past Launch's Pier so
// the tug has room), easing to a stop now and then for a good look.

const ID = 'tourboat';
const SPEED = 1.1;
const R0 = 29;
const BUMP_AT = 2.72; // angle of the tug's parking spot off the west pier
const BUMP_W = 0.5;
const BUMP_R = 9;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const radius = (a) => {
  const d = angDiff(a, BUMP_AT);
  return Math.abs(d) < BUMP_W ? R0 + BUMP_R * 0.5 * (1 + Math.cos((Math.PI * d) / BUMP_W)) : R0;
};

const HULL = hullGeo(
  [
    { z: -2.4, w: 0.95, h: 0.45, d: 0.22 },
    { z: -1.2, w: 1.04, h: 0.46, d: 0.3 },
    { z: 0.6, w: 1.02, h: 0.48, d: 0.3 },
    { z: 1.7, w: 0.76, h: 0.55, d: 0.24 },
    { z: 2.65, w: 0.05, h: 0.66, d: 0.06 },
  ],
  { top: '#fdf8ee', bottom: '#2ec4c8', stripe: 0.55, deck: false }
);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const POST = new THREE.CylinderGeometry(0.035, 0.035, 1.7, 5);
const FISH_BODY = new THREE.IcosahedronGeometry(0.1, 0).scale(0.45, 0.9, 1.4);
const FISH_TAIL = new THREE.ConeGeometry(0.07, 0.11, 4).rotateX(-Math.PI / 2).scale(0.35, 1, 1).translate(0, 0, -0.17);
const VISOR = new THREE.CylinderGeometry(0.2, 0.22, 0.06, 8);

const M = {
  hull: hullMat(),
  deck: std('#c99a62'),
  bench: std('#8a5a33'),
  post: std('#f2efe6', { metalness: 0.2 }),
  roof: std('#f6f1e4', { side: THREE.DoubleSide }),
  fringe: std('#2ec4c8'),
  well: new THREE.MeshStandardMaterial({ color: '#1b9fc0', emissive: '#0d6f8f', emissiveIntensity: 0.35, flatShading: true, roughness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: '#c8f4ff', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false }),
  frame: std('#6e4a2b'),
  visor: std('#f1c40f'),
};
const FISH_MATS = ['#ffd23f', '#ff7f2a', '#2b6cff', '#ff4fa3', '#7cf06b', '#b26bff'].map((c) => std(c, { emissive: c, emissiveIntensity: 0.35, roughness: 0.4 }));
const RED = runningLightMats('#ff3b3b');
const GREEN = runningLightMats('#35ff6a');
const WHITE = runningLightMats('#fff4d6');
const WARM = runningLightMats('#ffc46b');

const SEATS = [
  [-0.8, -0.95, 1],
  [0.8, -0.5, -1],
  [-0.8, 0.05, 1],
  [0.8, 0.5, -1],
  [-0.8, 1.0, 1],
  [0.8, -1.4, -1],
];

function Fish({ mat, fishRef }) {
  return (
    <group ref={fishRef}>
      <mesh geometry={FISH_BODY} material={mat} />
      <mesh geometry={FISH_TAIL} material={mat} />
    </group>
  );
}

export default function TourBoat({ sky, lowPower }) {
  const outer = useRef();
  const inner = useRef();
  const guide = useRef();
  const tourists = useRef([]);
  const fish = useRef([]);
  const outside = useRef([]);
  const seats = lowPower ? SEATS.slice(0, 4) : SEATS;
  const nFish = lowPower ? 3 : 5;
  const nOut = lowPower ? 0 : 4;
  const fishSeeds = useMemo(
    () =>
      Array.from({ length: 9 }, () => ({
        w1: 0.5 + Math.random() * 0.5,
        w2: 0.25 + Math.random() * 0.3,
        p1: Math.random() * 6.28,
        p2: Math.random() * 6.28,
        y: Math.random(),
      })),
    []
  );
  const st = useRef({ a: Math.random() * Math.PI * 2, now: 0, mul: 1, nextPause: 25 + Math.random() * 30, pauseUntil: -1, pointer: -1, pointAt: 5 });
  const ride = useRef({ y: 0, pitch: 0, roll: 0 });
  const entry = useRef({ x: 0, z: 0, heading: 0, speed: 0, size: 5.2 });

  const night = (sky?.stars ?? 0) > 0.5;
  useEffect(() => {
    [RED, GREEN, WHITE, WARM].forEach((m) => setRunningLights(m, night));
  }, [night]);
  useEffect(() => () => world.boats.delete(ID), []);

  // Seated tourists, hands on knees, looking down through the glass.
  useEffect(() => {
    tourists.current.forEach((b) => {
      if (!b) return;
      b.footL.position.set(-0.08, 0.0, 0.16);
      b.footR.position.set(0.08, 0.0, 0.16);
      b.armL.rotation.set(-0.6, 0, 0.12);
      b.armR.rotation.set(-0.6, 0, -0.12);
      b.head.rotation.x = 0.45;
    });
  }, [seats.length]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const s = st.current;
    s.now += dt;
    const now = s.now;
    const g = outer.current;
    if (!g) return;

    // cruise, and now and then ease to a stop for a look at the fish
    if (s.pauseUntil < 0 && now > s.nextPause) s.pauseUntil = now + 7 + Math.random() * 4;
    const paused = s.pauseUntil > 0 && now < s.pauseUntil;
    if (s.pauseUntil > 0 && now >= s.pauseUntil) {
      s.pauseUntil = -1;
      s.nextPause = now + 35 + Math.random() * 40;
    }
    s.mul += ((paused ? 0 : 1) - s.mul) * Math.min(1, dt * 0.6);
    const v = SPEED * s.mul;
    const r = radius(s.a);
    s.a += (v / r) * dt;
    const a = s.a;
    const x = r * Math.cos(a);
    const z = r * Math.sin(a);
    const dr = (radius(a + 0.01) - radius(a - 0.01)) / 0.02;
    const tx = dr * Math.cos(a) - r * Math.sin(a);
    const tz = dr * Math.sin(a) + r * Math.cos(a);
    const heading = Math.atan2(tx, tz);
    const t = state.clock.elapsedTime;
    const w = rideWaves(ride.current, x, z, heading, 5, 2, t);
    g.position.set(x, w.y, z);
    g.rotation.y = heading;
    const ig = inner.current;
    ig.rotation.x = w.pitch * 0.8;
    ig.rotation.z = w.roll * 0.8;

    // the guide: points at the island (the boat's -x side, the guide's own
    // right as they face aft) while cruising, down at the glass when stopped
    const gb = guide.current;
    if (gb) {
      const k = paused ? 1 : 0;
      gb.armR.rotation.x = -0.25 - k * 0.6 + Math.sin(now * 1.3) * 0.08;
      gb.armR.rotation.z = 1.35 * (1 - k) + 0.1;
      gb.armL.rotation.x = Math.sin(now * 0.9) * 0.15;
      gb.head.rotation.y = paused ? 0 : 0.9 + Math.sin(now * 0.5) * 0.15;
      gb.head.rotation.x = paused ? 0.35 : 0;
      gb.pose.position.y = Math.abs(Math.sin(now * 2.1)) * 0.015;
    }

    // tourists: mostly heads down at the fish; one at a time points
    if (now > s.pointAt) {
      s.pointer = s.pointer >= 0 ? -1 : Math.floor(Math.random() * seats.length);
      s.pointAt = now + (s.pointer >= 0 ? 2.5 : 3 + Math.random() * 5);
    }
    tourists.current.forEach((b, i) => {
      if (!b || i >= seats.length) return;
      const ph = i * 1.7;
      const look = Math.sin(now * 0.23 + ph);
      b.head.rotation.x = look > 0.6 && !paused ? 0 : 0.45 + Math.sin(now * 0.7 + ph) * 0.06;
      b.head.rotation.y = look > 0.6 && !paused ? 0.7 * seats[i][2] : Math.sin(now * 0.4 + ph) * 0.25;
      const pointing = i === s.pointer;
      b.armR.rotation.x = pointing ? -1.1 + Math.sin(now * 6) * 0.06 : -0.6;
      b.armR.rotation.y = 0;
      b.pose.rotation.x = paused ? 0.15 : 0.05; // leaning in for a look
    });

    // fish in the window under the glass (boat frame)
    for (let i = 0; i < nFish; i++) {
      const f = fish.current[i];
      if (!f) continue;
      const sd = fishSeeds[i];
      const p1 = now * sd.w1 + sd.p1;
      const p2 = now * sd.w2 + sd.p2;
      f.position.set(Math.sin(p1) * 0.2, 0.1 + sd.y * 0.05, Math.sin(p2) * 0.95);
      const fx = Math.cos(p1) * 0.2 * sd.w1;
      const fz = Math.cos(p2) * 0.95 * sd.w2;
      f.rotation.y = Math.atan2(fx, fz);
      f.children[1].rotation.y = Math.sin(now * 9 + i) * 0.35;
    }
    // a few bigger fish escorting the boat under the water (world depth)
    for (let i = 0; i < nOut; i++) {
      const f = outside.current[i];
      if (!f) continue;
      const sd = fishSeeds[5 + i];
      const side = i % 2 ? 1 : -1;
      const p = now * sd.w1 + sd.p1;
      f.position.set(side * (1.35 + Math.sin(p) * 0.25), -0.28 - sd.y * 0.08 - w.y, -1.6 + i * 1.0 + Math.sin(p * 0.7) * 0.4);
      f.rotation.y = Math.sin(p) * 0.25;
      f.children[1].rotation.y = Math.sin(now * 8 + i) * 0.35;
    }

    const e = entry.current;
    e.x = x;
    e.z = z;
    e.heading = heading;
    e.speed = v;
    world.boats.set(ID, e);
  });

  return (
    <group ref={outer}>
      {/* escort fish under the water, not tilted with the hull */}
      {Array.from({ length: nOut }, (_, i) => (
        <group key={i} scale={1.6}>
          <Fish mat={FISH_MATS[(i + 2) % FISH_MATS.length]} fishRef={(el) => (outside.current[i] = el)} />
        </group>
      ))}
      <group ref={inner}>
        <StaticMerge version={night ? 1 : 0}>
        <mesh geometry={HULL} material={M.hull} />
        {/* deck around the glass window */}
        <mesh geometry={BOX} material={M.deck} position={[-0.62, 0.24, 0]} scale={[0.54, 0.06, 4.0]} />
        <mesh geometry={BOX} material={M.deck} position={[0.62, 0.24, 0]} scale={[0.54, 0.06, 4.0]} />
        <mesh geometry={BOX} material={M.deck} position={[0, 0.24, 1.6]} scale={[0.7, 0.06, 0.8]} />
        <mesh geometry={BOX} material={M.deck} position={[0, 0.24, -1.75]} scale={[0.7, 0.06, 1.1]} />
        {/* the window: sea-blue well, fish (moving, so under noMerge), then the glass */}
        <mesh geometry={BOX} material={M.well} position={[0, 0.0, 0]} scale={[0.7, 0.04, 2.4]} />
        <group userData={{ noMerge: true }}>
          {Array.from({ length: nFish }, (_, i) => (
            <Fish key={i} mat={FISH_MATS[i % FISH_MATS.length]} fishRef={(el) => (fish.current[i] = el)} />
          ))}
        </group>
        <mesh geometry={BOX} material={M.glass} position={[0, 0.26, 0]} scale={[0.7, 0.02, 2.4]} renderOrder={4} />
        <mesh geometry={BOX} material={M.frame} position={[-0.37, 0.28, 0]} scale={[0.05, 0.05, 2.45]} />
        <mesh geometry={BOX} material={M.frame} position={[0.37, 0.28, 0]} scale={[0.05, 0.05, 2.45]} />
        <mesh geometry={BOX} material={M.frame} position={[0, 0.28, 1.22]} scale={[0.78, 0.05, 0.05]} />
        <mesh geometry={BOX} material={M.frame} position={[0, 0.28, -1.22]} scale={[0.78, 0.05, 0.05]} />
        {/* benches */}
        <mesh geometry={BOX} material={M.bench} position={[-0.8, 0.37, -0.2]} scale={[0.3, 0.22, 3.0]} />
        <mesh geometry={BOX} material={M.bench} position={[0.8, 0.37, -0.2]} scale={[0.3, 0.22, 3.0]} />
        {/* canopy */}
        {[
          [-0.88, -1.75],
          [0.88, -1.75],
          [-0.82, 1.45],
          [0.82, 1.45],
        ].map(([px, pz], i) => (
          <mesh key={i} geometry={POST} material={M.post} position={[px, 1.2, pz]} />
        ))}
        <mesh geometry={BOX} material={M.roof} position={[0, 2.07, -0.15]} scale={[2.05, 0.07, 3.8]} />
        <mesh geometry={BOX} material={M.fringe} position={[-1.02, 1.98, -0.15]} scale={[0.03, 0.14, 3.8]} />
        <mesh geometry={BOX} material={M.fringe} position={[1.02, 1.98, -0.15]} scale={[0.03, 0.14, 3.8]} />
        <mesh geometry={BOX} material={M.fringe} position={[0, 1.98, 1.75]} scale={[2.05, 0.14, 0.03]} />
        <mesh geometry={BOX} material={M.fringe} position={[0, 1.98, -2.05]} scale={[2.05, 0.14, 0.03]} />
        {/* running lights: red to port (-x), green to starboard, white aft on the roof, warm bulbs under the canopy */}
        <mesh geometry={LIGHT_GEO} material={RED.bulb} position={[-0.72, 0.62, 1.75]} />
        <mesh geometry={HALO_GEO} material={RED.halo} position={[-0.72, 0.62, 1.75]} />
        <mesh geometry={LIGHT_GEO} material={GREEN.bulb} position={[0.72, 0.62, 1.75]} />
        <mesh geometry={HALO_GEO} material={GREEN.halo} position={[0.72, 0.62, 1.75]} />
        <mesh geometry={LIGHT_GEO} material={WHITE.bulb} position={[0, 2.16, -1.9]} />
        <mesh geometry={HALO_GEO} material={WHITE.halo} position={[0, 2.16, -1.9]} />
        {[-1.2, 0, 1.2].map((pz) => (
          <group key={pz} position={[0, 1.96, pz]}>
            <mesh geometry={LIGHT_GEO} material={WARM.bulb} />
            <mesh geometry={HALO_GEO} material={WARM.halo} scale={1.4} />
          </group>
        ))}
        </StaticMerge>
        {/* tourists (posed every frame: outside the merge) */}
        {seats.map(([sx, sz, face], i) => (
          <MiniBot
            key={i}
            ref={(el) => (tourists.current[i] = el)}
            color={extraColor(i * 3 + 1)}
            shadow={false}
            scale={1.05}
            position={[sx, 0.36, sz]}
            rotation={[0, (face * Math.PI) / 2, 0]}
          />
        ))}
        {/* the guide at the bow, facing the guests, in a yellow visor */}
        <MiniBot ref={guide} color="#F09024" shadow={false} scale={1.15} position={[0, 0.27, 1.75]} rotation={[0, Math.PI, 0]}>
          <mesh geometry={VISOR} material={M.visor} position={[0, 0.98, 0.04]} />
        </MiniBot>
      </group>
    </group>
  );
}
