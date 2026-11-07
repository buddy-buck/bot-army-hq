import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TEST, rareGap } from '../director.js';
import { world } from '../world.js';
import StaticMerge from '../../utils/StaticMerge.jsx';
import { HALO_GEO, LIGHT_GEO, crateTexture, hullGeo, hullMat, rideWaves, runningLightMats, setRunningLights, std } from './kit.js';

// A chunky tug hauling a barge of PROMPT crates in from the open sea. It
// comes up from the south-west, eases in beside the end of Launch's Pier,
// sits a while (smoke puffing, tow line going slack), then loops round and
// heads back out. Every few minutes (rareGap 150-240 s). It doesn't use the
// travel slot: it's a boat, not a show.

const TUG_ID = 'tugboat';
const BARGE_ID = 'barge';
const VMAX = 2.4;
const TOW = 6.2; // tug center to barge center along the track
const FADE = 7;

const v3 = (x, z) => new THREE.Vector3(x, 0, z);
const IN = new THREE.CatmullRomCurve3([v3(-66, 52), v3(-50, 36), v3(-37, 22), v3(-28.5, 13), v3(-23.6, 8.7)], false, 'centripetal');
const OUT = new THREE.CatmullRomCurve3(
  [v3(-23.6, 8.7), v3(-20.9, 10.4), v3(-20.7, 13.5), v3(-23.6, 15.8), v3(-29.5, 17.8), v3(-40, 26), v3(-52, 40), v3(-67, 53)],
  false,
  'centripetal'
);
const LA = IN.getLength();
const LB = OUT.getLength();
const LTOT = LA + LB;
const P0 = IN.getPointAt(0);
const T0 = IN.getTangentAt(0);
const P1 = OUT.getPointAt(1);
const T1 = OUT.getTangentAt(1);

// position + tangent along the whole trip at arc length s (extrapolated past the ends)
function track(s, pos, tan) {
  if (s <= 0) {
    tan.copy(T0);
    pos.copy(P0).addScaledVector(T0, s);
  } else if (s <= LA) {
    IN.getPointAt(s / LA, pos);
    IN.getTangentAt(s / LA, tan);
  } else if (s <= LTOT) {
    OUT.getPointAt((s - LA) / LB, pos);
    OUT.getTangentAt((s - LA) / LB, tan);
  } else {
    tan.copy(T1);
    pos.copy(P1).addScaledVector(T1, s - LTOT);
  }
}
const fadeAt = (s) => THREE.MathUtils.clamp(Math.min(s / FADE, (LTOT - s) / FADE), 0, 1);

// --- Tug ----------------------------------------------------------------
const TUG_HULL = hullGeo(
  [
    { z: -1.5, w: 0.68, h: 0.45, d: 0.3 },
    { z: -0.6, w: 0.78, h: 0.45, d: 0.42 },
    { z: 0.5, w: 0.76, h: 0.5, d: 0.42 },
    { z: 1.2, w: 0.55, h: 0.6, d: 0.32 },
    { z: 1.62, w: 0.08, h: 0.68, d: 0.1 },
  ],
  { top: '#1d1f24', bottom: '#c0392b', stripe: 0.3, deckColor: '#8a8f96' }
);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const STACK = new THREE.CylinderGeometry(0.15, 0.17, 0.75, 7);
const STACK_TOP = new THREE.CylinderGeometry(0.16, 0.16, 0.14, 7);
const MAST = new THREE.CylinderGeometry(0.025, 0.025, 0.6, 4);
const TIRE = new THREE.TorusGeometry(0.14, 0.05, 4, 8).rotateY(Math.PI / 2);
const BUMPER = new THREE.CylinderGeometry(0.12, 0.12, 0.42, 6);
const BITT = new THREE.CylinderGeometry(0.06, 0.07, 0.18, 6);
const PUFF = new THREE.IcosahedronGeometry(1, 0);
const ROPE = new THREE.CylinderGeometry(0.028, 0.028, 1, 4);
const BULB = new THREE.IcosahedronGeometry(0.09, 0);

// --- Barge --------------------------------------------------------------
const BARGE_HULL = hullGeo(
  [
    { z: -2.15, w: 1.1, h: 0.38, d: 0.18 },
    { z: 1.6, w: 1.1, h: 0.38, d: 0.22 },
    { z: 2.2, w: 0.92, h: 0.42, d: 0.04 },
  ],
  { top: '#5b636c', bottom: '#9c4a2a', stripe: 0.4, deckColor: '#6e7379' }
);
const CRATE = 0.78;
const CRATES = [];
for (const z of [-1.4, -0.5, 0.4, 1.3]) for (const x of [-0.44, 0.44]) CRATES.push([x, 0.38 + CRATE / 2, z, CRATES.length % 3 === 1 ? 1 : 0, (Math.random() - 0.5) * 0.12]);
CRATES.push([-0.44, 0.38 + CRATE * 1.5, -0.95, 1, 0.08], [0.44, 0.38 + CRATE * 1.5, -0.95, 0, -0.1], [0.0, 0.38 + CRATE * 1.5, 0.85, 0, 0.2], [-0.2, 0.38 + CRATE * 2.5, -0.95, 0, 0.35]);

const M = {
  hull: hullMat(),
  white: std('#f7f5ef'),
  red: std('#c0392b'),
  black: std('#1d1f24'),
  rubber: std('#2a2a2a', { roughness: 0.95 }),
  window: std('#2b4a6b', { emissive: '#ffcf7a', emissiveIntensity: 0, roughness: 0.3 }),
  rope: std('#b89a6a', { roughness: 0.95 }),
  smoke: new THREE.MeshStandardMaterial({ color: '#d9d9d9', flatShading: true, transparent: true, opacity: 0.7, depthWrite: false, roughness: 1 }),
  idea: new THREE.MeshStandardMaterial({ color: '#fff3a0', emissive: '#ffd23f', emissiveIntensity: 1.2, flatShading: true }),
};
let crateMats = null;
const getCrateMats = () => {
  if (!crateMats) {
    const a = crateTexture(['PROMPTS']);
    const b = crateTexture(['PROMPT', 'CRATE']);
    crateMats = [std('#ffffff', { map: a, roughness: 0.85 }), std('#ffffff', { map: b, roughness: 0.85 })];
  }
  return crateMats;
};
const RED = runningLightMats('#ff3b3b');
const GREEN = runningLightMats('#35ff6a');
const WHITE = runningLightMats('#fff4d6');

export default function Tugboat({ sky, lowPower }) {
  const tug = useRef();
  const tugIn = useRef();
  const barge = useRef();
  const bargeIn = useRef();
  const ropes = useRef([]);
  const puffs = useRef([]);
  const nPuffs = lowPower ? 5 : 9;
  const crateMat = useMemo(getCrateMats, []);
  const st = useRef({ phase: 'wait', s: 0, v: 0, now: 0, at: TEST.rare ? 3 : 20 + Math.random() * 40, puffAt: 0, puffNext: 0 });
  const puffState = useMemo(() => Array.from({ length: 9 }, () => ({ t0: -99, life: 2.6, x: 0, y: 0, z: 0 })), []);
  const tmp = useMemo(
    () => ({
      p: new THREE.Vector3(),
      t: new THREE.Vector3(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      q0: new THREE.Vector3(),
      q1: new THREE.Vector3(),
      d: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      ride: { y: 0, pitch: 0, roll: 0 },
    }),
    []
  );
  const tugEntry = useRef({ x: 0, z: 0, heading: 0, speed: 0, size: 3.2 });
  const bargeEntry = useRef({ x: 0, z: 0, heading: 0, speed: 0, size: 4.4 });

  const night = (sky?.stars ?? 0) > 0.5;
  useEffect(() => {
    [RED, GREEN, WHITE].forEach((m) => setRunningLights(m, night));
    M.window.emissiveIntensity = night ? 0.9 : 0;
  }, [night]);
  useEffect(
    () => () => {
      world.boats.delete(TUG_ID);
      world.boats.delete(BARGE_ID);
    },
    []
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const s = st.current;
    s.now += dt;
    const now = s.now;
    const tg = tug.current;
    const bg = barge.current;
    if (!tg || !bg) return;

    if (s.phase === 'wait') {
      tg.visible = bg.visible = false;
      ropes.current.forEach((r) => r && (r.visible = false));
      puffs.current.forEach((p) => p && (p.visible = false));
      world.boats.delete(TUG_ID);
      world.boats.delete(BARGE_ID);
      if (now < s.at) return;
      s.phase = 'in';
      s.s = 0;
      s.v = VMAX;
    }
    if (s.phase === 'in') {
      s.v = THREE.MathUtils.clamp(Math.sqrt(2 * 0.3 * Math.max(0, LA - s.s)), 0.12, VMAX);
      s.s += s.v * dt;
      if (s.s >= LA - 0.02) {
        s.s = LA;
        s.v = 0;
        s.phase = 'stop';
        s.at = now + 16 + Math.random() * 8;
      }
    } else if (s.phase === 'stop') {
      if (now >= s.at) {
        s.phase = 'out';
        s.at = now;
      }
    } else if (s.phase === 'out') {
      s.v = Math.min(VMAX, 0.15 + (now - s.at) * 0.3);
      s.s += s.v * dt;
      if (s.s - TOW > LTOT + 1) {
        s.phase = 'wait';
        s.at = now + rareGap(150, 240);
        return;
      }
    }
    tg.visible = bg.visible = true;
    const t = state.clock.elapsedTime;
    const { p, t: tan, ride } = tmp;

    // tug
    track(s.s, p, tan);
    const th = Math.atan2(tan.x, tan.z);
    let w = rideWaves(ride, p.x, p.z, th, 3.2, 1.5, t);
    const tf = fadeAt(s.s);
    tg.position.set(p.x, w.y - (1 - tf) * 0.6, p.z);
    tg.rotation.y = th;
    tg.scale.setScalar(Math.max(0.01, tf));
    tugIn.current.rotation.set(w.pitch - s.v * 0.025, 0, w.roll + Math.sin(now * 1.1) * 0.02);
    const tx = p.x;
    const tz = p.z;
    const ty = w.y;
    const te = tugEntry.current;
    te.x = tx;
    te.z = tz;
    te.heading = th;
    te.speed = s.v;
    if (tf > 0.05) world.boats.set(TUG_ID, te);
    else world.boats.delete(TUG_ID);

    // barge, on the tug's track TOW behind
    const bs = s.s - TOW;
    track(bs, p, tan);
    const bh = Math.atan2(tan.x, tan.z);
    w = rideWaves(ride, p.x, p.z, bh, 4.3, 2.2, t);
    const bf = fadeAt(bs);
    bg.position.set(p.x, w.y - 0.05 - (1 - bf) * 0.6, p.z);
    bg.rotation.y = bh;
    bg.scale.setScalar(Math.max(0.01, bf));
    bargeIn.current.rotation.set(w.pitch * 0.7, 0, w.roll * 0.7);
    const be = bargeEntry.current;
    be.x = p.x;
    be.z = p.z;
    be.heading = bh;
    be.speed = s.v;
    if (bf > 0.05) world.boats.set(BARGE_ID, be);
    else world.boats.delete(BARGE_ID);

    // tow line: tug's stern bitt to the barge's bow, sagging (more when slack)
    const { a, b, q0, q1, d, up } = tmp;
    a.set(tx - Math.sin(th) * 1.42, ty + 0.55, tz - Math.cos(th) * 1.42);
    b.set(p.x + Math.sin(bh) * 2.1, w.y + 0.42, p.z + Math.cos(bh) * 2.1);
    const chord = a.distanceTo(b);
    const slack = Math.max(0, TOW - 3.55 - chord);
    const sag = Math.min(0.5, 0.1 + slack * 0.5 + (s.phase === 'stop' ? 0.3 : 0));
    const show = Math.min(tf, bf) > 0.5;
    const n = ropes.current.length;
    for (let i = 0; i < n; i++) {
      const r = ropes.current[i];
      if (!r) continue;
      r.visible = show;
      if (!show) continue;
      const u0 = i / n;
      const u1 = (i + 1) / n;
      q0.lerpVectors(a, b, u0);
      q0.y -= sag * Math.sin(Math.PI * u0);
      q1.lerpVectors(a, b, u1);
      q1.y -= sag * Math.sin(Math.PI * u1);
      d.subVectors(q1, q0);
      const len = d.length();
      r.position.addVectors(q0, q1).multiplyScalar(0.5);
      r.quaternion.setFromUnitVectors(up, d.multiplyScalar(1 / (len || 1)));
      r.scale.set(1, len, 1);
    }

    // smoke puffs from the stack: brisk under way, lazy while waiting
    if (tf > 0.5 && now >= s.puffNext) {
      s.puffNext = now + (s.phase === 'stop' ? 0.9 : 0.42);
      const ps = puffState[s.puffAt % nPuffs];
      s.puffAt++;
      ps.t0 = now;
      ps.x = tx - Math.sin(th) * 0.4;
      ps.y = ty + 1.75;
      ps.z = tz - Math.cos(th) * 0.4;
    }
    for (let i = 0; i < nPuffs; i++) {
      const m = puffs.current[i];
      if (!m) continue;
      const ps = puffState[i];
      const k = (now - ps.t0) / ps.life;
      if (k < 0 || k >= 1) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      const age = now - ps.t0;
      m.position.set(ps.x + age * 0.3, ps.y + age * 0.55, ps.z + age * 0.08);
      m.scale.setScalar((0.12 + k * 0.42) * (k < 0.7 ? 1 : (1 - k) / 0.3));
      m.rotation.set(age * 0.6, age * 0.4, 0);
    }
  });

  return (
    <>
      {/* world-space bits: smoke and tow line */}
      {Array.from({ length: nPuffs }, (_, i) => (
        <mesh key={`p${i}`} ref={(el) => (puffs.current[i] = el)} geometry={PUFF} material={M.smoke} visible={false} />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={`r${i}`} ref={(el) => (ropes.current[i] = el)} geometry={ROPE} material={M.rope} visible={false} />
      ))}

      <group ref={tug} visible={false}>
        <group ref={tugIn}>
          <StaticMerge version={night ? 1 : 0}>
          <mesh geometry={TUG_HULL} material={M.hull} />
          {/* cabin and wheelhouse */}
          <mesh geometry={BOX} material={M.white} position={[0, 0.78, 0.15]} scale={[1.0, 0.62, 1.1]} />
          <mesh geometry={BOX} material={M.white} position={[0, 1.3, 0.3]} scale={[0.86, 0.46, 0.72]} />
          <mesh geometry={BOX} material={M.window} position={[0, 1.36, 0.3]} scale={[0.88, 0.18, 0.74]} />
          <mesh geometry={BOX} material={M.window} position={[0, 0.86, 0.15]} scale={[1.02, 0.14, 0.7]} />
          <mesh geometry={BOX} material={M.red} position={[0, 1.56, 0.3]} scale={[0.98, 0.06, 0.84]} />
          {/* stack */}
          <mesh geometry={STACK} material={M.red} position={[0, 1.36, -0.4]} />
          <mesh geometry={STACK_TOP} material={M.black} position={[0, 1.78, -0.4]} />
          {/* mast with the white light */}
          <mesh geometry={MAST} material={M.black} position={[0, 1.88, 0.42]} />
          <mesh geometry={LIGHT_GEO} material={WHITE.bulb} position={[0, 2.2, 0.42]} />
          <mesh geometry={HALO_GEO} material={WHITE.halo} position={[0, 2.2, 0.42]} />
          {/* side lights on the wheelhouse wings */}
          <mesh geometry={LIGHT_GEO} material={RED.bulb} position={[-0.48, 1.3, 0.55]} />
          <mesh geometry={HALO_GEO} material={RED.halo} position={[-0.48, 1.3, 0.55]} />
          <mesh geometry={LIGHT_GEO} material={GREEN.bulb} position={[0.48, 1.3, 0.55]} />
          <mesh geometry={HALO_GEO} material={GREEN.halo} position={[0.48, 1.3, 0.55]} />
          {/* bow bumper, tire fenders, stern bitt */}
          <mesh geometry={BUMPER} material={M.rubber} position={[0, 0.42, 1.62]} />
          {[-0.6, 0.4].map((z) => (
            <group key={z}>
              <mesh geometry={TIRE} material={M.rubber} position={[-0.78, 0.2, z]} />
              <mesh geometry={TIRE} material={M.rubber} position={[0.78, 0.2, z]} />
            </group>
          ))}
          <mesh geometry={BITT} material={M.black} position={[0, 0.54, -1.32]} />
          </StaticMerge>
        </group>
      </group>

      <group ref={barge} visible={false}>
        <group ref={bargeIn}>
          <StaticMerge version={night ? 1 : 0}>
          <mesh geometry={BARGE_HULL} material={M.hull} />
          {CRATES.map(([x, y, z, k, ry], i) => (
            <mesh key={i} geometry={BOX} material={crateMat[k]} position={[x, y, z]} rotation={[0, ry, 0]} scale={CRATE} />
          ))}
          {/* one crate on top has its lid popped: an idea glowing inside */}
          <mesh geometry={BOX} material={crateMat[0]} position={[0.1, 0.38 + CRATE * 2.02, 0.95]} rotation={[0.5, 0.2, 0]} scale={[CRATE, 0.06, CRATE]} />
          <mesh geometry={BULB} material={M.idea} position={[0.0, 0.38 + CRATE * 2.05, 0.85]} />
          <mesh geometry={BITT} material={M.black} position={[0, 0.48, 1.95]} />
          <mesh geometry={LIGHT_GEO} material={WHITE.bulb} position={[0, 0.55, -2.05]} />
          <mesh geometry={HALO_GEO} material={WHITE.halo} position={[0, 0.55, -2.05]} />
          </StaticMerge>
        </group>
      </group>
    </>
  );
}
