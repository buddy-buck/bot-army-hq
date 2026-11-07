import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DOCK, SPREAD, islandE } from '../utils/paths.js';

// Sea life and the living world around the island. All low-poly, a handful
// of meshes each, and a single cheap useFrame per creature.
//   Two great white shark fins slowly circling, each with a wake
//   A blue marlin that leaps every 40 to 90 seconds, with splashes
//   Salmon hopping off the end of Launch's Pier
//   Small fish schools in the shallows
//   Seagulls overhead, a sea turtle surfacing (boats live in src/wild/Boats.jsx)
//   Dolphins at sunrise, fireflies at night
// Purely ambient: none of it says anything about the bots or the data.
// Not rendered at all when reduced motion is on.

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, ...extra });

const MAT = {
  shark: std('#5d6873'),
  sharkBelly: std('#d9dde2'),
  wake: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }),
  splash: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
  ring: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
  marlin: std('#1f4fb8', { roughness: 0.4 }),
  marlinBelly: std('#cfe0f2', { roughness: 0.4 }),
  marlinFin: std('#173a8a'),
  salmon: std('#e58a78', { roughness: 0.45 }),
  gull: std('#ffffff'),
  gullWing: std('#c9ced6'),
  beak: std('#f2a03d'),
  hull: std('#fdf8ee'),
  hullStripe: std('#19469d'),
  sail: new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, side: THREE.DoubleSide, roughness: 0.9 }),
  mast: std('#7a5232'),
  shell: std('#3f7d4a'),
  shellTop: std('#5b9a52'),
  skin: std('#8fae6b'),
  dolphin: std('#7d8fa3', { roughness: 0.4 }),
};

const rnd = (a, b) => a + Math.random() * (b - a);

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
// Wake: a soft V spreading behind the fin, flat on the water.
const WAKE_GEO = buildGeo([0.2, 0, 0, -2.8, 0, 0.9, -2.8, 0, 0.55, -0.1, 0, 0, -2.8, 0, -0.9, -2.8, 0, -0.55], [0, 1, 2, 0, 2, 3, 3, 5, 0, 0, 5, 4]);
const BODY_GEO = new THREE.IcosahedronGeometry(1, 1);
const CONE4 = new THREE.ConeGeometry(1, 1, 4);
const DROP_GEO = new THREE.IcosahedronGeometry(0.07, 0);
const RING_GEO = new THREE.RingGeometry(0.75, 1, 20).rotateX(-Math.PI / 2);
const TRI_GEO = buildGeo([0, 0, 0, -1, 0, 0, -0.5, 1, 0], [0, 1, 2, 0, 2, 1]);
const WING_GEO = buildGeo([0, 0, 0.08, 0, 0, -0.08, 0.7, 0.02, 0.02, 0.6, 0, -0.1], [0, 2, 1, 1, 2, 3]);

// --- Splash: droplets plus an expanding ring, fired by setting fx.t0 --------

function Splash({ fx, size = 1 }) {
  const drops = useRef();
  const ring = useRef();
  const N = 12;
  const dirs = useMemo(() => Array.from({ length: N }, (_, i) => ({ a: (i / N) * Math.PI * 2 + rnd(-0.2, 0.2), v: rnd(1.2, 2.2), up: rnd(2.2, 3.6) })), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime - fx.t0;
    const live = t >= 0 && t < 1.1;
    drops.current.visible = live;
    ring.current.visible = live;
    if (!live) return;
    dirs.forEach((d, i) => {
      const r = d.v * t * size;
      dummy.position.set(fx.x + Math.cos(d.a) * r, Math.max(-0.2, (d.up * t - 4.9 * t * t) * size), fx.z + Math.sin(d.a) * r);
      dummy.scale.setScalar(size * (1 - t * 0.6));
      dummy.updateMatrix();
      drops.current.setMatrixAt(i, dummy.matrix);
    });
    drops.current.instanceMatrix.needsUpdate = true;
    ring.current.position.set(fx.x, 0.1, fx.z);
    ring.current.scale.setScalar(size * (0.3 + t * 1.8));
    ring.current.material.opacity = 0.6 * (1 - t / 1.1);
  });
  return (
    <>
      <instancedMesh ref={drops} args={[DROP_GEO, MAT.splash, N]} visible={false} frustumCulled={false} />
      <mesh ref={ring} geometry={RING_GEO} material={MAT.ring.clone()} visible={false} renderOrder={3} />
    </>
  );
}

// --- Great white sharks -------------------------------------------------------

function SharkFin({ rx, rz, speed, offset, dir = 1 }) {
  const ref = useRef();
  const fin = useRef();
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
  });
  return (
    <group ref={ref}>
      <mesh ref={fin} geometry={FIN_GEO} material={MAT.shark} scale={1.25} />
      <mesh geometry={WAKE_GEO} material={MAT.wake} position={[0, 0.13, 0]} renderOrder={3} />
    </group>
  );
}

// --- Blue marlin --------------------------------------------------------------

function MarlinBody() {
  return (
    <group>
      <mesh geometry={BODY_GEO} material={MAT.marlin} scale={[0.95, 0.24, 0.2]} />
      <mesh geometry={BODY_GEO} material={MAT.marlinBelly} position={[0.05, -0.09, 0]} scale={[0.8, 0.14, 0.16]} />
      {/* bill */}
      <mesh geometry={CONE4} material={MAT.marlinFin} position={[1.25, 0.03, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[0.035, 0.7, 0.035]} />
      {/* tall dorsal sail */}
      <mesh geometry={TRI_GEO} material={MAT.marlinFin} position={[0.6, 0.15, 0]} scale={[1.0, 0.55, 1]} />
      {/* crescent tail */}
      <mesh geometry={TRI_GEO} material={MAT.marlinFin} position={[-0.85, 0, 0]} rotation={[0, 0, 0.5]} scale={[0.45, 0.5, 1]} />
      <mesh geometry={TRI_GEO} material={MAT.marlinFin} position={[-0.85, 0, 0]} rotation={[0, 0, Math.PI - 0.5]} scale={[0.45, -0.5, 1]} />
    </group>
  );
}

function Marlin() {
  const ref = useRef();
  const st = useRef({ next: rnd(8, 16), jump: null });
  const s1 = useMemo(() => ({ t0: -99, x: 0, z: 0 }), []);
  const s2 = useMemo(() => ({ t0: -99, x: 0, z: 0 }), []);
  const DUR = 1.7;
  const LEN = 5.5;
  const H = 2.8;
  useFrame((state) => {
    const t = state.clock.elapsedTime;
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
    ref.current.rotation.set(0, j.h, Math.atan(4 * H * (1 - 2 * k) / LEN) * 0.9 + Math.sin(k * Math.PI) * 0.15);
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
  const st = useRef({ next: rnd(2, 5), hop: null });
  const sp = useMemo(() => ({ t0: -99, x: 0, z: 0 }), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const s = st.current;
    if (!s.hop && t >= s.next) {
      const a = rnd(Math.PI * 0.5, Math.PI * 1.5);
      const r = rnd(1.4, 3.2);
      s.hop = { t0: t, x: DOCK.x0 - 0.3 + Math.cos(a) * r, z: (DOCK.z0 + DOCK.z1) / 2 + Math.sin(a) * r, h: rnd(0, Math.PI * 2) };
      Object.assign(sp, { t0: t + 0.62, x: s.hop.x + Math.cos(s.hop.h) * 1.1, z: s.hop.z - Math.sin(s.hop.h) * 1.1 });
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
        <mesh geometry={BODY_GEO} material={MAT.salmon} scale={[0.26, 0.09, 0.07]} />
        <mesh geometry={TRI_GEO} material={MAT.salmon} position={[-0.22, 0, 0]} rotation={[0, 0, 0.6]} scale={[0.14, 0.14, 1]} />
      </group>
      <Splash fx={sp} size={0.45} />
    </>
  );
}

// --- Fish schools in the shallows ----------------------------------------------

const SCHOOLS = [
  { a: 0.6, e: 1.32, color: '#ffd23f', n: 9, speed: 0.5 },
  { a: 2.5, e: 1.4, color: '#ff8a3d', n: 8, speed: -0.42 },
  { a: 4.3, e: 1.3, color: '#3ec9ff', n: 9, speed: 0.55 },
  { a: 5.4, e: 1.45, color: '#ffe066', n: 7, speed: -0.5 },
];

function FishSchools({ count = 4 }) {
  const ref = useRef();
  const fish = useMemo(() => {
    const out = [];
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
      for (let i = 0; i < s.n; i++) out.push({ cx, cz, si, speed: s.speed, ph: (i / s.n) * Math.PI * 2, rad: rnd(0.7, 1.3), dy: rnd(-0.06, 0.04), color: s.color });
    });
    return out;
  }, [count]);
  const geo = useMemo(() => new THREE.ConeGeometry(0.06, 0.24, 4).rotateZ(-Math.PI / 2), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.5, emissiveIntensity: 0.25 }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    fish.forEach((f, i) => ref.current.setColorAt(i, new THREE.Color(f.color)));
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [fish]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    fish.forEach((f, i) => {
      const a = f.ph + t * f.speed;
      const r = f.rad + Math.sin(t * 0.7 + f.ph * 2) * 0.15;
      dummy.position.set(f.cx + Math.cos(a) * r * 1.6, -0.2 + f.dy, f.cz + Math.sin(a) * r);
      const sg = Math.sign(f.speed);
      dummy.rotation.set(0, Math.atan2(-Math.cos(a) * sg, -Math.sin(a) * 1.6 * sg), 0);
      dummy.rotation.y += Math.sin(t * 9 + i) * 0.15; // tail flick
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
    ref.current.rotation.set(0, -a - Math.PI / 2 * Math.sign(speed), Math.sign(speed) * 0.25);
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

// --- Sailboat on the horizon ---------------------------------------------------

// --- Sea turtle surfacing --------------------------------------------------------

function Turtle() {
  const ref = useRef();
  const st = useRef({ next: rnd(10, 20), up: null });
  const ripple = useMemo(() => ({ t0: -99, x: 0, z: 0 }), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const s = st.current;
    if (!s.up && t >= s.next) {
      const a = rnd(0, Math.PI * 2);
      const r = rnd(16, 21) * SPREAD;
      s.up = { t0: t, x: Math.cos(a) * r, z: Math.sin(a) * r, h: a + Math.PI / 2 };
      Object.assign(ripple, { t0: t + 1.2, x: s.up.x, z: s.up.z });
    }
    const u = s.up;
    if (!u) {
      ref.current.visible = false;
      return;
    }
    const k = (t - u.t0) / 8;
    if (k > 1) {
      s.up = null;
      s.next = t + rnd(25, 60);
      ref.current.visible = false;
      return;
    }
    ref.current.visible = true;
    const rise = Math.min(1, k * 5, (1 - k) * 5);
    const d = k * 2.2;
    ref.current.position.set(u.x + Math.cos(u.h) * d, -0.55 + rise * 0.58, u.z - Math.sin(u.h) * d);
    ref.current.rotation.set(0, u.h, 0);
  });
  return (
    <>
      <group ref={ref} visible={false} scale={1.2}>
        <mesh geometry={BODY_GEO} material={MAT.shell} scale={[0.5, 0.16, 0.4]} />
        <mesh geometry={BODY_GEO} material={MAT.shellTop} position={[0, 0.06, 0]} scale={[0.36, 0.12, 0.28]} />
        <mesh geometry={BODY_GEO} material={MAT.skin} position={[0.56, 0.06, 0]} scale={[0.13, 0.09, 0.1]} />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={BODY_GEO} material={MAT.skin} position={[0.22, -0.03, s * 0.42]} rotation={[0, s * 0.5, 0]} scale={[0.22, 0.03, 0.08]} />
        ))}
      </group>
      <Splash fx={ripple} size={0.5} />
    </>
  );
}

// --- Dolphins at sunrise ------------------------------------------------------

function Dolphin({ delay }) {
  const ref = useRef();
  const PERIOD = 9;
  useFrame((state) => {
    const t = state.clock.elapsedTime - delay;
    const cyc = ((t % PERIOD) + PERIOD) % PERIOD;
    const lap = Math.floor(t / PERIOD);
    const base = 0.4 + lap * 0.5; // each lap starts a bit further around
    const k = cyc / 1.3; // each leap is 1.3s, then underwater
    const a = base + (cyc / PERIOD) * 0.55;
    const r = (24 + Math.sin(lap) * 2) * SPREAD;
    if (k > 1) {
      ref.current.visible = false;
      return;
    }
    ref.current.visible = true;
    ref.current.position.set(Math.cos(a) * r, -0.35 + 4 * 1.3 * k * (1 - k), Math.sin(a) * r);
    ref.current.rotation.set(0, -a - Math.PI / 2, (1 - 2 * k) * 1.1);
  });
  return (
    <group ref={ref} visible={false}>
      <mesh geometry={BODY_GEO} material={MAT.dolphin} scale={[0.7, 0.18, 0.17]} />
      <mesh geometry={CONE4} material={MAT.dolphin} position={[0.78, -0.02, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[0.06, 0.2, 0.06]} />
      <mesh geometry={TRI_GEO} material={MAT.dolphin} position={[0.15, 0.14, 0]} scale={[0.3, 0.26, 1]} />
      <mesh geometry={TRI_GEO} material={MAT.dolphin} position={[-0.65, 0, 0]} rotation={[Math.PI / 2, 0, 0.3]} scale={[0.25, 0.25, 1]} />
    </group>
  );
}

function Dolphins() {
  return (
    <>
      <Dolphin delay={0} />
      <Dolphin delay={0.45} />
      <Dolphin delay={0.9} />
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
  return (
    <group>
      <SharkFin rx={21 * SPREAD} rz={17 * SPREAD} speed={0.05} offset={0.8} dir={1} />
      <SharkFin rx={27 * SPREAD} rz={22 * SPREAD} speed={0.038} offset={3.6} dir={-1} />
      <Marlin />
      <Salmon />
      <FishSchools count={lowPower ? 2 : 4} />
      <Seagulls />
      <Turtle />
      {sky.phase === 'sunrise' && <Dolphins />}
      {night && <Fireflies count={lowPower ? 24 : 46} strength={Math.min(1, sky.stars)} />}
    </group>
  );
}
