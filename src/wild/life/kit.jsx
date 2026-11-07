import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { groundY } from '../../utils/paths.js';

// Shared building bits for the island life scenes (tiki bar, food truck,
// hammock, volleyball, DJ booth, waiters). Same low-poly look as Island.jsx:
// flat-shaded standard materials, shared at module level.

export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

export const L = {
  wood: std('#a8774a'),
  darkWood: std('#7a5232'),
  plank: std('#c08a57'),
  thatch: std('#dcb468'),
  thatchDark: std('#b98a45'),
  bamboo: std('#d4b872'),
  bambooNode: std('#9c8240'),
  white: std('#fdf8ee'),
  black: std('#22252c'),
  dark: std('#3b3430'),
  metal: std('#c9d2da', { roughness: 0.35, metalness: 0.5 }),
  rope: std('#d9c79a'),
  wire: std('#2e2a26'),
  shell: std('#f6d47a'),
  lettuce: std('#62c246'),
  tomato: std('#e8483a'),
  sand: std('#f4dfb0'),
  courtLine: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }),
  shadow: new THREE.MeshBasicMaterial({ color: '#13261b', transparent: true, opacity: 0.22, depthWrite: false }),
};

export function Box({ p, s, m, r }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <boxGeometry args={s} />
    </mesh>
  );
}

export function Cyl({ p, rt = 0.06, rb, h, m, seg = 6, r }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <cylinderGeometry args={[rt, rb ?? rt, h, seg]} />
    </mesh>
  );
}

// Material that glows more as the night gets darker (night: 0..1).
export function useGlow(color, night, base = 0.15, boost = 1.5) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, flatShading: true }), [color, base]);
  useEffect(() => {
    mat.emissiveIntensity = base + night * boost;
  }, [mat, night, base, boost]);
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

// Bamboo pole with node rings.
export function BambooPost({ p, h, r = 0.07 }) {
  const nodes = Math.max(2, Math.round(h / 0.55));
  return (
    <group position={p}>
      <Cyl p={[0, h / 2, 0]} rt={r * 0.92} rb={r} h={h} m={L.bamboo} seg={7} />
      {Array.from({ length: nodes }, (_, i) => (
        <Cyl key={i} p={[0, ((i + 0.6) / (nodes + 0.2)) * h, 0]} rt={r * 1.12} h={0.04} m={L.bambooNode} seg={7} />
      ))}
    </group>
  );
}

// Festoon string lights along a sagging wire (local coordinates).
const BULB_COLORS = ['#ffd27a', '#ff8fb8', '#7fe3d8', '#ffb35c'];
const BULB_GEO = new THREE.IcosahedronGeometry(0.05, 0);
export function StringLights({ points, sag = 0.25, per = 6, night }) {
  const mats = [useGlow(BULB_COLORS[0], night, 0.25, 1.8), useGlow(BULB_COLORS[1], night, 0.25, 1.8), useGlow(BULB_COLORS[2], night, 0.25, 1.8), useGlow(BULB_COLORS[3], night, 0.25, 1.8)];
  const { bulbs, wire } = useMemo(() => {
    const out = [];
    const wirePts = [];
    for (let s = 0; s < points.length - 1; s++) {
      const a = new THREE.Vector3(...points[s]);
      const b = new THREE.Vector3(...points[s + 1]);
      const at = (t) => a.clone().lerp(b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0));
      for (let i = 0; i <= 10; i++) if (s === 0 || i > 0) wirePts.push(at(i / 10));
      for (let i = 1; i <= per; i++) out.push(at(i / (per + 1)).add(new THREE.Vector3(0, -0.05, 0)).toArray());
    }
    return { bulbs: out, wire: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wirePts), wirePts.length * 2, 0.01, 3, false) };
  }, [points, sag, per]);
  useEffect(() => () => wire.dispose(), [wire]);
  return (
    <group>
      <mesh geometry={wire} material={L.wire} />
      {bulbs.map((b, i) => (
        <mesh key={i} position={b} geometry={BULB_GEO} material={mats[i % 4]} />
      ))}
    </group>
  );
}

// A site's local frame: (lx, lz) in the site's rotated frame to world x/z,
// and the ground height there. rotY uses three.js' rotation.y convention.
export function frame(x, z, rotY) {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return {
    x,
    z,
    rotY,
    wx: (lx, lz) => x + lx * c + lz * s,
    wz: (lx, lz) => z - lx * s + lz * c,
    gy: (lx, lz) => groundY(x + lx * c + lz * s, z - lx * s + lz * c),
  };
}

export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Keep something held in a MiniBot hand level: undo the arm's rotation.
// Arms use the default 'XYZ' Euler order, so the inverse is 'ZYX' negated.
export function keepLevel(obj, arm) {
  if (!obj || !arm) return;
  obj.rotation.set(-arm.rotation.x, -arm.rotation.y, -arm.rotation.z, 'ZYX');
}

// Walking feet and a little bob on a MiniBot handle.
export function walkCycle(b, t, amount = 1) {
  const w = t * 9;
  b.pose.position.y = Math.abs(Math.sin(w)) * 0.05 * amount;
  b.pose.rotation.z = Math.sin(w) * 0.06 * amount;
  b.footL.position.z = Math.sin(w) * 0.09 * amount;
  b.footR.position.z = -Math.sin(w) * 0.09 * amount;
}

// Canvas texture drawn once (signs, menu boards).
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Taco and shave-ice cone props (origin at the bottom, sized for a hand).
const TACO_GEO = new THREE.CylinderGeometry(0.09, 0.09, 0.07, 10, 1, true, 0, Math.PI).rotateZ(-Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0.09, 0);
const LETTUCE_GEO = new THREE.BoxGeometry(0.15, 0.03, 0.05).translate(0, 0.085, 0);
const CONE_GEO = new THREE.ConeGeometry(0.05, 0.13, 8).rotateX(Math.PI).translate(0, 0.065, 0);
const ICE_GEO = new THREE.IcosahedronGeometry(0.065, 0).translate(0, 0.15, 0);
const ICE_MATS = [std('#ff5fa2', { roughness: 0.5 }), std('#5fd3ff', { roughness: 0.5 }), std('#ffe066', { roughness: 0.5 })];
export function Taco() {
  return (
    <group>
      <mesh geometry={TACO_GEO} material={L.shell} />
      <mesh geometry={LETTUCE_GEO} material={L.lettuce} />
    </group>
  );
}
export function ShaveIce({ flavor = 0 }) {
  return (
    <group>
      <mesh geometry={CONE_GEO} material={L.white} />
      <mesh geometry={ICE_GEO} material={ICE_MATS[flavor % 3]} />
    </group>
  );
}
