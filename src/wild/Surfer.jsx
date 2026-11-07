import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { claimTravel, releaseTravel, slotBusy, TEST, testOn } from './director.js';
import { SEA_LANES } from '../utils/paths.js';
import { world } from '../world/state.js';
import MiniBot from '../world/MiniBot.jsx';
import { angDiff, clamp, hullGeometry, registerBoat, Spray, std, waveY } from '../world/boats/kit.js';

// Echo's jet ski: every 3 to 5 minutes Echo tears across the water on a
// sleek jet ski, carving S-turns, bouncing over the swell, throwing a
// rooster tail of spray and hopping off a wave, then is gone again. Never a
// constant loop, and it waits for the travel slot like the drone and plane.
// Runs stay out between the tour boat's loop and the sailboats, and pick a
// stretch of water away from the other boats.
//
// ?surf=test or ?test=jetski: a run right away, then every 20 seconds or so.

const DURATION = 13;
const QUICK = TEST.surf || testOn('jetski');
const nextGap = () => (QUICK ? 20 : 180 + Math.random() * 120);
const ID = 'jetski';

// The run lane: an ellipse between the tour loop and the sail lane.
const RX = Math.max(38.5, SEA_LANES.jetski.minR + 6);
const RZ = Math.max(32.5, SEA_LANES.jetski.minR + 2.5);
const SWERVE = 1.8; // S-turn amplitude
const SPAN = 2.1; // radians of lane per run
const HOP_AT = 0.52;
const HOP_LEN = 0.065;

const LEN = 1.5;
const DECK = 0.2;
const SCALE = 1.4;
const HULL_GEO = hullGeometry(LEN, 0.64, 0.34, { bow: 0.5, stern: 0.85, taper: 0.5, sheer: 0.1 });
const COWL_GEO = hullGeometry(0.62, 0.5, 0.14, { bow: 0.6, stern: 0.9, taper: 1, sheer: 0 });
const SEAT_GEO = new THREE.CapsuleGeometry(0.11, 0.5, 2, 6).rotateX(Math.PI / 2);
const BAR_GEO = new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5).rotateZ(Math.PI / 2);
const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);

const _p = new THREE.Vector3();
const _b = new THREE.Vector3();

// Point on the run at u (0..1).
function runPoint(r, u, out) {
  const a = r.a0 + r.dir * SPAN * u;
  const env = Math.min(1, u / 0.12, (1 - u) / 0.12);
  const off = SWERVE * Math.sin(u * Math.PI * 2 * 2.5) * env;
  return out.set((RX + off) * Math.cos(a), 0, (RZ + off * (RZ / RX)) * Math.sin(a));
}

// Pick a run: far side or flanks of the island from the camera, whichever is
// clearest of other boats.
function pickRun(camera) {
  const ac = Math.atan2(camera.position.z, camera.position.x);
  let best = null;
  for (const c of [Math.PI, Math.PI - 0.8, Math.PI + 0.8, 1.9, -1.9]) {
    for (const dir of [1, -1]) {
      const r = { a0: ac + c - (dir * SPAN) / 2, dir };
      let clear = Infinity;
      for (let i = 0; i <= 8; i++) {
        runPoint(r, i / 8, _p);
        world.boats.forEach((b, id) => {
          if (id !== ID) clear = Math.min(clear, Math.hypot(b.x - _p.x, b.z - _p.z) - (b.size || 2) * 0.5);
        });
      }
      const score = Math.min(clear, 20) + (Math.abs(c - Math.PI) < 1 ? 3 : 0) + Math.random() * 2;
      if (!best || score > best.score) best = { ...r, score };
    }
  }
  return best;
}

export default function Surfer({ color = '#2E86DE', sky = null }) {
  const { camera } = useThree();
  const group = useRef();
  const echo = useRef({});
  const run = useRef(null);
  const alive = useRef(0); // seconds of frames actually drawn, so nothing plays unseen in a hidden tab
  const nextAt = useRef(QUICK ? 2 : 60 + Math.random() * 90); // first ride 1 to 2.5 minutes in
  const night = sky?.stars ?? 0;

  const mats = useMemo(
    () => ({
      hull: std('#fdf8ee', { roughness: 0.35 }),
      accent: std(color, { roughness: 0.35, emissive: color, emissiveIntensity: 0.12 }),
      dark: std('#22242c'),
      stripe: std('#F09024'),
      lamp: std('#fff6d8', { emissive: '#fff2c0', emissiveIntensity: 0.3 }),
    }),
    [color]
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => {
    mats.lamp.emissiveIntensity = 0.3 + night * 2.5;
  }, [mats, night]);
  const glow = useMemo(() => ({ x: 0, z: 0, strength: 0.6 }), []);
  const spray = useMemo(() => new Spray(140, { gravity: 7.5, drag: 1.1, opacity: 0.9 }), []);
  useEffect(() => () => spray.dispose(), [spray]);
  useEffect(
    () => () => {
      releaseTravel('surf');
      world.boats.delete(ID);
      world.glow.delete(ID);
    },
    []
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    alive.current += dt;
    const now = alive.current;
    const g = group.current;
    spray.update(dt);
    if (!g) return;
    if (!run.current) {
      g.visible = false;
      if (now < nextAt.current) return;
      // A boat race owns the water: wait for it to finish.
      if (slotBusy('sea') || !claimTravel('surf', DURATION + 0.5)) {
        nextAt.current = now + 5;
        return;
      }
      run.current = { ...pickRun(camera), start: now, h: null, hopped: false, landed: false, x: 0, z: 0 };
    }
    const r = run.current;
    const u = (now - r.start) / DURATION;
    if (u >= 1) {
      run.current = null;
      g.visible = false;
      releaseTravel('surf');
      world.boats.delete(ID);
      world.glow.delete(ID);
      nextAt.current = now + nextGap();
      return;
    }
    claimTravel('surf', 2); // keep the travel slot while riding
    g.visible = true;
    const t = state.clock.elapsedTime;

    runPoint(r, u, _p);
    runPoint(r, Math.min(1, u + 0.004), _b);
    const h = Math.atan2(_b.x - _p.x, _b.z - _p.z);
    const turn = r.h === null ? 0 : angDiff(h, r.h) / Math.max(dt, 1e-3);
    r.h = h;
    const speed = r.x || r.z ? Math.hypot(_p.x - r.x, _p.z - r.z) / Math.max(dt, 1e-3) : 5;
    r.x = _p.x;
    r.z = _p.z;

    // Bounce over the swell, lean into the turns, a hop off a wave mid-run.
    const fade = Math.min(1, u / 0.04, (1 - u) / 0.04);
    let y = waveY(_p.x, _p.z, t) + Math.abs(Math.sin(now * 6.5)) * 0.07;
    let pitch = -0.07 + Math.sin(now * 6.5) * 0.04;
    const hk = (u - HOP_AT) / HOP_LEN;
    const hopping = hk > 0 && hk < 1;
    if (hopping) {
      y += 0.75 * Math.sin(Math.PI * hk);
      pitch = -0.38 * Math.cos(Math.PI * hk);
    }
    g.position.set(_p.x, y - (1 - fade) * 0.4, _p.z);
    g.rotation.set(pitch, h, clamp(-turn * 0.45, -0.5, 0.5), 'YXZ');
    g.scale.setScalar(Math.max(0.01, fade) * SCALE);
    g.updateMatrixWorld();

    // Echo hangs on, leaning into the turns and ducking for the hop.
    const e = echo.current;
    if (e.pose) {
      e.pose.rotation.z = clamp(-turn * 0.25, -0.3, 0.3);
      e.pose.rotation.x = 0.25 + (hopping ? 0.15 * Math.sin(Math.PI * hk) : 0);
      e.armL.rotation.x = -1.15;
      e.armR.rotation.x = -1.15;
      e.armL.rotation.z = -0.15;
      e.armR.rotation.z = 0.15;
      e.head.rotation.x = -0.1;
      e.head.rotation.y = Math.sin(now * 0.8) * 0.2;
    }

    // Spray: a rooster tail behind, a sheet off the outside of each turn,
    // bursts when she pops in, takes off, lands and leaves.
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    if (!hopping && fade > 0.5) {
      g.localToWorld(_b.set(0, 0.02, -LEN / 2 - 0.05));
      for (let i = 0; i < 3; i++) {
        const lat = (Math.random() - 0.5) * 0.7;
        spray.emit(_b.x, _b.y, _b.z, -fx * (1.2 + Math.random()) + fz * lat, 3.1 + Math.random() * 1.6, -fz * (1.2 + Math.random()) - fx * lat, 0.95, 0.08 + Math.random() * 0.08);
      }
      const side = turn > 0 ? -1 : 1; // outside of the turn, in local x
      const amt = clamp(Math.abs(turn) - 0.15, 0, 1);
      if (Math.random() < amt * 2) {
        g.localToWorld(_b.set(side * 0.34, 0, -0.1));
        const sx = Math.cos(h) * side;
        const sz = -Math.sin(h) * side;
        for (let i = 0; i < 2; i++) spray.emit(_b.x, _b.y, _b.z, sx * (2 + Math.random() * 1.5) - fx * 0.8, 1.6 + Math.random() * 1.2, sz * (2 + Math.random() * 1.5) - fz * 0.8, 0.7, 0.07 + Math.random() * 0.06);
      }
    }
    const burst = (n, up) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 1 + Math.random() * 1.8;
        spray.emit(_p.x + Math.cos(a) * 0.4, y - 0.05, _p.z + Math.sin(a) * 0.4, Math.cos(a) * s, up + Math.random() * 1.5, Math.sin(a) * s, 0.8, 0.07 + Math.random() * 0.07);
      }
    };
    if (u < 0.03 && Math.random() < 0.5) burst(2, 1.2);
    if (u > 0.96 && Math.random() < 0.5) burst(2, 1.2);
    if (hopping && !r.hopped) {
      r.hopped = true;
      burst(10, 2);
    }
    if (hk >= 1 && !r.landed) {
      r.landed = true;
      burst(22, 2.6);
    }

    registerBoat(ID, _p.x, _p.z, h, hopping ? 0 : speed, LEN * SCALE, 0);
    glow.x = _p.x;
    glow.z = _p.z;
    world.glow.set(ID, glow);
  });

  return (
    <>
      <group ref={group} visible={false}>
        <group>
          {/* hull, colored cowling, seat and handlebars */}
          <mesh geometry={HULL_GEO} material={mats.hull} position={[0, DECK, 0]} />
          <mesh geometry={COWL_GEO} material={mats.accent} position={[0, DECK + 0.13, 0.4]} />
          <mesh geometry={BOX_GEO} material={mats.stripe} position={[0.315, DECK - 0.1, -0.1]} scale={[0.02, 0.05, 1.0]} />
          <mesh geometry={BOX_GEO} material={mats.stripe} position={[-0.315, DECK - 0.1, -0.1]} scale={[0.02, 0.05, 1.0]} />
          <mesh geometry={BOX_GEO} material={mats.accent} position={[0, DECK + 0.02, -0.25]} scale={[0.5, 0.06, 0.9]} />
          <mesh geometry={SEAT_GEO} material={mats.dark} position={[0, DECK + 0.13, -0.38]} />
          <mesh geometry={BOX_GEO} material={mats.dark} position={[0, DECK + 0.22, 0.3]} scale={[0.06, 0.2, 0.06]} rotation={[0.4, 0, 0]} />
          <mesh geometry={BAR_GEO} material={mats.dark} position={[0, DECK + 0.33, 0.24]} />
          <mesh geometry={BOX_GEO} material={mats.lamp} position={[0, DECK + 0.14, 0.66]} scale={[0.14, 0.05, 0.04]} />
          {/* Echo, riding */}
          <MiniBot color={color} parts={echo} position={[0, DECK + 0.02, 0.0]} scale={0.62} shadow={false} />
        </group>
      </group>
      <primitive object={spray.mesh} />
    </>
  );
}
