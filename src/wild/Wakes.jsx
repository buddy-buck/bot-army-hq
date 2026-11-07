import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { world } from './world.js';
import { ISLAND_GLSL, OCEAN_UNIFORMS, WAVE_GLSL, wakeSources } from '../components/Water.jsx';

// Kelvin wakes: every boat in world.boats (and the shark fins in
// wakeSources) moving faster than 0.2 leaves a V on the water. Two arms open
// at about 19.5 degrees from the bow, with churned water down the middle.
// Each boat keeps a short trail of where its bow has been, so the V bends
// when the boat turns and stays put in the water as the boat moves on. One
// mesh, one draw call, rebuilt each frame into a preallocated buffer. The
// foam rides the waves and glows cyan at night.
// Props: { sky, animate, lowPower, bots, layout } (only sky and lowPower used)

const N = 34; // trail points per boat (the live bow is point 0)
const VPP = 6; // vertices per trail point: left arm (2), center (2), right arm (2)
const SAMPLE = 0.08; // seconds between trail samples
const TAN = Math.tan((19.5 * Math.PI) / 180);

const VERT = /* glsl */ `
  ${WAVE_GLSL}
  attribute vec4 aW; // age 0..1, across -1..1, kind (0 arm, 1 center), strength
  varying vec4 vW;
  varying vec2 vP;
  #include <fog_pars_vertex>
  void main() {
    vW = aW;
    vP = position.xz;
    float cap;
    vec3 d = oceanDisp(position.xz, uTime, cap);
    vec4 mvPosition = viewMatrix * vec4(position.x + d.x, d.y + 0.08, position.z + d.z, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  varying vec4 vW;
  varying vec2 vP;
  ${ISLAND_GLSL}
  #include <fog_pars_fragment>
  void main() {
    float life = 1.0 - vW.x;
    if (life <= 0.0 || vW.w <= 0.0) discard;
    float acr = vW.y;
    float n = vnoise(vP * 3.2 + vec2(uTime * 0.12, 0.0));
    float n2 = vnoise(vP * 7.5 - uTime * 0.35);
    float a;
    if (vW.z < 0.5) {
      // arm: crisp outer edge, softer inside, broken into lacy streaks
      float prof = smoothstep(-1.0, 0.15, acr) * (1.0 - smoothstep(0.55, 1.0, acr));
      a = prof * (0.45 + 0.55 * smoothstep(0.25, 0.7, n)) * pow(life, 1.3);
    } else {
      // centerline: churned propeller water
      float prof = 1.0 - acr * acr;
      float churn = smoothstep(0.3, 0.75, n * 0.55 + n2 * 0.55);
      a = prof * mix(0.3, 1.0, churn) * pow(life, 1.8);
    }
    a *= vW.w;
    vec3 col = mix(vec3(1.0), vec3(0.35, 0.95, 1.0) * 1.2, uGlow);
    gl_FragColor = vec4(col, clamp(a * (0.72 + uGlow * 0.3), 0.0, 1.0));
    #include <fog_fragment>
  }
`;

export default function Wakes({ lowPower = false }) {
  const MAX = lowPower ? 5 : 8;
  const { geometry, pos, aw } = useMemo(() => {
    const verts = MAX * N * VPP;
    const pos = new Float32Array(verts * 3);
    const aw = new Float32Array(verts * 4);
    const idx = [];
    for (let b = 0; b < MAX; b++) {
      for (let j = 0; j < N - 1; j++) {
        const base = (b * N + j) * VPP;
        const next = base + VPP;
        for (const [l, r] of [[0, 1], [2, 3], [4, 5]]) idx.push(base + l, base + r, next + l, base + r, next + r, next + l);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aW', new THREE.BufferAttribute(aw, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    return { geometry: g, pos, aw };
  }, [MAX]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: OCEAN_UNIFORMS.uTime, uGlow: OCEAN_UNIFORMS.uGlow },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
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

  // id -> { x, z, t: Float32Array trails (oldest first), n, last, size, k }
  const trails = useMemo(() => new Map(), []);
  const clock = useRef(0);
  const mesh = useRef();

  useFrame((_, delta) => {
    const now = (clock.current += Math.min(delta, 0.1));

    // 1. Sample every moving boat's bow.
    const visit = (id, b) => {
      let tr = trails.get(id);
      if (!tr) {
        if (trails.size >= MAX || !(b.speed > 0.2)) return;
        tr = { x: new Float32Array(N), z: new Float32Array(N), t: new Float32Array(N), n: 0, last: -1, size: 1, k: 0, live: false, bx: 0, bz: 0, h: 0 };
        trails.set(id, tr);
      }
      const size = b.size || 1;
      const fx = Math.sin(b.heading);
      const fz = Math.cos(b.heading);
      tr.size = size;
      tr.live = b.speed > 0.2;
      tr.bx = b.x + fx * size * 0.45;
      tr.bz = b.z + fz * size * 0.45;
      tr.h = b.heading;
      tr.k = Math.min(1, 0.3 + b.speed / 2.5);
      tr.seen = now;
      // jumped (a new lap or a respawn): start a fresh trail
      if (tr.n && Math.hypot(tr.bx - tr.x[tr.n - 1], tr.bz - tr.z[tr.n - 1]) > 4 + size) tr.n = 0;
      if (tr.live && now - tr.last >= SAMPLE) {
        if (tr.n === N - 1) {
          tr.x.copyWithin(0, 1);
          tr.z.copyWithin(0, 1);
          tr.t.copyWithin(0, 1);
          tr.n--;
        }
        tr.x[tr.n] = tr.bx;
        tr.z[tr.n] = tr.bz;
        tr.t[tr.n] = now;
        tr.n++;
        tr.last = now;
      }
    };
    for (const [id, b] of world.boats) visit(id, b);
    for (const [id, b] of wakeSources) visit('s:' + id, b);

    // 2. Build the ribbons.
    let slot = 0;
    for (const [id, tr] of trails) {
      if (tr.seen !== now) tr.live = false; // boat gone: let its wake fade out
      const life = 2.4 + tr.size * 0.7;
      // drop expired samples
      let drop = 0;
      while (drop < tr.n && now - tr.t[drop] > life) drop++;
      if (drop) {
        tr.x.copyWithin(0, drop);
        tr.z.copyWithin(0, drop);
        tr.t.copyWithin(0, drop);
        tr.n -= drop;
      }
      if (tr.n === 0 && !tr.live) {
        trails.delete(id);
        continue;
      }
      if (slot >= MAX) continue;
      const base = slot * N * VPP;
      slot++;
      // points newest first: the live bow, then the samples
      const count = tr.n + (tr.live ? 1 : 0);
      let s = 0;
      let px = 0;
      let pz = 0;
      let tx = Math.sin(tr.h);
      let tz = Math.cos(tr.h);
      let j = 0;
      for (; j < count; j++) {
        const si = tr.live ? tr.n - j : tr.n - 1 - j; // sample index (tr.n = live bow)
        const x = si === tr.n ? tr.bx : tr.x[si];
        const z = si === tr.n ? tr.bz : tr.z[si];
        const age = si === tr.n ? 0 : Math.min(1, (now - tr.t[si]) / life);
        if (j > 0) s += Math.hypot(x - px, z - pz);
        // direction of travel from the neighbors (falls back to the last one)
        const ni = si + 1 <= tr.n - (tr.live ? 0 : 1) ? si + 1 : si;
        const pi = si - 1 >= 0 ? si - 1 : si;
        const ax = ni === tr.n && tr.live ? tr.bx : tr.x[ni];
        const az = ni === tr.n && tr.live ? tr.bz : tr.z[ni];
        const bx = pi === tr.n ? tr.bx : tr.x[pi];
        const bz = pi === tr.n ? tr.bz : tr.z[pi];
        const dl = Math.hypot(ax - bx, az - bz);
        if (dl > 1e-4) {
          tx = (ax - bx) / dl;
          tz = (az - bz) / dl;
        }
        px = x;
        pz = z;
        const nx = tz; // perpendicular
        const nz = -tx;
        const spread = s * TAN + tr.size * 0.22;
        const armW = tr.size * 0.08 + s * 0.05;
        const cw = tr.size * 0.18 + s * 0.04;
        const offs = [spread + armW, spread - armW, cw, -cw, -(spread - armW), -(spread + armW)];
        const v0 = base + j * VPP;
        for (let q = 0; q < VPP; q++) {
          const v = v0 + q;
          pos[v * 3] = x + nx * offs[q];
          pos[v * 3 + 1] = 0;
          pos[v * 3 + 2] = z + nz * offs[q];
          aw[v * 4] = age;
          aw[v * 4 + 1] = q === 0 || q === 3 || q === 5 ? 1 : -1;
          aw[v * 4 + 2] = q === 2 || q === 3 ? 1 : 0;
          aw[v * 4 + 3] = tr.k;
        }
      }
      // pad the rest of this slot with the last point, invisible
      const last = base + Math.max(0, j - 1) * VPP;
      for (; j < N; j++) {
        const v0 = base + j * VPP;
        for (let q = 0; q < VPP; q++) {
          const v = v0 + q;
          const src = last + q;
          pos[v * 3] = pos[src * 3];
          pos[v * 3 + 1] = 0;
          pos[v * 3 + 2] = pos[src * 3 + 2];
          aw[v * 4] = 1;
          aw[v * 4 + 3] = 0;
        }
      }
    }
    // clear unused slots
    for (let b = slot; b < MAX; b++) {
      const v0 = b * N * VPP;
      if (aw[v0 * 4 + 3] === 0 && aw[(v0 + VPP) * 4 + 3] === 0) continue;
      for (let v = v0; v < v0 + N * VPP; v++) {
        aw[v * 4] = 1;
        aw[v * 4 + 3] = 0;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aW.needsUpdate = true;
    if (mesh.current) mesh.current.visible = slot > 0;
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={3} visible={false} />;
}
