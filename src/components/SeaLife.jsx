import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DOCK, SPREAD, islandE } from '../utils/paths.js';
import { world, aliveClock } from '../wild/world.js';
import { rareGap, TEST } from '../wild/director.js';
import { addRipple, wakeSources } from './Water.jsx';
import StaticMerge from '../utils/StaticMerge.jsx';

// Sea life and the living world around the island. All low-poly, a handful
// of meshes each, and a single cheap useFrame per creature.
//   Two great white shark fins slowly circling, each with a V wake
//   A blue marlin that leaps every 40 to 90 seconds, with splashes
//   Salmon hopping off the end of Launch's Pier
//   Small fish schools in the shallows that scatter when a boat comes by
//   Seagulls overhead, sea turtles coming up to breathe
//   Pairs of dolphins leaping far out by day, a humpback breaching now and
//   then (about every 10 minutes), fireflies at night
// Purely ambient: none of it says anything about the bots or the data.
// Not rendered at all when reduced motion is on.
// Splashes and surfacing make ripples on the water (addRipple in Water.jsx).

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, ...extra });

const MAT = {
  shark: std('#5d6873'),
  sharkBelly: std('#d9dde2'),
  splash: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
  marlin: std('#1f4fb8', { roughness: 0.4 }),
  marlinBelly: std('#cfe0f2', { roughness: 0.4 }),
  marlinFin: std('#173a8a'),
  salmon: std('#e58a78', { roughness: 0.45 }),
  gull: std('#ffffff'),
  gullWing: std('#c9ced6'),
  beak: std('#f2a03d'),
  shell: std('#4a6b3a'),
  shellTop: std('#6b8f45'),
  scute: std('#8aa65a'),
  plastron: std('#e3d9a8'),
  skin: std('#8fae6b'),
  eye: std('#1f2430'),
  dolphin: std('#6f8296', { roughness: 0.4 }),
  dolphinBelly: std('#d5dde6', { roughness: 0.4 }),
  whale: std('#38434f', { roughness: 0.55 }),
  whaleBelly: std('#c9ced3', { roughness: 0.6 }),
  whaleFin: std('#dfe4e8', { roughness: 0.6, side: THREE.DoubleSide }),
  whaleFluke: std('#2f3944', { side: THREE.DoubleSide }),
  spout: new THREE.MeshBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0.75, depthWrite: false }),
};

const rnd = (a, b) => a + Math.random() * (b - a);

// Seconds of frames actually drawn, shared by every timed creature here so
// nothing plays unseen in a hidden tab. Ticked once per frame by <Tick />.
const T = aliveClock();
function Tick() {
  useFrame((_, delta) => T.tick(delta), -1);
  return null;
}

// Horizontal unit vectors from the camera toward the island, and to its right.
function viewDirs(camera) {
  let fx = -camera.position.x;
  let fz = -camera.position.z;
  const l = Math.hypot(fx, fz) || 1;
  fx /= l;
  fz /= l;
  return { fx, fz, rx: -fz, rz: fx };
}

// --- Geometry ---------------------------------------------------------------

function buildGeo(verts, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Fin: swept-back triangle with a little thickness at the base. Points along +x.
const FIN_GEO = buildGeo(
  [0.42, 0, 0, -0.4, 0, 0.07, -0.4, 0, -0.07, -0.28, 0.82, 0, 0.0, 0, 0.09, 0.0, 0, -0.09],
  [0, 4, 3, 4, 1, 3, 0, 3, 5, 5, 3, 2, 1, 2, 3]
);
const BODY_GEO = new THREE.IcosahedronGeometry(1, 1);
const CONE4 = new THREE.ConeGeometry(1, 1, 4);
const DROP_GEO = new THREE.IcosahedronGeometry(0.07, 0);
const PUFF_GEO = new THREE.IcosahedronGeometry(0.3, 0);
const CROWN_GEO = new THREE.CylinderGeometry(1, 0.6, 1, 14, 1, true).translate(0, 0.5, 0);
const TRI_GEO = buildGeo([0, 0, 0, -1, 0, 0, -0.5, 1, 0], [0, 1, 2, 0, 2, 1]);
const WING_GEO = buildGeo([0, 0, 0.08, 0, 0, -0.08, 0.7, 0.02, 0.02, 0.6, 0, -0.1], [0, 2, 1, 1, 2, 3]);
// Flat paddle (flippers, pectoral fins): a flattened diamond along +z.
const PADDLE_GEO = buildGeo(
  [0, 0.03, 0, 0, -0.03, 0, 0.35, 0, 0.35, -0.3, 0, 0.3, 0.05, 0, 1],
  [0, 2, 4, 0, 4, 3, 1, 4, 2, 1, 3, 4, 0, 3, 1, 0, 1, 2]
);
// Fluke half: swept-back wing in the xz plane, out along +z.
const FLUKE_GEO = buildGeo([0, 0, 0, -0.35, 0, 0.15, -0.75, 0, 1.0, -0.2, 0, 0.75], [0, 1, 3, 1, 2, 3]);
// Mirrored copies (out along -z) so left/right parts can merge without a
// negative scale.
function mirrorZ(geo) {
  const g = geo.clone().scale(1, 1, -1);
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  g.computeVertexNormals();
  return g;
}
const PADDLE_GEO_M = mirrorZ(PADDLE_GEO);
const FLUKE_GEO_M = mirrorZ(FLUKE_GEO);

// --- Splash: droplets (and a foam crown for big ones) plus ripples ----------
// Fired by setting fx.t0 (on the shared clock T), fx.x, fx.z.

function Splash({ fx, size = 1, n = 12, lift = 1, crown = false }) {
  const drops = useRef();
  const crownRef = useRef();
  const fired = useRef(-99);
  const dirs = useMemo(() => Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2 + rnd(-0.25, 0.25), v: rnd(0.9, 2.2), up: rnd(2.2, 3.8) * lift, s: rnd(0.7, 1.2) })), [n, lift]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const crownMat = useMemo(() => (crown ? Object.assign(MAT.splash.clone(), { side: THREE.DoubleSide }) : null), [crown]);
  useEffect(() => () => crownMat?.dispose(), [crownMat]);
  useFrame(() => {
    const sq = Math.sqrt(size);
    const t = T.now - fx.t0;
    const live = t >= 0 && t < 1.1 * sq;
    drops.current.visible = live;
    if (crownRef.current) crownRef.current.visible = live;
    if (!live) return;
    if (fired.current !== fx.t0) {
      fired.current = fx.t0;
      addRipple(fx.x, fx.z, size * 0.85, 1);
      if (size > 1.5) addRipple(fx.x, fx.z, size * 1.3, 0.6, 0.35);
    }
    const tau = t / sq;
    dirs.forEach((d, i) => {
      const r = d.v * tau * size;
      dummy.position.set(fx.x + Math.cos(d.a) * r, Math.max(-0.2, (d.up * tau - 4.9 * tau * tau) * size), fx.z + Math.sin(d.a) * r);
      dummy.scale.setScalar(size * d.s * Math.max(0.05, 1 - tau * 0.65));
      dummy.updateMatrix();
      drops.current.setMatrixAt(i, dummy.matrix);
    });
    drops.current.instanceMatrix.needsUpdate = true;
    if (crownRef.current) {
      const c = crownRef.current;
      const k = Math.min(1, tau / 0.9);
      c.position.set(fx.x, -0.1, fx.z);
      c.scale.set(size * (0.35 + tau * 0.8), Math.max(0.01, size * 0.75 * Math.sin(Math.PI * k)), size * (0.35 + tau * 0.8));
      crownMat.opacity = 0.8 * Math.max(0, 1 - tau / 1.1);
    }
  });
  return (
    <>
      <instancedMesh ref={drops} args={[DROP_GEO, MAT.splash, n]} visible={false} frustumCulled={false} />
      {crown && <mesh ref={crownRef} geometry={CROWN_GEO} material={crownMat} visible={false} renderOrder={4} />}
    </>
  );
}

// --- Great white sharks -------------------------------------------------------
// The V wake is drawn by Wakes.jsx: each fin registers as a wake source.

function SharkFin({ id, rx, rz, speed, offset, dir = 1 }) {
  const ref = useRef();
  const fin = useRef();
  const src = useMemo(() => ({ x: 0, z: 0, heading: 0, speed: 0, size: 1.3 }), []);
  useEffect(() => {
    wakeSources.set(id, src);
    return () => wakeSources.delete(id);
  }, [id, src]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = offset + t * speed * dir;
    const x = Math.cos(a) * rx;
    const z = Math.sin(a) * rz;
    ref.current.position.set(x, 0, z);
    // heading along the path (derivative of the ellipse)
    const dx = -Math.sin(a) * rx * dir;
    const dz = Math.cos(a) * rz * dir;
    ref.current.rotation.y = Math.atan2(-dz, dx);
    // gentle bob, and now and then a slow dip under
    const dip = Math.max(0, Math.sin(t * 0.11 + offset * 3)) ** 8;
    fin.current.position.y = -0.12 + Math.sin(t * 1.3 + offset) * 0.04 - dip * 0.75;
    fin.current.rotation.z = Math.sin(t * 2.1 + offset) * 0.06;
    src.x = x;
    src.z = z;
    src.heading = Math.atan2(dx, dz);
    src.speed = dip > 0.3 ? 0 : speed * Math.hypot(dx, dz);
  });
  return (
    <group ref={ref}>
      <mesh ref={fin} geometry={FIN_GEO} material={MAT.shark} scale={1.25} />
    </group>
  );
}

// --- Blue marlin --------------------------------------------------------------

function MarlinBody() {
  return (
    <StaticMerge>
      <mesh geometry={BODY_GEO} material={MAT.marlin} scale={[0.95, 0.24, 0.2]} />
      <mesh geometry={BODY_GEO} material={MAT.marlinBelly} position={[0.05, -0.09, 0]} scale={[0.8, 0.14, 0.16]} />
      {/* bill */}
      <mesh geometry={CONE4} material={MAT.marlinFin} position={[1.25, 0.03, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[0.035, 0.7, 0.035]} />
      {/* tall dorsal sail */}
      <mesh geometry={TRI_GEO} material={MAT.marlinFin} position={[0.6, 0.15, 0]} scale={[1.0, 0.55, 1]} />
      {/* crescent tail */}
      <mesh geometry={TRI_GEO} material={MAT.marlinFin} position={[-0.85, 0, 0]} rotation={[0, 0, 0.5]} scale={[0.45, 0.5, 1]} />
      <mesh geometry={TRI_GEO} material={MAT.marlinFin} position={[-0.85, 0, 0]} rotation={[0, 0, Math.PI - 0.5]} scale={[0.45, -0.5, 1]} />
    </StaticMerge>
  );
}

function Marlin() {
  const ref = useRef();
  const st = useRef({ next: T.now + rnd(8, 16), jump: null });
  const s1 = useMemo(() => ({ t0: -99, x: 0, z: 0 }), []);
  const s2 = useMemo(() => ({ t0: -99, x: 0, z: 0 }), []);
  const DUR = 1.7;
  const LEN = 5.5;
  const H = 2.8;
  useFrame(() => {
    const t = T.now;
    const s = st.current;
    if (!s.jump && t >= s.next) {
      const a = rnd(0, Math.PI * 2);
      const r = rnd(22, 30) * SPREAD;
      const heading = a + Math.PI / 2 + rnd(-0.4, 0.4);
      s.jump = { t0: t, x: Math.cos(a) * r, z: Math.sin(a) * r, h: heading };
      Object.assign(s1, { t0: t, x: s.jump.x, z: s.jump.z });
      Object.assign(s2, { t0: t + DUR * 0.92, x: s.jump.x + Math.cos(heading) * LEN, z: s.jump.z - Math.sin(heading) * LEN });
    }
    const j = s.jump;
    if (!j) {
      ref.current.visible = false;
      return;
    }
    const k = (t - j.t0) / DUR;
    if (k > 1) {
      s.jump = null;
      s.next = t + rnd(40, 90);
      ref.current.visible = false;
      return;
    }
    ref.current.visible = true;
    const d = k * LEN;
    ref.current.position.set(j.x + Math.cos(j.h) * d, -0.3 + 4 * H * k * (1 - k), j.z - Math.sin(j.h) * d);
    ref.current.rotation.set(0, j.h, Math.atan((4 * H * (1 - 2 * k)) / LEN) * 0.9 + Math.sin(k * Math.PI) * 0.15);
  });
  return (
    <>
      <group ref={ref} visible={false} scale={1.3}>
        <MarlinBody />
      </group>
      <Splash fx={s1} size={1.4} />
      <Splash fx={s2} size={1.6} />
    </>
  );
}

// --- Salmon hopping off the end of Launch's Pier --------------------------------

function Salmon() {
  const ref = useRef();
  const st = useRef({ next: T.now + rnd(2, 5), hop: null });
  const sp = useMemo(() => ({ t0: -99, x: 0, z: 0 }), []);
  useFrame(() => {
    const t = T.now;
    const s = st.current;
    if (!s.hop && t >= s.next) {
      const a = rnd(Math.PI * 0.5, Math.PI * 1.5);
      const r = rnd(1.4, 3.2);
      s.hop = { t0: t, x: DOCK.x0 - 0.3 + Math.cos(a) * r, z: (DOCK.z0 + DOCK.z1) / 2 + Math.sin(a) * r, h: rnd(0, Math.PI * 2) };
      Object.assign(sp, { t0: t + 0.62, x: s.hop.x + Math.cos(s.hop.h) * 1.1, z: s.hop.z - Math.sin(s.hop.h) * 1.1 });
      addRipple(s.hop.x, s.hop.z, 0.35, 0.7);
    }
    const hop = s.hop;
    if (!hop) return;
    const k = (t - hop.t0) / 0.7;
    if (k > 1) {
      s.hop = null;
      s.next = t + rnd(3, 8);
      ref.current.visible = false;
      return;
    }
    ref.current.visible = true;
    const d = k * 1.1;
    ref.current.position.set(hop.x + Math.cos(hop.h) * d, -0.15 + 4 * 0.75 * k * (1 - k), hop.z - Math.sin(hop.h) * d);
    ref.current.rotation.set(0, hop.h, (1 - 2 * k) * 0.9);
  });
  return (
    <>
      <group ref={ref} visible={false}>
        <StaticMerge>
          <mesh geometry={BODY_GEO} material={MAT.salmon} scale={[0.26, 0.09, 0.07]} />
          <mesh geometry={TRI_GEO} material={MAT.salmon} position={[-0.22, 0, 0]} rotation={[0, 0, 0.6]} scale={[0.14, 0.14, 1]} />
        </StaticMerge>
      </group>
      <Splash fx={sp} size={0.45} />
    </>
  );
}

// --- Fish schools in the shallows ----------------------------------------------
// When a boat (or a shark) comes within 4 units, the school bolts away from
// it, spreads out and dives a little, then drifts home and tightens up again.

const SCHOOLS = [
  { a: 0.6, e: 1.32, color: '#ffd23f', n: 9, speed: 0.5 },
  { a: 2.5, e: 1.4, color: '#ff8a3d', n: 8, speed: -0.42 },
  { a: 4.3, e: 1.3, color: '#3ec9ff', n: 9, speed: 0.55 },
  { a: 5.4, e: 1.45, color: '#ffe066', n: 7, speed: -0.5 },
];
const FLEE_R2 = 4 * 4;

function FishSchools({ count = 4 }) {
  const ref = useRef();
  const { fish, schools } = useMemo(() => {
    const out = [];
    const schools = [];
    SCHOOLS.slice(0, count).forEach((s, si) => {
      // School center: just outside the beach, where islandE ~ s.e
      let r = 10;
      for (let k = 0; k < 30; k++) {
        const x = Math.cos(s.a) * r;
        const z = Math.sin(s.a) * r;
        r *= islandE(x, z) < s.e ? 1.02 : 0.99;
      }
      const cx = Math.cos(s.a) * r;
      const cz = Math.sin(s.a) * r;
      schools.push({ cx, cz, ox: 0, oz: 0, fx: 0, fz: 0, scatter: 0 });
      for (let i = 0; i < s.n; i++)
        out.push({ si, speed: s.speed, a: (i / s.n) * Math.PI * 2, ph: (i / s.n) * Math.PI * 2, rad: rnd(0.7, 1.3), dy: rnd(-0.06, 0.04), color: s.color, jit: rnd(0.6, 1.4), px: cx, pz: cz, h: 0 });
    });
    return { fish: out, schools };
  }, [count]);
  const geo = useMemo(() => new THREE.ConeGeometry(0.06, 0.24, 4).rotateZ(-Math.PI / 2), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.5, emissiveIntensity: 0.25 }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    fish.forEach((f, i) => ref.current.setColorAt(i, new THREE.Color(f.color)));
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [fish]);
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.1);
    for (const sc of schools) {
      const x = sc.cx + sc.ox;
      const z = sc.cz + sc.oz;
      let best = FLEE_R2;
      let tx = 0;
      let tz = 0;
      let found = false;
      const check = (b) => {
        const d2 = (b.x - x) ** 2 + (b.z - z) ** 2;
        if (d2 < best) {
          best = d2;
          tx = b.x;
          tz = b.z;
          found = true;
        }
      };
      for (const b of world.boats.values()) check(b);
      for (const b of wakeSources.values()) if (b.speed > 0) check(b);
      if (found) {
        const l = Math.hypot(x - tx, z - tz) || 1;
        sc.fx = (x - tx) / l;
        sc.fz = (z - tz) / l;
        sc.scatter = 1;
      }
      if (sc.scatter > 0) {
        // bolt away, but never up onto the beach
        const nx = sc.ox + sc.fx * 4.5 * sc.scatter * dt;
        const nz = sc.oz + sc.fz * 4.5 * sc.scatter * dt;
        if (islandE(sc.cx + nx, sc.cz + nz) > 1.12 && Math.hypot(nx, nz) < 6) {
          sc.ox = nx;
          sc.oz = nz;
        }
        sc.scatter = Math.max(0, sc.scatter - dt * 0.4);
      }
      // drift home
      const home = dt * 0.35 * (1 - sc.scatter);
      sc.ox -= sc.ox * home;
      sc.oz -= sc.oz * home;
    }
    fish.forEach((f, i) => {
      const sc = schools[f.si];
      f.a += dt * f.speed * (1 + sc.scatter * 2.5 * f.jit);
      const spread = 1 + sc.scatter * 1.8 * f.jit;
      const r = (f.rad + Math.sin(t * 0.7 + f.ph * 2) * 0.15) * spread;
      const x = sc.cx + sc.ox + Math.cos(f.a) * r * 1.6 + sc.fx * sc.scatter * f.jit * 1.2;
      const z = sc.cz + sc.oz + Math.sin(f.a) * r + sc.fz * sc.scatter * f.jit * 1.2;
      const vx = x - f.px;
      const vz = z - f.pz;
      if (vx * vx + vz * vz > 1e-8) f.h = Math.atan2(-vz, vx);
      f.px = x;
      f.pz = z;
      dummy.position.set(x, -0.2 + f.dy - sc.scatter * 0.15, z);
      dummy.rotation.set(0, f.h + Math.sin(t * (9 + sc.scatter * 10) + i) * 0.15, 0); // tail flick
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, fish.length]} frustumCulled={false} />;
}

// --- Seagulls -------------------------------------------------------------------

function Gull({ r, y, speed, offset }) {
  const ref = useRef();
  const lw = useRef();
  const rw = useRef();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = offset + t * speed;
    ref.current.position.set(Math.cos(a) * r, y + Math.sin(t * 0.5 + offset) * 0.6, Math.sin(a) * r * 0.8);
    ref.current.rotation.set(0, -a - (Math.PI / 2) * Math.sign(speed), Math.sign(speed) * 0.25);
    // flap a few beats, then glide
    const cyc = (t * 0.35 + offset) % 1;
    const flap = cyc < 0.45 ? Math.sin(t * 9) * 0.55 : 0.12;
    lw.current.rotation.x = flap;
    rw.current.rotation.x = -flap;
  });
  return (
    <group ref={ref} scale={0.9}>
      <mesh geometry={BODY_GEO} material={MAT.gull} scale={[0.26, 0.08, 0.08]} />
      <mesh geometry={CONE4} material={MAT.beak} position={[0.3, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[0.03, 0.09, 0.03]} />
      <group ref={lw}>
        <mesh geometry={WING_GEO} material={MAT.gullWing} rotation={[0, Math.PI / 2, 0]} scale={[1, 1, 1]} />
      </group>
      <group ref={rw}>
        <mesh geometry={WING_GEO} material={MAT.gullWing} rotation={[0, -Math.PI / 2, 0]} />
      </group>
    </group>
  );
}

function Seagulls() {
  return (
    <>
      <Gull r={14 * SPREAD} y={9} speed={0.12} offset={0} />
      <Gull r={17 * SPREAD} y={10.5} speed={0.1} offset={2.1} />
      <Gull r={11 * SPREAD} y={8} speed={-0.14} offset={4.2} />
    </>
  );
}

// --- Sea turtles coming up to breathe --------------------------------------------
// Swims up from below, flippers paddling, pokes its head up for a couple of
// breaths (little ripples each time), then tips forward and dives.

const TURTLE_DUR = 12;

function Turtle({ first }) {
  const ref = useRef();
  const body = useRef();
  const neck = useRef();
  const fl = useRef();
  const fr = useRef();
  const bl = useRef();
  const br = useRef();
  const st = useRef({ next: T.now + first, up: null, puff: 0 });
  useFrame(() => {
    const t = T.now;
    const s = st.current;
    if (!s.up && t >= s.next) {
      const a = rnd(0, Math.PI * 2);
      const r = rnd(16, 21) * SPREAD;
      s.up = { t0: t, x: Math.cos(a) * r, z: Math.sin(a) * r, h: a + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2, surfaced: false };
      s.puff = 0;
    }
    const u = s.up;
    if (!u) {
      ref.current.visible = false;
      return;
    }
    const tt = t - u.t0;
    const k = tt / TURTLE_DUR;
    if (k > 1) {
      s.up = null;
      s.next = t + rnd(30, 70);
      ref.current.visible = false;
      return;
    }
    ref.current.visible = true;
    // rise for 2.5s, float, dive in the last 2.5s
    const rise = Math.min(1, tt / 2.5, (TURTLE_DUR - tt) / 2.5);
    const ease = rise * rise * (3 - 2 * rise);
    const d = tt * 0.22;
    const x = u.x + Math.cos(u.h) * d;
    const z = u.z - Math.sin(u.h) * d;
    ref.current.position.set(x, -0.75 + ease * 0.74, z);
    ref.current.rotation.set(0, u.h, 0);
    // nose up while rising, nose down to dive
    body.current.rotation.z = tt < 2.5 ? 0.25 * (1 - ease) : tt > TURTLE_DUR - 2.5 ? -0.4 * (1 - ease) : Math.sin(t * 0.8) * 0.03;
    // breathe: head pokes up twice while at the surface
    const breath = tt > 3 && tt < TURTLE_DUR - 3 ? Math.max(0, Math.sin(((tt - 3) / (TURTLE_DUR - 6)) * Math.PI * 2)) : 0;
    neck.current.rotation.z = -0.15 + breath * 0.75;
    if (!u.surfaced && tt > 2.2) {
      u.surfaced = true;
      addRipple(x, z, 0.9, 0.8);
    }
    if (breath > 0.6 && t - s.puff > 1.6) {
      s.puff = t;
      addRipple(x + Math.cos(u.h) * 0.75, z - Math.sin(u.h) * 0.75, 0.35, 0.7);
    }
    // flying strokes with the front flippers, little kicks at the back
    const p = Math.sin(t * (ease < 0.9 ? 3.2 : 1.6));
    fl.current.rotation.set(p * 0.45, -0.35 + p * 0.3, 0);
    fr.current.rotation.set(-p * 0.45, 0.35 - p * 0.3, 0);
    bl.current.rotation.y = -0.4 + Math.sin(t * 2.4) * 0.2;
    br.current.rotation.y = 0.4 - Math.sin(t * 2.4) * 0.2;
  });
  return (
    <group ref={ref} visible={false} scale={1.25}>
      <group ref={body}>
        <StaticMerge>
        <mesh geometry={BODY_GEO} material={MAT.shell} scale={[0.5, 0.15, 0.4]} />
        <mesh geometry={BODY_GEO} material={MAT.shellTop} position={[0, 0.07, 0]} scale={[0.38, 0.12, 0.3]} />
        {[[0.14, 0], [-0.1, 0], [0.02, 0.13], [0.02, -0.13]].map(([sx, sz], i) => (
          <mesh key={i} geometry={BODY_GEO} material={MAT.scute} position={[sx, 0.155, sz]} scale={[0.1, 0.04, 0.08]} />
        ))}
        <mesh geometry={BODY_GEO} material={MAT.plastron} position={[0, -0.05, 0]} scale={[0.44, 0.08, 0.36]} />
        <mesh geometry={CONE4} material={MAT.skin} position={[-0.5, -0.01, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.04, 0.12, 0.04]} />
        </StaticMerge>
        <group ref={neck} position={[0.42, 0.01, 0]}>
          <StaticMerge>
          <mesh geometry={BODY_GEO} material={MAT.skin} position={[0.08, 0, 0]} scale={[0.12, 0.06, 0.07]} />
          <mesh geometry={BODY_GEO} material={MAT.skin} position={[0.2, 0.01, 0]} scale={[0.11, 0.075, 0.085]} />
          <mesh geometry={BODY_GEO} material={MAT.eye} position={[0.25, 0.04, 0.06]} scale={0.016} />
          <mesh geometry={BODY_GEO} material={MAT.eye} position={[0.25, 0.04, -0.06]} scale={0.016} />
          </StaticMerge>
        </group>
        <group ref={fl} position={[0.2, -0.02, 0.3]}>
          <mesh geometry={PADDLE_GEO} material={MAT.skin} scale={[0.22, 1, 0.4]} />
        </group>
        <group ref={fr} position={[0.2, -0.02, -0.3]}>
          <mesh geometry={PADDLE_GEO} material={MAT.skin} scale={[0.22, 1, -0.4]} />
        </group>
        <group ref={bl} position={[-0.34, -0.03, 0.2]}>
          <mesh geometry={PADDLE_GEO} material={MAT.skin} scale={[0.14, 0.8, 0.18]} />
        </group>
        <group ref={br} position={[-0.34, -0.03, -0.2]}>
          <mesh geometry={PADDLE_GEO} material={MAT.skin} scale={[0.14, 0.8, -0.18]} />
        </group>
      </group>
    </group>
  );
}

// --- Dolphins: pairs leaping in sync far out, by day ----------------------------

function DolphinBody() {
  return (
    <StaticMerge>
      <mesh geometry={BODY_GEO} material={MAT.dolphin} scale={[0.72, 0.19, 0.18]} />
      <mesh geometry={BODY_GEO} material={MAT.dolphinBelly} position={[0.08, -0.07, 0]} scale={[0.55, 0.11, 0.14]} />
      <mesh geometry={BODY_GEO} material={MAT.dolphin} position={[0.5, 0.03, 0]} scale={[0.24, 0.15, 0.14]} />
      <mesh geometry={CONE4} material={MAT.dolphin} position={[0.8, -0.02, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[0.055, 0.2, 0.055]} />
      {/* curved dorsal fin */}
      <mesh geometry={TRI_GEO} material={MAT.dolphin} position={[0.12, 0.15, 0]} scale={[0.32, 0.26, 1]} />
      {/* pectoral fins */}
      <mesh geometry={PADDLE_GEO} material={MAT.dolphin} position={[0.32, -0.1, 0.1]} rotation={[0.5, -0.5, 0]} scale={[0.1, 0.6, 0.22]} />
      <mesh geometry={PADDLE_GEO_M} material={MAT.dolphin} position={[0.32, -0.1, -0.1]} rotation={[-0.5, 0.5, 0]} scale={[0.1, 0.6, 0.22]} />
      {/* tail stock and flukes */}
      <mesh geometry={BODY_GEO} material={MAT.dolphin} position={[-0.68, 0, 0]} scale={[0.25, 0.08, 0.07]} />
      <mesh geometry={FLUKE_GEO} material={MAT.dolphin} position={[-0.86, 0, 0]} scale={[0.3, 1, 0.26]} />
      <mesh geometry={FLUKE_GEO_M} material={MAT.dolphin} position={[-0.86, 0, 0]} scale={[0.3, 1, 0.26]} />
    </StaticMerge>
  );
}

// lat: side offset, back: behind the leader, delay: seconds after the leader
const POD = [
  { lat: 0.45, back: 0, delay: 0, s: 1 },
  { lat: -0.45, back: 0.3, delay: 0.1, s: 0.92 },
  { lat: 1.3, back: 2.6, delay: 0.7, s: 0.95 },
  { lat: 0.5, back: 2.8, delay: 0.78, s: 0.8 },
];
const LEAP_P = 2.1; // seconds per leap cycle
const LEAP_D = 1.15; // seconds in the air
const LEAP_V = 2.7; // swim speed
const LEAP_H = 1.35;

function Dolphins({ day, lowPower }) {
  const refs = useRef([]);
  const st = useRef({ next: T.now + (TEST.rare ? 4 : rnd(20, 45)), run: null });
  const fx = useMemo(() => POD.map(() => ({ t0: -99, x: 0, z: 0 })), []);
  const last = useRef(POD.map(() => -1));
  const out = useRef(POD.map(() => -1));
  useFrame(({ camera }) => {
    const t = T.now;
    const s = st.current;
    if (!s.run) {
      refs.current.forEach((g) => g && (g.visible = false));
      if (t < s.next) return;
      if (!day) {
        s.next = t + 30;
        return;
      }
      const v = viewDirs(camera);
      const r = rnd(40, 58);
      const side = rnd(-22, 22);
      const sgn = Math.random() < 0.5 ? 1 : -1;
      // swim across the view, angled a little toward or away
      const ang = rnd(-0.35, 0.35);
      const dx = (v.rx * Math.cos(ang) + v.fx * Math.sin(ang)) * sgn;
      const dz = (v.rz * Math.cos(ang) + v.fz * Math.sin(ang)) * sgn;
      const leaps = Math.floor(rnd(4, 7));
      s.run = { t0: t, x: v.fx * r + v.rx * side - dx * 6, z: v.fz * r + v.rz * side - dz * 6, dx, dz, h: Math.atan2(-dz, dx), leaps, n: lowPower || Math.random() < 0.5 ? 2 : 4 };
      last.current.fill(-1);
      out.current.fill(-1);
    }
    const run = s.run;
    const tt = t - run.t0;
    if (tt > run.leaps * LEAP_P + 2) {
      s.run = null;
      s.next = t + (TEST.rare ? rnd(8, 15) : rnd(45, 110));
      return;
    }
    POD.forEach((p, i) => {
      const g = refs.current[i];
      if (!g) return;
      const tau = tt - p.delay;
      const L = Math.floor(tau / LEAP_P);
      const c = tau - L * LEAP_P;
      if (i >= run.n || tau < 0 || L >= run.leaps || c > LEAP_D) {
        g.visible = false;
        return;
      }
      const k = c / LEAP_D;
      const along = tau * LEAP_V - p.back;
      const x = run.x + run.dx * along - run.dz * p.lat;
      const z = run.z + run.dz * along + run.dx * p.lat;
      g.visible = true;
      g.position.set(x, -0.45 + 4 * LEAP_H * p.s * k * (1 - k), z);
      g.rotation.set(0, run.h, Math.atan((4 * LEAP_H * p.s * (1 - 2 * k)) / (LEAP_D * LEAP_V)) * 0.95);
      g.scale.setScalar(p.s * 1.15);
      if (k > 0.86 && last.current[i] !== L) {
        last.current[i] = L;
        Object.assign(fx[i], { t0: t, x: x + run.dx * 0.3, z: z + run.dz * 0.3 });
      }
      if (k < 0.2 && out.current[i] !== L) {
        out.current[i] = L;
        addRipple(x, z, 0.6, 0.6);
      }
    });
  });
  return (
    <>
      {POD.map((p, i) => (
        <group key={i} ref={(g) => (refs.current[i] = g)} visible={false}>
          <DolphinBody />
        </group>
      ))}
      {POD.map((p, i) => (
        <Splash key={i} fx={fx[i]} size={0.8} n={8} />
      ))}
    </>
  );
}

// --- Humpback whale breaching on the horizon -------------------------------------
// About every 8 to 12 minutes by day (?rare=test: every 20 to 40 seconds).
// Rises almost straight up out of the sea in front of the camera, twists,
// crashes back on its side, then surfaces to blow and dives showing its flukes.

const WHALE_DUR = 12.5;
const ease = (k) => k * k * (3 - 2 * k);

function WhaleBody({ finL, finR }) {
  return (
    <StaticMerge>
      <mesh geometry={BODY_GEO} material={MAT.whale} scale={[3.5, 0.95, 1.0]} />
      <mesh geometry={BODY_GEO} material={MAT.whaleBelly} position={[0.5, -0.38, 0]} scale={[2.9, 0.6, 0.82]} />
      {/* broad flat head with knobs */}
      <mesh geometry={BODY_GEO} material={MAT.whale} position={[2.6, -0.05, 0]} scale={[1.35, 0.68, 0.86]} />
      {[[3.2, 0.25], [2.8, -0.3], [3.5, -0.1], [2.5, 0.35]].map(([x, z], i) => (
        <mesh key={i} geometry={BODY_GEO} material={MAT.whale} position={[x, 0.55, z]} scale={0.12} />
      ))}
      <mesh geometry={BODY_GEO} material={MAT.eye} position={[2.3, 0.05, 0.78]} scale={0.07} />
      <mesh geometry={BODY_GEO} material={MAT.eye} position={[2.3, 0.05, -0.78]} scale={0.07} />
      {/* small dorsal hump */}
      <mesh geometry={CONE4} material={MAT.whale} position={[-1.7, 0.85, 0]} rotation={[0, Math.PI / 4, 0.4]} scale={[0.35, 0.5, 0.35]} />
      {/* tail stock and flukes */}
      <mesh geometry={BODY_GEO} material={MAT.whale} position={[-3.3, 0, 0]} scale={[1.5, 0.45, 0.45]} />
      <mesh geometry={FLUKE_GEO} material={MAT.whaleFluke} position={[-4.5, 0, 0]} scale={[1.5, 1, 1.5]} />
      <mesh geometry={FLUKE_GEO_M} material={MAT.whaleFluke} position={[-4.5, 0, 0]} scale={[1.5, 1, 1.5]} />
      {/* the long white pectoral fins humpbacks are known for (they move) */}
      <group ref={finL} userData={{ noMerge: true }} position={[1.5, -0.45, 0.8]}>
        <mesh geometry={PADDLE_GEO} material={MAT.whaleFin} rotation={[0, -0.5, 0]} scale={[0.7, 1.6, 2.8]} />
      </group>
      <group ref={finR} userData={{ noMerge: true }} position={[1.5, -0.45, -0.8]}>
        <mesh geometry={PADDLE_GEO} material={MAT.whaleFin} rotation={[0, 0.5, 0]} scale={[0.7, 1.6, -2.8]} />
      </group>
    </StaticMerge>
  );
}

function Whale({ day, lowPower }) {
  const outer = useRef();
  const pitch = useRef();
  const roll = useRef();
  const finL = useRef();
  const finR = useRef();
  const puffs = useRef();
  const st = useRef({ next: T.now + rareGap(480, 720), run: null });
  const rise = useMemo(() => ({ t0: -99, x: 0, z: 0 }), []);
  const crash = useMemo(() => ({ t0: -99, x: 0, z: 0 }), []);
  const dive = useMemo(() => ({ t0: -99, x: 0, z: 0 }), []);
  const NP = lowPower ? 8 : 16;
  const puffDirs = useMemo(() => Array.from({ length: NP }, (_, i) => ({ b: i * 0.045, vx: rnd(-0.5, 0.5), vz: rnd(-0.5, 0.5), up: rnd(3.2, 4.6), s: rnd(0.7, 1.3) })), [NP]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ camera }) => {
    const t = T.now;
    const s = st.current;
    const g = outer.current;
    if (!s.run) {
      g.visible = false;
      puffs.current.visible = false;
      if (t < s.next) return;
      if (!day) {
        s.next = t + 60;
        return;
      }
      const v = viewDirs(camera);
      const r = rnd(55, 68);
      const side = (Math.random() < 0.5 ? -1 : 1) * rnd(10, 24);
      const sgn = Math.random() < 0.5 ? 1 : -1;
      const x = v.fx * r + v.rx * side;
      const z = v.fz * r + v.rz * side;
      s.run = { t0: t, x, z, dx: v.rx * sgn, dz: v.rz * sgn, h: Math.atan2(-v.rz * sgn, v.rx * sgn), splashed: 0 };
      addRipple(x, z, 3, 0.6);
      addRipple(x, z, 2, 0.5, 0.4);
    }
    const run = s.run;
    const tt = t - run.t0;
    if (tt > WHALE_DUR) {
      s.run = null;
      s.next = t + rareGap(480, 720);
      g.visible = false;
      puffs.current.visible = false;
      return;
    }
    let y = -6;
    let p = 0;
    let rl = 0;
    let fwd = 0;
    let fin = 0;
    let show = true;
    if (tt < 0.7) show = false;
    else if (tt < 2.5) {
      // up and out, twisting
      const k = ease((tt - 0.7) / 1.8);
      y = -5.2 + 7.6 * k;
      p = 1.25;
      rl = 1.4 * k;
      fin = k;
      fwd = k * 1.5;
    } else if (tt < 3.9) {
      // over onto its side and down
      const k = (tt - 2.5) / 1.4;
      y = 2.4 - 6.8 * k * k;
      p = 1.25 - 1.5 * ease(k);
      rl = 1.4 + 1.3 * k;
      fin = 1 - k * 0.5;
      fwd = 1.5 + k * 2.2;
    } else if (tt < 6.2) show = false;
    else if (tt < 9.4) {
      // back at the surface, blowing
      const k = Math.min(1, (tt - 6.2) / 0.8);
      y = -2.2 + 1.45 * ease(k);
      fwd = 6 + (tt - 6.2) * 1.1;
    } else {
      // dive, flukes up
      const k = (tt - 9.4) / (WHALE_DUR - 9.4);
      y = -0.75 - 4.5 * k * k;
      p = -1.15 * ease(Math.min(1, k * 1.6));
      fwd = 6 + 3.2 * 1.1 + k * 2;
    }
    g.visible = show;
    const x = run.x + run.dx * fwd;
    const z = run.z + run.dz * fwd;
    g.position.set(x, y, z);
    g.rotation.y = run.h;
    pitch.current.rotation.z = p;
    roll.current.rotation.x = rl;
    finL.current.rotation.x = -0.9 * fin;
    finR.current.rotation.x = 0.9 * fin;
    if (run.splashed === 0 && tt > 1.05) {
      run.splashed = 1;
      Object.assign(rise, { t0: t, x, z });
    }
    if (run.splashed === 1 && tt > 3.2) {
      run.splashed = 2;
      Object.assign(crash, { t0: t, x: x + run.dx * 1.5, z: z + run.dz * 1.5 });
    }
    if (run.splashed === 2 && tt > 10.3) {
      run.splashed = 3;
      Object.assign(dive, { t0: t, x: x - run.dx * 3.5, z: z - run.dz * 3.5 });
    }
    // the blow: a puffy column from the blowhole that drifts and fades
    const bt = tt - 6.9;
    const pm = puffs.current;
    pm.visible = bt > 0 && bt < 2.6;
    if (pm.visible) {
      const bx = x + run.dx * 2.2;
      const bz = z + run.dz * 2.2;
      puffDirs.forEach((d, i) => {
        const a = bt - d.b;
        if (a < 0 || a > 1.9) dummy.scale.setScalar(0.001);
        else {
          dummy.position.set(bx + d.vx * a, 0.3 + d.up * a - 1.2 * a * a, bz + d.vz * a);
          dummy.scale.setScalar(d.s * (0.4 + a * 0.9) * (1 - a / 1.9));
        }
        dummy.updateMatrix();
        pm.setMatrixAt(i, dummy.matrix);
      });
      pm.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <>
      <group ref={outer} visible={false}>
        <group ref={pitch}>
          <group ref={roll}>
            <WhaleBody finL={finL} finR={finR} />
          </group>
        </group>
      </group>
      <instancedMesh ref={puffs} args={[PUFF_GEO, MAT.spout, NP]} visible={false} frustumCulled={false} />
      <Splash fx={rise} size={2.6} n={lowPower ? 12 : 20} lift={1.2} />
      <Splash fx={crash} size={4.5} n={lowPower ? 18 : 36} lift={1.5} crown />
      <Splash fx={dive} size={1.8} n={10} />
    </>
  );
}

// --- Fireflies at night -------------------------------------------------------

function Fireflies({ count = 46, strength = 1 }) {
  const ref = useRef();
  const flies = useMemo(
    () =>
      Array.from({ length: count }, () => {
        let x;
        let z;
        do {
          x = rnd(-12, 12);
          z = rnd(-8.5, 8.5);
        } while (islandE(x, z) > 0.8 || Math.hypot(x, z) < 2.6);
        return { x, z, y: rnd(0.8, 2.4), ph: rnd(0, Math.PI * 2), sp: rnd(0.3, 0.8), blink: rnd(0.4, 1.1) };
      }),
    [count]
  );
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, [count]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    flies.forEach((f, i) => {
      pos[i * 3] = f.x + Math.sin(t * f.sp + f.ph) * 0.6;
      pos[i * 3 + 1] = f.y + Math.sin(t * f.sp * 1.7 + f.ph) * 0.3;
      pos[i * 3 + 2] = f.z + Math.cos(t * f.sp * 0.8 + f.ph) * 0.6;
      const glow = Math.max(0, Math.sin(t * f.blink + f.ph)) ** 3 * strength;
      col[i * 3] = glow;
      col[i * 3 + 1] = glow * 0.95;
      col[i * 3 + 2] = glow * 0.35;
    });
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo} frustumCulled={false}>
      <pointsMaterial size={0.32} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation fog={false} />
    </points>
  );
}

// ---------------------------------------------------------------------------

export default function SeaLife({ sky, lowPower = false }) {
  const night = sky.stars > 0.5;
  const day = sky.phase !== 'night';
  const turtleStarts = useMemo(() => [rnd(10, 20), rnd(45, 75)], []);
  return (
    <group>
      <Tick />
      <SharkFin id="shark-a" rx={21 * SPREAD} rz={17 * SPREAD} speed={0.05} offset={0.8} dir={1} />
      <SharkFin id="shark-b" rx={27 * SPREAD} rz={22 * SPREAD} speed={0.038} offset={3.6} dir={-1} />
      <Marlin />
      <Salmon />
      <FishSchools count={lowPower ? 2 : 4} />
      <Seagulls />
      <Turtle first={turtleStarts[0]} />
      {!lowPower && <Turtle first={turtleStarts[1]} />}
      <Dolphins day={day} lowPower={lowPower} />
      <Whale day={day} lowPower={lowPower} />
      {night && <Fireflies count={lowPower ? 24 : 46} strength={Math.min(1, sky.stars)} />}
    </group>
  );
}
