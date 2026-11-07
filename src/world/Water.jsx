import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ISLAND, islandE, islandWobble, terrainY } from '../utils/paths.js';
import { world } from './state.js';
import { FX, FX_MAX, emitFx, fx, ripple } from './sea/fx.js';
import { NOISE_FN, WAVE_FN } from './sea/glsl.js';
import { COLLARS } from './sea/spots.js';

// The sea around the island: the wave surface, the far ocean, the lagoon
// floor, surf rolling up the beach, foam around stilts, rocks and moored
// boats, boat wakes, ripples, and bioluminescence at night.
//
// Everything on the water rides the same GPU waves (sea/glsl.js) and shares
// one set of uniforms, ticked by a single useFrame here. With animate off
// (reduced motion) it all stays still and the particle system isn't drawn.

const GLOW_PTS = 8; // boats and world.glow spots that light the night water

// Shared uniforms: one object, handed to every material below.
function makeShared() {
  return {
    uTime: { value: 0 },
    uGlow: { value: 0 }, // 0..1 bioluminescence (night)
    uFoam: { value: new THREE.Color('#ffffff') },
    uBio: { value: new THREE.Color('#3fe6ff') },
    uGlowPts: { value: Array.from({ length: GLOW_PTS }, () => new THREE.Vector4()) },
  };
}

// Unlit foam materials still sit in the fog like everything else.
const FOG_VERT = { pars: '#include <fog_pars_vertex>', main: '#include <fog_vertex>' };
const FOG_FRAG = { pars: '#include <fog_pars_fragment>', main: '#include <colorspace_fragment>\n#include <fog_fragment>' };

function foamMaterial(shared, vertexShader, fragmentShader) {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...shared },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
}

// --- Wave surface ---------------------------------------------------------------

// Waves run on the GPU: the vertex shader lifts each vertex, and flat
// shading picks up the new slopes for free. At night the water lights up:
// sparkling shallows, a soft glow near the beach, and light around every
// moving boat and glow spot (uGlowPts). Skipped on low-power devices.
function WaterSurface({ shared, tint, onTap }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(170, 170, 84, 84);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 4);
    const es = new Float32Array(pos.count);
    const shallow = new THREE.Color('#72e6da');
    const mid = new THREE.Color('#2bb9cb');
    const deep = new THREE.Color('#1784b3');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const e = islandE(pos.getX(i), pos.getZ(i));
      es[i] = Math.min(e, 9);
      if (e < 2.0) c.copy(shallow).lerp(mid, Math.max(0, (e - 1.1) / 0.9));
      else c.copy(mid).lerp(deep, Math.min(1, (e - 2.0) / 4));
      c.toArray(colors, i * 4);
      // clear shallows (fish and turtles show through), deeper water more opaque
      colors[i * 4 + 3] = 0.62 + 0.24 * Math.min(1, Math.max(0, (e - 1.3) / 1.2));
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    g.setAttribute('aE', new THREE.BufferAttribute(es, 1));
    return g;
  }, []);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, roughness: 0.3, metalness: 0.05 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shared.uTime;
      shader.uniforms.uGlow = shared.uGlow;
      shader.uniforms.uBio = shared.uBio;
      shader.uniforms.uGlowPts = shared.uGlowPts;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;\nattribute float aE;\nvarying vec2 vXZ;\nvarying float vE;\n${WAVE_FN}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n  vXZ = position.xz;\n  vE = aE;\n  transformed.y += waveY(position.xz, uTime);`);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nuniform float uTime;\nuniform float uGlow;\nuniform vec3 uBio;\nuniform vec4 uGlowPts[${GLOW_PTS}];\nvarying vec2 vXZ;\nvarying float vE;\n${NOISE_FN}`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
  if (uGlow > 0.0) {
    // shallows: from the waterline out to the reef edge
    float shallow = smoothstep(0.94, 1.04, vE) * (1.0 - smoothstep(1.3, 1.9, vE));
    // twinkling sparks, one per cell, each on its own slow beat
    vec2 g = vXZ * 2.4;
    vec2 cell = floor(g);
    float h = hash12(cell);
    vec2 off = vec2(hash12(cell + 3.1), hash12(cell + 7.7)) * 0.6 + 0.2;
    float tw = pow(max(0.0, sin(uTime * (0.6 + h * 1.8) + h * 60.0)), 14.0);
    float spark = smoothstep(0.14, 0.0, length(fract(g) - off)) * tw * step(0.35, h);
    // a fainter scatter of sparks out in the open water
    vec2 g2 = vXZ * 1.3 + 17.0;
    vec2 c2 = floor(g2);
    float h2 = hash12(c2);
    float tw2 = pow(max(0.0, sin(uTime * (0.4 + h2) + h2 * 40.0)), 22.0);
    float spark2 = smoothstep(0.1, 0.0, length(fract(g2) - 0.5)) * tw2 * step(0.7, h2) * (1.0 - smoothstep(2.5, 6.0, vE));
    // slow drifting veils of glow along the beach
    float veil = lace(vXZ * 0.45 + vec2(uTime * 0.05, -uTime * 0.04));
    float base = shallow * smoothstep(0.5, 0.85, veil) * 0.1;
    // light around boats and glow spots, broken up so it churns
    float pts = 0.0;
    for (int i = 0; i < ${GLOW_PTS}; i++) {
      vec4 gp = uGlowPts[i];
      if (gp.z <= 0.0) continue;
      vec2 dv = vXZ - gp.xy;
      float q = dot(dv, dv) / (gp.w * gp.w);
      pts += gp.z * exp(-q * 1.6) * (0.35 + 1.1 * lace(vXZ * 2.6 + uTime * 0.7));
    }
    totalEmissiveRadiance += uBio * (spark * shallow * 1.6 + spark2 * 0.9 + base + pts * 0.55) * uGlow;
  }`
        );
    };
    m.customProgramCacheKey = () => 'island-water-v3';
    return m;
  }, [shared]);

  useEffect(() => {
    material.color.set(tint);
  }, [material, tint]);
  useEffect(() => () => (material.dispose(), geometry.dispose()), [material, geometry]);

  // Taps on the water: a ripple where the finger landed, and the usual
  // ground tap (double-tap to fly). Skipped when something in front with
  // its own click handler (the beach, a deck) already took this tap.
  const onClick = (e) => {
    const first = e.intersections.find((i) => i.object.__r3f?.handlers?.onClick);
    if (first && first.object !== e.object) return;
    if (e.delta <= 8) ripple(e.point.x, e.point.z, 1.6);
    onTap?.(e);
  };

  return <mesh geometry={geometry} material={material} onClick={onClick} renderOrder={1} />;
}

// --- Surf -----------------------------------------------------------------------

// A band hugging the shoreline, from wet sand out past the break. Two waves
// at a time roll in: a lacy foam line runs up the sand, stalls, and slides
// back leaving a fading lace behind. Arrival times drift along the beach so
// the line never looks stamped. At night the break lines glow.
const SURF_ROWS = [0.865, 0.885, 0.905, 0.925, 0.945, 0.965, 0.985, 1.005, 1.03, 1.06, 1.1, 1.15, 1.2, 1.25];
const SURF_SEG = 260;

const SURF_VERT = /* glsl */ `
  uniform float uTime;
  attribute float aE;
  varying float vE;
  varying vec2 vXZ;
  ${WAVE_FN}
  ${FOG_VERT.pars}
  void main() {
    vec3 p = position;
    p.y = max(p.y + 0.035, waveY(p.xz, uTime) + 0.05);
    vE = aE;
    vXZ = p.xz;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    ${FOG_VERT.main}
  }
`;

const SURF_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform vec3 uFoam;
  uniform vec3 uBio;
  varying float vE;
  varying vec2 vXZ;
  ${NOISE_FN}
  ${FOG_FRAG.pars}

  // One wave's foam at this spot: (foam, leading line).
  // tt counts waves: its fraction is how far along this one is.
  vec2 surf(float tt, float e, float runUp) {
    float ph = fract(tt);
    float n = lace(vXZ * 2.4 + vec2(floor(tt) * 3.7 + ph * 1.5, ph * 2.0));
    float ef;
    float strength;
    if (ph < 0.42) {
      float k = ph / 0.42;
      ef = mix(1.2, runUp, 1.0 - pow(1.0 - k, 2.2));
      strength = smoothstep(0.0, 0.12, ph);
    } else {
      float k = (ph - 0.42) / 0.58;
      ef = mix(runUp, 1.03, k * k * (3.0 - 2.0 * k));
      strength = 1.0 - k;
    }
    float edge = ef + (n - 0.5) * 0.014;
    // bright line at the water's leading edge
    float front = smoothstep(edge - 0.003, edge + 0.002, e) * (1.0 - smoothstep(edge + 0.014, edge + 0.04, e));
    // lacy wash just behind it
    float wash = smoothstep(edge, edge + 0.006, e) * (1.0 - smoothstep(edge + 0.03, edge + 0.11, e)) * smoothstep(0.4, 0.6, n);
    // lace left on the sand as the water slides back
    float back = 0.0;
    if (ph > 0.42) {
      float k = (ph - 0.42) / 0.58;
      float n2 = lace(vXZ * 4.2 + 11.0 + ph);
      back = step(runUp - 0.004, e) * (1.0 - smoothstep(edge - 0.004, edge + 0.002, e)) * smoothstep(0.42 + k * 0.32, 0.56 + k * 0.32, n2) * (1.0 - k);
    }
    float foam = max(front, wash * 0.8) * strength + back * 0.75;
    return vec2(foam, front * strength);
  }

  void main() {
    float e = vE;
    float slow = vnoise(vXZ * 0.07);
    float runUp = 0.9 + 0.025 * vnoise(vXZ * 0.35 + 3.0);
    float t = uTime / 9.0 + slow * 0.45;
    vec2 a = surf(t, e, runUp);
    vec2 b = surf(t + 0.5, e, runUp);
    float foam = max(a.x, b.x);
    float line = max(a.y, b.y);
    // a soft, steady line of white water out on the break
    float brk = smoothstep(1.11, 1.13, e) * (1.0 - smoothstep(1.14, 1.19, e)) * smoothstep(0.5, 0.75, lace(vXZ * 1.8 + vec2(uTime * 0.12, 0.0))) * 0.45;
    foam = max(foam, brk);
    float fade = smoothstep(0.865, 0.89, e) * (1.0 - smoothstep(1.18, 1.25, e));
    float alpha = foam * fade * 0.9;
    // night: the breaking lines glow blue
    vec3 col = mix(uFoam, uBio * 1.25, clamp(uGlow * (0.55 + line * 0.6 + brk), 0.0, 1.0));
    alpha = max(alpha, (line + brk * 0.6) * fade * uGlow * 0.9);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
    ${FOG_FRAG.main}
  }
`;

function Surf({ shared }) {
  const geometry = useMemo(() => {
    const rows = SURF_ROWS.length;
    const pos = new Float32Array((SURF_SEG + 1) * rows * 3);
    const es = new Float32Array((SURF_SEG + 1) * rows);
    const idx = [];
    for (let i = 0; i <= SURF_SEG; i++) {
      const a = (i / SURF_SEG) * Math.PI * 2;
      const dx = ISLAND.rx * Math.cos(a);
      const dz = ISLAND.rz * Math.sin(a);
      const w = islandWobble(dx, dz);
      for (let r = 0; r < rows; r++) {
        const e = SURF_ROWS[r];
        const s = Math.sqrt(e) * w;
        const x = dx * s;
        const z = dz * s;
        const k = i * rows + r;
        pos.set([x, terrainY(x, z), z], k * 3);
        es[k] = e;
        if (i < SURF_SEG && r < rows - 1) idx.push(k, k + 1, k + rows, k + 1, k + rows + 1, k + rows);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aE', new THREE.BufferAttribute(es, 1));
    g.setIndex(idx);
    return g;
  }, []);
  const material = useMemo(() => {
    const m = foamMaterial(shared, SURF_VERT, SURF_FRAG);
    m.side = THREE.DoubleSide;
    return m;
  }, [shared]);
  useEffect(() => () => (material.dispose(), geometry.dispose()), [material, geometry]);
  return <mesh geometry={geometry} material={material} renderOrder={2} frustumCulled={false} />;
}

// --- Foam collars -----------------------------------------------------------------

// Soft white water lapping around every stilt, rock and moored hull, with
// little rings spreading out from each one. All one instanced draw, animated
// entirely in the shader.
const COLLAR_VERT = /* glsl */ `
  uniform float uTime;
  attribute vec4 aP; // x, z, size, phase
  attribute vec3 aQ; // aspect, rotation, contact
  varying vec2 vUv2;
  varying vec2 vXZ;
  varying vec2 vPh;
  ${WAVE_FN}
  ${FOG_VERT.pars}
  void main() {
    vec2 l = position.xz * 2.0 * aP.z * vec2(aQ.x, 1.0);
    float c = cos(aQ.y);
    float s = sin(aQ.y);
    vec2 w = aP.xy + vec2(l.x * c - l.y * s, l.x * s + l.y * c);
    vec3 p = vec3(w.x, waveY(aP.xy, uTime) + 0.045, w.y);
    vUv2 = position.xz * 2.0;
    vXZ = w;
    vPh = vec2(aP.w, aQ.z);
    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    ${FOG_VERT.main}
  }
`;

const COLLAR_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform vec3 uFoam;
  uniform vec3 uBio;
  varying vec2 vUv2;
  varying vec2 vXZ;
  varying vec2 vPh;
  ${NOISE_FN}
  ${FOG_FRAG.pars}
  void main() {
    float r = length(vUv2);
    if (r > 1.0) discard;
    float contact = vPh.y;
    float n = lace(vXZ * 4.5 + vec2(uTime * 0.25, -uTime * 0.2));
    float breathe = 0.75 + 0.25 * sin(uTime * 1.3 + vPh.x * 6.28);
    float collar = (1.0 - smoothstep(contact, contact + 0.2 * breathe + (n - 0.5) * 0.2, r)) * smoothstep(0.4, 0.62, n + 0.15);
    float ring = 0.0;
    for (int i = 0; i < 2; i++) {
      float ph = fract(uTime * 0.26 + vPh.x + float(i) * 0.5);
      float rr = contact + ph * (1.0 - contact) * 0.95;
      ring += (1.0 - smoothstep(0.0, 0.035 + ph * 0.03, abs(r - rr))) * pow(1.0 - ph, 1.6) * smoothstep(0.25, 0.5, n + 0.2);
    }
    float alpha = clamp(collar * 0.62 + ring * 0.5, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, r));
    vec3 col = mix(uFoam, uBio * 1.2, uGlow * 0.8);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
    ${FOG_FRAG.main}
  }
`;

function Collars({ shared }) {
  const geometry = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    const p = new Float32Array(COLLARS.length * 4);
    const q = new Float32Array(COLLARS.length * 3);
    COLLARS.forEach(([x, z, size, phase, aspect, rot, contact], i) => {
      p.set([x, z, size, phase], i * 4);
      q.set([aspect, rot, contact], i * 3);
    });
    g.setAttribute('aP', new THREE.InstancedBufferAttribute(p, 4));
    g.setAttribute('aQ', new THREE.InstancedBufferAttribute(q, 3));
    g.instanceCount = COLLARS.length;
    return g;
  }, []);
  const material = useMemo(() => foamMaterial(shared, COLLAR_VERT, COLLAR_FRAG), [shared]);
  useEffect(() => () => (material.dispose(), geometry.dispose()), [material, geometry]);
  return <mesh geometry={geometry} material={material} renderOrder={2} frustumCulled={false} />;
}

// --- Foam particles: wakes, ripples, splashes -------------------------------------

// Draws every particle in sea/fx.js. A particle drifts with its velocity
// (easing off as it ages), grows and fades; the shader does all of it.
const FX_VERT = /* glsl */ `
  uniform float uTime;
  attribute vec4 aA; // x, z, vx, vz
  attribute vec4 aB; // t0, life, size, grow
  attribute vec4 aC; // kind, rotation, aspect, glow only
  varying vec2 vUv2;
  varying vec2 vSeed;
  varying float vK;
  varying float vKind;
  varying float vGlowOnly;
  ${WAVE_FN}
  ${FOG_VERT.pars}
  void main() {
    float age = uTime - aB.x;
    float k = age / aB.y;
    if (k < 0.0 || k > 1.0) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }
    vec2 c = aA.xy + aA.zw * age * (1.0 - 0.3 * k);
    float s = aB.z * (1.0 + aB.w * k);
    vec2 l = position.xz * 2.0 * s * vec2(aC.z, 1.0);
    float cr = cos(aC.y);
    float sr = sin(aC.y);
    vec2 w = c + vec2(l.x * cr - l.y * sr, l.x * sr + l.y * cr);
    vec3 p = vec3(w.x, waveY(c, uTime) + 0.055, w.y);
    vUv2 = position.xz * 2.0;
    vSeed = aA.xy;
    vK = k;
    vKind = aC.x;
    vGlowOnly = aC.w;
    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    ${FOG_VERT.main}
  }
`;

const FX_FRAG = /* glsl */ `
  uniform float uGlow;
  uniform vec3 uFoam;
  uniform vec3 uBio;
  varying vec2 vUv2;
  varying vec2 vSeed;
  varying float vK;
  varying float vKind;
  varying float vGlowOnly;
  ${NOISE_FN}
  ${FOG_FRAG.pars}
  void main() {
    float r = length(vUv2);
    if (r > 1.0) discard;
    float n = lace(vUv2 * 2.2 + vSeed * 1.7);
    float shape;
    float fade;
    if (vKind > 1.5) {
      // ring: thin, lacy, thinning as it spreads
      float d = abs(r - 0.82 + (n - 0.5) * 0.08);
      shape = 1.0 - smoothstep(0.02, 0.07 + 0.08 * (1.0 - vK), d);
      fade = smoothstep(0.0, 0.08, vK) * pow(1.0 - vK, 1.6) * 0.75;
    } else {
      // puff or streak: soft blob that opens up into lace as it ages
      shape = 1.0 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.55);
      shape *= mix(1.0, smoothstep(0.3 + vK * 0.25, 0.5 + vK * 0.25, lace(vUv2 * 3.5 + vSeed * 3.1)), smoothstep(0.1, 0.6, vK));
      fade = smoothstep(0.0, 0.1, vK) * pow(1.0 - vK, 1.3);
    }
    float alpha = shape * fade * mix(0.85, uGlow * 0.9, vGlowOnly);
    vec3 col = mix(uFoam, uBio * 1.3, max(vGlowOnly, uGlow * 0.75));
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
    ${FOG_FRAG.main}
  }
`;

// Kelvin wake: on calm deep water a moving hull leaves a V whose arms open
// at about 19.5 degrees. Each arm particle is dropped at the bow and drifts
// sideways at speed * tan(19.5deg) while the boat sails on, so the arms
// form the right angle on their own and curve naturally when a boat turns.
const KELVIN = Math.tan((19.47 * Math.PI) / 180);
const trails = new Map(); // boat id -> { x, z, acc, frame }
let wakeDt = 0;
let wakeFrame = 0;
let wakeGlow = 0;

// Drops wake particles every `step` along the path the boat sailed since
// the last frame, each born at the moment the boat passed that spot, so
// the wake looks the same at any frame rate.
function emitWake(b, id) {
  let st = trails.get(id);
  if (!st) {
    st = { x: b.x, z: b.z, acc: 0, frame: 0 };
    trails.set(id, st);
  }
  st.frame = wakeFrame;
  const lx = st.x;
  const lz = st.z;
  st.x = b.x;
  st.z = b.z;
  const size = b.size || 2;
  const dist = Math.hypot(b.x - lx, b.z - lz);
  if (!(b.speed > 0.15) || dist < 1e-4 || dist > size * 4) return; // moored, or jumped
  const step = Math.min(0.5, Math.max(0.2, size * 0.1));
  let d = step - st.acc; // distance from last frame's spot to the next drop
  let n = 0;
  while (d <= dist && n < 10) {
    const f = d / dist;
    dropWake(b, size, lx + (b.x - lx) * f, lz + (b.z - lz) * f, (1 - f) * wakeDt);
    d += step;
    n++;
  }
  st.acc = n === 10 ? 0 : dist - (d - step);
}

function dropWake(b, size, x, z, ago) {
  const dx = Math.sin(b.heading);
  const dz = Math.cos(b.heading);
  const px = dz; // perpendicular, to the boat's right
  const pz = -dx;
  const sp = Math.min(b.speed, 5);
  const bowX = x + dx * size * 0.4;
  const bowZ = z + dz * size * 0.4;
  const armSize = size * 0.11 * (0.7 + sp * 0.12);
  const armLife = 2.2 + size * 0.35;
  for (let s = -1; s <= 1; s += 2) {
    const vx = px * s * b.speed * KELVIN;
    const vz = pz * s * b.speed * KELVIN;
    const rot = Math.atan2(-dz + pz * s * KELVIN, -dx + px * s * KELVIN);
    emitFx(FX.STREAK, bowX + px * s * size * 0.12, bowZ + pz * s * size * 0.12, vx, vz, armLife, armSize, 1.3, rot, 2.6, 0, -ago);
  }
  // churned water straight behind the stern
  const j = (Math.random() - 0.5) * size * 0.1;
  const sx = x - dx * size * 0.45 + px * j;
  const sz = z - dz * size * 0.45 + pz * j;
  emitFx(FX.PUFF, sx, sz, -dx * sp * 0.12, -dz * sp * 0.12, 3.2 + size * 0.3, size * 0.16, 2.2, Math.random() * 6.28, 1.3, 0, -ago);
  // and at night a long glowing trail
  if (wakeGlow > 0.05) emitFx(FX.PUFF, sx, sz, 0, 0, 6, size * 0.22, 1.8, Math.random() * 6.28, 1.2, 1, -ago);
}

let glowTick = 0;
function emitGlowSpot(g) {
  emitFx(FX.RING, g.x, g.z, 0, 0, 2.4, 0.22, 4, 0, 1, 1);
}

function FoamFx({ shared }) {
  const { geometry, attrs } = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    const attrs = [new THREE.InstancedBufferAttribute(fx.a, 4), new THREE.InstancedBufferAttribute(fx.b, 4), new THREE.InstancedBufferAttribute(fx.c, 4)];
    attrs.forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', attrs[0]);
    g.setAttribute('aB', attrs[1]);
    g.setAttribute('aC', attrs[2]);
    g.instanceCount = FX_MAX;
    return { geometry: g, attrs };
  }, []);
  const material = useMemo(() => foamMaterial(shared, FX_VERT, FX_FRAG), [shared]);
  useEffect(() => {
    fx.live = true;
    return () => {
      fx.live = false;
      material.dispose();
      geometry.dispose();
    };
  }, [material, geometry]);

  useFrame((_, delta) => {
    // wakes for everything moving on the water
    wakeDt = delta;
    wakeFrame += 1;
    wakeGlow = shared.uGlow.value;
    world.boats.forEach(emitWake);
    if (trails.size > world.boats.size) trails.forEach((st, id) => st.frame !== wakeFrame && trails.delete(id));
    // night: glow spots pulse little rings
    glowTick += wakeDt;
    if (wakeGlow > 0.05 && glowTick > 0.7) {
      glowTick = 0;
      world.glow.forEach(emitGlowSpot);
    }
    // upload only what changed this frame
    if (fx.hi >= 0) {
      for (const a of attrs) {
        a.clearUpdateRanges();
        a.addUpdateRange(fx.lo * 4, (fx.hi - fx.lo + 1) * 4);
        a.needsUpdate = true;
      }
      fx.lo = Infinity;
      fx.hi = -1;
    }
  });

  return <mesh geometry={geometry} material={material} renderOrder={3} frustumCulled={false} />;
}

// --- The sea --------------------------------------------------------------------

let glowPts = null;
let glowSlot = 0;
function packBoatGlow(b) {
  if (glowSlot >= GLOW_PTS || !(b.speed > 0.15)) return;
  glowPts[glowSlot++].set(b.x, b.z, Math.min(1, 0.35 + b.speed * 0.2), 0.6 + (b.size || 2) * 0.55);
}
function packSpotGlow(g) {
  if (glowSlot >= GLOW_PTS) return;
  glowPts[glowSlot++].set(g.x, g.z, Math.min(1.5, g.strength ?? 1), 1.3);
}

const FOAM_DAY = new THREE.Color('#ffffff');

export default function Water({ sky, animate = true, onTap, lowPower = false }) {
  const shared = useMemo(makeShared, []);
  const glow = animate && !lowPower ? sky.stars : 0;

  useEffect(() => {
    shared.uGlow.value = glow;
    // foam dims at night and picks up the sky's tint at dawn and dusk
    shared.uFoam.value.copy(FOAM_DAY).lerp(new THREE.Color(sky.water), 0.35).multiplyScalar(1 - 0.5 * sky.stars);
  }, [shared, glow, sky.water, sky.stars]);

  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;
    shared.uTime.value = t;
    fx.now = t;
    if (glow > 0) {
      glowPts = shared.uGlowPts.value;
      glowSlot = 0;
      world.boats.forEach(packBoatGlow);
      world.glow.forEach(packSpotGlow);
      for (let i = glowSlot; i < GLOW_PTS; i++) glowPts[i].z = 0;
    }
  });

  return (
    <group>
      <WaterSurface shared={shared} tint={sky.water} onTap={onTap} />
      <Surf shared={shared} />
      <Collars shared={shared} />
      {animate && <FoamFx shared={shared} />}
      {/* Far ocean, static, fades into the horizon fog. Sits well below the
          wave troughs (lowest about -0.15) so it never pokes through. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
        <circleGeometry args={[420, 48]} />
        <meshStandardMaterial color="#2a86c8" roughness={0.4} />
      </mesh>
      {/* Lagoon floor beyond the terrain mesh */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
        <circleGeometry args={[84, 48]} />
        <meshStandardMaterial color="#3d9fae" roughness={1} />
      </mesh>
    </group>
  );
}
