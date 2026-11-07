import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rareGap } from '../director.js';
import { farSide, isDark, rand } from './common.js';

// Fireworks: every few minutes at night, a short show of 6 to 10 bursts over
// the water just past the island (the far side from where the camera is when
// the show starts, so it's framed above the island). Rockets climb with a
// spark trail, then burst: peonies, rings, golden willows and the odd bot
// face. Sparks fly out, slow down, fall and fade, each with a short trail.
// One particle buffer, reused for every burst.

const TRAIL = 3; // samples per spark: the spark and two fading ghosts behind it
const TRAIL_DT = 0.07;
const KINDS = [
  // speed, drag, gravity, life
  { speed: 10, drag: 1.8, grav: 2.4, life: 2.2 }, // peony
  { speed: 11, drag: 2.0, grav: 1.8, life: 2.1 }, // ring
  { speed: 7.5, drag: 1.1, grav: 3.4, life: 3.3 }, // willow
  { speed: 9, drag: 2.1, grav: 1.0, life: 2.6 }, // bot face
];
const PALETTE = [
  ['#ff4fa3', '#ffe14d'], ['#4aa8ff', '#ffffff'], ['#5fd16b', '#ffde69'], ['#d63af9', '#2ec4c8'],
  ['#ff7a59', '#fff1b0'], ['#2ec4c8', '#ff4fa3'], ['#ffde69', '#ff9b3d'],
].map((p) => p.map((c) => new THREE.Color(c)));
const GOLD = [new THREE.Color('#ffcf6a'), new THREE.Color('#ffa64a')];

const vert = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aAlpha > 0.003 ? min(48.0, aSize * uScale / max(0.1, -mv.z)) : 0.0;
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a = a * a * vAlpha;
    gl_FragColor = vec4(vColor * a * 1.6, 1.0);
  }
`;

export default function Fireworks({ sky, lowPower }) {
  const { camera } = useThree();
  const MAXB = lowPower ? 4 : 6;
  const PER = lowPower ? 44 : 96;
  const N = MAXB * PER * TRAIL;
  const pts = useRef();
  const skyRef = useRef(sky);
  skyRef.current = sky;

  const buf = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const alpha = new Float32Array(N);
    const size = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    return {
      g, mat, pos, col, alpha, size,
      // per burst
      active: new Uint8Array(MAXB),
      age: new Float32Array(MAXB),
      launch: new Float32Array(MAXB),
      kind: new Uint8Array(MAXB),
      c: new Float32Array(MAXB * 3), // burst center
      b: new Float32Array(MAXB * 3), // launch point on the water
      ca: new Float32Array(MAXB * 3),
      cb: new Float32Array(MAXB * 3),
      dirs: new Float32Array(MAXB * PER * 3),
    };
  }, [N, MAXB, PER]);
  useEffect(() => () => {
    buf.g.dispose();
    buf.mat.dispose();
  }, [buf]);

  const st = useMemo(() => ({ wait: rareGap(90, 200), left: 0, next: 0, any: false, side: { x: 0, z: -1 }, lx: 1, lz: 0 }), []);

  function launch() {
    let i = 0;
    while (i < MAXB && buf.active[i]) i++;
    if (i === MAXB) return;
    const f = st.side;
    const out = rand(22, 32);
    const lat = rand(-14, 14);
    const cx = f.x * out + st.lx * lat;
    const cz = f.z * out + st.lz * lat;
    buf.c[i * 3] = cx;
    buf.c[i * 3 + 1] = rand(8, 14);
    buf.c[i * 3 + 2] = cz;
    buf.b[i * 3] = cx + rand(-1.5, 1.5);
    buf.b[i * 3 + 1] = 0.1;
    buf.b[i * 3 + 2] = cz + rand(-1.5, 1.5);
    const r = Math.random();
    const kind = r < 0.42 ? 0 : r < 0.6 ? 1 : r < 0.8 ? 2 : 3;
    buf.kind[i] = kind;
    const pair = kind === 2 ? GOLD : PALETTE[Math.floor(Math.random() * PALETTE.length)];
    pair[0].toArray(buf.ca, i * 3);
    pair[1].toArray(buf.cb, i * 3);
    buf.launch[i] = rand(1.0, 1.45);
    buf.age[i] = 0;
    buf.active[i] = 1;
    // Spark directions for this burst.
    const d = buf.dirs;
    const tilt = rand(0.5, 1.2);
    for (let p = 0; p < PER; p++) {
      const o = (i * PER + p) * 3;
      let x;
      let y;
      let z;
      if (kind === 1) {
        const a = (p / PER) * Math.PI * 2;
        x = Math.cos(a);
        y = Math.sin(a) * Math.cos(tilt);
        z = Math.sin(a) * Math.sin(tilt);
      } else if (kind === 3) {
        // A bot face in the camera's view plane: head ring, eyes, antenna, bulb.
        let u;
        let v;
        const q = p / PER;
        if (q < 0.56) {
          const a = (q / 0.56) * Math.PI * 2;
          u = Math.cos(a);
          v = Math.sin(a);
        } else if (q < 0.76) {
          const a = Math.random() * Math.PI * 2;
          const rr = Math.random() * 0.12;
          u = (q < 0.66 ? -0.36 : 0.36) + Math.cos(a) * rr;
          v = 0.14 + Math.sin(a) * rr * 1.3;
        } else if (q < 0.88) {
          u = 0;
          v = 1.02 + ((q - 0.76) / 0.12) * 0.4;
        } else {
          const a = Math.random() * Math.PI * 2;
          u = Math.cos(a) * 0.13;
          v = 1.56 + Math.sin(a) * 0.13;
        }
        x = st.lx * u;
        y = v;
        z = st.lz * u;
      } else {
        z = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - z * z);
        x = s * Math.cos(a);
        y = s * Math.sin(a);
        if (kind === 2) y = y * 0.8 + 0.25;
        const k = 0.82 + Math.random() * 0.18;
        x *= k;
        y *= k;
        z *= k;
      }
      d[o] = x;
      d[o + 1] = y;
      d[o + 2] = z;
    }
  }

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const P = pts.current;
    if (!P) return;

    // Show scheduling.
    if (st.left > 0) {
      st.next -= dt;
      if (st.next <= 0) {
        launch();
        st.left--;
        st.next = st.left <= 2 ? rand(0.3, 0.6) : rand(0.6, 1.5); // quicker finale
      }
    } else {
      st.wait -= dt;
      if (st.wait <= 0) {
        st.wait = rareGap(180, 360);
        if (isDark(skyRef.current)) {
          farSide(camera, st.side);
          st.lx = -st.side.z;
          st.lz = st.side.x;
          st.left = 6 + Math.floor(Math.random() * 5);
          st.next = 0.2;
        }
      }
    }

    let any = false;
    for (let i = 0; i < MAXB; i++) if (buf.active[i]) any = true;
    if (!any && !st.any) {
      P.visible = false;
      return;
    }
    st.any = any;
    P.visible = true;
    buf.mat.uniforms.uScale.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));

    const { pos, col, alpha, size, dirs } = buf;
    for (let i = 0; i < MAXB; i++) {
      const base = i * PER * TRAIL;
      if (!buf.active[i]) {
        if (alpha[base] !== 0 || alpha[base + TRAIL] !== 0) for (let v = 0; v < PER * TRAIL; v++) alpha[base + v] = 0;
        continue;
      }
      buf.age[i] += dt;
      const age = buf.age[i];
      const L = buf.launch[i];
      const K = KINDS[buf.kind[i]];
      const cx = buf.c[i * 3];
      const cy = buf.c[i * 3 + 1];
      const cz = buf.c[i * 3 + 2];
      if (age < L) {
        // Rocket climbing, with its spark trail.
        const bx = buf.b[i * 3];
        const bz = buf.b[i * 3 + 2];
        for (let v = 0; v < PER * TRAIL; v++) alpha[base + v] = 0;
        for (let k = 0; k < TRAIL; k++) {
          const tau = age - k * 0.06;
          const v = base + k;
          if (tau < 0) continue;
          const e = 1 - (1 - tau / L) * (1 - tau / L);
          pos[v * 3] = bx + (cx - bx) * e + Math.sin(tau * 23) * 0.04;
          pos[v * 3 + 1] = 0.1 + (cy - 0.1) * e;
          pos[v * 3 + 2] = bz + (cz - bz) * e;
          col[v * 3] = 1;
          col[v * 3 + 1] = 0.85;
          col[v * 3 + 2] = 0.6;
          alpha[v] = 0.9 - k * 0.3;
          size[v] = 0.3 - k * 0.06;
        }
        continue;
      }
      const te = age - L;
      if (te > K.life) {
        buf.active[i] = 0;
        for (let v = 0; v < PER * TRAIL; v++) alpha[base + v] = 0;
        continue;
      }
      const fade = Math.pow(1 - te / K.life, 1.6);
      const white = Math.max(0, 1 - te * 5);
      const flash = 1 + 1.3 * Math.max(0, 1 - te * 6);
      const late = te / K.life > 0.55;
      for (let p = 0; p < PER; p++) {
        const o = (i * PER + p) * 3;
        const dx = dirs[o];
        const dy = dirs[o + 1];
        const dz = dirs[o + 2];
        const src = p % 2 ? buf.cb : buf.ca;
        const r = src[i * 3] + (1 - src[i * 3]) * white;
        const g = src[i * 3 + 1] + (1 - src[i * 3 + 1]) * white;
        const b = src[i * 3 + 2] + (1 - src[i * 3 + 2]) * white;
        const twinkle = late ? 0.55 + 0.45 * Math.sin(p * 12.9 + te * 28) : 1;
        for (let k = 0; k < TRAIL; k++) {
          const v = base + p * TRAIL + k;
          const tau = te - k * TRAIL_DT;
          if (tau < 0) {
            alpha[v] = 0;
            continue;
          }
          const f = ((1 - Math.exp(-K.drag * tau)) / K.drag) * K.speed;
          pos[v * 3] = cx + dx * f;
          pos[v * 3 + 1] = cy + dy * f - 0.5 * K.grav * tau * tau;
          pos[v * 3 + 2] = cz + dz * f;
          col[v * 3] = r;
          col[v * 3 + 1] = g;
          col[v * 3 + 2] = b;
          alpha[v] = fade * (k === 0 ? 1 : k === 1 ? 0.45 : 0.2) * Math.max(0.1, twinkle);
          size[v] = (k === 0 ? 0.4 : 0.3) * flash;
        }
      }
    }
    const a = buf.g.attributes;
    a.position.needsUpdate = true;
    a.aColor.needsUpdate = true;
    a.aAlpha.needsUpdate = true;
    a.aSize.needsUpdate = true;
  });

  return <points ref={pts} geometry={buf.g} material={buf.mat} frustumCulled={false} visible={false} />;
}
