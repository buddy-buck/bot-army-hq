import * as THREE from 'three';

// Shared bits for the boats: a low-poly hull builder, the sea surface height
// (same formula as the wave shader in Water.jsx, so hulls ride the waves they
// sit on), a spray particle pool, and a stencil crate texture.

export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, ...extra });

// Sea surface height at (x, z). `t` is state.clock.elapsedTime (the water's uTime).
export const waveY = (x, z, t) => 0.07 * Math.sin(x * 0.35 + t * 0.8) + 0.05 * Math.cos(z * 0.42 + t * 0.63) + 0.03 * Math.sin((x + z) * 0.9 + t * 1.4);

// Pitch / roll / heave of a hull of length L and beam W heading `h` at (x, z).
// Writes into `out` ({ y, pitch, roll }) so nothing allocates per frame.
export function rideWaves(out, x, z, h, L, W, t) {
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const hl = L / 2;
  const hw = W / 2;
  const bow = waveY(x + fx * hl, z + fz * hl, t);
  const stern = waveY(x - fx * hl, z - fz * hl, t);
  // local +x in world is (cos h, -sin h)
  const stb = waveY(x + fz * hw, z - fx * hw, t);
  const port = waveY(x - fz * hw, z + fx * hw, t);
  out.y = (bow + stern + stb + port) / 4;
  out.pitch = -Math.atan2(bow - stern, L); // rotation.x: bow up is negative
  out.roll = Math.atan2(stb - port, W); // rotation.z: +x side up is positive
  return out;
}

// Low-poly hull from stations along z (bow is +z). Each station:
//   { z, w: half beam at the sheer, h: sheer height, d: keel depth below 0 }
// The section is sheer -> stripe line -> chine -> keel, mirrored. Faces above
// the stripe line get `top`, faces below get `bottom` (vertex colors, so one
// draw call). The deck is closed unless `deck: false` (open boats).
export function hullGeo(stations, { top = '#ffffff', bottom = '#19469d', stripe = 0.45, deck = true, deckColor = null } = {}) {
  const cTop = new THREE.Color(top);
  const cBot = new THREE.Color(bottom);
  const cDeck = new THREE.Color(deckColor || top);
  const pos = [];
  const col = [];
  const tri = (a, b, c, color) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) col.push(color.r, color.g, color.b);
  };
  const quad = (a, b, c, d, color) => {
    tri(a, b, c, color);
    tri(a, c, d, color);
  };
  const section = (s) => {
    const sy = s.h * stripe - s.d * (1 - stripe) * 0.4;
    return [
      [-s.w, s.h, s.z],
      [-s.w * 0.96, sy, s.z],
      [-s.w * 0.6, -s.d * 0.7, s.z],
      [0, -s.d, s.z],
      [s.w * 0.6, -s.d * 0.7, s.z],
      [s.w * 0.96, sy, s.z],
      [s.w, s.h, s.z],
    ];
  };
  const secs = stations.map(section);
  const bandColor = (j) => (j === 0 || j === 5 ? cTop : cBot);
  for (let i = 0; i < secs.length - 1; i++) {
    const A = secs[i];
    const B = secs[i + 1];
    for (let j = 0; j < 6; j++) quad(A[j], A[j + 1], B[j + 1], B[j], bandColor(j));
    if (deck) quad(A[6], A[0], B[0], B[6], cDeck);
  }
  // end caps (transom and stem)
  for (const k of [0, secs.length - 1]) {
    const S = secs[k];
    for (let j = 1; j < 6; j++) tri(S[0], S[j], S[j + 1], j === 1 || j === 5 ? cTop : cBot);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Hull material: vertex colors, both sides so open hulls show their insides.
export const hullMat = (extra = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, side: THREE.DoubleSide, ...extra });

// --- Spray --------------------------------------------------------------
// World-space droplets: a fixed pool of points, each with a velocity and a
// life. Round, fading, shrinking on the GPU. One draw call.
const SPRAY_VERT = /* glsl */ `
  attribute float aLife;
  uniform float uSize;
  uniform float uPx;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float l = clamp(aLife, 0.0, 1.0);
    vA = (1.0 - l) * (1.0 - l);
    gl_PointSize = l >= 1.0 ? 0.0 : uSize * (0.55 + l * 1.1) * uPx / max(0.5, -mv.z);
  }
`;
const SPRAY_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    gl_FragColor = vec4(uColor, vA * uOpacity * (1.0 - d * 2.6));
  }
`;

export class Spray {
  constructor(count, { size = 0.16, color = '#ffffff', opacity = 0.85, gravity = 9.8 } = {}) {
    this.count = count;
    this.gravity = gravity;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count).fill(1);
    this.span = new Float32Array(count).fill(1);
    this.next = 0;
    this.live = 0;
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.lifeAttr = new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aLife', this.lifeAttr);
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      vertexShader: SPRAY_VERT,
      fragmentShader: SPRAY_FRAG,
      uniforms: { uSize: { value: size }, uPx: { value: 400 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }
  emit(x, y, z, vx, vy, vz, span) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    const k = i * 3;
    this.pos[k] = x;
    this.pos[k + 1] = y;
    this.pos[k + 2] = z;
    this.vel[k] = vx;
    this.vel[k + 1] = vy;
    this.vel[k + 2] = vz;
    this.life[i] = 0;
    this.span[i] = span;
  }
  // camera: for the pixel scale of a world-sized droplet
  update(dt, camera, heightPx) {
    const fov = camera.fov ?? 40;
    this.material.uniforms.uPx.value = heightPx / (2 * Math.tan((fov * Math.PI) / 360));
    let live = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] >= 1) continue;
      const k = i * 3;
      this.vel[k + 1] -= this.gravity * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.life[i] = Math.min(1, this.life[i] + dt / this.span[i]);
      if (this.pos[k + 1] < -0.15) this.life[i] = 1; // back in the sea
      live++;
    }
    this.live = live;
    this.posAttr.needsUpdate = true;
    this.lifeAttr.needsUpdate = true;
  }
  clear() {
    this.life.fill(1);
    this.lifeAttr.needsUpdate = true;
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// --- Crate stencils -----------------------------------------------------
const texCache = new Map();
export function crateTexture(lines) {
  const key = lines.join('|');
  if (texCache.has(key)) return texCache.get(key);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b98149';
  ctx.fillRect(0, 0, 128, 128);
  // planks
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? '#c48c52' : '#ad7641';
    ctx.fillRect(0, i * 32 + 2, 128, 28);
  }
  ctx.strokeStyle = '#6e4521';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 118, 118);
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(8, 8);
  ctx.lineTo(120, 120);
  ctx.globalAlpha = 0.35;
  ctx.stroke();
  ctx.globalAlpha = 1;
  // stencil text
  ctx.fillStyle = '#2b1a0c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const big = lines.length === 1;
  ctx.font = `900 ${big ? 26 : 21}px Impact, "Arial Black", sans-serif`;
  lines.forEach((ln, i) => {
    const y = big ? 64 : 64 + (i - (lines.length - 1) / 2) * 26;
    ctx.fillText(ln, 64, y, 108);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  texCache.set(key, tex);
  return tex;
}

// A little light: a bulb plus an additive halo, both shared materials whose
// brightness is flipped on at night by setRunningLights.
export function runningLightMats(color) {
  return {
    bulb: new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, flatShading: true }),
    halo: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, visible: false }),
  };
}
export function setRunningLights(mats, on) {
  mats.bulb.emissiveIntensity = on ? 2.2 : 0.15;
  mats.halo.visible = on;
}

export const LIGHT_GEO = new THREE.IcosahedronGeometry(0.06, 0);
export const HALO_GEO = new THREE.SphereGeometry(0.22, 8, 6);
