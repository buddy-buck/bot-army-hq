import * as THREE from 'three';

// Arm helpers shared by the team bots (Bot.jsx) and the crew (MiniBot).
//
// An arm is a shoulder group holding the arm mesh (hanging down along -y) and
// a hand group at its tip. aimArm points the arm at a spot in the shoulder's
// parent space (the bot's pose) and stretches it a touch if the spot is a
// little out of reach, so hands can meet for a high-five or grab a rod.

export const ARM_LEN = 0.31;
const DOWN = new THREE.Vector3(0, -1, 0);
const dir = new THREE.Vector3();
const tmp = new THREE.Vector3();

export function aimArm(arm, mesh, hand, tx, ty, tz, maxLen = 0.46) {
  dir.set(tx - arm.position.x, ty - arm.position.y, tz - arm.position.z);
  let len = dir.length();
  if (len < 1e-4) {
    dir.set(0, -1, 0);
    len = ARM_LEN;
  } else dir.multiplyScalar(1 / len);
  len = Math.min(maxLen, Math.max(0.2, len));
  arm.quaternion.setFromUnitVectors(DOWN, dir);
  mesh.scale.y = len / ARM_LEN;
  hand.position.y = -len;
}

// MiniBot parts: aim armL / armR at a spot in pose space.
export function aimCrew(parts, side, x, y, z, maxLen) {
  const arm = side === 'L' ? parts.armL : parts.armR;
  const hand = side === 'L' ? parts.handL : parts.handR;
  if (!arm || !hand) return;
  aimArm(arm, arm.children[0], hand, x, y, z, maxLen);
}

// Same, but the target is a world point (hands meeting across a barrel).
export function reachWorld(parts, side, wx, wy, wz, maxLen) {
  const pose = parts.pose;
  if (!pose) return;
  pose.updateWorldMatrix(true, false);
  tmp.set(wx, wy, wz);
  pose.worldToLocal(tmp);
  aimCrew(parts, side, tmp.x, tmp.y, tmp.z, maxLen);
}

// Arms hanging at rest (pose space).
export function restArms(parts, swing = 0) {
  aimCrew(parts, 'L', -0.23, 0.2, 0.02 + swing);
  aimCrew(parts, 'R', 0.23, 0.2, 0.02 - swing);
}

// Pose tipped forward by `tilt` around the feet and raised by `py`: turn a
// spot in the bot's own (unrotated) frame into pose space. Handy for hands
// on the ground during push-ups or a faceplant.
export function toPose(out, x, Y, Z, tilt, py) {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const y = Y - py;
  out.x = x;
  out.y = y * c + Z * s;
  out.z = -y * s + Z * c;
  return out;
}

// Reset a MiniBot to standing (its pose group and head).
export function standCrew(parts) {
  if (!parts.pose) return;
  parts.pose.position.set(0, 0, 0);
  parts.pose.rotation.set(0, 0, 0);
  parts.head.rotation.set(0, 0, 0);
  parts.footL.position.set(-0.08, 0.06, 0);
  parts.footR.position.set(0.08, 0.06, 0);
}

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const ease = (t) => {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
};
export const lerp = (a, b, t) => a + (b - a) * t;
// 0 -> 1 -> 0 bump over [a, b]
export const bump = (k, a, b) => (k <= a || k >= b ? 0 : Math.sin(((k - a) / (b - a)) * Math.PI));
