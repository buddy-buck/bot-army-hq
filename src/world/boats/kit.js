import * as THREE from 'three';
import { world } from '../state.js';

// Shared bits for everything that floats: the wave height (same formula as
// the water's vertex shader), riding the swell, a low-poly hull builder,
// a spray/smoke particle pool, traffic rules and canvas text textures.

export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, ...extra });

// Matches waveY() in Water.jsx (uTime = clock.elapsedTime).
export const waveY = (x, z, t) => 0.07 * Math.sin(x * 0.35 + t * 0.8) + 0.05 * Math.cos(z * 0.42 + t * 0.63) + 0.03 * Math.sin((x + z) * 0.9 + t * 1.4);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (k) => k * k * (3 - 2 * k);
// Shortest signed difference between two angles.
export const angDiff = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

// Sit a boat on the swell: height from the average of bow, stern and both
// sides; pitch and roll from the slopes between them. `k` exaggerates the
// motion a little for charm. Euler order YXZ: yaw first, then pitch/roll.
export function ridePose(obj, x, z, heading, t, len, wid, k = 1.6, lift = 0) {
  const sh = Math.sin(heading);
  const ch = Math.cos(heading);
  const hl = len * 0.5;
  const hw = wid * 0.5;
  const yb = waveY(x + sh * hl, z + ch * hl, t);
  const ys = waveY(x - sh * hl, z - ch * hl, t);
  const yl = waveY(x + ch * hw, z - sh * hw, t);
  const yr = waveY(x - ch * hw, z + sh * hw, t);
  obj.position.set(x, (yb + ys + yl + yr) * 0.25 + lift, z);
  obj.rotation.set(-Math.atan2(yb - ys, len) * k, heading, Math.atan2(yl - yr, wid) * k, 'YXZ');
}

// A low-poly hull, nose along +z, deck at y = 0, keel at y = -depth.
// bow: how far back the pointed bow starts (0 = blunt, 1 = all point).
export function hullGeometry(len, beam, depth, { bow = 0.35, stern = 0.85, taper = 0.55, sheer = 0.12 } = {}) {
  const L = len / 2;
  const b = beam / 2;
  const s = new THREE.Shape();
  const pts = [
    [-b * stern, -L],
    [-b, -L * 0.2],
    [-b * 0.97, L * (1 - bow * 1.4)],
    [-b * (0.55 - bow * 0.25), L * (1 - bow * 0.45)],
    [0, L],
    [b * (0.55 - bow * 0.25), L * (1 - bow * 0.45)],
    [b * 0.97, L * (1 - bow * 1.4)],
    [b, -L * 0.2],
    [b * stern, -L],
  ];
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, steps: 1 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const zz = p.getZ(i);
    if (zz > depth * 0.5) {
      // keel: narrower and a touch shorter
      p.setX(i, x * taper);
      p.setY(i, y * 0.9 - L * 0.04);
    } else if (y > 0) {
      // sheer: the bow rises a little
      p.setZ(i, zz - sheer * (y / L) ** 2);
    }
  }
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

// --- Spray, splash, smoke and steam ---------------------------------------------
// A pool of little low-poly puffs in world space. emit() a puff, update() each
// frame. Mount `spray.mesh` at the scene root (not inside a moving boat).
const PUFF_GEO = [new THREE.IcosahedronGeometry(1, 0), new THREE.IcosahedronGeometry(1, 1)];
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

export class Spray {
  constructor(max, { gravity = 9, drag = 1.4, grow = 0, floor = -0.05, round = false, color = '#ffffff', emissive = '#bfe9ff', emissiveIntensity = 0.25, opacity = 0.92 } = {}) {
    this.max = max;
    this.g = gravity;
    this.drag = drag;
    this.grow = grow;
    this.floor = floor;
    this.mat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive, emissiveIntensity, flatShading: true, roughness: 0.5, transparent: true, opacity, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(PUFF_GEO[round ? 1 : 0], this.mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = 3;
    this.a = {
      px: new Float32Array(max), py: new Float32Array(max), pz: new Float32Array(max),
      vx: new Float32Array(max), vy: new Float32Array(max), vz: new Float32Array(max),
      age: new Float32Array(max), life: new Float32Array(max), size: new Float32Array(max), rot: new Float32Array(max),
    };
    _c.set(color);
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, HIDE);
      this.mesh.setColorAt(i, _c);
      this.a.life[i] = 0;
    }
    this.base = new THREE.Color(color);
    this.next = 0;
    this.live = 0;
  }

  emit(x, y, z, vx, vy, vz, life, size, color = null) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const a = this.a;
    if (a.life[i] <= 0) this.live++;
    a.px[i] = x; a.py[i] = y; a.pz[i] = z;
    a.vx[i] = vx; a.vy[i] = vy; a.vz[i] = vz;
    a.age[i] = 0; a.life[i] = life; a.size[i] = size;
    a.rot[i] = Math.random() * 6.28;
    this.mesh.setColorAt(i, color ? _c.set(color) : this.base);
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    if (this.live <= 0) return;
    const a = this.a;
    const damp = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.max; i++) {
      if (a.life[i] <= 0) continue;
      a.age[i] += dt;
      if (a.age[i] >= a.life[i] || (a.py[i] < this.floor && a.vy[i] < 0)) {
        a.life[i] = 0;
        this.live--;
        this.mesh.setMatrixAt(i, HIDE);
        continue;
      }
      a.vy[i] -= this.g * dt;
      a.vx[i] *= damp;
      a.vz[i] *= damp;
      if (this.g < 0) a.vy[i] *= damp;
      a.px[i] += a.vx[i] * dt;
      a.py[i] += a.vy[i] * dt;
      a.pz[i] += a.vz[i] * dt;
      const k = a.age[i] / a.life[i];
      const s = a.size[i] * (0.45 + 0.55 * Math.min(1, k * 6)) * (1 + this.grow * k) * (1 - k * k);
      _e.set(a.rot[i], a.rot[i] * 1.3, 0);
      _q.setFromEuler(_e);
      _m.compose(_p.set(a.px[i], a.py[i], a.pz[i]), _q, _s.set(s, s, s));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.dispose();
    this.mat.dispose();
  }
}

// Bow splash and prop wash for a boat moving at `speed` along `heading`.
// `rate` is a 0..1 chance per frame scaled by speed, so slow boats just fizz.
export function wakeSpray(spray, x, z, heading, speed, len, wid, t, { bow = 1, wash = 1 } = {}) {
  if (speed < 0.05) return;
  const sh = Math.sin(heading);
  const ch = Math.cos(heading);
  const hl = len * 0.5;
  const sp = Math.min(1, speed / 3);
  // bow splash: a curl of droplets off each side of the nose
  if (Math.random() < 0.55 * sp * bow) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const bx = x + sh * hl * 0.85 + ch * side * wid * 0.3;
    const bz = z + ch * hl * 0.85 - sh * side * wid * 0.3;
    const out = 0.6 + speed * 0.3;
    spray.emit(bx, waveY(bx, bz, t) + 0.05, bz, ch * side * out + sh * speed * 0.3, 0.9 + Math.random() * 0.8 * sp, -sh * side * out + ch * speed * 0.3, 0.55, 0.06 + 0.05 * sp * len * 0.25);
  }
  // prop wash: white churn just behind the stern
  if (Math.random() < 0.6 * sp * wash) {
    const r = (Math.random() - 0.5) * wid * 0.6;
    const sx = x - sh * hl + ch * r;
    const sz = z - ch * hl - sh * r;
    spray.emit(sx, waveY(sx, sz, t) + 0.02, sz, -sh * speed * 0.35, 0.4 + Math.random() * 0.5, -ch * speed * 0.35, 0.7, 0.07 + 0.04 * len * 0.2);
  }
}

// --- Traffic ------------------------------------------------------------------------
// Every moving boat registers in world.boats. `prio` decides who gives way:
// the tug (3) > the tour boat (2) > sailboats (1); the jet ski picks clear water.
export function registerBoat(id, x, z, heading, speed, size, prio = 1) {
  let e = world.boats.get(id);
  if (!e) {
    e = { x, z, heading, speed, size, prio };
    world.boats.set(id, e);
  }
  e.x = x;
  e.z = z;
  e.heading = heading;
  e.speed = speed;
  e.size = size;
  e.prio = prio;
}

// 0..1: how much to slow for a boat we must give way to, in the lane ahead.
export function giveWay(id, x, z, heading, prio, look = 9, half = 2) {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  let k = 1;
  world.boats.forEach((b, oid) => {
    if (oid === id) return;
    const op = b.prio ?? 1;
    if (op < prio || (op === prio && oid > id)) return;
    const size = b.size || 2;
    const dx = b.x - x;
    const dz = b.z - z;
    const ahead = dx * fx + dz * fz;
    if (ahead <= 0 || ahead > look + size * 0.5) return;
    if (Math.abs(dx * fz - dz * fx) > half + size * 0.45) return;
    k = Math.min(k, clamp((ahead - size * 0.5 - 1.5) / (look * 0.6), 0, 1));
  });
  return k;
}

// Distance to the nearest other (slow) boat from a point.
export function nearestBoat(id, x, z, maxSpeed = 4) {
  let best = Infinity;
  world.boats.forEach((b, oid) => {
    if (oid === id || b.speed > maxSpeed) return;
    const d = Math.hypot(b.x - x, b.z - z) - (b.size || 2) * 0.5;
    if (d < best) best = d;
  });
  return best;
}

// --- Canvas textures -----------------------------------------------------------------
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A wooden crate side stenciled PROMPTS.
let crateTex = null;
export function crateTexture() {
  if (crateTex) return crateTex;
  crateTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#c99a5e';
    g.fillRect(0, 0, w, h);
    // planks
    const shades = ['#c99a5e', '#bf8f53', '#d1a467', '#c49558'];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = shades[i];
      g.fillRect(0, i * 64, w, 64);
      g.fillStyle = 'rgba(80,45,20,0.45)';
      g.fillRect(0, i * 64, w, 3);
    }
    // frame and a cross brace
    g.strokeStyle = '#8a5a2e';
    g.lineWidth = 20;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#6b4322';
    for (const [x, y] of [[22, 22], [w - 22, 22], [22, h - 22], [w - 22, h - 22]]) {
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
    }
    // stencil
    g.fillStyle = '#2d1c0e';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 50px "Arial Black", Impact, system-ui, sans-serif';
    g.fillText('PROMPTS', w / 2, h / 2 + 4, w - 52);
    g.font = '700 20px system-ui, sans-serif';
    g.fillText('{  FRESH  }', w / 2, h / 2 - 46);
    g.fillText('▲ THIS SIDE UP', w / 2, h / 2 + 52);
    // stencil bridges: thin gaps through the big letters
    g.fillStyle = '#c99a5e';
    g.fillRect(36, h / 2 + 2, w - 72, 3);
  });
  return crateTex;
}

// A simple sign: text on a colored board.
export function signTexture(text, { w = 512, h = 96, bg = '#fdf8ee', fg = '#19469D', font = '900 56px system-ui, sans-serif' } = {}) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = font;
    g.fillText(text, w / 2, h / 2 + 3, w - 24);
  });
}

// --- Running lights ---------------------------------------------------------------------
// Little emissive dots: red to port (+x), green to starboard (-x), white
// masthead and stern. Shared by every boat; brightness set from the night.
export const LIGHT_GEO = new THREE.SphereGeometry(0.06, 6, 4);
export const LIGHTS = {
  red: new THREE.MeshStandardMaterial({ color: '#ff3b3b', emissive: '#ff2a2a', emissiveIntensity: 0.4, flatShading: true }),
  green: new THREE.MeshStandardMaterial({ color: '#3bff7a', emissive: '#22ff66', emissiveIntensity: 0.4, flatShading: true }),
  white: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6d8', emissiveIntensity: 0.4, flatShading: true }),
};
let lightNight = -1;
export function setNightLights(night) {
  if (Math.abs(night - lightNight) < 0.01) return;
  lightNight = night;
  const k = 0.25 + night * 2.6;
  LIGHTS.red.emissiveIntensity = k;
  LIGHTS.green.emissiveIntensity = k;
  LIGHTS.white.emissiveIntensity = k;
}
