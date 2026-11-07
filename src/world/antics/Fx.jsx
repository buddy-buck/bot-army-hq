import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Tiny particle bursts for the antics, all from one pool: high-five sparks,
// dust puffs, sweat drops, splashes, dizzy stars and pop-up counts.
//   fxBurst('sparks', x, y, z)       fxCount(3, x, y, z)
// Two instanced meshes draw every particle; shrinking replaces fading.

const CAP = 120;
const NUMS = 6;

const P = {
  alive: new Uint8Array(CAP),
  shape: new Uint8Array(CAP), // 0 star, 1 blob
  t0: new Float32Array(CAP),
  life: new Float32Array(CAP),
  pos: new Float32Array(CAP * 3),
  vel: new Float32Array(CAP * 3),
  grav: new Float32Array(CAP),
  size: new Float32Array(CAP),
  grow: new Float32Array(CAP), // 1 = puff up then shrink, 0 = just shrink
  col: new Float32Array(CAP * 3),
  orbit: new Float32Array(CAP * 4), // cx, cz, radius, speed (dizzy stars)
};
const nums = Array.from({ length: NUMS }, () => ({ alive: false, n: 0, t0: 0, x: 0, y: 0, z: 0, color: '#ffffff' }));
let next = 0;
let nextNum = 0;
const clock = { t: 0, lite: false };
const c = new THREE.Color();

function spawn(shape, x, y, z, vx, vy, vz, life, size, color, grav = 0, grow = 0) {
  const i = next;
  next = (next + 1) % CAP;
  P.alive[i] = 1;
  P.shape[i] = shape;
  P.t0[i] = clock.t;
  P.life[i] = life;
  P.pos.set([x, y, z], i * 3);
  P.vel.set([vx, vy, vz], i * 3);
  P.grav[i] = grav;
  P.size[i] = size;
  P.grow[i] = grow;
  c.set(color);
  P.col.set([c.r, c.g, c.b], i * 3);
  P.orbit[i * 4 + 2] = 0;
  return i;
}

const SPARK = ['#fff4a8', '#ffd23f', '#ffffff', '#ffb84d'];
const CONFETTI = ['#ff6fae', '#ffd23f', '#5fd16b', '#4aa8ff', '#ff8a5c', '#9b7bff'];
const rnd = (a, b) => a + Math.random() * (b - a);

export function fxBurst(kind, x, y, z, opts = {}) {
  const lite = clock.lite;
  if (kind === 'sparks') {
    const n = lite ? 6 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(0, 0.4);
      const up = rnd(-0.3, 1);
      const s = rnd(1.2, 2.1);
      spawn(0, x, y, z, Math.cos(a) * s, up * s * 0.8, Math.sin(a) * s, rnd(0.45, 0.7), rnd(0.06, 0.1), SPARK[i % 4], 2);
    }
  } else if (kind === 'dust') {
    const n = lite ? 4 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      spawn(1, x + Math.cos(a) * 0.15, y + 0.05, z + Math.sin(a) * 0.15, Math.cos(a) * rnd(0.4, 0.8), rnd(0.2, 0.5), Math.sin(a) * rnd(0.4, 0.8), rnd(0.7, 1.0), rnd(0.09, 0.14), opts.color || '#eedcb0', -0.2, 1);
    }
  } else if (kind === 'sweat') {
    const s = opts.side ?? (Math.random() < 0.5 ? -1 : 1);
    spawn(1, x, y, z, s * rnd(0.3, 0.6), rnd(0.6, 1.0), rnd(-0.2, 0.2), 0.6, 0.035, '#9fe3ff', 4);
  } else if (kind === 'splash') {
    const n = lite ? 6 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = rnd(0.4, 0.9) * (opts.scale || 1);
      spawn(1, x, y, z, Math.cos(a) * s, rnd(1.4, 2.3) * (opts.scale || 1), Math.sin(a) * s, rnd(0.5, 0.75), rnd(0.035, 0.06), i % 3 ? '#e8fbff' : '#8fe0f0', 6);
    }
  } else if (kind === 'confetti') {
    const n = lite ? 8 : 16;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(0.3, 0.9);
      spawn(0, x, y, z, Math.cos(a) * s, rnd(1.6, 2.6), Math.sin(a) * s, rnd(1.0, 1.5), rnd(0.04, 0.07), CONFETTI[i % CONFETTI.length], 3);
    }
  } else if (kind === 'dizzy') {
    // little stars circling a head for `life` seconds
    const n = 3;
    for (let i = 0; i < n; i++) {
      const k = spawn(0, x, y, z, 0, 0, 0, opts.life || 2, 0.07, '#ffe14d');
      P.orbit.set([x, z, 0.22, 4 + i * 0.01], k * 4);
      P.vel[k * 3] = (i / n) * Math.PI * 2; // start angle
    }
  } else if (kind === 'glint') {
    spawn(0, x, y, z, 0, 0.25, 0, 0.5, 0.09, '#ffffff', 0, 1);
  }
}

export function fxCount(n, x, y, z, color = '#ffffff') {
  const s = nums[nextNum];
  nextNum = (nextNum + 1) % NUMS;
  Object.assign(s, { alive: true, n, t0: clock.t, x, y, z, color });
}

// One canvas texture per number, made the first time it's needed.
const numTex = new Map();
function numberTexture(n) {
  if (numTex.has(n)) return numTex.get(n);
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d');
  g.font = '900 44px system-ui, -apple-system, Segoe UI, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = '#1d2230';
  g.strokeText(String(n), 32, 34);
  g.fillStyle = '#ffffff';
  g.fillText(String(n), 32, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  numTex.set(n, tex);
  return tex;
}

const STAR_GEO = new THREE.OctahedronGeometry(1, 0);
const BLOB_GEO = new THREE.IcosahedronGeometry(1, 0);
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const sv = new THREE.Vector3();
const pv = new THREE.Vector3();

function commit(mesh, n) {
  mesh.count = n;
  mesh.visible = n > 0;
  if (n) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

export default function Fx({ lowPower = false }) {
  const stars = useRef();
  const blobs = useRef();
  const sprites = useRef([]);
  const mats = useMemo(
    () => ({
      star: new THREE.MeshBasicMaterial({ toneMapped: false }),
      blob: new THREE.MeshBasicMaterial({ toneMapped: false }),
      nums: Array.from({ length: NUMS }, () => new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false })),
    }),
    []
  );
  useEffect(() => {
    clock.lite = lowPower;
  }, [lowPower]);
  useEffect(
    () => () => {
      mats.star.dispose();
      mats.blob.dispose();
      mats.nums.forEach((m) => m.dispose());
      P.alive.fill(0);
      nums.forEach((s) => (s.alive = false));
    },
    [mats]
  );
  useEffect(() => {
    const white = new THREE.Color('#ffffff');
    for (let i = 0; i < CAP; i++) {
      stars.current.setColorAt(i, white);
      blobs.current.setColorAt(i, white);
    }
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    clock.t += dt;
    const t = clock.t;
    let ns = 0;
    let nb = 0;
    for (let i = 0; i < CAP; i++) {
      if (!P.alive[i]) continue;
      const k = (t - P.t0[i]) / P.life[i];
      if (k >= 1) {
        P.alive[i] = 0;
        continue;
      }
      const j = i * 3;
      const o = i * 4;
      if (P.orbit[o + 2] > 0) {
        const a = P.vel[j] + t * P.orbit[o + 3];
        P.pos[j] = P.orbit[o] + Math.cos(a) * P.orbit[o + 2];
        P.pos[j + 2] = P.orbit[o + 1] + Math.sin(a) * P.orbit[o + 2];
        P.pos[j + 1] += Math.sin(a * 2) * 0.002;
      } else {
        P.vel[j + 1] -= P.grav[i] * dt;
        P.pos[j] += P.vel[j] * dt;
        P.pos[j + 1] += P.vel[j + 1] * dt;
        P.pos[j + 2] += P.vel[j + 2] * dt;
      }
      const s = P.size[i] * (P.grow[i] ? Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5 + 0.2) * (1 - k * k) * 1.3 : 1 - k * k);
      e.set(t * 3 + i, t * 2 + i * 0.7, 0);
      q.setFromEuler(e);
      pv.set(P.pos[j], P.pos[j + 1], P.pos[j + 2]);
      sv.setScalar(Math.max(0.0001, s));
      m4.compose(pv, q, sv);
      c.setRGB(P.col[j], P.col[j + 1], P.col[j + 2]);
      if (P.shape[i] === 0) {
        stars.current.setMatrixAt(ns, m4);
        stars.current.setColorAt(ns, c);
        ns++;
      } else {
        blobs.current.setMatrixAt(nb, m4);
        blobs.current.setColorAt(nb, c);
        nb++;
      }
    }
    commit(stars.current, ns);
    commit(blobs.current, nb);
    // pop-up counts: rise, then fade
    nums.forEach((s, i) => {
      const sp = sprites.current[i];
      if (!sp) return;
      const k = s.alive ? (t - s.t0) / 0.9 : 1;
      if (k >= 1) {
        s.alive = false;
        sp.visible = false;
        return;
      }
      if (sp.material.map !== numberTexture(s.n)) {
        sp.material.map = numberTexture(s.n);
        sp.material.needsUpdate = true;
      }
      sp.material.color.set(s.color);
      sp.visible = true;
      sp.position.set(s.x, s.y + k * 0.45, s.z);
      sp.scale.setScalar(0.42 * (k < 0.15 ? k / 0.15 : 1));
      sp.material.opacity = k > 0.6 ? (1 - k) / 0.4 : 1;
    });
  });

  return (
    <group>
      <instancedMesh ref={stars} args={[STAR_GEO, mats.star, CAP]} frustumCulled={false} />
      <instancedMesh ref={blobs} args={[BLOB_GEO, mats.blob, CAP]} frustumCulled={false} />
      {mats.nums.map((m, i) => (
        <sprite key={i} ref={(el) => (sprites.current[i] = el)} material={m} visible={false} renderOrder={5} />
      ))}
    </group>
  );
}
