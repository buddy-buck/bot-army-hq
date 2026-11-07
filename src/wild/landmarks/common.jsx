import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

// Shared bits for the landmarks: materials, primitive helpers, tap handling
// and small canvas textures. Everything here is module-level and shared.

export const std = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.8,
    ...extra,
  });

export const LM = {
  wood: std('#a8774a'),
  darkWood: std('#7a5232'),
  plank: std('#c08a57'),
  white: std('#fdf8ee'),
  red: std('#d8352e'),
  stone: std('#9aa3a8'),
  stoneDark: std('#7d868c'),
  rock: std('#8a8f8c'),
  rockDark: std('#6f7472'),
  dark: std('#3b3430'),
  iron: std('#2e2a26', { roughness: 0.5 }),
  asphalt: std('#3d3f44', { roughness: 0.95 }),
  concrete: std('#b9b6ad', { roughness: 0.95 }),
  blue: std('#19469D'),
  yellow: std('#FFDE69'),
  teal: std('#2ec4c8'),
  tealRoof: std('#21a6aa', { side: THREE.DoubleSide }),
  coral: std('#ff7a59'),
  cream: std('#f6efe0'),
  orange: std('#F09024'),
  glass: std('#bfe8ff', { transparent: true, opacity: 0.5, roughness: 0.15 }),
  hit: new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }),
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

// A beam between two points (legs, ladder rails, braces).
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
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} material={m}>
      <cylinderGeometry args={[r, r, len, seg]} />
    </mesh>
  );
}

// Pointer cursor on hover, the same as the Easter eggs.
export const pointer = {
  onPointerOver: (e) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
  },
  onPointerOut: () => {
    document.body.style.cursor = '';
  },
};

// A tap that isn't the end of a drag.
export const tap = (fn) => (e) => {
  if (e.delta > 8) return;
  e.stopPropagation();
  fn();
};

// Glow material whose brightness follows the night (0..1).
export function useGlow(color, night, base = 0.1, boost = 1.3) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: base,
        flatShading: true,
      }),
    [color, base]
  );
  useEffect(() => {
    mat.emissiveIntensity = base + night * boost;
  }, [mat, night, base, boost]);
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

// Canvas texture drawn by `draw(ctx, w, h)`. Disposed on unmount.
export function makeCanvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// A flat sign: background, optional border, centered bold text.
export function signTexture({ text, w = 512, h = 128, bg = '#19469D', fg = '#FFDE69', border = null, font = 900, size = 0.62 }) {
  return makeCanvasTexture(w, h, (x) => {
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    if (border) {
      x.strokeStyle = border;
      x.lineWidth = Math.round(h * 0.07);
      x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, w - x.lineWidth, h - x.lineWidth);
    }
    x.fillStyle = fg;
    let px = Math.round(h * size);
    x.font = `${font} ${px}px "Arial Black", Arial, sans-serif`;
    while (x.measureText(text).width > w * 0.9 && px > 10) {
      px -= 2;
      x.font = `${font} ${px}px "Arial Black", Arial, sans-serif`;
    }
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, w / 2, h / 2 + px * 0.04);
  });
}

// Material for a sign texture that stays readable at night.
export function useSignMaterial(makeTex, night, base = 0.35, boost = 0.45) {
  const mat = useMemo(() => {
    const map = makeTex();
    return new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: '#ffffff',
      emissiveIntensity: base,
      roughness: 0.7,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    mat.emissiveIntensity = base + night * boost;
  }, [mat, night, base, boost]);
  useEffect(() => () => (mat.map.dispose(), mat.dispose()), [mat]);
  return mat;
}

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInQuad = (t) => t * t;
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
