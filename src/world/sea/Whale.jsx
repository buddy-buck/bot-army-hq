import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SEA_LANES, islandE } from '../../utils/paths.js';
import { aliveClock, claimSlot, releaseSlot, testOn } from '../../wild/director.js';
import { FX, emitFx, ripple, splashFoam } from './fx.js';
import { splash } from './Spray.jsx';
import { BODY_GEO, CONE4, LOW_GEO, buildGeo, rnd, std, toScreen } from './kit.js';

// The rare one: a humpback far out at sea, on the side the camera can see.
// It blows once at the surface, slips under, then bursts out nose first,
// twists onto its back with its long white flippers flung wide and crashes
// down in a huge splash that leaves a ring of foam. A little later it blows
// again and dives, tail flukes high. Roughly once every 8 to 15 minutes on
// screen, through the 'rare' slot. ?test=whale: within 5 s, then every 25 s.

const MAT = {
  back: std('#3c4859', { roughness: 0.55 }),
  belly: std('#d9dee3', { roughness: 0.6 }),
  grooves: std('#b9c1c9', { roughness: 0.6 }),
  knob: std('#4c596b'),
  flipper: std('#e8ecef', { roughness: 0.55 }),
  flukeTop: new THREE.MeshStandardMaterial({ color: '#36424f', flatShading: true, roughness: 0.55, side: THREE.BackSide }),
  flukeUnder: new THREE.MeshStandardMaterial({ color: '#e3e8ec', flatShading: true, roughness: 0.55 }),
  mist: new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, transparent: true, opacity: 0.7, depthWrite: false, roughness: 1 }),
};

// Butterfly flukes with a notch in the middle, built flat. Its faces point
// down, so the white underside is the front face and the dark top the back.
const FLUKE_GEO = buildGeo(
  [0, 0, 0, 2.0, 0.05, -1.05, 0.95, 0, -0.95, 0, 0, -0.55, -0.95, 0, -0.95, -2.0, 0.05, -1.05],
  [0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4]
);

// Nose along +z, about 8 units long, center near the middle of the body.
function WhaleModel({ pecs }) {
  return (
    <group>
      <mesh geometry={BODY_GEO} material={MAT.back} position={[0, 0, 0.3]} scale={[1.0, 0.95, 3.3]} />
      <mesh geometry={BODY_GEO} material={MAT.grooves} position={[0, -0.36, 1.2]} scale={[0.86, 0.6, 2.5]} />
      <mesh geometry={BODY_GEO} material={MAT.belly} position={[0, -0.42, 0.2]} scale={[0.7, 0.45, 2.6]} />
      {/* broad flat head with knobbly tubercles */}
      <mesh geometry={BODY_GEO} material={MAT.back} position={[0, -0.05, 2.9]} scale={[0.82, 0.58, 1.35]} />
      {[[0, 0.5, 3.6], [0.25, 0.46, 3.2], [-0.25, 0.46, 3.2], [0.12, 0.52, 2.7], [-0.12, 0.52, 2.7], [0, 0.4, 4.0]].map((pt, i) => (
        <mesh key={i} geometry={LOW_GEO} material={MAT.knob} position={pt} scale={0.09} />
      ))}
      {/* tail stock, small dorsal hump */}
      <mesh geometry={BODY_GEO} material={MAT.back} position={[0, 0.05, -3.1]} scale={[0.42, 0.55, 1.9]} />
      <mesh geometry={CONE4} material={MAT.back} position={[0, 0.88, -1.5]} rotation={[-0.5, 0, 0]} scale={[0.22, 0.42, 0.4]} />
      {/* long white pectoral flippers */}
      {[-1, 1].map((s, i) => (
        <group key={s} ref={pecs[i]} position={[s * 0.85, -0.38, 1.7]}>
          <mesh geometry={BODY_GEO} material={MAT.flipper} position={[s * 1.75, -0.1, -0.55]} rotation={[0, s * 0.32, s * -0.12]} scale={[1.9, 0.08, 0.36]} />
        </group>
      ))}
      <group position={[0, 0.05, -4.85]}>
        <mesh geometry={FLUKE_GEO} material={MAT.flukeTop} />
        <mesh geometry={FLUKE_GEO} material={MAT.flukeUnder} />
      </group>
    </group>
  );
}

// Spout: a column of mist puffs that rises, spreads and fades.
const MIST_N = 12;
const mistSeed = Array.from({ length: MIST_N }, (_, i) => ({ d: i * 0.045, h: rnd(2.2, 3.2), a: rnd(0, 6.28), r: rnd(0.15, 0.6) }));

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, k) => a + (b - a) * k;

// True the first frame the event clock passes `at`.
function once(st, tau, name, at) {
  if (tau < at || st.fired[name]) return false;
  st.fired[name] = true;
  return true;
}

const BREACH_AT = 3.5;
const BREACH_LEN = 4.0;
const SPOUT2_AT = 11;
const DIVE_AT = 13;
const DONE_AT = 18.5;

export default function Whale() {
  const ref = useRef();
  const inner = useRef();
  const roll = useRef();
  const mist = useRef();
  const pecs = [useRef(), useRef()];
  const camera = useThree((s) => s.camera);
  const clock = useMemo(aliveClock, []);
  const test = testOn('whale');
  const st = useMemo(() => ({ next: test ? 5 : rnd(480, 900), ev: null, spout: null, fired: {} }), [test]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => () => releaseSlot('rare', 'whale'), []);

  // Somewhere out past SEA_LANES.whale.minR that's in frame and not hidden
  // behind the island. Nearer is better.
  const pickSpot = () => {
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const r = SEA_LANES.whale.minR + 3 + rnd(0, 5);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const lo = toScreen(camera, x, 0, z);
      if (lo.z > 1 || Math.abs(lo.x) > 0.6 || lo.y < -0.8 || lo.y > 0.7) continue;
      const hi = toScreen(camera, x, 4, z);
      if (hi.z > 1 || hi.y > 0.85) continue;
      // hidden behind the island? sample the sight line for land under it
      let hidden = false;
      for (let k = 1; k < 16 && !hidden; k++) {
        const f = k / 16;
        const sx = camera.position.x + (x - camera.position.x) * f;
        const sz = camera.position.z + (z - camera.position.z) * f;
        const sy = camera.position.y + (1 - camera.position.y) * f;
        if (islandE(sx, sz) < 1.05 && sy < 4.5) hidden = true;
      }
      const score = Math.hypot(x - camera.position.x, z - camera.position.z) + (hidden ? 1000 : 0) + Math.abs(lo.x) * 20;
      if (score < bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
    if (!best) {
      // nothing in frame: straight out beyond the island
      const a = Math.atan2(-camera.position.z, -camera.position.x);
      best = { x: Math.cos(a) * 52, z: Math.sin(a) * 52 };
    }
    // swim across the view so it shows its side
    const vx = best.x - camera.position.x;
    const vz = best.z - camera.position.z;
    const s = Math.random() < 0.5 ? 1 : -1;
    return { ...best, h: Math.atan2(vz * s, -vx * s) };
  };

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.tick(delta);

    if (!st.ev && t >= st.next) {
      if (claimSlot('rare', 'whale', DONE_AT + 2)) {
        st.ev = { t0: t, ...pickSpot() };
        st.fired = {};
      } else st.next = t + 20;
    }

    // spout mist
    const m = mist.current;
    if (m) {
      const sp = st.spout;
      const k = sp ? (t - sp.t0) / 2.6 : 2;
      m.visible = k < 1;
      if (k < 1) {
        for (let i = 0; i < MIST_N; i++) {
          const ms = mistSeed[i];
          const kk = Math.min(1, Math.max(0, (t - sp.t0 - ms.d) / 1.4));
          dummy.position.set(sp.x + Math.cos(ms.a) * ms.r * kk, 0.3 + ms.h * Math.sqrt(kk), sp.z + Math.sin(ms.a) * ms.r * kk);
          dummy.scale.setScalar(kk > 0 ? 0.18 + kk * 0.5 : 0);
          dummy.updateMatrix();
          m.setMatrixAt(i, dummy.matrix);
        }
        m.instanceMatrix.needsUpdate = true;
        MAT.mist.opacity = 0.7 * (1 - smooth(0.35, 1, k));
      }
    }

    const ev = st.ev;
    if (!ev) {
      g.visible = false;
      return;
    }
    const tau = t - ev.t0;
    const fx = Math.sin(ev.h);
    const fz = Math.cos(ev.h);
    let d = 0; // distance along the heading
    let y = -6;
    let pitch = 0;
    let rollZ = 0;
    let fin = 0.15;

    if (tau < 2.6) {
      // a slow roll at the surface: just the back and the hump
      const k = tau / 2.6;
      d = k * 1.8;
      y = lerp(-1.3, -0.55, smooth(0, 0.4, k)) - smooth(0.6, 1, k) * 1.2;
      pitch = lerp(-0.08, 0.15, k);
      if (once(st, tau, 'blow1', 0.3)) {
        st.spout = { t0: t, x: ev.x + fx * 3.3, z: ev.z + fz * 3.3 };
        ripple(ev.x + fx * 2, ev.z + fz * 2, 3);
      }
    } else if (tau < BREACH_AT) {
      d = 1.8;
      y = -6;
    } else if (tau < BREACH_AT + BREACH_LEN) {
      // the breach
      const k = (tau - BREACH_AT) / BREACH_LEN;
      d = 3 + k * 3.5;
      y = -4.4 + 4 * 6.2 * k * (1 - k);
      pitch = -(1.2 - 1.28 * k);
      rollZ = smooth(0.15, 0.85, k) * 1.9;
      fin = 0.2 + Math.sin(k * Math.PI) * 0.75;
      if (once(st, tau, 'burst', BREACH_AT + 0.35)) splash(ev.x + fx * 4.5, ev.z + fz * 4.5, 2.2, 18);
      if (once(st, tau, 'crash', BREACH_AT + BREACH_LEN * 0.93)) {
        const cx = ev.x + fx * 6.5;
        const cz = ev.z + fz * 6.5;
        splash(cx, cz, 3.6, 40, false);
        splashFoam(cx, cz, 3.6, 3);
        // the lingering foam ring
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          emitFx(FX.PUFF, cx + Math.cos(a) * 2.4, cz + Math.sin(a) * 2.4, Math.cos(a) * 0.35, Math.sin(a) * 0.35, rnd(9, 12), rnd(0.7, 1.0), 1.2, a, 1.6);
        }
        emitFx(FX.RING, cx, cz, 0, 0, 10, 2.2, 3.5, 0, 1);
        emitFx(FX.PUFF, cx, cz, 0, 0, 12, 1.8, 1.5, 0, 1);
      }
    } else if (tau < SPOUT2_AT) {
      d = 6.5;
      y = -6;
    } else if (tau < DIVE_AT) {
      // up again for a breath
      const k = (tau - SPOUT2_AT) / (DIVE_AT - SPOUT2_AT);
      d = 8 + k * 1.6;
      y = lerp(-1.3, -0.55, smooth(0, 0.35, k));
      pitch = 0.05;
      if (once(st, tau, 'blow2', SPOUT2_AT + 0.3)) {
        st.spout = { t0: t, x: ev.x + fx * 11, z: ev.z + fz * 11 };
        ripple(ev.x + fx * 10, ev.z + fz * 10, 3);
      }
    } else if (tau < DONE_AT) {
      // fluke-up dive: arch over, tail high, slide under
      const k = (tau - DIVE_AT) / (DONE_AT - DIVE_AT);
      d = 9.6 + k * 2.5;
      pitch = lerp(0.05, 1.25, smooth(0, 0.35, k));
      y = lerp(-0.55, -3.7, smooth(0, 0.35, k)) - smooth(0.55, 1, k) * 5;
      if (once(st, tau, 'drip', DIVE_AT + 2.4)) splash(ev.x + fx * 7.4, ev.z + fz * 7.4, 0.8, 10, false);
      if (once(st, tau, 'slip', DIVE_AT + 3.9)) splashFoam(ev.x + fx * 7.6, ev.z + fz * 7.6, 1.6, 2);
    } else {
      st.ev = null;
      st.next = t + (test ? 25 : rnd(480, 900));
      releaseSlot('rare', 'whale');
      g.visible = false;
      return;
    }

    g.visible = true;
    g.position.set(ev.x + fx * d, y, ev.z + fz * d);
    g.rotation.y = ev.h;
    inner.current.rotation.x = pitch;
    roll.current.rotation.z = rollZ;
    pecs[0].current.rotation.z = fin;
    pecs[1].current.rotation.z = -fin;
  });

  return (
    <>
      <group ref={ref} visible={false}>
        <group ref={inner}>
          <group ref={roll}>
            <WhaleModel pecs={pecs} />
          </group>
        </group>
      </group>
      <instancedMesh ref={mist} args={[LOW_GEO, MAT.mist, MIST_N]} visible={false} frustumCulled={false} />
    </>
  );
}
