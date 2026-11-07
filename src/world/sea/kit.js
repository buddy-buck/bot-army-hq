// Small shared pieces for the sea creatures.
import * as THREE from 'three';
import { ISLAND, islandWobble } from '../../utils/paths.js';

export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, ...extra });

export const rnd = (a, b) => a + Math.random() * (b - a);

export function buildGeo(verts, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const BODY_GEO = new THREE.IcosahedronGeometry(1, 1);
export const LOW_GEO = new THREE.IcosahedronGeometry(1, 0);
export const CONE4 = new THREE.ConeGeometry(1, 1, 4);
// Flat triangle in the xy plane, both sides: (0,0) (-1,0) (-0.5,1).
export const TRI_GEO = buildGeo([0, 0, 0, -1, 0, 0, -0.5, 1, 0], [0, 1, 2, 0, 2, 1]);

// A point on the sea at a given islandE() ring and angle around the island.
export function lanePoint(theta, e, out) {
  const dx = ISLAND.rx * Math.cos(theta);
  const dz = ISLAND.rz * Math.sin(theta);
  const s = Math.sqrt(e) * islandWobble(dx, dz);
  out.x = dx * s;
  out.z = dz * s;
  return out;
}

// Smallest signed difference between two angles.
export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Where a world point lands on screen (-1..1 both ways when in view).
const ndcV = new THREE.Vector3();
export function toScreen(camera, x, y, z) {
  return ndcV.set(x, y, z).project(camera);
}
export function onScreen(camera, x, y, z, mx = 0.8, my = 0.8) {
  const v = toScreen(camera, x, y, z);
  return v.z < 1 && Math.abs(v.x) < mx && Math.abs(v.y) < my;
}
