import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { groundY, islandE, SITES } from '../../utils/paths.js';
import { testOn } from '../../wild/director.js';
import MiniBot from '../MiniBot.jsx';
import { fxBurst } from './Fx.jsx';
import { PROP_GEO, PROP_MAT } from './props.js';
import { aimCrew, bump, clamp01, ease, lerp, reachWorld, restArms, standCrew } from './rig.js';

// Two crew bots build a sandcastle on the south beach over a few minutes:
// one kneels and pats the base into shape, the other runs buckets of wet
// sand up from the waterline and flips them into a keep and four towers.
// A flag on top, a proud cheer, a long admiring look... then a wave rolls
// in and flattens it. A shrug, and they start again. Nobody minds.

const S = SITES.sandcastle;
const BASE_T = 14;
const TRIP_GAP = 22;
const TRIPS = 5; // keep + four towers
const FLAG_T = BASE_T + TRIPS * TRIP_GAP;
const ADMIRE_T = FLAG_T + 2.5;
const WAVE_T = ADMIRE_T + 12;
const CYCLE = WAVE_T + 12;
const WALK = 1.1;

const TOWERS = [
  [0.3, 0.3],
  [-0.3, 0.3],
  [-0.3, -0.3],
  [0.3, -0.3],
];

const std = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95 });

// Where the bucket gets filled: down the beach, right at the waterline.
const FILL = (() => {
  const x = S.x + 0.5;
  let z = S.z;
  while (islandE(x, z) < 0.95 && z < S.z + 6) z += 0.05;
  return { x, z };
})();

export default function Sandcastle({ ctx }) {
  const A = useRef({});
  const B = useRef({});
  const crew = useRef();
  const parts = useRef({});
  const bucket = useRef();
  const foam = useRef();
  const flag = useRef();
  const st = useRef({ t: 0, fired: new Set() });
  const g0 = useMemo(() => groundY(S.x, S.z), []);
  const mats = useMemo(
    () => ({
      sand: std('#f2d9a0'),
      wet: std('#d9b77a'),
      flag: new THREE.MeshStandardMaterial({ color: '#ff4f5e', flatShading: true, side: THREE.DoubleSide }),
      pole: std('#fdf8ee'),
      foam: new THREE.MeshBasicMaterial({ color: '#f4fdff', transparent: true, opacity: 0, depthWrite: false }),
    }),
    []
  );
  const baseGeo = useMemo(() => new THREE.CylinderGeometry(0.46, 0.55, 0.16, 9).translate(0, 0.08, 0), []);
  const flagGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.1, 0, 0.16, -0.05, 0], 3));
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
      flagGeo.dispose();
      baseGeo.dispose();
    },
    [mats, flagGeo, baseGeo]
  );
  const speed = testOn('sandcastle') ? 4 : 1;
  const day = !ctx.bedtime;

  // A kneels on the west side, B dumps buckets on the east side.
  const aAt = { x: S.x - 0.72, z: S.z + 0.12 };
  const bAt = { x: S.x + 0.74, z: S.z + 0.08 };
  const tripLen = useMemo(() => {
    const d = Math.hypot(FILL.x - bAt.x, FILL.z - bAt.z);
    return { d, walk: d / WALK, fill: 1.2, dump: 1.5 };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((state, delta) => {
    if (crew.current) crew.current.visible = day;
    const PA = A.current;
    const PB = B.current;
    if (!PA.root || !PB.root) return;
    const s = st.current;
    if (day) s.t += Math.min(delta, 0.1) * speed; // the castle waits overnight
    if (s.t >= CYCLE) {
      s.t = 0;
      s.fired.clear();
    }
    const t = s.t;
    const clock = state.clock.elapsedTime;
    const once = (key, fn) => {
      if (!s.fired.has(key)) {
        s.fired.add(key);
        fn();
      }
    };

    // --- the castle ----------------------------------------------------------
    const C = parts.current;
    const melt = ease((t - WAVE_T - 2.2) / 1.6); // the wave flattens it
    const gone = ease((t - CYCLE + 2.5) / 2.5);
    const squash = 1 - melt * 0.82;
    const baseK = ease(t / BASE_T);
    if (C.base) {
      C.base.visible = baseK > 0.01;
      C.base.scale.set(lerp(0.4, 1, baseK) * (1 + melt * 0.35) * (1 - gone), Math.max(0.01, baseK * (1 - melt * 0.6) * (1 - gone)), lerp(0.4, 1, baseK) * (1 + melt * 0.35) * (1 - gone));
      C.moat.visible = t > BASE_T * 0.7 && melt < 0.9;
    }
    for (let i = 0; i < TRIPS; i++) {
      const at = BASE_T + i * TRIP_GAP + tripLen.walk * 2 + tripLen.fill + tripLen.dump * 0.75;
      const k = clamp01((t - at) / 0.35);
      const piece = i === 0 ? C.keep : C.towers?.[i - 1];
      if (!piece) continue;
      piece.visible = k > 0 && gone < 1;
      // pops out of the bucket a bit tall, settles
      piece.scale.set(1 + melt * 0.5, Math.max(0.01, (k < 1 ? lerp(1.15, 1, k) : 1) * squash * (1 - gone)), 1 + melt * 0.5);
      if (k > 0) {
        const p = i === 0 ? [0, 0] : TOWERS[i - 1];
        once(`piece${i}`, () => fxBurst('dust', S.x + p[0], g0 + 0.3, S.z + p[1], { color: '#f2d9a0' }));
      }
    }
    const flagK = clamp01((t - FLAG_T - 0.9) / 0.3);
    if (flag.current) {
      flag.current.visible = flagK > 0 && melt < 0.6;
      flag.current.scale.setScalar(Math.max(0.01, flagK));
      flag.current.children[1].rotation.y = Math.sin(clock * 4) * 0.35;
      if (flagK > 0) once('flag', () => fxBurst('sparks', S.x, g0 + 0.95, S.z));
    }
    if (t > ADMIRE_T + 0.5) once('cheer', () => fxBurst('confetti', S.x, g0 + 1.1, S.z));

    // --- the wave --------------------------------------------------------------
    if (foam.current) {
      const w = (t - WAVE_T) / 6;
      const on = w > 0 && w < 1;
      foam.current.visible = on;
      if (on) {
        const reach = Math.sin(w * Math.PI); // in, then back out
        const z = lerp(FILL.z + 0.6, S.z - 0.5, ease(reach));
        foam.current.position.set(S.x + 0.2, groundY(S.x + 0.2, z) + 0.035, z);
        foam.current.scale.set(1.9 + reach * 0.4, 1, 0.8 + reach * 0.6);
        mats.foam.opacity = 0.75 * Math.min(1, w * 6, (1 - w) * 3);
      }
      if (w > 0.3) once('splash', () => fxBurst('splash', S.x, g0 + 0.2, S.z + 0.3, { scale: 0.7 }));
    }

    // --- A: kneeling patter, flag placer ---------------------------------------
    standCrew(PA);
    const faceA = Math.atan2(S.x - aAt.x, S.z - aAt.z);
    PA.root.position.set(aAt.x, groundY(aAt.x, aAt.z), aAt.z);
    PA.root.rotation.y = faceA;
    const startled = bump(t, WAVE_T + 1.2, WAVE_T + 4.5);
    const shrug = bump(t, WAVE_T + 5, WAVE_T + 7);
    if (t >= FLAG_T && t < ADMIRE_T) {
      // stand up and plant the flag on top
      const r = bump(t, FLAG_T, ADMIRE_T);
      restArms(PA);
      reachWorld(PA, 'R', S.x - 0.05, g0 + lerp(0.5, 1.0, r), S.z, 0.52);
      PA.pose.rotation.x = 0.15 * r;
    } else if (t >= ADMIRE_T && t < WAVE_T + 8) {
      celebrate(PA, t - ADMIRE_T, startled, shrug, clock, 0);
      PA.root.position.x -= 0.35 * ease((t - ADMIRE_T) / 1.2);
    } else if (t < CYCLE - 3) {
      // kneel and pat pat pat
      PA.pose.position.y = -0.14;
      PA.pose.rotation.x = 0.32;
      PA.footL.position.z = -0.08;
      PA.footR.position.z = -0.08;
      const pat = Math.sin(clock * 7);
      const reachK = Math.min(1, baseK + 0.3);
      reachWorld(PA, 'L', S.x - 0.3 * reachK, g0 + 0.16 + Math.max(0, pat) * 0.1, S.z + 0.18, 0.52);
      reachWorld(PA, 'R', S.x - 0.3 * reachK, g0 + 0.16 + Math.max(0, -pat) * 0.1, S.z - 0.12, 0.52);
      PA.head.rotation.x = 0.3;
    } else {
      restArms(PA);
    }

    // --- B: bucket runner -------------------------------------------------------
    standCrew(PB);
    let bx = bAt.x;
    let bz = bAt.z;
    let heading = Math.atan2(S.x - bAt.x, S.z - bAt.z);
    let mode = 'idle';
    let tk = 0;
    const trip = Math.floor((t - BASE_T) / TRIP_GAP);
    if (t >= BASE_T && trip < TRIPS) {
      const u = t - BASE_T - trip * TRIP_GAP;
      const L = tripLen;
      if (u < L.walk) {
        tk = u / L.walk;
        mode = 'walk';
        bx = lerp(bAt.x, FILL.x, tk);
        bz = lerp(bAt.z, FILL.z, tk);
        heading = Math.atan2(FILL.x - bAt.x, FILL.z - bAt.z);
      } else if (u < L.walk + L.fill) {
        mode = 'fill';
        tk = (u - L.walk) / L.fill;
        bx = FILL.x;
        bz = FILL.z;
        heading = Math.atan2(FILL.x - bAt.x, FILL.z - bAt.z);
      } else if (u < L.walk * 2 + L.fill) {
        tk = (u - L.walk - L.fill) / L.walk;
        mode = 'walkBack';
        bx = lerp(FILL.x, bAt.x, tk);
        bz = lerp(FILL.z, bAt.z, tk);
        heading = Math.atan2(bAt.x - FILL.x, bAt.z - FILL.z);
      } else if (u < L.walk * 2 + L.fill + L.dump) {
        mode = 'dump';
        tk = (u - L.walk * 2 - L.fill) / L.dump;
      }
    }
    PB.root.position.set(bx, groundY(bx, bz), bz);
    PB.root.rotation.y = heading;
    let bucketMode = 'carry';
    if (mode === 'walk' || mode === 'walkBack') {
      const w = clock * 10;
      PB.pose.position.y = Math.abs(Math.sin(w)) * 0.06;
      PB.pose.rotation.z = Math.sin(w) * 0.06;
      PB.footL.position.z = Math.sin(w) * 0.09;
      PB.footR.position.z = -Math.sin(w) * 0.09;
      aimCrew(PB, 'L', -0.23, 0.2, 0.02 + Math.sin(w) * 0.14);
      aimCrew(PB, 'R', 0.27, 0.22, 0.06);
    } else if (mode === 'fill') {
      const b = bump(tk, 0, 1);
      PB.pose.rotation.x = 0.55 * b;
      aimCrew(PB, 'L', -0.12, lerp(0.2, 0.1, b), lerp(0.02, 0.3, b));
      aimCrew(PB, 'R', 0.12, lerp(0.22, 0.1, b), lerp(0.06, 0.32, b));
      if (tk > 0.3) once(`fill${trip}`, () => fxBurst('splash', FILL.x, 0.05, FILL.z + 0.3, { scale: 0.45 }));
    } else if (mode === 'dump') {
      const p = trip === 0 ? [0, 0] : TOWERS[trip - 1];
      const b = bump(tk, 0, 1);
      PB.pose.rotation.x = 0.35 * b;
      reachWorld(PB, 'L', S.x + p[0] + 0.05, g0 + lerp(0.6, 0.45, b), S.z + p[1] - 0.06, 0.52);
      reachWorld(PB, 'R', S.x + p[0] + 0.05, g0 + lerp(0.6, 0.45, b), S.z + p[1] + 0.06, 0.52);
      bucketMode = tk > 0.25 && tk < 0.85 ? 'flip' : 'carry';
    } else if (t >= ADMIRE_T && t < WAVE_T + 8) {
      celebrate(PB, t - ADMIRE_T, startled, shrug, clock, 1);
      PB.root.position.x += 0.35 * ease((t - ADMIRE_T) / 1.2);
      bucketMode = 'ground';
    } else {
      // waiting: hands on hips, watching the work
      aimCrew(PB, 'L', -0.27, 0.36, -0.02);
      aimCrew(PB, 'R', 0.27, 0.24, 0.06);
      PB.head.rotation.y = Math.sin(clock * 0.5) * 0.4;
      PB.pose.position.y = (Math.sin(clock * 1.6) + 1) * 0.008;
      bucketMode = t < BASE_T || trip >= TRIPS ? 'ground' : 'carry';
    }
    if (bucket.current) {
      const bk = bucket.current;
      if (bucketMode === 'ground') {
        bk.position.set(bAt.x + 0.35, groundY(bAt.x + 0.35, bAt.z + 0.3), bAt.z + 0.3);
        bk.rotation.set(0, 0.3, 0);
      } else if (PB.handR) {
        PB.handR.getWorldPosition(bk.position);
        if (bucketMode === 'flip') {
          bk.position.y -= 0.02;
          bk.rotation.set(Math.PI, 0, 0);
        } else {
          bk.position.y -= 0.17;
          bk.rotation.set(0, heading, 0);
        }
      }
    }
  });

  return (
    <group>
      <group position={[S.x, g0, S.z]}>
        <mesh ref={(el) => (parts.current.base = el)} material={mats.sand} geometry={baseGeo} />
        <mesh ref={(el) => (parts.current.moat = el)} material={mats.wet} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.6, 0.72, 18]} />
        </mesh>
        <group ref={(el) => (parts.current.keep = el)} position={[0, 0.15, 0]} visible={false}>
          <mesh material={mats.sand} position={[0, 0.15, 0]}>
            <boxGeometry args={[0.34, 0.3, 0.34]} />
          </mesh>
          {TOWERS.map(([x, z]) => (
            <mesh key={`${x}${z}`} material={mats.sand} position={[x * 0.45, 0.34, z * 0.45]}>
              <boxGeometry args={[0.08, 0.08, 0.08]} />
            </mesh>
          ))}
          <group ref={flag} position={[0, 0.3, 0]} visible={false}>
            <mesh material={mats.pole} position={[0, 0.17, 0]}>
              <cylinderGeometry args={[0.008, 0.008, 0.34, 4]} />
            </mesh>
            <mesh geometry={flagGeo} material={mats.flag} position={[0, 0.33, 0]} />
          </group>
        </group>
        {TOWERS.map(([x, z], i) => (
          <group key={i} ref={(el) => ((parts.current.towers ||= [])[i] = el)} position={[x, 0.15, z]} visible={false}>
            <mesh material={mats.sand} position={[0, 0.16, 0]}>
              <cylinderGeometry args={[0.075, 0.09, 0.32, 7]} />
            </mesh>
            <mesh material={mats.wet} position={[0, 0.38, 0]}>
              <coneGeometry args={[0.1, 0.13, 7]} />
            </mesh>
          </group>
        ))}
        {/* a shovel stuck in the sand */}
        <group position={[-0.35, 0.3, -0.62]} rotation={[0.25, 0, 0.2]}>
          <mesh geometry={PROP_GEO.shovelStick} material={PROP_MAT.stick} scale={1.35} />
          <mesh geometry={PROP_GEO.shovelBlade} material={PROP_MAT.shovel} scale={1.35} />
        </group>
      </group>
      <mesh ref={foam} material={mats.foam} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[1, 18]} />
      </mesh>
      <group ref={bucket} scale={1.35}>
        <mesh geometry={PROP_GEO.bucket} material={PROP_MAT.bucketRed} />
        <mesh geometry={PROP_GEO.handle} material={PROP_MAT.handle} position={[0, 0.11, 0]} />
      </group>
      <group ref={crew}>
        <MiniBot color="#ffb84d" parts={A} />
        <MiniBot color="#7ad0ff" parts={B} />
      </group>
    </group>
  );
}

// Admire the finished castle: cheer, hands on hips, then the wave: jump
// back with hands on the head... and shrug.
function celebrate(P, k, startled, shrug, clock, i) {
  if (startled > 0) {
    P.pose.position.y = bump(startled, 0, 0.35) * 0.25;
    aimCrew(P, 'L', -0.2, 0.92, 0.0);
    aimCrew(P, 'R', 0.2, 0.92, 0.0);
    P.head.rotation.x = -0.2;
    return;
  }
  if (shrug > 0) {
    aimCrew(P, 'L', -0.36, 0.42, 0.12);
    aimCrew(P, 'R', 0.36, 0.42, 0.12);
    P.head.rotation.z = Math.sin(clock * 2 + i) * 0.15;
    P.pose.position.y = shrug * 0.04;
    return;
  }
  if (k < 2.5) {
    const hop = bump((k * 2.2 + i * 0.3) % 1, 0, 1);
    P.pose.position.y = hop * 0.16;
    aimCrew(P, 'L', -0.32, 0.88, 0.05);
    aimCrew(P, 'R', 0.32, 0.88, 0.05);
    return;
  }
  aimCrew(P, 'L', -0.27, 0.36, -0.02);
  aimCrew(P, 'R', 0.27, 0.36, -0.02);
  P.head.rotation.x = -0.1 + Math.sin(clock * 1.2 + i) * 0.08; // nodding, very pleased
}
