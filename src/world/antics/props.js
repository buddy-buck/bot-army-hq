import * as THREE from 'three';

// Little props for the antics, built once and shared: a phone for selfies,
// a fishing rod and bobber, a fish, a sand bucket and shovel, a barrel.

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.65, ...extra });

export const PROP_GEO = {
  // phone: screen faces -z (toward whoever holds it)
  phone: new THREE.BoxGeometry(0.1, 0.17, 0.018),
  phoneScreen: new THREE.PlaneGeometry(0.085, 0.145).rotateY(Math.PI).translate(0, 0, -0.01),
  flash: new THREE.IcosahedronGeometry(0.05, 0),
  lens: new THREE.CylinderGeometry(0.014, 0.014, 0.01, 6).rotateX(Math.PI / 2).translate(0.025, 0.055, 0.012),
  peace: new THREE.CapsuleGeometry(0.014, 0.06, 2, 4).translate(0, -0.06, 0),
  // fishing rod along +y from the grip
  rod: new THREE.CylinderGeometry(0.008, 0.016, 1.3, 4).translate(0, 0.65, 0),
  reel: new THREE.CylinderGeometry(0.03, 0.03, 0.03, 6).rotateZ(Math.PI / 2).translate(0, 0.16, 0.03),
  bobber: new THREE.IcosahedronGeometry(0.055, 0),
  bobberTop: new THREE.ConeGeometry(0.04, 0.05, 5).translate(0, 0.045, 0),
  // fish: nose along +z
  fishBody: new THREE.OctahedronGeometry(0.1, 0).scale(0.55, 0.8, 1.3),
  fishTail: new THREE.ConeGeometry(0.07, 0.1, 4).rotateX(-Math.PI / 2).scale(0.3, 1, 1).translate(0, 0, -0.16),
  // beach toys
  bucket: new THREE.CylinderGeometry(0.075, 0.06, 0.11, 8).translate(0, 0.055, 0),
  handle: new THREE.TorusGeometry(0.07, 0.007, 3, 10, Math.PI),
  shovelStick: new THREE.CylinderGeometry(0.01, 0.01, 0.26, 4).translate(0, -0.13, 0),
  shovelBlade: new THREE.ConeGeometry(0.045, 0.08, 4).rotateX(Math.PI).translate(0, -0.29, 0),
  // gym
  dumbbellBar: new THREE.CylinderGeometry(0.012, 0.012, 0.2, 4).rotateZ(Math.PI / 2),
  dumbbellEnd: new THREE.CylinderGeometry(0.04, 0.04, 0.05, 6).rotateZ(Math.PI / 2),
  bottle: new THREE.CylinderGeometry(0.03, 0.03, 0.13, 6).translate(0, 0.065, 0),
  bottleCap: new THREE.CylinderGeometry(0.018, 0.018, 0.025, 6).translate(0, 0.14, 0),
  // fishing lantern on a short post
  post: new THREE.CylinderGeometry(0.018, 0.018, 0.62, 4).translate(0, 0.31, 0),
  lantern: new THREE.IcosahedronGeometry(0.065, 0),
  glow: new THREE.SphereGeometry(0.2, 10, 8),
};

export const PROP_MAT = {
  phone: std('#2a2f3a', { roughness: 0.4 }),
  phoneCase: std('#ff6fae'),
  screen: new THREE.MeshBasicMaterial({ color: '#9fe3ff' }),
  lens: new THREE.MeshBasicMaterial({ color: '#111318' }),
  flash: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  rod: std('#5b3a1f'),
  reel: std('#c9ced8', { metalness: 0.4, roughness: 0.35 }),
  line: new THREE.LineBasicMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.75 }),
  bobberRed: std('#ff3b3b', { emissive: '#ff3b3b', emissiveIntensity: 0.25 }),
  bobberWhite: std('#ffffff'),
  fish: std('#ff9a3c', { emissive: '#ff7a1a', emissiveIntensity: 0.15 }),
  fishTail: std('#ffcf5a'),
  bucketBlue: std('#3fa0ff'),
  bucketRed: std('#ff5a5a'),
  handle: std('#f6f6f6'),
  shovel: std('#ffd23f'),
  stick: std('#8a5a32'),
  iron: std('#3b3f4a', { metalness: 0.3 }),
  bottle: std('#7fd8ff', { roughness: 0.25 }),
  cap: std('#ffffff'),
  post: std('#7a5232'),
  lantern: std('#ffd9a0', { emissive: '#ffb066', emissiveIntensity: 1.8 }),
  glow: new THREE.MeshBasicMaterial({ color: '#ffc58a', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }),
};

// Water height near the shore: the same gentle swell as the sea surface.
export function seaY(x, z, t) {
  return 0.07 * Math.sin(x * 0.35 + t * 0.8) + 0.05 * Math.cos(z * 0.42 + t * 0.63) + 0.03 * Math.sin((x + z) * 0.9 + t * 1.4);
}
