import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rareGap } from '../director.js';
import { isDark, rand } from './common.js';

// Northern lights: now and then on a dark night, green, teal and violet
// curtains ripple low over the northern sky (-z) for a minute or so, then
// fade away. A few curved ribbons with an additive shader.

const FADE_IN = 9;
const FADE_OUT = 12;

const vert = /* glsl */ `
  uniform float uTime;
  uniform float uA0;
  uniform float uA1;
  uniform float uR;
  uniform float uBase;
  uniform float uH;
  uniform float uSeed;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    float ang = mix(uA0, uA1, uv.x);
    float w = sin(uv.x * 9.0 + uTime * 0.35 + uSeed) * 0.6 + sin(uv.x * 23.0 - uTime * 0.6 + uSeed * 2.0) * 0.25;
    float r = uR + w * 7.0;
    float y = uBase + sin(uv.x * 5.0 + uTime * 0.2 + uSeed) * 3.0
      + uv.y * uH * (0.72 + 0.28 * sin(uv.x * 7.0 + uTime * 0.3 + uSeed));
    vec3 p = vec3(sin(ang) * r, y, -cos(ang) * r);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const frag = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uSeed;
  varying vec2 vUv;
  void main() {
    float bottom = smoothstep(0.0, 0.07, vUv.y);
    float up = pow(1.0 - vUv.y, 1.5);
    float x = vUv.x;
    float rays = 0.55 + 0.45 * sin(x * 150.0 + uTime * 1.2 + sin(x * 31.0 + uTime * 0.5 + uSeed) * 3.0);
    rays *= 0.65 + 0.35 * sin(x * 57.0 - uTime * 0.8 + uSeed);
    float edges = smoothstep(0.0, 0.14, x) * smoothstep(1.0, 0.86, x);
    float pulse = 0.75 + 0.25 * sin(uTime * 0.45 + x * 6.0 + uSeed);
    vec3 green = vec3(0.3, 1.0, 0.55);
    vec3 teal = vec3(0.2, 0.85, 0.9);
    vec3 violet = vec3(0.62, 0.38, 1.0);
    vec3 col = mix(green, teal, smoothstep(0.15, 0.5, vUv.y));
    col = mix(col, violet, smoothstep(0.45, 0.95, vUv.y));
    float a = bottom * up * rays * edges * pulse * uFade;
    gl_FragColor = vec4(col * a * 0.85, 1.0);
  }
`;

const RIBBONS = [
  { a0: -1.05, a1: 0.25, r: 138, base: 7, h: 38, seed: 0.0 },
  { a0: -0.35, a1: 0.95, r: 128, base: 10, h: 30, seed: 2.1 },
  { a0: -0.8, a1: 0.55, r: 148, base: 14, h: 44, seed: 4.3 },
];
const GEO = new THREE.PlaneGeometry(1, 1, 120, 1);

export default function Aurora({ sky, lowPower }) {
  const group = useRef();
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const shared = useMemo(() => ({ uTime: { value: 0 }, uFade: { value: 0 } }), []);
  const mats = useMemo(
    () =>
      RIBBONS.slice(0, lowPower ? 2 : 3).map(
        (r) =>
          new THREE.ShaderMaterial({
            uniforms: {
              uTime: shared.uTime,
              uFade: shared.uFade,
              uA0: { value: r.a0 },
              uA1: { value: r.a1 },
              uR: { value: r.r },
              uBase: { value: r.base },
              uH: { value: r.h },
              uSeed: { value: r.seed },
            },
            vertexShader: vert,
            fragmentShader: frag,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            fog: false,
          })
      ),
    [lowPower, shared]
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  const st = useMemo(() => ({ wait: rareGap(300, 600), age: -1, len: 75 }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const g = group.current;
    if (!g) return;
    if (st.age < 0) {
      g.visible = false;
      st.wait -= dt;
      if (st.wait > 0) return;
      st.wait = rareGap(300, 600);
      if (!isDark(skyRef.current)) return;
      st.age = 0;
      st.len = rand(60, 90);
    }
    st.age += dt;
    // Fade out early if dawn comes.
    if (!isDark(skyRef.current) && st.age < st.len - FADE_OUT) st.age = st.len - FADE_OUT;
    if (st.age > st.len) {
      st.age = -1;
      g.visible = false;
      return;
    }
    const fin = Math.min(1, st.age / FADE_IN);
    const fout = Math.min(1, (st.len - st.age) / FADE_OUT);
    shared.uFade.value = fin * fin * (3 - 2 * fin) * fout * fout * (3 - 2 * fout);
    shared.uTime.value += dt;
    g.visible = true;
  });

  return (
    <group ref={group} visible={false}>
      {mats.map((m, i) => (
        <mesh key={i} geometry={GEO} material={m} frustumCulled={false} renderOrder={-6} />
      ))}
    </group>
  );
}
