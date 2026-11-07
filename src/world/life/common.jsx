import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { groundY } from '../../utils/paths.js';

// Shared bits for the island life scenes (tiki bar, food truck, hammock,
// volleyball, DJ booth, waiters): materials in the Island.jsx style, little
// mesh helpers, walking paths, sign textures and MiniBot poses.

export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

export const LM = {
  wood: std('#a8774a'),
  darkWood: std('#7a5232'),
  plank: std('#c08a57'),
  thatch: std('#dcb468'),
  thatchDark: std('#b98a45'),
  fringe: std('#c99a52', { side: THREE.DoubleSide }),
  bamboo: std('#d4b872'),
  bambooNode: std('#9c8240'),
  white: std('#fdf8ee'),
  cream: std('#f6e7c8'),
  dark: std('#3b3430'),
  metal: std('#b9c2c8', { roughness: 0.4, metalness: 0.5 }),
  chrome: std('#dfe6ea', { roughness: 0.25, metalness: 0.7 }),
  rope: std('#d9c79a'),
  canvas: std('#f2e2c4', { side: THREE.DoubleSide, roughness: 1 }),
  red: std('#e5533d'),
  coral: std('#ff7a59'),
  teal: std('#2fbfb0'),
  yellow: std('#ffd23f'),
  pink: std('#ff6fae'),
  blue: std('#3d7be5'),
  green: std('#3fae5a'),
  leaf: std('#4fb35a'),
  palm: std('#9a6b43'),
  coconut: std('#6b4a2a'),
  glass: std('#cfefff', { transparent: true, opacity: 0.6, roughness: 0.2 }),
  shadow: new THREE.MeshBasicMaterial({ color: '#13261b', transparent: true, opacity: 0.18, depthWrite: false }),
  sandLine: new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true, opacity: 0.85, depthWrite: false }),
};

// Additive glow (halos around lamps and signs). Opacity is set per frame
// or per night level by the scene.
export const glowMat = (color, opacity = 0.25) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

// An emissive material that gets brighter as night falls (night = sky.stars).
export function useNightGlow(color, night, base = 0.1, boost = 1.3) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, flatShading: true }), [color, base]);
  useEffect(() => {
    mat.emissiveIntensity = base + night * boost;
  }, [mat, night, base, boost]);
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

export function Box({ p, s, m, r, ...rest }) {
  return (
    <mesh position={p} rotation={r} material={m} {...rest}>
      <boxGeometry args={s} />
    </mesh>
  );
}

export function Cyl({ p, rt = 0.06, rb, h, m, seg = 6, r, ...rest }) {
  return (
    <mesh position={p} rotation={r} material={m} {...rest}>
      <cylinderGeometry args={[rt, rb ?? rt, h, seg]} />
    </mesh>
  );
}

export function Cone({ p, rad, h, m, seg = 8, r, ...rest }) {
  return (
    <mesh position={p} rotation={r} material={m} {...rest}>
      <coneGeometry args={[rad, h, seg]} />
    </mesh>
  );
}

export function Ball({ p, rad, m, detail = 0, s, ...rest }) {
  return (
    <mesh position={p} material={m} scale={s} {...rest}>
      <icosahedronGeometry args={[rad, detail]} />
    </mesh>
  );
}

// A beam between two points (rafters, braces, ropes).
const UP = new THREE.Vector3(0, 1, 0);
export function Beam({ a, b, r = 0.04, m, seg = 5 }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    return {
      pos: va.clone().add(vb).multiplyScalar(0.5).toArray(),
      quat: new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()),
      len: dir.length(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a[0], a[1], a[2], b[0], b[1], b[2]]);
  return (
    <mesh position={pos} quaternion={quat} material={m}>
      <cylinderGeometry args={[r, r, len, seg]} />
    </mesh>
  );
}

// Bamboo pole with darker node rings.
export function BambooPost({ p, h, r = 0.07 }) {
  const nodes = Math.max(2, Math.round(h / 0.55));
  return (
    <group position={p}>
      <Cyl p={[0, h / 2, 0]} rt={r * 0.92} rb={r} h={h} m={LM.bamboo} seg={7} />
      {Array.from({ length: nodes }, (_, i) => (
        <Cyl key={i} p={[0, ((i + 0.6) / (nodes + 0.2)) * h, 0]} rt={r * 1.12} h={0.035} m={LM.bambooNode} seg={7} />
      ))}
    </group>
  );
}

// Ragged thatch skirt hanging under a rectangular eave.
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function makeFringe(halfX, halfZ, drop) {
  const pos = [];
  const pts = [];
  const c = [[-halfX, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ], [-halfX, -halfZ]];
  for (let k = 0; k < 4; k++) {
    const [x0, z0] = c[k];
    const [x1, z1] = c[k + 1];
    const n = Math.max(4, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.16));
    for (let i = 0; i < n; i++) pts.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
  }
  pts.push(c[4]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const d = drop * (0.7 + 0.6 * hash2(mx * 3.1, mz * 2.7));
    pos.push(ax, 0, az, bx, 0, bz, mx, -d, mz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
export function Fringe({ p, halfX, halfZ, drop = 0.24, m = LM.fringe }) {
  const geo = useMemo(() => makeFringe(halfX, halfZ, drop), [halfX, halfZ, drop]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh position={p} geometry={geo} material={m} />;
}

// Square-based thatch roof: halfX, halfZ are the half-widths of the base.
const PYRAMID = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4);
const PYR_K = 1 / Math.SQRT1_2;
export function Roof({ p, halfX, halfZ, h, m = LM.thatch }) {
  return <mesh position={p} geometry={PYRAMID} material={m} scale={[halfX * PYR_K, h, halfZ * PYR_K]} />;
}

// Festoon string lights along a list of points; each bulb glows at night.
const BULB_COLORS = ['#ffd27a', '#ff8fb8', '#7fe3d8', '#ffb35c'];
const BULB_GEO = new THREE.IcosahedronGeometry(0.05, 0);
export function StringLights({ points, sag = 0.22, per = 6, night }) {
  const m0 = useNightGlow(BULB_COLORS[0], night, 0.25, 1.8);
  const m1 = useNightGlow(BULB_COLORS[1], night, 0.25, 1.8);
  const m2 = useNightGlow(BULB_COLORS[2], night, 0.25, 1.8);
  const m3 = useNightGlow(BULB_COLORS[3], night, 0.25, 1.8);
  const mats = [m0, m1, m2, m3];
  const key = JSON.stringify(points);
  const { bulbs, wire } = useMemo(() => {
    const bulbs = [];
    const wirePts = [];
    for (let s = 0; s < points.length - 1; s++) {
      const a = new THREE.Vector3(...points[s]);
      const b = new THREE.Vector3(...points[s + 1]);
      const at = (t) => a.clone().lerp(b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0));
      for (let i = 0; i <= 10; i++) if (s === 0 || i > 0) wirePts.push(at(i / 10));
      for (let i = 1; i <= per; i++) bulbs.push(at(i / (per + 1)).add(new THREE.Vector3(0, -0.045, 0)).toArray());
    }
    const curve = new THREE.CatmullRomCurve3(wirePts);
    return { bulbs, wire: new THREE.TubeGeometry(curve, wirePts.length * 2, 0.01, 3, false) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sag, per]);
  useEffect(() => () => wire.dispose(), [wire]);
  return (
    <group>
      <mesh geometry={wire} material={LM.dark} />
      {bulbs.map((b, i) => (
        <mesh key={i} position={b} geometry={BULB_GEO} material={mats[i % 4]} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

// With reduced motion the canvas only draws on demand: ask for a frame after
// mounting (and when the scene changes) so useFrame poses everything once.
export function usePoseOnce(...deps) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    const id = setTimeout(() => invalidate(), 60);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// Local (x, z) in a frame { x, z, rotY } -> world [x, z] (same as a group
// with that position and rotation.y).
export function toWorld(f, lx, lz) {
  const c = Math.cos(f.rotY || 0);
  const s = Math.sin(f.rotY || 0);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
}

// ---------------------------------------------------------------------------
// Walking paths
// ---------------------------------------------------------------------------

// A polyline over the sand. sample(s, out) writes { x, y, z, heading } at
// distance s along it (heading = rotation.y facing along the path). No
// allocations per call. Closed paths wrap around.
export function makePath(points, closed = false) {
  const pts = closed ? [...points, points[0]] : points;
  const segs = [];
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, dx: bx - ax, dz: bz - az, len, s0: length });
    length += len;
  }
  return {
    length,
    closed,
    sample(s, out) {
      let d = closed ? ((s % length) + length) % length : Math.min(Math.max(s, 0), length);
      let seg = segs[segs.length - 1];
      for (let i = 0; i < segs.length; i++) {
        if (d <= segs[i].s0 + segs[i].len) {
          seg = segs[i];
          break;
        }
      }
      const k = seg.len > 0 ? (d - seg.s0) / seg.len : 0;
      out.x = seg.ax + seg.dx * k;
      out.z = seg.az + seg.dz * k;
      out.y = groundY(out.x, out.z);
      out.heading = Math.atan2(seg.dx, seg.dz);
      return out;
    },
  };
}

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smooth = (t) => {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
};
export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Small seeded random, so scenes look the same every visit.
export function seeded(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ---------------------------------------------------------------------------
// MiniBot poses (parts from MiniBot.jsx). Call resetBot first each frame,
// then layer a pose on top.
// ---------------------------------------------------------------------------

export function resetBot(p) {
  if (!p || !p.pose) return false;
  p.pose.position.set(0, 0, 0);
  p.pose.rotation.set(0, 0, 0);
  p.head.rotation.set(0, 0, 0);
  p.armL.rotation.set(0, 0, 0);
  p.armR.rotation.set(0, 0, 0);
  p.footL.position.set(-0.08, 0.06, 0);
  p.footR.position.set(0.08, 0.06, 0);
  return true;
}

// Walking: little bob, swinging feet and arms. w = walk phase (radians).
export function walkPose(p, w, arms = true) {
  p.pose.position.y = Math.abs(Math.sin(w)) * 0.05;
  p.pose.rotation.z = Math.sin(w) * 0.06;
  p.footL.position.z = Math.sin(w) * 0.09;
  p.footR.position.z = -Math.sin(w) * 0.09;
  if (arms) {
    p.armL.rotation.x = -Math.sin(w) * 0.45;
    p.armR.rotation.x = Math.sin(w) * 0.45;
  }
}

// Sitting on a stool or bench: the root sits at seatY - SIT_DROP * scale,
// feet dangle forward over the edge. swing (radians) kicks the feet.
export const SIT_DROP = 0.11; // body bottom above the root, in bot units
export function sitPose(p, swing = 0) {
  p.footL.position.set(-0.08, 0.06 + Math.max(0, Math.sin(swing)) * 0.03, 0.15 + Math.sin(swing) * 0.04);
  p.footR.position.set(0.08, 0.06 + Math.max(0, -Math.sin(swing)) * 0.03, 0.15 - Math.sin(swing) * 0.04);
}

// ---------------------------------------------------------------------------
// Canvas textures (signs, menu boards, floating glyphs)
// ---------------------------------------------------------------------------

const texCache = new Map();

// A glyph (♪, ♫, Z) drawn once to a small canvas; cached by char+color.
export function glyphTexture(char, color = '#ffffff', outline = 'rgba(30,30,50,0.55)') {
  const key = `g|${char}|${color}|${outline}`;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 50px "Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = outline;
  g.strokeText(char, 32, 35);
  g.fillStyle = color;
  g.fillText(char, 32, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

// A sign or menu board: draw(ctx, w, h) paints a canvas of w x h pixels.
// Cached by key, never disposed (shared, tiny).
export function canvasTexture(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

// A floating "Z" for sleepy bots.
export const ZZZ_MAT = new THREE.SpriteMaterial({ map: null, transparent: true, depthWrite: false, fog: false });
export function zzzMaterial() {
  if (!ZZZ_MAT.map && typeof document !== 'undefined') {
    ZZZ_MAT.map = glyphTexture('Z', '#ffffff', 'rgba(60,70,120,0.7)');
    ZZZ_MAT.needsUpdate = true;
  }
  return ZZZ_MAT;
}
