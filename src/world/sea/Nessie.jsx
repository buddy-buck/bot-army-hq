import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SEA_LANES, islandE, seaClear } from '../../utils/paths.js';
import { aliveClock, claimSlot, releaseSlot, testOn } from '../../wild/director.js';
import { world } from '../state.js';
import { FX, emitFx, ripple, splashFoam } from './fx.js';
import { BODY_GEO, CONE4, HIT_MAT, LOW_GEO, hoverPointer, islandToast, rnd, setHittable, std, tapOnly, toScreen } from './kit.js';

// Nessie, on holiday. Every 8 to 14 minutes of the page being looked at
// (any time but deep night, 10:30 PM to 4:30 AM), the classic silhouette
// surfaces in open sea between the shark lanes and the sailboats, on the
// side the camera is looking at: three humps first, then the long neck and
// small head. She glides a few lengths, looks around (and right at you),
// then sinks back under in a spread of ripples. ~20 s. Shares the 'rare'
// slot with the whale and Bigfoot. Tap her: "Nessie's on vacation."
// ?test=nessie: within a few seconds, then about every 30 s.

const MAT = {
  skin: std('#3e5a4b', { roughness: 0.55 }),
  dark: std('#2e463a', { roughness: 0.55 }),
  belly: std('#7f9a7d', { roughness: 0.6 }),
  eye: std('#111614'),
};

const GLIDE = 6; // how far she travels
const RISE = 3.5;
const SINK_AT = 14.5;
const DONE_AT = 19;
const HUMPS = [
  { z: -1.25, s: 1.0 },
  { z: -2.65, s: 0.82 },
  { z: -3.85, s: 0.62 },
];

// Neck: a bead chain bending up and forward from the front hump.
const NECK = Array.from({ length: 7 }, (_, i) => {
  const k = i / 6;
  // quadratic bezier: base (0,-0.15,0), control (0,2.1,-0.35), top (0,2.35,0.6)
  const a = (1 - k) ** 2;
  const b = 2 * (1 - k) * k;
  const c = k * k;
  return { y: a * -0.15 + b * 2.1 + c * 2.35, z: b * -0.35 + c * 0.6, r: 0.34 - k * 0.15 };
});

function NessieModel({ neck, head, humps }) {
  return (
    <group>
      <group ref={neck}>
        {NECK.map((n, i) => (
          <mesh key={i} geometry={BODY_GEO} material={MAT.skin} position={[0, n.y, n.z]} scale={[n.r, n.r * 1.25, n.r]} />
        ))}
        <mesh geometry={BODY_GEO} material={MAT.belly} position={[0, 1.0, 0.16]} scale={[0.2, 0.75, 0.16]} rotation={[0.2, 0, 0]} />
        <group ref={head} position={[0, 2.45, 0.68]}>
          <mesh geometry={BODY_GEO} material={MAT.skin} position={[0, 0, 0.12]} scale={[0.21, 0.18, 0.38]} />
          <mesh geometry={BODY_GEO} material={MAT.belly} position={[0, -0.07, 0.22]} scale={[0.15, 0.08, 0.28]} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh geometry={LOW_GEO} material={MAT.eye} position={[s * 0.14, 0.07, 0.2]} scale={0.04} />
              <mesh geometry={CONE4} material={MAT.dark} position={[s * 0.07, 0.2, -0.08]} rotation={[-0.4, 0, 0]} scale={[0.04, 0.12, 0.04]} />
            </group>
          ))}
        </group>
      </group>
      {HUMPS.map((h, i) => (
        <group key={i} ref={humps[i]} position={[0, 0, h.z]}>
          <mesh geometry={BODY_GEO} material={MAT.skin} scale={[0.5 * h.s, 0.62 * h.s, 0.78 * h.s]} />
          <mesh geometry={CONE4} material={MAT.dark} position={[0, 0.58 * h.s, 0]} rotation={[-0.3, 0, 0]} scale={[0.09, 0.2 * h.s, 0.12]} />
        </group>
      ))}
      {/* tail tip flicking at the end */}
      <mesh geometry={CONE4} material={MAT.skin} position={[0, 0.05, -4.9]} rotation={[-1.25, 0, 0]} scale={[0.14, 0.7, 0.1]} />
    </group>
  );
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const laneE = (x, z, l) => (x / l.rx) ** 2 + (z / l.rz) ** 2;

// Open water between the outer shark lane and the sailboats, away from
// decks and anything afloat, in frame from wherever the camera is.
function okWater(x, z) {
  if (!seaClear(x, z, 3)) return false;
  if (laneE(x, z, SEA_LANES.sharkOuter) < 1.12 || laneE(x, z, SEA_LANES.sail) > 0.82) return false;
  for (const b of world.boats.values()) if (Math.hypot(b.x - x, b.z - z) < 11) return false;
  return true;
}

function pickSpot(camera) {
  const good = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    for (const r of [34, 37, 40, 42]) {
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // glide across the view, so she shows her side
      const vx = x - camera.position.x;
      const vz = z - camera.position.z;
      const s = Math.random() < 0.5 ? 1 : -1;
      const h = Math.atan2(-vz * s, vx * s);
      const ex = x + Math.sin(h) * GLIDE;
      const ez = z + Math.cos(h) * GLIDE;
      if (!okWater(x, z) || !okWater(ex, ez) || !okWater(x - Math.sin(h) * 5, z - Math.cos(h) * 5)) continue;
      const mx = (x + ex) / 2;
      const mz = (z + ez) / 2;
      const lo = toScreen(camera, mx, 0, mz);
      if (lo.z > 1 || Math.abs(lo.x) > 0.65 || lo.y < -0.8 || lo.y > 0.65) continue;
      const hi = toScreen(camera, mx, 2.6, mz);
      if (hi.z > 1 || hi.y > 0.8) continue;
      // not tucked behind the island
      let hidden = false;
      for (let k = 1; k < 16 && !hidden; k++) {
        const f = k / 16;
        const sx = camera.position.x + (mx - camera.position.x) * f;
        const sz = camera.position.z + (mz - camera.position.z) * f;
        const sy = camera.position.y + (0.8 - camera.position.y) * f;
        if (islandE(sx, sz) < 1.05 && sy < 4.5) hidden = true;
      }
      if (hidden) continue;
      good.push({ x, z, h, score: Math.hypot(vx, vz) + Math.abs(lo.x) * 15 + rnd(0, 6) });
    }
  }
  if (!good.length) return null;
  good.sort((p, q) => p.score - q.score);
  return good[0];
}

export default function Nessie({ hour }) {
  const ref = useRef();
  const neck = useRef();
  const head = useRef();
  const hit = useRef();
  const humps = [useRef(), useRef(), useRef()];
  const camera = useThree((s) => s.camera);
  const clock = useMemo(aliveClock, []);
  const test = testOn('nessie');
  const hourRef = useRef(hour);
  hourRef.current = hour;
  const st = useMemo(() => ({ next: test ? 4 : rnd(480, 840), ev: null }), [test]);
  const boat = useMemo(() => ({ x: 0, z: 0, heading: 0, speed: 0, size: 1.4 }), []);
  useEffect(
    () => () => {
      releaseSlot('rare', 'nessie');
      world.boats.delete('nessie');
    },
    []
  );
  useEffect(() => setHittable(hit.current, false), []);

  const onTap = () => {
    if (!st.ev) return;
    islandToast("Nessie's on vacation. Don't tell Scotland.");
  };

  const finish = (t, g) => {
    st.ev = null;
    st.next = t + (test ? 12 : rnd(480, 840));
    g.visible = false;
    setHittable(hit.current, false);
    world.boats.delete('nessie');
    releaseSlot('rare', 'nessie');
  };

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.tick(delta);
    if (!st.ev) {
      if (t < st.next) return;
      const h = hourRef.current ?? 12;
      if (!test && (h >= 22.5 || h < 4.5)) {
        st.next = t + 60;
        return;
      }
      const spot = pickSpot(camera);
      if (!spot || !claimSlot('rare', 'nessie', DONE_AT + 2)) {
        st.next = t + (test ? 4 : 30);
        return;
      }
      st.ev = { t0: t, ...spot, fired: {} };
      g.visible = true;
      setHittable(hit.current, true);
    }

    const ev = st.ev;
    const tau = t - ev.t0;
    if (tau > DONE_AT) {
      finish(t, g);
      return;
    }
    const fx = Math.sin(ev.h);
    const fz = Math.cos(ev.h);
    // glide: eases in once she's up, eases out as she sinks
    const d = GLIDE * smooth(1.5, DONE_AT - 1, tau);
    const x = ev.x + fx * d;
    const z = ev.z + fz * d;
    const up = smooth(0, RISE, tau) * (1 - smooth(SINK_AT, SINK_AT + 3.2, tau));
    const neckUp = smooth(1.2, RISE + 1.2, tau) * (1 - smooth(SINK_AT - 0.6, SINK_AT + 2.2, tau));

    g.position.set(x, -2.2 + up * 2.2 + Math.sin(tau * 1.1) * 0.04, z);
    g.rotation.y = ev.h + Math.sin(tau * 0.4) * 0.05;
    neck.current.rotation.x = (1 - neckUp) * 1.1;
    neck.current.position.y = -(1 - neckUp) * 1.2;

    // humps roll like a wave travelling down her back
    for (let i = 0; i < 3; i++) humps[i].current.position.y = Math.sin(tau * 1.6 - i * 1.1) * 0.08 - (1 - up) * 0.4;

    // look around: left, right, then a long stare at the camera
    const lookPhase = smooth(5, 6, tau) * (1 - smooth(13, 14, tau));
    let yaw = Math.sin((tau - 5) * 0.9) * 0.7 * lookPhase;
    if (tau > 10 && tau < 13) {
      const toCam = Math.atan2(camera.position.x - x, camera.position.z - z) - g.rotation.y;
      const a = Math.atan2(Math.sin(toCam), Math.cos(toCam));
      yaw += (Math.max(-1.1, Math.min(1.1, a)) - yaw) * smooth(10, 10.8, tau) * (1 - smooth(12.3, 13, tau));
    }
    head.current.rotation.set(Math.sin(tau * 0.7) * 0.08 - 0.05, yaw, 0);

    // water: rings as she surfaces and sinks, a small V wake while gliding
    if (!ev.fired.rise) {
      ev.fired.rise = true;
      for (const h of HUMPS) ripple(x + fx * h.z, z + fz * h.z, 1.4, rnd(0, 0.6));
      ripple(x, z, 1.8, 1.2);
    }
    if (tau > SINK_AT && !ev.fired.sink) {
      ev.fired.sink = true;
      ripple(x, z, 2.2, 0.4);
      for (const h of HUMPS) ripple(x + fx * h.z, z + fz * h.z, 1.6, rnd(0.6, 1.6));
      splashFoam(x, z, 1.2, 1.5);
      emitFx(FX.RING, x + fx * -2.4, z + fz * -2.4, 0, 0, 7, 1.4, 3.2, 0, 1, 0, 2.2);
    }
    const gliding = tau > RISE && tau < SINK_AT + 1;
    if (gliding) {
      if (!world.boats.has('nessie')) world.boats.set('nessie', boat);
      boat.x = x;
      boat.z = z;
      boat.heading = ev.h;
      boat.speed = (GLIDE / (DONE_AT - 2.5)) * 1.6;
    } else if (world.boats.has('nessie')) world.boats.delete('nessie');
  });

  return (
    <group ref={ref} visible={false} scale={1.15}>
      <NessieModel neck={neck} head={head} humps={humps} />
      <mesh ref={hit} geometry={BODY_GEO} material={HIT_MAT} position={[0, 0.9, -1.6]} scale={[1.1, 1.8, 3.6]} onClick={tapOnly(onTap)} {...hoverPointer} />
    </group>
  );
}
