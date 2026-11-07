import * as THREE from 'three';

// Shared bits for the sky show (SkyShow.jsx and the files in this folder).

// The island's framing keeps the camera fairly low and tight, so most of the
// sky sits above the view. Sky sights that should be seen are placed low and
// on the far side of the island from the camera when they start.
// Horizontal direction from the camera toward the island (unit, xz).
export function farSide(camera, out = { x: 0, z: -1 }) {
  const x = -camera.position.x;
  const z = -camera.position.z;
  const l = Math.hypot(x, z) || 1;
  out.x = x / l;
  out.z = z / l;
  return out;
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
export const rand = (a, b) => a + Math.random() * (b - a);

// How dark it is, 0 (day) .. 1 (night), and whether it counts as night for
// night-only sights.
export const isDark = (sky) => sky.stars > 0.6;
export const isDaylight = (sky) => sky.phase !== 'night' && sky.stars < 0.35;

// Bot face logo: the round bot head (white face, two dark eyes, antenna with
// a colored bulb) on a transparent square. Cached per bulb color.
const logoCache = new Map();
export function botLogoTexture(bulb = '#2E86DE', ring = '#19469D') {
  const key = `${bulb}|${ring}`;
  let t = logoCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 256);
  // antenna
  x.strokeStyle = '#4a4f5c';
  x.lineWidth = 9;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(128, 78);
  x.lineTo(128, 38);
  x.stroke();
  x.fillStyle = bulb;
  x.beginPath();
  x.arc(128, 30, 18, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.55)';
  x.beginPath();
  x.arc(122, 24, 6, 0, Math.PI * 2);
  x.fill();
  // face with a ring in the balloon color
  x.fillStyle = ring;
  x.beginPath();
  x.arc(128, 156, 94, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#fff8ec';
  x.beginPath();
  x.arc(128, 156, 82, 0, Math.PI * 2);
  x.fill();
  // eyes
  x.fillStyle = '#1d2230';
  for (const ex of [96, 160]) {
    x.beginPath();
    x.ellipse(ex, 146, 13, 17, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = '#ffffff';
  for (const ex of [91, 155]) {
    x.beginPath();
    x.arc(ex, 140, 4.5, 0, Math.PI * 2);
    x.fill();
  }
  // smile
  x.strokeStyle = '#1d2230';
  x.lineWidth = 7;
  x.beginPath();
  x.arc(128, 172, 30, 0.2 * Math.PI, 0.8 * Math.PI);
  x.stroke();
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  logoCache.set(key, t);
  return t;
}

// Soft round dot for additive sprites.
let dotTex = null;
export function softDotTexture() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}
