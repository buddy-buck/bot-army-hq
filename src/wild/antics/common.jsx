import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { labelState } from '../../components/labels.js';

// Shared bits for the bot antics.

export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, ...extra });

export const AMAT = {
  wood: std('#9a6b43'),
  woodDark: std('#6e4a2c'),
  sand: std('#ecd29a', { roughness: 1 }),
  sandDark: std('#d9b878', { roughness: 1 }),
  red: std('#e2543e'),
  blue: std('#2e86de'),
  yellow: std('#ffd23f'),
  white: std('#ffffff'),
  dark: std('#2b2a33'),
  steel: std('#9aa3ad', { metalness: 0.3, roughness: 0.4 }),
  gold: std('#ffd75a', { emissive: '#ffb800', emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.35 }),
  flash: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
};

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
// 0 -> 1 over [a, b]
export const ramp = (t, a, b) => clamp01((t - a) / (b - a));

export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// MiniBot arm helpers. Hanging arm math (Euler XYZ): rotation.x = -PI/2 points
// the arm straight forward, about -2.6 points it up and a little forward.
// For armR a negative rotation.z brings the hand toward the middle; armL the
// opposite (rest: armL z = -0.12, armR z = +0.12). side: +1 armR, -1 armL.
export function raiseArm(arm, k, side = 1, inward = 0.3) {
  // k 0..1: hanging -> up for a high five
  arm.rotation.set(-2.6 * k, 0, side * (0.12 - (0.12 + inward) * k));
}

// A walking step: swing arms, bob, shuffle feet. w = phase.
export function walkPose(b, w, amp = 1) {
  b.pose.position.y = Math.abs(Math.sin(w)) * 0.05 * amp;
  b.pose.rotation.z = Math.sin(w) * 0.07 * amp;
  b.footL.position.z = Math.sin(w) * 0.09 * amp;
  b.footR.position.z = -Math.sin(w) * 0.09 * amp;
  b.armL.rotation.x = -Math.sin(w) * 0.5 * amp;
  b.armR.rotation.x = Math.sin(w) * 0.5 * amp;
}

// A small speech bubble over an antic. The antic's own useFrame drives it
// with showBubble(); it hides when zoomed far out (it would just be clutter).
export function Bubble({ position, bubbleRef, className = '' }) {
  return (
    <Html position={position} center zIndexRange={[7, 0]} pointerEvents="none">
      <div ref={bubbleRef} className={`antics-bubble ${className}`} aria-hidden="true" style={{ display: 'none' }} />
    </Html>
  );
}

export function showBubble(el, on, text) {
  if (!el) return;
  const show = on && labelState.tier !== 'far' ? '' : 'none';
  if (el.style.display !== show) el.style.display = show;
  if (on && text !== undefined && el.textContent !== text) el.textContent = text;
}

// Point a MiniBot arm (shoulder s, in the bot's root frame) at target t
// (also in the bot's root frame), allowing for the pose leaning forward by
// `lean` around x. side: +1 for armR, -1 for armL (only used for the shoulder).
export function aimArm(arm, sx, sy, sz, tx, ty, tz, lean = 0) {
  let dx = tx - sx;
  let dy = ty - sy;
  let dz = tz - sz;
  const L = Math.hypot(dx, dy, dz) || 1;
  dx /= L;
  dy /= L;
  dz /= L;
  const theta = Math.asin(Math.max(-1, Math.min(1, dx)));
  const big = Math.atan2(-dz, -dy);
  arm.rotation.set(big - lean, 0, theta);
}
