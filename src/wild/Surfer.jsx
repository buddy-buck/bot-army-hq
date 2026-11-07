import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { claimTravel, releaseTravel, TEST } from './director.js';
import { world } from './world.js';
import MiniBot from './MiniBot.jsx';
import StaticMerge from '../utils/StaticMerge.jsx';
import { Spray, hullGeo, hullMat, rideWaves, std } from './boats/kit.js';

// Echo's jet ski: every 3 to 5 minutes Echo rips past the far side of the
// island, carving S-turns, hopping the chop and throwing a rooster tail.
// Never a constant loop, and it waits for the travel slot like the drone and
// the seaplane. (The file keeps its old name: it used to be a surfboard.)

const DURATION = 13;
const nextGap = () => (TEST.surf ? 20 : 180 + Math.random() * 120); // ?surf=test: every 30 seconds or so
const SCALE = 1.35;
const D = 26; // distance of the run line from the island center
const A = 2.2; // S-turn amplitude
const WAVES = 4 * Math.PI; // two full S-turns per run
const HALF = 32; // run goes from -HALF to +HALF across

const HULL = hullGeo(
  [
    { z: -1.0, w: 0.34, h: 0.26, d: 0.1 },
    { z: -0.45, w: 0.4, h: 0.3, d: 0.16 },
    { z: 0.3, w: 0.37, h: 0.31, d: 0.17 },
    { z: 0.8, w: 0.21, h: 0.27, d: 0.12 },
    { z: 1.08, w: 0.03, h: 0.2, d: 0.03 },
  ],
  { top: '#ffffff', bottom: '#f4f6f8', stripe: 0.2 }
);
const HOOD = new THREE.CylinderGeometry(0.06, 0.3, 0.55, 5, 1).rotateX(Math.PI / 2).scale(1, 0.55, 1);
const SEAT = new THREE.CapsuleGeometry(0.15, 0.55, 2, 6).rotateX(Math.PI / 2).scale(1, 0.6, 1);
const COLUMN = new THREE.CylinderGeometry(0.035, 0.05, 0.3, 5);
const BAR = new THREE.CylinderGeometry(0.022, 0.022, 0.56, 5).rotateZ(Math.PI / 2);
const GRIP = new THREE.CylinderGeometry(0.032, 0.032, 0.1, 5).rotateZ(Math.PI / 2);
const SCREEN = new THREE.PlaneGeometry(0.3, 0.16);
const NOZZLE = new THREE.CylinderGeometry(0.07, 0.09, 0.12, 6).rotateX(Math.PI / 2);

const MATS = {
  hull: hullMat(),
  seat: std('#23272f', { roughness: 0.8 }),
  metal: std('#3a4048', { metalness: 0.4, roughness: 0.4 }),
  grip: std('#15181d'),
  screen: new THREE.MeshStandardMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.45, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
};

export default function Surfer({ color = '#2E86DE' }) {
  const { camera, size, viewport } = useThree();
  const outer = useRef();
  const inner = useRef();
  const bot = useRef();
  const run = useRef(null);
  const alive = useRef(0); // seconds of frames actually drawn, so nothing plays unseen in a hidden tab
  const nextAt = useRef(TEST.surf ? 2 : 60 + Math.random() * 90); // first ride 1 to 2.5 minutes in
  const ride = useRef({ y: 0, pitch: 0, roll: 0 });
  const entry = useRef({ x: 0, z: 0, heading: 0, speed: 0, size: 2.8 });
  const emit = useRef({ tail: 0, side: 0 });

  const accent = useMemo(() => std(color, { emissive: color, emissiveIntensity: 0.08, roughness: 0.4 }), [color]);
  useEffect(() => () => accent.dispose(), [accent]);

  const spray = useMemo(() => new Spray(110, { size: 0.17, opacity: 0.8 }), []);
  useEffect(() => () => spray.dispose(), [spray]);

  useEffect(
    () => () => {
      releaseTravel('surf');
      world.boats.delete('jetski');
    },
    []
  );

  // Hunched over the bars.
  useEffect(() => {
    const b = bot.current;
    if (!b) return;
    b.pose.rotation.x = 0.5;
    b.head.rotation.x = -0.35;
    b.armL.rotation.set(-1.25, 0, 0.05);
    b.armR.rotation.set(-1.25, 0, -0.05);
    b.footL.position.set(-0.25, 0.03, 0.1);
    b.footR.position.set(0.25, 0.03, 0.1);
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    alive.current += dt;
    const now = alive.current;
    const g = outer.current;
    if (!g) return;
    const r0 = run.current;
    if (!r0) {
      g.visible = false;
      spray.points.visible = false;
      if (now < nextAt.current) return;
      if (!claimTravel('surf', DURATION + 0.5)) {
        nextAt.current = now + 5;
        return;
      }
      let fx = -camera.position.x;
      let fz = -camera.position.z;
      const fl = Math.hypot(fx, fz) || 1;
      fx /= fl;
      fz /= fl;
      // Always left to right across the far side, as seen from the camera.
      run.current = { start: now, fx, fz, rx: -fz, rz: fx };
      spray.clear();
    }
    const r = run.current;
    const u = (now - r.start) / DURATION;
    if (u < 1) claimTravel('surf', 2); // keep the travel slot while riding
    if (u >= 1) {
      run.current = null;
      g.visible = false;
      spray.points.visible = false;
      world.boats.delete('jetski');
      releaseTravel('surf');
      nextAt.current = now + nextGap();
      return;
    }
    g.visible = true;
    spray.points.visible = true;

    // Path: a line behind the island with S-turns weaving toward and away.
    const off = (v) => D + A * Math.sin(v * WAVES);
    const lat = (v) => -HALF + 2 * HALF * v;
    const x = r.fx * off(u) + r.rx * lat(u);
    const z = r.fz * off(u) + r.rz * lat(u);
    // velocity and acceleration (per second), from the path's derivatives
    const dOff = (A * WAVES * Math.cos(u * WAVES)) / DURATION;
    const ddOff = (-A * WAVES * WAVES * Math.sin(u * WAVES)) / (DURATION * DURATION);
    const dLat = (2 * HALF) / DURATION;
    const vx = r.fx * dOff + r.rx * dLat;
    const vz = r.fz * dOff + r.rz * dLat;
    const ax = r.fx * ddOff;
    const az = r.fz * ddOff;
    const heading = Math.atan2(vx, vz);
    const speed = Math.hypot(vx, vz);
    const ch = Math.cos(heading);
    const sh = Math.sin(heading);
    const aSide = ax * ch - az * sh; // toward local +x

    const fade = Math.min(1, u / 0.06, (1 - u) / 0.06);
    const t = state.clock.elapsedTime;
    const w = rideWaves(ride.current, x, z, heading, 2.7, 1.0, t);
    // hopping the chop: a little airtime every second or so
    const hop = Math.pow(Math.max(0, Math.sin(now * 5.3)), 3) * 0.16 + Math.pow(Math.max(0, Math.sin(now * 2.1 + 1)), 6) * 0.12;
    g.position.set(x, w.y + 0.02 + hop - (1 - fade) * 0.5, z);
    g.rotation.y = heading;
    g.scale.setScalar(Math.max(0.01, fade) * SCALE);
    const ig = inner.current;
    ig.rotation.x = w.pitch - 0.1 - hop * 0.9; // nose up under power, more in the air
    ig.rotation.z = THREE.MathUtils.clamp(-aSide * 0.09, -0.5, 0.5) + w.roll * 0.5;
    const b = bot.current;
    if (b) {
      b.root.position.y = 0.3 + Math.sin(now * 9) * 0.012 - hop * 0.15;
      b.pose.rotation.z = -ig.rotation.z * 0.5; // Echo leans into the turn, then some
    }

    const e = entry.current;
    e.x = x;
    e.z = z;
    e.heading = heading;
    e.speed = speed * fade;
    world.boats.set('jetski', e);

    // Spray: the rooster tail arcs up and back off the stern, plus sheets
    // of side spray off the chines. Only while the hull is on the water.
    const em = emit.current;
    const wet = fade > 0.6 && hop < 0.06;
    if (wet) {
      em.tail += dt * 75;
      em.side += dt * 50;
    }
    const sx = x - sh * 1.4;
    const sz = z - ch * 1.4;
    while (em.tail >= 1) {
      em.tail -= 1;
      const back = 0.8 + Math.random() * 1.6;
      const up = 4 + Math.random() * 2.2;
      const jit = (Math.random() - 0.5) * 0.9;
      spray.emit(sx + (Math.random() - 0.5) * 0.15, w.y + 0.1, sz + (Math.random() - 0.5) * 0.15, -sh * back + ch * jit, up, -ch * back - sh * jit, 1 + Math.random() * 0.3);
    }
    while (em.side >= 1) {
      em.side -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const out = 1.6 + Math.random() * 1.4;
      const along = 0.2 + Math.random() * 0.5;
      const px = x + sh * along + ch * side * 0.5;
      const pz = z + ch * along - sh * side * 0.5;
      spray.emit(px, w.y + 0.05, pz, ch * side * out - sh * 0.8, 1.3 + Math.random() * 1.2, -sh * side * out - ch * 0.8, 0.5);
    }
    spray.update(dt, camera, size.height * viewport.dpr);
  });

  return (
    <>
      <primitive object={spray.points} />
      <group ref={outer} visible={false}>
        <group ref={inner}>
          {/* fixed parts bake into a few draws; the rider stays outside */}
          <StaticMerge version={color}>
          <mesh geometry={HULL} material={MATS.hull} />
          {/* Echo-colored hood and side panels */}
          <mesh geometry={HOOD} material={accent} position={[0, 0.36, 0.62]} />
          <mesh material={accent} position={[0, 0.2, -0.2]} scale={[0.83, 0.05, 1.3]}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
          <mesh geometry={SEAT} material={MATS.seat} position={[0, 0.36, -0.35]} />
          <mesh geometry={NOZZLE} material={MATS.metal} position={[0, -0.02, -1.02]} />
          <mesh geometry={COLUMN} material={MATS.metal} position={[0, 0.44, 0.36]} rotation={[-0.35, 0, 0]} />
          <mesh geometry={BAR} material={MATS.metal} position={[0, 0.56, 0.31]} />
          <mesh geometry={GRIP} material={MATS.grip} position={[-0.25, 0.56, 0.31]} />
          <mesh geometry={GRIP} material={MATS.grip} position={[0.25, 0.56, 0.31]} />
          <mesh geometry={SCREEN} material={MATS.screen} position={[0, 0.6, 0.48]} rotation={[-0.5, 0, 0]} />
          </StaticMerge>
          <MiniBot ref={bot} color={color} shadow={false} scale={0.85} position={[0, 0.3, -0.18]} />
        </group>
      </group>
    </>
  );
}
