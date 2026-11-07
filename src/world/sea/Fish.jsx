import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FLO, SEA_LANES, islandE } from '../../utils/paths.js';
import { aliveClock, testOn } from '../../wild/director.js';
import { world } from '../state.js';
import { ripple } from './fx.js';
import { splash } from './Spray.jsx';
import { lanePoint, rnd } from './kit.js';

// Schools of little tropical fish in the shallows, one draw for all of them.
// Boids-lite: every fish steers toward its spot around the school's leader,
// keeps a little space from its neighbours and matches the leader's swim,
// so the school swirls and stretches like the real thing. When a boat comes
// close the school bolts away from it and regroups once it has passed.
// Now and then one fish jumps clear of the water with a tiny splash.
// One school lives under Flo's glass floor, so there's always something to
// see through it.

// Palettes: mostly one kind of fish per school, with a few odd ones in.
const SCHOOLS = [
  { theta: 1.25, e: 1.42, n: 14, colors: ['#ffd23f', '#ffd23f', '#ffe680', '#ffc21a'] }, // yellow tangs, south beach
  { theta: 2.45, e: 1.55, n: 12, colors: ['#2f7dff', '#2f7dff', '#4aa3ff', '#ffd23f'] }, // blue tangs, south-west
  { theta: 0.35, e: 1.6, n: 12, colors: ['#ff7a1a', '#ff8a3d', '#ffffff', '#ff7a1a'] }, // clownfish, east
  { theta: 3.6, e: 1.5, n: 12, colors: ['#3fe0b0', '#ff6fa8', '#3fe0b0', '#7af0d0'] }, // parrotfish, west
  { theta: 4.55, e: 1.6, n: 10, colors: ['#3ec9ff', '#b26bff', '#3ec9ff', '#8fe3ff'] }, // neon, north (west of Flo's)
];
const GLASS_SCHOOL = { n: 12, colors: ['#ffd23f', '#ff6fa8', '#3ec9ff', '#ff8a3d', '#b26bff'] };

// Low-poly fish, nose along +z: a diamond body and a forked tail fin.
// Vertex colors darken the tail and lighten the belly a touch.
function fishGeometry() {
  const v = [
    0, 0, 0.13, // 0 nose
    0, 0.055, 0, // 1 top
    0.032, 0, 0, // 2 right
    0, -0.045, 0, // 3 belly
    -0.032, 0, 0, // 4 left
    0, 0, -0.1, // 5 tail root
    0, 0.065, -0.18, // 6 tail top
    0, -0.065, -0.18, // 7 tail bottom
  ];
  const idx = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1, 5, 2, 1, 5, 3, 2, 5, 4, 3, 5, 1, 4, 5, 6, 7, 5, 7, 6];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const shade = [1, 1.05, 1, 1.25, 1, 0.8, 0.7, 0.7];
  g.setAttribute('color', new THREE.Float32BufferAttribute(shade.flatMap((s) => [s, s, s]), 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  g.dispose();
  return flat;
}

// Nearest moving boat to a point (shared temp, no allocations per frame).
const near = { d: Infinity, x: 0, z: 0, r: 0 };
let qx = 0;
let qz = 0;
function nearestBoat(b) {
  const d = Math.hypot(b.x - qx, b.z - qz);
  const r = 3.5 + (b.size || 2) * 0.8;
  if (d - r < near.d - near.r) {
    near.d = d;
    near.x = b.x;
    near.z = b.z;
    near.r = r;
  }
}

const tmp = { x: 0, z: 0 };

export default function FishSchools({ lowPower = false }) {
  const ref = useRef();
  const clock = useMemo(aliveClock, []);
  const test = testOn('fish');

  const { schools, fish } = useMemo(() => {
    const list = (lowPower ? SCHOOLS.slice(0, 3) : SCHOOLS).map((s) => {
      lanePoint(s.theta, s.e, tmp);
      return { ...s, hx: tmp.x, hz: tmp.z, lx: tmp.x, lz: tmp.z, vx: 0, vz: 0, ox: 0, oz: 0, glass: false, ph: rnd(0, 10), depth: -0.2 };
    });
    // under the glass floor: a slow tight swirl in the shade of the platform
    list.push({ ...GLASS_SCHOOL, hx: FLO.glass.x, hz: FLO.glass.z, lx: FLO.glass.x, lz: FLO.glass.z, vx: 0, vz: 0, ox: 0, oz: 0, glass: true, ph: rnd(0, 10), depth: -0.3 });
    const fish = [];
    list.forEach((s, si) => {
      for (let i = 0; i < s.n; i++) {
        const a = (i / s.n) * Math.PI * 2;
        const rr = rnd(0.25, 0.9) * (s.glass ? 0.7 : 1);
        fish.push({
          si,
          x: s.hx + Math.cos(a) * rr,
          z: s.hz + Math.sin(a) * rr,
          vx: 0,
          vz: 0,
          ox: Math.cos(a) * rr, // home spot around the leader
          oz: Math.sin(a) * rr,
          y: s.depth + rnd(-0.08, 0.06),
          s: rnd(1.15, 1.6) * (s.glass ? 1.2 : 1),
          wag: rnd(0, 6.28),
          heading: 0,
          color: s.colors[i % s.colors.length],
        });
      }
    });
    return { schools: list, fish };
  }, [lowPower]);

  const geo = useMemo(fishGeometry, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.45, side: THREE.DoubleSide }), []);
  useEffect(() => () => (geo.dispose(), mat.dispose()), [geo, mat]);
  const dummy = useMemo(() => {
    const d = new THREE.Object3D();
    d.rotation.order = 'YXZ'; // heading first, then the jump's pitch
    return d;
  }, []);
  const jump = useRef({ next: test ? 2 : rnd(5, 10), i: -1, t0: 0 });

  useLayoutEffect(() => {
    const c = new THREE.Color();
    fish.forEach((f, i) => ref.current.setColorAt(i, c.set(f.color)));
    ref.current.instanceColor.needsUpdate = true;
  }, [fish]);

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const dt = Math.min(delta, 0.05);
    const t = clock.tick(delta);

    // Leaders wander in slow loops around home, and bolt from boats.
    for (const s of schools) {
      const R = s.glass ? 0.55 : 2.2;
      let tx = s.hx + Math.sin(t * 0.13 + s.ph) * R * 1.3 + Math.sin(t * 0.31 + s.ph * 2) * R * 0.4;
      let tz = s.hz + Math.cos(t * 0.11 + s.ph) * R + Math.sin(t * 0.27 + s.ph) * R * 0.3;
      near.d = Infinity;
      near.r = 0;
      qx = s.lx;
      qz = s.lz;
      world.boats.forEach(nearestBoat);
      let fleeX = 0;
      let fleeZ = 0;
      if (near.d < near.r) {
        const k = (near.r - near.d) / near.r;
        fleeX = ((s.lx - near.x) / (near.d || 1)) * k * 4.5;
        fleeZ = ((s.lz - near.z) / (near.d || 1)) * k * 4.5;
      }
      // the bolt offset eases in fast and relaxes slowly
      const ease = fleeX || fleeZ ? 4 : 0.35;
      s.ox += (fleeX - s.ox) * Math.min(1, dt * ease);
      s.oz += (fleeZ - s.oz) * Math.min(1, dt * ease);
      tx += s.ox;
      tz += s.oz;
      // keep the school in the shallows' lane, off the beach
      if (!s.glass) {
        const e = islandE(tx, tz);
        if (e < SEA_LANES.nearShore.e0 - 0.05) {
          tx += (tx - s.hx) * -0.5;
          tz += (tz - s.hz) * -0.5;
        }
      }
      const nvx = (tx - s.lx) * 0.8;
      const nvz = (tz - s.lz) * 0.8;
      s.vx += (nvx - s.vx) * Math.min(1, dt * 2);
      s.vz += (nvz - s.vz) * Math.min(1, dt * 2);
      s.lx += s.vx * dt;
      s.lz += s.vz * dt;
      s.scared = Math.hypot(s.ox, s.oz);
    }

    // A fish jumps now and then (never the glass school).
    const j = jump.current;
    if (j.i < 0 && t >= j.next) {
      j.i = Math.floor(Math.random() * fish.length);
      if (schools[fish[j.i].si].glass) j.i = 0;
      j.t0 = t;
      ripple(fish[j.i].x, fish[j.i].z, 0.7);
    }

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      const s = schools[f.si];
      // swirl: each fish's home spot slowly turns around the leader
      const spin = t * (s.glass ? 0.5 : 0.32) * (f.si % 2 ? -1 : 1);
      const c = Math.cos(spin);
      const sn = Math.sin(spin);
      const spread = 1 + Math.min(1.5, s.scared * 0.25); // a scared school scatters a little
      const hx = s.lx + (f.ox * c - f.oz * sn) * spread;
      const hz = s.lz + (f.ox * sn + f.oz * c) * spread;
      let ax = (hx - f.x) * 2.2 + (s.vx - f.vx) * 0.8;
      let az = (hz - f.z) * 2.2 + (s.vz - f.vz) * 0.8;
      // keep a little space from schoolmates
      for (let k = i - 3; k <= i + 3; k++) {
        if (k === i || k < 0 || k >= fish.length || fish[k].si !== f.si) continue;
        const dx = f.x - fish[k].x;
        const dz = f.z - fish[k].z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.06 && d2 > 1e-6) {
          ax += (dx / d2) * 0.05;
          az += (dz / d2) * 0.05;
        }
      }
      f.vx += ax * dt;
      f.vz += az * dt;
      const sp = Math.hypot(f.vx, f.vz);
      const max = s.scared > 0.5 ? 4.2 : 1.6;
      if (sp > max) {
        f.vx *= max / sp;
        f.vz *= max / sp;
      }
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      if (sp > 0.05) {
        const want = Math.atan2(f.vx, f.vz);
        let dh = want - f.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        f.heading += dh * Math.min(1, dt * 6);
      }
      let y = f.y + Math.sin(t * 1.1 + f.wag) * 0.03;
      let pitch = 0;
      if (i === j.i) {
        const k = (t - j.t0) / 0.75;
        if (k >= 1) {
          splash(f.x, f.z, 0.35, 5);
          j.i = -1;
          j.next = t + (test ? rnd(2, 4) : rnd(6, 14));
        } else {
          y = -0.1 + 4 * 0.7 * k * (1 - k);
          pitch = (2 * k - 1) * 1.1;
        }
      }
      dummy.position.set(f.x, y, f.z);
      dummy.rotation.set(pitch, f.heading + Math.sin(t * (8 + sp * 4) + f.wag) * 0.18, 0);
      dummy.scale.setScalar(f.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geo, mat, fish.length]} frustumCulled={false} />;
}
