import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ZONES } from '../utils/paths.js';

// Weather events: short, 5 seconds, then clear. Only one plays at a time;
// extra requests wait their turn (at most 3 waiting, no repeats in a row).
//   storm  : a thundercloud over Launch's Pier (feed item with type "shipped")
//   rainbow: a rainbow over the island (feed item with type "fantasy_win")
//   double : a double rainbow (minutes saved crossing a round thousand)
// ?weather=test cycles through all three. Nothing plays by default.
// The Rainbow is exported too: the sky show uses it for a rare, longer
// rainbow after a passing shower.

export const WEATHER_SECONDS = 5;
const GAP_MS = 1200;
const KINDS = ['storm', 'rainbow', 'double'];

export function useWeather({ enabled = true, test = false } = {}) {
  const [weather, setWeather] = useState(null);
  const queue = useRef([]);
  const busy = useRef(false);
  const timers = useRef([]);

  const pump = useCallback(() => {
    if (busy.current || !queue.current.length) return;
    busy.current = true;
    const kind = queue.current.shift();
    setWeather({ kind, id: Date.now() + Math.random() });
    timers.current.push(
      setTimeout(() => {
        setWeather(null);
        timers.current.push(
          setTimeout(() => {
            busy.current = false;
            pump();
          }, GAP_MS)
        );
      }, WEATHER_SECONDS * 1000)
    );
  }, []);

  const request = useCallback(
    (kind) => {
      if (!enabled || !KINDS.includes(kind)) return;
      const q = queue.current;
      if (q.length >= 3 || q[q.length - 1] === kind) return;
      q.push(kind);
      pump();
    },
    [enabled, pump]
  );

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Test mode: cycle storm, rainbow, double rainbow.
  useEffect(() => {
    if (!test || !enabled) return undefined;
    let i = 0;
    const next = () => {
      if (!busy.current && !queue.current.length) request(KINDS[i++ % KINDS.length]);
    };
    const first = setTimeout(next, 2500);
    const id = setInterval(next, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [test, enabled, request]);

  return [weather, request];
}

// 0 -> 1 -> 0 over the event, with soft edges.
function envelope(t, duration = WEATHER_SECONDS, fadeIn = 0.6, fadeOut = 0.9) {
  if (t < 0 || t > duration) return 0;
  let k = 1;
  if (t < fadeIn) k = t / fadeIn;
  else if (t > duration - fadeOut) k = (duration - t) / fadeOut;
  return k * k * (3 - 2 * k);
}

// --- Thunderstorm over the pier ----------------------------------------------

const DROPS = 140;
const PUFF = new THREE.IcosahedronGeometry(1, 0);

function Storm() {
  const dock = ZONES.dock;
  const cx = dock.x - 0.5;
  const cz = dock.z;
  const top = 6.2;
  const start = useRef(null);
  const cloud = useRef();
  const rain = useRef();
  const bolt = useRef();
  const flash = useRef();
  const cloudMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#4a5263', flatShading: true, transparent: true, opacity: 0 }), []);
  const rainMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#cfe3ff', transparent: true, opacity: 0 }), []);
  const boltMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fffbe0', transparent: true, opacity: 0, depthWrite: false, fog: false }), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#dfe8ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), []);

  const drops = useMemo(() => {
    const seeds = [];
    for (let i = 0; i < DROPS; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 2.8;
      seeds.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r * 0.7, phase: Math.random(), speed: 7 + Math.random() * 3 });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(DROPS * 6), 3));
    return { seeds, g };
  }, [cx, cz]);

  // Jagged bolt from the cloud to the water, as a flat ribbon.
  const boltGeo = useMemo(() => {
    const pts = [];
    let x = cx + 0.4;
    let z = cz + 0.2;
    for (let y = top - 0.6; y > 0.1; y -= 0.7) {
      pts.push(new THREE.Vector3(x, y, z));
      x += (Math.random() - 0.5) * 0.8;
      z += (Math.random() - 0.5) * 0.3;
    }
    pts.push(new THREE.Vector3(x, 0.05, z));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), 24, 0.07, 3, false);
  }, [cx, cz]);

  useEffect(() => () => [cloudMat, rainMat, boltMat, flashMat, drops.g, boltGeo].forEach((x) => x.dispose()), [cloudMat, rainMat, boltMat, flashMat, drops, boltGeo]);

  useFrame((state) => {
    const now = performance.now() / 1000;
    if (start.current === null) start.current = now;
    const t = now - start.current;
    const e = envelope(t);
    cloudMat.opacity = 0.92 * e;
    rainMat.opacity = 0.55 * e;
    if (cloud.current) cloud.current.position.x = Math.sin(t * 0.6) * 0.15;

    const pos = drops.g.attributes.position;
    for (let i = 0; i < DROPS; i++) {
      const d = drops.seeds[i];
      const y = top - 0.6 - (((t * d.speed) / 6 + d.phase) % 1) * (top - 0.6);
      pos.setXYZ(i * 2, d.x, y, d.z);
      pos.setXYZ(i * 2 + 1, d.x + 0.04, y - 0.38, d.z);
    }
    pos.needsUpdate = true;

    // Two lightning strikes.
    const strike = (at) => (t > at && t < at + 0.16 ? 1 : t > at + 0.22 && t < at + 0.3 ? 0.6 : 0);
    const s = Math.max(strike(1.3), strike(3.1)) * e;
    boltMat.opacity = s;
    flashMat.opacity = s * 0.35;
  });

  const puffs = [
    [0, 0, 0, 1.6], [1.4, -0.2, 0.3, 1.25], [-1.4, -0.15, -0.2, 1.3], [0.6, 0.5, -0.4, 1.1], [-0.7, 0.45, 0.5, 1.0], [2.3, -0.35, -0.3, 0.9], [-2.2, -0.3, 0.4, 0.9],
  ];
  return (
    <group>
      <group ref={cloud} position={[cx, top, cz]}>
        {puffs.map(([x, y, z, s], i) => (
          <mesh key={i} geometry={PUFF} material={cloudMat} position={[x, y, z]} scale={[s * 1.2, s * 0.75, s]} />
        ))}
      </group>
      <lineSegments geometry={drops.g} material={rainMat} frustumCulled={false} />
      <mesh ref={bolt} geometry={boltGeo} material={boltMat} />
      <mesh ref={flash} position={[cx, top - 1.5, cz]} material={flashMat}>
        <sphereGeometry args={[5, 12, 8]} />
      </mesh>
    </group>
  );
}

// --- Rainbows ------------------------------------------------------------------
// A soft arc framing the island, opposite the viewer (as real rainbows are),
// so it turns with the camera. Its legs stand in the sea off either side of
// the island; the camera looks down at the island, so the bow leans back
// over the far sea just enough that its top stays in view (upright when the
// camera looks level). One shader draws the bands with soft edges,
// the faint bright haze inside the bow, and legs that fade into the sea.
// The double variant adds the dimmer outer bow with its colors reversed.

const BOW_R = 25; // primary radius
const BOW_W = 3.4; // primary band width (wide: the bow is seen leaning back)
const BOW_BACK = 4; // distance behind the island center
const BOW_Y = -1.5; // arc center, a little under the sea so the legs dip in
const BOW_TOP = 0.9; // where the top of the outer bow may reach on screen (-1..1)
const _apex = new THREE.Vector3();

const bowVertex = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const bowFragment = /* glsl */ `
  uniform float uR0;
  uniform float uR1;
  uniform float uK;
  uniform float uReverse;
  uniform float uHaze;
  varying vec2 vP;
  vec3 hue(float h) {
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }
  void main() {
    float r = length(vP);
    float s = (r - uR0) / (uR1 - uR0); // 0 inner edge, 1 outer edge
    float t = mix(s, 1.0 - s, uReverse);
    vec3 col = mix(hue(mix(0.78, 0.0, t)), vec3(1.0), 0.18);
    float band = smoothstep(0.0, 0.22, s) * (1.0 - smoothstep(0.78, 1.0, s));
    // Faint bright sky just inside the primary bow.
    float inside = step(s, 0.0) * smoothstep(-0.78, 0.0, s);
    float bandA = band * 0.72;
    float hazeA = inside * uHaze;
    float a = bandA + hazeA;
    col = (col * bandA + vec3(1.0, 1.0, 0.96) * hazeA) / max(a, 1e-3);
    // Legs fade into the sea mist.
    float up = vP.y / max(r, 1e-3);
    a *= smoothstep(0.02, 0.32, up);
    gl_FragColor = vec4(col, a * uK);
    #include <colorspace_fragment>
  }
`;

function bowMaterial(r0, r1, reverse, haze) {
  return new THREE.ShaderMaterial({
    uniforms: { uR0: { value: r0 }, uR1: { value: r1 }, uK: { value: 0 }, uReverse: { value: reverse }, uHaze: { value: haze } },
    vertexShader: bowVertex,
    fragmentShader: bowFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
}

export function Rainbow({ double, duration = WEATHER_SECONDS, fadeIn = 0.8, fadeOut = 1.2, strength = 1 }) {
  const { camera, invalidate } = useThree();
  const group = useRef();
  const start = useRef(null);
  const yaw = useRef(null);
  const lean = useRef(null);
  const parts = useMemo(() => {
    const haze = BOW_W * 0.8; // width of the bright haze inside the bow
    const inner = bowMaterial(BOW_R - BOW_W, BOW_R, 0, 0.07);
    const innerGeo = new THREE.RingGeometry(BOW_R - BOW_W - haze, BOW_R + 0.05, 128, 1, 0, Math.PI);
    const R2 = BOW_R * 1.24;
    const W2 = BOW_W * 1.5;
    const outer = double ? bowMaterial(R2, R2 + W2, 1, 0) : null;
    const outerGeo = double ? new THREE.RingGeometry(R2 - 0.05, R2 + W2 + 0.05, 128, 1, 0, Math.PI) : null;
    return { inner, innerGeo, outer, outerGeo };
  }, [double]);
  useEffect(() => () => Object.values(parts).forEach((x) => x?.dispose()), [parts]);

  useFrame(() => {
    const now = performance.now() / 1000;
    if (start.current === null) start.current = now;
    const t = now - start.current;
    const e = envelope(t, duration, fadeIn, fadeOut) * strength;
    parts.inner.uniforms.uK.value = e;
    // The outer bow trails in a little after the first.
    if (parts.outer) parts.outer.uniforms.uK.value = envelope(t - 0.6, duration - 0.6, fadeIn, fadeOut) * strength * 0.5;
    // Stay opposite the viewer, easing as the camera turns.
    const target = Math.atan2(camera.position.x, camera.position.z);
    if (yaw.current === null) yaw.current = target;
    let d = target - yaw.current;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    yaw.current += d * 0.05;
    if (group.current) {
      const sy = Math.sin(yaw.current);
      const cy = Math.cos(yaw.current);
      const x = -sy * BOW_BACK;
      const z = -cy * BOW_BACK;
      // Lean back the least that keeps the top of the bow on screen.
      const R = double ? BOW_R * 1.24 + BOW_W * 1.5 : BOW_R;
      let want = 1.4;
      for (let L = 0; L <= 1.4; L += 0.05) {
        _apex.set(x - sy * R * Math.sin(L), BOW_Y + R * Math.cos(L), z - cy * R * Math.sin(L)).project(camera);
        if (_apex.y <= BOW_TOP) {
          want = L;
          break;
        }
      }
      lean.current = lean.current === null ? want : lean.current + (want - lean.current) * 0.04;
      group.current.rotation.set(-lean.current, yaw.current, 0, 'YXZ');
      group.current.position.set(x, BOW_Y, z);
    }
    if (t < duration) invalidate();
  });

  return (
    <group ref={group}>
      <mesh geometry={parts.innerGeo} material={parts.inner} renderOrder={8} />
      {parts.outer && <mesh geometry={parts.outerGeo} material={parts.outer} renderOrder={7} />}
    </group>
  );
}

export default function Weather({ weather }) {
  if (!weather) return null;
  if (weather.kind === 'storm') return <Storm key={weather.id} />;
  return <Rainbow key={weather.id} double={weather.kind === 'double'} />;
}
