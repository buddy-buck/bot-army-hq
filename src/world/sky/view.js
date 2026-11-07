import * as THREE from 'three';

// The island's camera looks down at about 30 degrees, so the open sky is
// usually out of frame. Sky things that should be seen place themselves with
// these helpers: on the far side of the island from the viewer, and at a
// height that lands at a chosen spot on screen.

const _v = new THREE.Vector3();

// Yaw of the camera around the island (atan2(x, z) of its position).
export const cameraYaw = (camera) => Math.atan2(camera.position.x, camera.position.z);

// World height at horizontal spot (x, z) that shows at screen height ndcY
// (-1 bottom .. 1 top) in the middle column. Returns `fallback` when the spot
// is behind the camera or the view looks up past it.
export function heightAtNdc(camera, x, z, ndcY, fallback = 12) {
  _v.set(0, ndcY, 0.5).unproject(camera).sub(camera.position);
  const flat = Math.hypot(_v.x, _v.z);
  if (flat < 1e-4) return fallback;
  const fx = _v.x / flat;
  const fz = _v.z / flat;
  const hd = (x - camera.position.x) * fx + (z - camera.position.z) * fz;
  if (hd < 2) return fallback;
  return camera.position.y + (_v.y / flat) * hd;
}

// The world point at height y that shows at screen spot (ndcX, ndcY). If the
// ray through that spot never comes down to y (the camera looks level or
// up), the point is placed `maxDist` along the ray instead.
export function pointAtNdc(camera, ndcX, ndcY, y, out, maxDist = 90) {
  _v.set(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
  const dy = y - camera.position.y;
  let d = maxDist;
  if (Math.abs(_v.y) > 1e-4 && dy / _v.y > 0) d = Math.min(maxDist, dy / _v.y);
  return out.copy(camera.position).addScaledVector(_v, d);
}
