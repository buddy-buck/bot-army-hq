import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { aliveClock, claimSlot, releaseSlot, testOn } from '../../wild/director.js';
import { cameraYaw, heightAtNdc, isDarkNight, rand, smooth } from './common.js';
import { skyFx } from './fx.js';

// Northern lights, now and then on a dark night: shimmering green-teal
// curtains with violet tops, vertical rays drifting along, folds slowly
// waving. Additive and fog-free so they glow over the far sea.
//
// The default camera looks down on the island, so the curtains hang just
// off the far beach from the viewer (the way north looks from the beach),
// ease around as the camera turns, and stretch to reach the top of the view
// (taller when the camera looks up). Their light spills across the sea below
// them and tints the island's ambient light a little (via skyFx).
//
// About 1 night in 4 gets a show a few minutes in, plus a small chance every
// ~15 minutes of night viewing. Takes the 'sky' slot. ?test=aurora shows it
// right away and often.

const OWNER = 'aurora';
const R = 21; // distance from the island center: just off the far beach
const BASE = 0.5;
const HEIGHT = 10; // starting height; follows the view
const SPREAD = 2.0; // radians the curtain spans

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uR;
  uniform float uH;
  uniform float uPhase;
  varying float vU;
  varying float vV;
  void main() {
    float u = position.x + 0.5;
    float v = position.y + 0.5;
    vU = u;
    vV = v;
    float t = uTime + uPhase;
    float ang = (u - 0.5) * ${SPREAD.toFixed(2)};
    // Folds in the curtain, slowly waving.
    float fold = sin(u * 9.0 + t * 0.22) * 4.0 + sin(u * 23.0 - t * 0.37) * 1.4;
    float r = uR + fold * (0.6 + 0.4 * v);
    float h = uH * (0.82 + 0.18 * sin(u * 6.0 + t * 0.3));
    vec3 p = vec3(sin(ang) * r, ${BASE.toFixed(1)} + v * h, -cos(ang) * r);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uK;
  uniform float uDetail;
  uniform float uPhase;
  varying float vU;
  varying float vV;
  void main() {
    float t = uTime + uPhase;
    // Vertical rays drifting sideways.
    float w = sin(vU * 17.0 + t * 0.5) * 3.0;
    float ray = pow(0.5 + 0.5 * sin(vU * 130.0 + w + t * 0.8), 3.0);
    ray = mix(0.55, 1.0, ray);
    ray *= mix(1.0, 0.65 + 0.35 * sin(vU * 61.0 - t * 1.3), uDetail);
    // Bright lower hem, long soft fade upward.
    float prof = smoothstep(0.0, 0.05, vV) * pow(1.0 - vV, 1.7);
    float hem = smoothstep(0.0, 0.03, vV) * (1.0 - smoothstep(0.03, 0.14, vV));
    vec3 green = vec3(0.25, 1.0, 0.55);
    vec3 teal = vec3(0.15, 0.85, 0.85);
    vec3 violet = vec3(0.62, 0.35, 1.0);
    vec3 col = mix(green, teal, smoothstep(0.12, 0.45, vV));
    col = mix(col, violet, smoothstep(0.45, 0.95, vV));
    float ends = pow(sin(3.14159 * vU), 1.3);
    float shimmer = 0.8 + 0.2 * sin(t * 2.1 + vU * 40.0);
    float a = (prof * ray + hem * 0.6) * ends * shimmer * uK;
    gl_FragColor = vec4(col, a);
  }
`;

// The glow on the sea under the curtains: a fan on the water from the far
// beach outward, brightest near the curtain.
const seaVertex = /* glsl */ `
  varying float vU;
  varying float vV;
  void main() {
    float u = position.x + 0.5;
    float v = position.y + 0.5;
    vU = u;
    vV = v;
    float ang = (u - 0.5) * ${SPREAD.toFixed(2)};
    float r = ${(R - 5).toFixed(1)} + v * 40.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(sin(ang) * r, 0.22, -cos(ang) * r, 1.0);
  }
`;
const seaFragment = /* glsl */ `
  uniform float uTime;
  uniform float uK;
  varying float vU;
  varying float vV;
  void main() {
    float near = smoothstep(0.0, 0.12, vV) * pow(1.0 - vV, 2.2);
    float streak = 0.6 + 0.4 * sin(vU * 90.0 + sin(vU * 13.0 + uTime * 0.5) * 3.0 + uTime * 0.7);
    float ends = pow(sin(3.14159 * vU), 1.5);
    vec3 col = mix(vec3(0.25, 1.0, 0.6), vec3(0.45, 0.4, 1.0), vV * 0.6);
    gl_FragColor = vec4(col, near * streak * ends * uK * 0.35);
  }
`;

export default function Aurora({ ctx }) {
  const { sky, lowPower } = ctx;
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const { camera } = useThree();
  const test = testOn('aurora');
  const clock = useMemo(aliveClock, []);
  const group = useRef();

  const layers = useMemo(() => {
    const defs = lowPower ? [{ r: R, h: HEIGHT, phase: 0, k: 1 }] : [{ r: R, h: HEIGHT, phase: 0, k: 1 }, { r: R + 8, h: HEIGHT * 1.15, phase: 17, k: 0.6 }];
    return defs.map((d) => {
      const geo = new THREE.PlaneGeometry(1, 1, lowPower ? 40 : 110, 1);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uR: { value: d.r }, uH: { value: d.h }, uPhase: { value: d.phase }, uDetail: { value: lowPower ? 0 : 1 } },
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
      return { geo, mat, k: d.k, r: d.r, hk: d.h / HEIGHT };
    });
  }, [lowPower]);
  const sea = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1, lowPower ? 24 : 60, 6);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uK: { value: 0 } },
      vertexShader: seaVertex,
      fragmentShader: seaFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    return { geo, mat };
  }, [lowPower]);
  useEffect(() => () => [...layers.flatMap((l) => [l.geo, l.mat]), sea.geo, sea.mat].forEach((x) => x.dispose()), [layers, sea]);
  useEffect(() => () => {
    releaseSlot('sky', OWNER);
    skyFx.aurora = 0;
  }, []);

  const S = useRef({
    show: null, // { start, dur }
    nightT: 0,
    tonight: Math.random() < 0.25 ? rand(60, 300) : Infinity,
    nextRoll: 900,
    nextTry: test ? 2 : Infinity,
    yaw: null,
  });

  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const dt = Math.min(delta, 0.1);
    const st = S.current;
    const dark = isDarkNight(skyRef.current);
    if (dark) st.nightT += dt;

    if (!st.show) {
      let want = false;
      if (t > st.nextTry) {
        st.nextTry = t + 4;
        want = true;
      }
      if (dark && st.nightT > st.tonight) {
        st.tonight = Infinity;
        want = true;
      }
      if (dark && st.nightT > st.nextRoll) {
        st.nextRoll = st.nightT + 900;
        if (Math.random() < 0.3) want = true;
      }
      const dur = test ? 45 : rand(100, 150);
      if (want && (dark || test) && claimSlot('sky', OWNER, dur + 1)) st.show = { start: t, dur };
      else if (want && !test) st.tonight = st.nightT + 60; // busy: try again in a minute
    }

    const g = group.current;
    if (!g) return;
    if (!st.show) {
      g.visible = false;
      skyFx.aurora = 0;
      return;
    }
    const e = t - st.show.start;
    // Dawn coming: fade out over the next 12 seconds.
    if (!dark && !test && st.show.dur > e + 12) st.show.dur = e + 12;
    const k = smooth(0, 10, e) * (1 - smooth(st.show.dur - 12, st.show.dur, e));
    if (e > st.show.dur) {
      st.show = null;
      if (test) st.nextTry = t + 10;
      releaseSlot('sky', OWNER);
      g.visible = false;
      skyFx.aurora = 0;
      return;
    }
    g.visible = true;
    // Breathe: slow surges of brightness.
    const surge = 0.75 + 0.25 * Math.sin(e * 0.35) * Math.sin(e * 0.13 + 1);
    skyFx.aurora = k * surge;
    sea.mat.uniforms.uTime.value = e;
    sea.mat.uniforms.uK.value = k * surge;
    for (const l of layers) {
      l.mat.uniforms.uTime.value = e;
      l.mat.uniforms.uK.value = k * surge * l.k;
      // Tall enough to reach a little past the top of the view.
      const top = heightAtNdc(camera, -Math.sin(st.yaw ?? 0) * l.r, -Math.cos(st.yaw ?? 0) * l.r, 1.15, HEIGHT);
      const want = Math.min(48, Math.max(6, (top - BASE) * l.hk));
      l.mat.uniforms.uH.value += (want - l.mat.uniforms.uH.value) * Math.min(1, dt * 0.8);
    }
    // Hang on the far side from the camera, easing as it turns.
    const target = cameraYaw(camera);
    if (st.yaw === null) st.yaw = target;
    let d = target - st.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    st.yaw += d * Math.min(1, dt * 0.6);
    g.rotation.y = st.yaw;
  });

  return (
    <group ref={group} visible={false}>
      {layers.map((l, i) => (
        <mesh key={i} geometry={l.geo} material={l.mat} frustumCulled={false} renderOrder={10} />
      ))}
      <mesh geometry={sea.geo} material={sea.mat} frustumCulled={false} renderOrder={9} />
    </group>
  );
}
