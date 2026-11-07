import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ISLAND, islandE, islandWobble, terrainY } from '../utils/paths.js';
import { labelState } from './labels.js';
import { world } from '../wild/world.js';

// The lagoon and the ocean around the island: Gerstner waves, swash rolling
// up the beach, ripples, and the bioluminescent glow at night.
//
// Shared with the rest of the ocean (SeaLife, Wakes):
//   OCEAN_UNIFORMS  uTime (wave clock) and uGlow (0 by day, up to 1 at night)
//   ISLAND_GLSL     islandE() and a small value noise, in GLSL
//   WAVE_GLSL       oceanDisp(): the same wave displacement the water uses,
//                   so anything floating can sit on the waves
//   addRipple(x, z, size, strength, delay)   an expanding ring on the water
//   wakeSources     extra wake makers that aren't boats (shark fins), same
//                   shape as world.boats entries

export const OCEAN_UNIFORMS = { uTime: { value: 0 }, uGlow: { value: 0 } };
export const wakeSources = new Map();

export const ISLAND_GLSL = /* glsl */ `
  float islandE(vec2 p) {
    float a = atan(p.y, p.x);
    float w = 1.0 + 0.045 * sin(a * 3.0 + 0.7) + 0.03 * sin(a * 5.0 + 2.1) + 0.02 * sin(a * 9.0 + 4.0);
    vec2 q = p / vec2(${ISLAND.rx.toFixed(2)}, ${ISLAND.rz.toFixed(2)});
    return dot(q, q) / (w * w);
  }
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

// Gerstner waves: each vertex moves in a little ellipse, so crests sharpen
// and troughs flatten. Amplitudes add to 0.215 offshore (troughs stay above
// the far-ocean disk at -0.4) and drop to about a quarter in the lagoon.
export const WAVE_GLSL = /* glsl */ `
  uniform float uTime;
  ${ISLAND_GLSL}
  vec3 gWave(vec2 p, float t, vec2 dir, float L, float A, float Q) {
    float k = 6.2832 / L;
    float f = k * dot(dir, p) - sqrt(2.4 * k) * t;
    float c = cos(f);
    return vec3(dir.x * Q * A * c, A * sin(f), dir.y * Q * A * c);
  }
  // cap: 0..1, how close this point is to a big offshore crest (whitecaps)
  vec3 oceanDisp(vec2 p, float t, out float cap) {
    float e = islandE(p);
    float calm = mix(0.22, 1.0, smoothstep(1.2, 4.5, e));
    vec3 d = gWave(p, t, vec2(0.83, 0.55), 14.0, 0.09, 1.6);
    d += gWave(p, t, vec2(-0.42, 0.91), 9.0, 0.06, 1.8);
    d += gWave(p, t, vec2(0.96, -0.28), 6.2, 0.04, 2.2);
    d += gWave(p, t, vec2(-0.7, -0.71), 4.8, 0.025, 2.4);
    cap = smoothstep(0.1, 0.19, d.y) * smoothstep(2.5, 5.0, e);
    return d * calm;
  }
`;

// --- Ripples ----------------------------------------------------------------
// A small pool of expanding rings: a bright crest with a darker trough just
// inside it (reads as the surface bending), two trailing rings and a foam
// patch at the start. They ride the waves and glow cyan at night.

const MAX_RIPPLES = 40;
const rip = {
  x: new Float32Array(MAX_RIPPLES),
  z: new Float32Array(MAX_RIPPLES),
  t0: new Float32Array(MAX_RIPPLES).fill(-999),
  size: new Float32Array(MAX_RIPPLES),
  k: new Float32Array(MAX_RIPPLES),
  next: 0,
  now: 0, // seconds of frames drawn
};

export function addRipple(x, z, size = 1, strength = 1, delay = 0) {
  const i = rip.next;
  rip.next = (i + 1) % MAX_RIPPLES;
  rip.x[i] = x;
  rip.z[i] = z;
  rip.t0[i] = rip.now + delay;
  rip.size[i] = size;
  rip.k[i] = strength;
}

const rippleLife = (size) => 1.5 + 0.8 * Math.sqrt(size);

const RIPPLE_VERT = /* glsl */ `
  ${WAVE_GLSL}
  attribute vec4 aR; // x, z, radius, age 0..1
  attribute vec2 aK; // strength, seed
  varying vec2 vUv;
  varying float vAge;
  varying vec2 vK;
  #include <fog_pars_vertex>
  void main() {
    vUv = position.xz;
    vAge = aR.w;
    vK = aK;
    vec2 w = aR.xy + position.xz * aR.z;
    float cap;
    vec3 d = oceanDisp(w, uTime, cap);
    vec4 mvPosition = viewMatrix * vec4(w.x + d.x, d.y + 0.07, w.y + d.z, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const RIPPLE_FRAG = /* glsl */ `
  uniform float uGlow;
  varying vec2 vUv;
  varying float vAge;
  varying vec2 vK;
  #include <fog_pars_fragment>
  void main() {
    if (vK.x <= 0.0) discard;
    float r = length(vUv);
    if (r > 1.0) discard;
    float ang = atan(vUv.y, vUv.x);
    float age = vAge;
    float light = 0.0;
    float dark = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float ri = age * 0.92 - fi * 0.14;
      if (ri <= 0.0) continue;
      float wob = 0.018 * sin(ang * 7.0 + fi * 2.0 + vK.y) + 0.012 * sin(ang * 13.0 - vK.y);
      float x = (r - ri - wob) / (0.03 + 0.05 * ri);
      float fade = pow(1.0 - age, 1.6) * (1.0 - fi * 0.3);
      light += exp(-x * x) * fade;
      dark += exp(-(x + 1.5) * (x + 1.5)) * fade;
    }
    // foam patch where it started
    float foamSpot = (1.0 - smoothstep(0.0, 0.12 + age * 0.3, r)) * (1.0 - smoothstep(0.0, 0.35, age));
    light += foamSpot * 0.9;
    float a = clamp(light * 0.8 + dark * 0.22, 0.0, 1.0) * vK.x;
    vec3 lit = mix(vec3(1.0), vec3(0.35, 0.95, 1.0), uGlow);
    vec3 col = mix(vec3(0.05, 0.32, 0.42), lit, light / (light + dark + 0.001));
    gl_FragColor = vec4(col, a * (1.0 + uGlow * 0.4));
    #include <fog_fragment>
  }
`;

function Ripples() {
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(2, 2, 6, 6).rotateX(-Math.PI / 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = plane.index;
    g.setAttribute('position', plane.attributes.position);
    g.setAttribute('aR', new THREE.InstancedBufferAttribute(new Float32Array(MAX_RIPPLES * 4), 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aK', new THREE.InstancedBufferAttribute(new Float32Array(MAX_RIPPLES * 2), 2).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = MAX_RIPPLES;
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: OCEAN_UNIFORMS.uTime, uGlow: OCEAN_UNIFORMS.uGlow },
        vertexShader: RIPPLE_VERT,
        fragmentShader: RIPPLE_FRAG,
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    []
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  const mesh = useRef();
  useFrame((_, delta) => {
    rip.now += Math.min(delta, 0.1);
    const R = geometry.attributes.aR;
    const K = geometry.attributes.aK;
    let live = 0;
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const age = (rip.now - rip.t0[i]) / rippleLife(rip.size[i]);
      const on = age >= 0 && age < 1;
      R.array[i * 4] = rip.x[i];
      R.array[i * 4 + 1] = rip.z[i];
      R.array[i * 4 + 2] = on ? rip.size[i] * 1.6 : 0;
      R.array[i * 4 + 3] = on ? age : 0;
      K.array[i * 2] = on ? rip.k[i] : 0;
      K.array[i * 2 + 1] = i * 1.7;
      if (on) live++;
    }
    R.needsUpdate = true;
    K.needsUpdate = true;
    if (mesh.current) mesh.current.visible = live > 0;
  });
  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={3} visible={false} />;
}

// --- Water surface ----------------------------------------------------------

const MAX_PTS = 8;
const MAX_GLOW_BOATS = 6;

export function Water({ tint, animate, onTap, glow = 0, lowPower = false }) {
  const ref = useRef();
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(170, 170, 112, 112);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const shallow = new THREE.Color('#72e6da');
    const mid = new THREE.Color('#2bb9cb');
    const deep = new THREE.Color('#1784b3');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const e = islandE(pos.getX(i), pos.getZ(i));
      if (e < 2.0) c.copy(shallow).lerp(mid, Math.max(0, (e - 1.1) / 0.9));
      else c.copy(mid).lerp(deep, Math.min(1, (e - 2.0) / 4));
      c.toArray(colors, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);

  // Night glow sources: bots near the water and moving boats.
  const uniforms = useMemo(
    () => ({
      uPts: { value: Array.from({ length: MAX_PTS }, () => new THREE.Vector3()) },
      uBoats: { value: Array.from({ length: MAX_GLOW_BOATS }, () => new THREE.Vector4()) },
      uBoatK: { value: new Array(MAX_GLOW_BOATS).fill(0) },
    }),
    []
  );
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.82, roughness: 0.3, metalness: 0.05 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = OCEAN_UNIFORMS.uTime;
      shader.uniforms.uGlow = OCEAN_UNIFORMS.uGlow;
      shader.uniforms.uPts = uniforms.uPts;
      shader.uniforms.uBoats = uniforms.uBoats;
      shader.uniforms.uBoatK = uniforms.uBoatK;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WAVE_GLSL}\nvarying vec2 vXZ;\nvarying float vCap;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n  vXZ = position.xz;\n  transformed += oceanDisp(position.xz, uTime, vCap);`);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTime;
uniform float uGlow;
uniform vec3 uPts[${MAX_PTS}];
uniform vec4 uBoats[${MAX_GLOW_BOATS}];
uniform float uBoatK[${MAX_GLOW_BOATS}];
varying vec2 vXZ;
varying float vCap;
${ISLAND_GLSL}`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  // whitecaps on the big offshore crests
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vCap * (0.25 + 0.3 * vnoise(vXZ * 1.7 + uTime * 0.3)));`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
  if (uGlow > 0.0) {
    vec2 p = vXZ;
    float t = uTime;
    float u = sqrt(islandE(p));
    float sp = sin(p.x * 4.1 + t * 0.9) * sin(p.y * 3.7 - t * 0.7) * sin((p.x - p.y) * 2.3 + t * 0.5);
    float spark = pow(max(sp, 0.0), 6.0);
    float soft = vnoise(p * 0.9 + vec2(t * 0.15, -t * 0.1));
    float lum = 0.35 + 0.35 * soft + 1.2 * spark;
    // a glowing band all along the shore
    float g = smoothstep(0.96, 1.0, u) * (1.0 - smoothstep(1.03, 1.15, u)) * (0.15 + 0.85 * soft + 1.1 * spark);
    // around bots on the decks, piers and beach
    for (int i = 0; i < ${MAX_PTS}; i++) {
      vec3 q = uPts[i];
      if (q.z <= 0.0) continue;
      vec2 r = p - q.xy;
      g += q.z * exp(-dot(r, r) * 0.16) * lum;
    }
    // around moving boats and in their V-shaped wakes
    for (int i = 0; i < ${MAX_GLOW_BOATS}; i++) {
      float k = uBoatK[i];
      if (k <= 0.0) continue;
      vec4 b = uBoats[i];
      vec2 fwd = vec2(sin(b.z), cos(b.z));
      vec2 r = p - b.xy;
      float along = dot(r, fwd);
      float lat = abs(r.x * fwd.y - r.y * fwd.x);
      float behind = max(-along, 0.0);
      float sz = max(b.w, 0.6);
      float halo = exp(-dot(r, r) / (sz * sz * 0.7));
      float ad = lat - behind * 0.354;
      float arm = exp(-(ad * ad) / (0.06 + behind * 0.04)) * step(along, sz * 0.5);
      float inside = (1.0 - smoothstep(behind * 0.25, behind * 0.354 + 0.2, lat)) * step(along, 0.0);
      float fade = exp(-behind / (sz * 3.0 + 4.0));
      g += k * (halo * 0.9 + (arm + inside * 0.35) * fade) * lum;
    }
    totalEmissiveRadiance += vec3(0.12, 0.7, 1.0) * g * uGlow;
  }`
        );
    };
    m.customProgramCacheKey = () => 'island-water-v2';
    return m;
  }, [uniforms]);

  useEffect(() => {
    material.color.set(tint);
  }, [material, tint]);
  useEffect(() => {
    OCEAN_UNIFORMS.uGlow.value = glow;
  }, [glow]);
  useEffect(() => () => material.dispose(), [material]);

  // scratch for picking the bots nearest the water (no per-frame arrays)
  const best = useMemo(() => ({ x: new Float32Array(MAX_PTS), z: new Float32Array(MAX_PTS), e: new Float32Array(MAX_PTS), s: new Float32Array(MAX_PTS) }), []);

  useFrame((state) => {
    if (animate) OCEAN_UNIFORMS.uTime.value = state.clock.elapsedTime;
    if (glow <= 0) return;
    const pts = uniforms.uPts.value;
    const boats = uniforms.uBoats.value;
    const bk = uniforms.uBoatK.value;
    if (lowPower) {
      for (let i = 0; i < MAX_PTS; i++) pts[i].z = 0;
      bk.fill(0);
      return;
    }
    // Keep the 8 bots furthest out toward (or over) the water.
    best.e.fill(-1);
    const offer = (x, z, e, s) => {
      let m = 0;
      for (let i = 1; i < MAX_PTS; i++) if (best.e[i] < best.e[m]) m = i;
      if (e <= best.e[m]) return;
      best.x[m] = x;
      best.z[m] = z;
      best.e[m] = e;
      best.s[m] = s;
    };
    for (const p of labelState.positions.values()) {
      const e = islandE(p.x, p.z);
      if (e > 0.86) offer(p.x, p.z, e, Math.min(1, (e - 0.86) / 0.14));
    }
    for (const g of world.glow.values()) offer(g.x, g.z, 9, g.strength ?? 1);
    for (let i = 0; i < MAX_PTS; i++) pts[i].set(best.x[i], best.z[i], best.e[i] > 0 ? best.s[i] : 0);

    let n = 0;
    const addBoat = (b) => {
      if (n >= MAX_GLOW_BOATS || !(b.speed > 0.2)) return;
      boats[n].set(b.x, b.z, b.heading, b.size || 1);
      bk[n] = Math.min(1, 0.35 + b.speed / 3);
      n++;
    };
    for (const b of world.boats.values()) addBoat(b);
    for (const b of wakeSources.values()) addBoat(b);
    for (let i = n; i < MAX_GLOW_BOATS; i++) bk[i] = 0;
  });

  return (
    <group>
      <mesh ref={ref} geometry={geometry} material={material} onClick={onTap} renderOrder={1} />
      {animate && <Ripples />}
      {/* Far ocean, static, fades into the horizon fog. Sits well below the
          wave troughs (lowest about -0.22) so it never pokes through. */}
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

// --- Swash: foam rolling up the beach ---------------------------------------
// A band draped over the waterline. Two overlapping wave sets wash up the
// sand with a bright ragged lip and lacy foam behind it, leave wet sand as
// they slide back, and arrive at different moments along the coast. At night
// the foam glows like breaking bioluminescent surf.

const SWASH_U = [0.925, 0.945, 0.965, 0.98, 0.993, 1.005, 1.02, 1.045, 1.075, 1.1];
const SHORE_R = 16;

const SWASH_VERT = /* glsl */ `
  varying vec2 vXZ;
  void main() {
    vXZ = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SWASH_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  varying vec2 vXZ;
  ${ISLAND_GLSL}
  void main() {
    float u = sqrt(islandE(vXZ));
    float d = (u - 1.0) * ${SHORE_R.toFixed(1)}; // world units from the waterline, negative up the sand
    float ang = atan(vXZ.y, vXZ.x);
    float lace = vnoise(vXZ * 4.5 + vec2(uTime * 0.25, -uTime * 0.18));
    float lace2 = vnoise(vXZ * 9.0 - vec2(uTime * 0.4, uTime * 0.1));
    float foam = 0.0;
    float wet = 0.0;
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float period = 6.5 + fk * 1.9;
      float ph = uTime / period + fk * 0.5 + 0.16 * sin(ang * 2.0 + fk * 3.0) + 0.07 * sin(ang * 5.0 + 1.3);
      float c = fract(ph);
      float reach = 0.45 + 0.4 * vnoise(vec2(ang * 2.2, floor(ph) * 3.7 + fk * 11.0));
      float up = smoothstep(0.0, 0.42, c);
      float back = smoothstep(0.45, 1.0, c);
      float front = mix(mix(1.5, -reach, 1.0 - (1.0 - up) * (1.0 - up)), 0.35, back);
      front += (vnoise(vec2(ang * 22.0, uTime * 0.35 + fk * 5.0)) - 0.5) * 0.22; // ragged lip
      float fade = 1.0 - smoothstep(0.5, 0.95, c);
      float x = d - front;
      float xl = x / 0.07;
      float lip = exp(-xl * xl) * step(-0.12, x);
      float body = smoothstep(0.0, 0.06, x) * (1.0 - smoothstep(0.15, 0.25 + 0.8 * (1.0 - back), x));
      foam += (lip * 0.95 + body * smoothstep(0.35, 0.7, lace) * 0.75) * fade;
      // wet sand left behind as the water slides back
      wet += step(-reach, d) * step(d, front) * back * (1.0 - smoothstep(0.7, 1.0, c));
    }
    // thin steady foam line right at the waterline
    float dl = (d - 0.12) / 0.16;
    foam += exp(-dl * dl) * smoothstep(0.45, 0.75, lace2) * 0.45;
    foam = clamp(foam, 0.0, 1.0);
    wet = clamp(wet, 0.0, 1.0) * step(d, 0.0) * (1.0 - foam);
    float edge = smoothstep(-1.2, -1.0, d) * (1.0 - smoothstep(1.2, 1.5, d));
    vec3 foamCol = mix(vec3(1.0), vec3(0.4, 0.95, 1.0) * 1.15, uGlow);
    vec3 wetCol = vec3(0.55, 0.48, 0.36);
    float a = (foam * (0.85 + uGlow * 0.15) + wet * 0.22 * (1.0 - uGlow)) * edge;
    vec3 col = mix(wetCol, foamCol, foam / max(foam + wet * 0.22, 0.001));
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }
`;

export function Foam() {
  const geometry = useMemo(() => {
    const n = 280;
    const rows = SWASH_U.length;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const dx = ISLAND.rx * Math.cos(a);
      const dz = ISLAND.rz * Math.sin(a);
      const w = islandWobble(dx, dz);
      for (const u of SWASH_U) {
        const x = dx * u * w;
        const z = dz * u * w;
        pos.push(x, Math.max(terrainY(x, z), 0) + 0.05, z);
      }
      if (i < n) {
        for (let r = 0; r < rows - 1; r++) {
          const k = i * rows + r;
          idx.push(k, k + 1, k + rows, k + 1, k + rows + 1, k + rows);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: OCEAN_UNIFORMS.uTime, uGlow: OCEAN_UNIFORMS.uGlow },
        vertexShader: SWASH_VERT,
        fragmentShader: SWASH_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    []
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  return <mesh geometry={geometry} material={material} renderOrder={2} />;
}
