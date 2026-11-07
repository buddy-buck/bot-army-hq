import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { heightAtNdc } from '../world/sky/view.js';
import { skyFx } from '../world/sky/fx.js';

// Dynamic sky: gradient dome, stars at night, drifting low-poly clouds, and
// the scene's lights and fog, all from Duvall time. The sun and moon live in
// SkyClock.jsx, where they double as the clock.
// At night a buck constellation hides low in the northern sky.

const DOME_RADIUS = 170;

// The dome: a soft gradient from horizon to top, a warm glow band on the
// horizon that gathers around the sun at sunrise and sunset (with a pink
// "belt" opposite it), and a gentle halo near the sun or moon. The sun and
// moon themselves are drawn by SkyClock, so the halo stays soft and wide.
const domeVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const domeFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform float uGlowK;
  uniform vec3 uSunDir;
  uniform vec3 uHaloCol;
  uniform float uHaloK;
  uniform vec3 uFog;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
    // Melt into the fogged far ocean right at the horizon, so there's no seam.
    col = mix(uFog, col, smoothstep(0.0, 0.16, h));

    // Glow band on the horizon, strongest toward the sun.
    vec2 flat2 = normalize(d.xz + 1e-5);
    vec2 sun2 = normalize(uSunDir.xz + 1e-5);
    float toward = dot(flat2, sun2) * 0.5 + 0.5;
    float band = exp(-h * 5.5);
    float glow = band * (0.25 + 0.75 * pow(toward, 2.5)) * uGlowK;
    col = mix(col, uGlow, clamp(glow * 0.75, 0.0, 0.62));
    // A faint rosy belt on the far side (the Belt of Venus).
    float belt = exp(-abs(h - 0.12) * 14.0) * pow(1.0 - toward, 3.0) * uGlowK * 0.22;
    col = mix(col, vec3(1.0, 0.62, 0.72), belt);

    // Soft halo around the sun (or moon).
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uHaloCol * (pow(s, 7.0) * 0.28 + pow(s, 40.0) * 0.35) * uHaloK;

    // Tiny dither so the gradient never bands.
    float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const EASE = 1.6; // how fast sky colors ease toward a new palette (per second)

function SkyDome({ sky, animate }) {
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color(sky.top) },
      uHorizon: { value: new THREE.Color(sky.horizon) },
      uGlow: { value: new THREE.Color(sky.glow || sky.horizon) },
      uGlowK: { value: sky.glowK || 0 },
      uSunDir: { value: new THREE.Vector3(...sky.sunDir) },
      uHaloCol: { value: new THREE.Color('#ffffff') },
      uHaloK: { value: 0 },
      uFog: { value: new THREE.Color(sky.fog) },
    }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const target = useMemo(() => ({ fog: new THREE.Color(), top: new THREE.Color(), horizon: new THREE.Color(), glow: new THREE.Color(), halo: new THREE.Color(), glowK: 0, haloK: 0 }), []);
  const { scene, invalidate } = useThree();

  useEffect(() => {
    target.top.set(sky.top);
    target.fog.set(sky.fog);
    target.horizon.set(sky.horizon);
    target.glow.set(sky.glow || sky.horizon);
    target.glowK = sky.glowK || 0;
    // Halo follows the sun by day and the moon by night.
    const useSun = sky.sunDir[1] > -0.08;
    uniforms.uSunDir.value.fromArray(useSun ? sky.sunDir : sky.moonDir);
    target.halo.set(useSun ? sky.sun : '#c8d4ff');
    target.haloK = useSun ? 0.45 + 0.6 * (sky.glowK || 0) : 0.35 * sky.stars;
    if (!animate) {
      uniforms.uTop.value.copy(target.top);
      uniforms.uHorizon.value.copy(target.horizon);
      uniforms.uGlow.value.copy(target.glow);
      uniforms.uGlowK.value = target.glowK;
      uniforms.uHaloCol.value.copy(target.halo);
      uniforms.uHaloK.value = target.haloK;
      uniforms.uFog.value.copy(target.fog);
      if (scene.fog) scene.fog.color.copy(target.fog);
      if (scene.background?.isColor) scene.background.copy(target.horizon);
      invalidate();
    }
  }, [sky, animate, target, uniforms, invalidate, scene]);

  useFrame((_, dt) => {
    if (!animate) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * EASE);
    uniforms.uTop.value.lerp(target.top, k);
    uniforms.uHorizon.value.lerp(target.horizon, k);
    uniforms.uGlow.value.lerp(target.glow, k);
    uniforms.uHaloCol.value.lerp(target.halo, k);
    uniforms.uGlowK.value += (target.glowK - uniforms.uGlowK.value) * k;
    uniforms.uHaloK.value += (target.haloK - uniforms.uHaloK.value) * k;
    if (scene.background?.isColor) scene.background.copy(uniforms.uHorizon.value);
    uniforms.uFog.value.lerp(target.fog, k);
    if (scene.fog) scene.fog.color.copy(uniforms.uFog.value);
  });

  return (
    <mesh renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[DOME_RADIUS, 48, 24]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={domeVertex}
        fragmentShader={domeFragment}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

function Stars({ opacity, animate }) {
  const ref = useRef();
  const geometry = useMemo(() => {
    const n = 420;
    const pos = new Float32Array(n * 3);
    let seed = 1234;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const y = 0.12 + rnd() * 0.88;
      const r = Math.sqrt(1 - y * y);
      const R = DOME_RADIUS * 0.92;
      pos[i * 3] = Math.cos(a) * r * R;
      pos[i * 3 + 1] = y * R;
      pos[i * 3 + 2] = Math.sin(a) * r * R;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((state) => {
    if (!ref.current) return;
    const shimmer = animate ? 0.88 + 0.12 * Math.sin(state.clock.elapsedTime * 0.7) : 1;
    ref.current.material.opacity = opacity * shimmer;
    ref.current.visible = opacity > 0.02;
  });
  return (
    <points ref={ref} geometry={geometry} frustumCulled={false} visible={opacity > 0.02}>
      <pointsMaterial color="#ffffff" size={2.2} sizeAttenuation={false} transparent opacity={opacity} depthWrite={false} fog={false} />
    </points>
  );
}

// Easter egg: a buck (deer with antlers) drawn in the stars, low in the
// northern sky. Night only. Tap it and it lights up.
// Points are (u, v) on a small grid; the deer faces left.
const BUCK_STARS = {
  nose: [-2.7, 2.15],
  head: [-1.95, 2.75],
  ear: [-1.5, 2.95],
  antlerBase: [-1.85, 3.1],
  a1: [-2.45, 3.85],
  a2: [-2.15, 4.65],
  a3: [-3.05, 4.3],
  a4: [-1.35, 3.85],
  a5: [-0.95, 4.6],
  a6: [-0.55, 3.75],
  chest: [-1.7, 1.15],
  shoulder: [-0.95, 1.75],
  back: [1.55, 1.6],
  rump: [2.45, 1.25],
  tail: [2.9, 1.7],
  belly: [-0.85, 0.55],
  flank: [1.85, 0.55],
  frontHoof: [-1.05, -1.25],
  frontHoof2: [-0.45, -1.2],
  backHoof: [1.75, -1.25],
  backHoof2: [2.4, -1.15],
};
const BUCK_LINES = [
  ['nose', 'head'], ['head', 'ear'], ['head', 'antlerBase'],
  ['antlerBase', 'a1'], ['a1', 'a2'], ['a1', 'a3'],
  ['antlerBase', 'a4'], ['a4', 'a5'], ['a4', 'a6'],
  ['nose', 'chest'], ['ear', 'shoulder'], ['shoulder', 'back'], ['back', 'rump'], ['rump', 'tail'],
  ['chest', 'belly'], ['belly', 'flank'], ['flank', 'rump'],
  ['belly', 'frontHoof'], ['belly', 'frontHoof2'], ['flank', 'backHoof'], ['flank', 'backHoof2'],
];
const BUCK = { scale: 3.9, base: 5, dist: 150, turn: 0.5 }; // low in the sky, north-west, beside the tower

function buckPoint([u, v]) {
  return [u * BUCK.scale, BUCK.base + (v + 1.3) * BUCK.scale, -BUCK.dist];
}

function BuckConstellation({ visible, animate, onTap }) {
  const lineMat = useRef();
  const starMat = useRef();
  const glowStart = useRef(-100);
  const { invalidate, clock } = useThree();
  const { starGeo, lineGeo, hitPos, hitSize } = useMemo(() => {
    const names = Object.keys(BUCK_STARS);
    const pts = names.map((n) => buckPoint(BUCK_STARS[n]));
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    const lp = [];
    for (const [a, b] of BUCK_LINES) lp.push(...buckPoint(BUCK_STARS[a]), ...buckPoint(BUCK_STARS[b]));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const pad = 4;
    return {
      starGeo: sg,
      lineGeo: lg,
      hitPos: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, -BUCK.dist + 0.5],
      hitSize: [Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2],
    };
  }, []);

  useFrame((state) => {
    if (!lineMat.current || !starMat.current) return;
    const k = (state.clock.elapsedTime - glowStart.current) / 3.5;
    const glow = k >= 0 && k < 1 ? Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - k) : 0;
    const twinkle = animate ? 0.9 + 0.1 * Math.sin(state.clock.elapsedTime * 1.3) : 1;
    lineMat.current.opacity = (0.2 + glow * 0.75) * twinkle;
    starMat.current.size = 3.4 + glow * 4;
    starMat.current.color.set(glow > 0.05 ? '#ffffff' : '#e4ecff');
    if (glow > 0) invalidate();
  });

  if (!visible) return null;
  return (
    <group rotation={[0, BUCK.turn, 0]}>
      <lineSegments geometry={lineGeo} frustumCulled={false}>
        <lineBasicMaterial ref={lineMat} color="#cfe0ff" transparent opacity={0.2} depthWrite={false} fog={false} />
      </lineSegments>
      <points geometry={starGeo} frustumCulled={false}>
        <pointsMaterial ref={starMat} color="#e4ecff" size={3.4} sizeAttenuation={false} transparent depthWrite={false} fog={false} />
      </points>
      <mesh
        position={hitPos}
        onClick={(e) => {
          e.stopPropagation();
          glowStart.current = clock.elapsedTime;
          invalidate();
          onTap?.();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        <planeGeometry args={hitSize} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} fog={false} />
      </mesh>
    </group>
  );
}

// --- Clouds -------------------------------------------------------------------
// One instanced mesh of faceted puffs: plain cumulus plus a few clouds shaped
// like little bots (round head, antenna and bulb, a body, stubby arms; one
// waves). Tops take sky.cloud; undersides are cooler by day and pick up the
// sunrise/sunset glow, and the side facing the sun gets a warm rim.

// Cumulus: [x, y, z, sx, sy, sz] puffs in cloud space.
const CUMULUS = [
  [0, 0, 0, 2.2, 1.2, 1.6], [1.9, -0.2, 0.3, 1.6, 1.0, 1.3], [-1.8, -0.3, -0.2, 1.5, 0.9, 1.2], [0.4, 0.7, 0, 1.3, 1.0, 1.1],
];
const CUMULUS_B = [
  [0, 0, 0, 1.8, 1.1, 1.4], [1.6, 0.25, 0.2, 1.3, 1.1, 1.1], [3.0, -0.2, 0, 1.3, 0.8, 1.0], [-1.5, -0.25, 0.1, 1.2, 0.8, 1.0], [0.9, 0.95, -0.1, 1.0, 0.8, 0.9],
];
// Bot cloud, facing +z. The last two puffs (eyes) and the bulb are tinted.
const BOT_CLOUD = [
  // body and a puffy base
  [0, 0, 0, 1.55, 1.15, 1.25], [0.85, -0.75, 0.1, 0.95, 0.6, 0.85], [-0.85, -0.75, 0.1, 0.95, 0.6, 0.85],
  // head
  [0, 1.75, 0, 1.35, 1.15, 1.2], [0.75, 1.6, 0, 0.8, 0.75, 0.8], [-0.75, 1.6, 0, 0.8, 0.75, 0.8],
  // antenna stalk
  [0, 3.05, 0, 0.13, 0.55, 0.13],
];
const BOT_BULB = [0, 3.7, 0, 0.36, 0.36, 0.36];
const BOT_EYES = [[0.45, 1.85, 1.05, 0.17, 0.22, 0.1], [-0.45, 1.85, 1.05, 0.17, 0.22, 0.1]];
const BOT_ARM = [1.05, 0, 0, 0.95, 0.42, 0.42]; // offset from the shoulder, along +x

// a: angle around the island, r: distance, y: height, s: size, kind.
// Low clouds float just past the island's shore; the camera looks down on
// the island, so these are the ones usually in view. Their height follows the
// view (ndc: where on screen they sit), so they hang over the far sea. As one
// drifts round toward the camera it melts away, and it puffs back up once
// it's on the far side again.
const CLOUD_DEFS = [
  { a: 0.6, r: 31, y: 8, s: 1.0, kind: 'bot', wave: true, low: true, ndc: 0.72 },
  { a: 1.85, r: 35, y: 8, s: 1.2, kind: 'c', low: true, ndc: 0.8 },
  { a: 3.1, r: 30, y: 8, s: 0.95, kind: 'b', low: true, ndc: 0.7 },
  { a: 4.3, r: 33, y: 8, s: 1.0, kind: 'bot', low: true, ndc: 0.74 },
  { a: 5.5, r: 36, y: 8, s: 1.25, kind: 'c', low: true, ndc: 0.82 },
  // High clouds, seen when the camera tilts up.
  { a: 0.3, r: 92, y: 30, s: 2.6, kind: 'c' },
  { a: 1.1, r: 104, y: 38, s: 2.2, kind: 'bot', wave: true },
  { a: 1.75, r: 100, y: 35, s: 3.0, kind: 'b' },
  { a: 2.4, r: 86, y: 28, s: 2.2, kind: 'c' },
  { a: 3.05, r: 108, y: 41, s: 2.0, kind: 'bot' },
  { a: 3.6, r: 96, y: 34, s: 2.9, kind: 'c' },
  { a: 4.35, r: 90, y: 30, s: 2.6, kind: 'b' },
  { a: 5.0, r: 106, y: 39, s: 2.1, kind: 'bot', wave: true },
  { a: 5.55, r: 100, y: 37, s: 3.2, kind: 'c' },
];

const cloudVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vTint;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vN = normalize(mat3(m) * normal);
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #else
      vTint = vec3(1.0);
    #endif
    gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
  }
`;
const cloudFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uUnder;
  uniform vec3 uRim;
  uniform vec3 uSunDir;
  uniform vec3 uHaze;
  varying vec3 vN;
  varying vec3 vTint;
  void main() {
    vec3 n = normalize(vN);
    float up = n.y * 0.5 + 0.5;
    vec3 col = mix(uUnder, uTop, smoothstep(0.15, 0.85, up));
    float facing = max(dot(n, normalize(uSunDir)), 0.0);
    col += uRim * pow(facing, 2.0) * 0.35;
    col *= vTint;
    col = mix(col, uHaze, 0.12);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function puffMatrix(out, [x, y, z, sx, sy, sz], rotZ = 0) {
  _e.set(0, 0, rotZ);
  _q.setFromEuler(_e);
  return out.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// Builds every puff once. Returns the instance list and where the waving arms are.
function buildClouds() {
  const items = []; // { cloud: Matrix4, puff: Matrix4, tint }
  const wavers = []; // { index, cloud, side }
  const lows = []; // { def, cloud, from, to, y }
  const white = '#ffffff';
  for (const d of CLOUD_DEFS) {
    const from = items.length;
    const cloud = new THREE.Matrix4();
    const pos = new THREE.Vector3(Math.cos(d.a) * d.r, d.y, Math.sin(d.a) * d.r);
    // Face the island (local +z toward the center), so bot faces look in.
    const yaw = Math.atan2(-pos.x, -pos.z);
    cloud.compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(d.s, d.s, d.s));
    const add = (p, tint = white, rotZ = 0) => items.push({ cloud, puff: puffMatrix(new THREE.Matrix4(), p, rotZ), tint });
    if (d.kind === 'bot') {
      BOT_CLOUD.forEach((p) => add(p));
      add(BOT_BULB, '#fff0b0');
      BOT_EYES.forEach((p) => add(p, '#8d9bb8'));
      // Arms hang out from the shoulders; the waving one is posed every frame.
      for (const side of [1, -1]) {
        const raised = d.wave && side === 1;
        const rot = side === 1 ? (raised ? 1.1 : -0.5) : Math.PI + 0.5;
        const sh = new THREE.Matrix4().makeTranslation(side * 1.25, 0.25, 0);
        const arm = new THREE.Matrix4().makeRotationZ(rot).multiply(puffMatrix(new THREE.Matrix4(), BOT_ARM));
        items.push({ cloud, puff: sh.multiply(arm), tint: white });
        if (raised) wavers.push({ index: items.length - 1, cloud, phase: d.a * 3 });
      }
    } else {
      (d.kind === 'b' ? CUMULUS_B : CUMULUS).forEach((p) => add(p));
    }
    if (d.low) lows.push({ def: d, cloud, quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-pos.x, -pos.z), 0)), from, to: items.length, y: null, k: null });
  }
  return { items, wavers, lows };
}

const _w = new THREE.Vector3();
const _w2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function Clouds({ sky, animate }) {
  const group = useRef();
  const mesh = useRef();
  const { camera } = useThree();
  const { items, wavers, lows } = useMemo(buildClouds, []);
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color() },
      uUnder: { value: new THREE.Color() },
      uRim: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uHaze: { value: new THREE.Color() },
    }),
    []
  );
  const material = useMemo(() => new THREE.ShaderMaterial({ uniforms, vertexShader: cloudVertex, fragmentShader: cloudFragment, fog: false }), [uniforms]);
  useEffect(() => () => [geometry, material].forEach((x) => x.dispose()), [geometry, material]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    items.forEach((it, i) => {
      m.setMatrixAt(i, _m.multiplyMatrices(it.cloud, it.puff));
      m.setColorAt(i, _c.set(it.tint));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);

  // Palette: tops are the cloud color; undersides a cooler shade that warms
  // with the sunrise/sunset glow; the sun side gets a warm rim.
  useEffect(() => {
    const k = sky.glowK || 0;
    uniforms.uTop.value.set(sky.cloud);
    uniforms.uUnder.value.set(sky.cloud).multiplyScalar(sky.isNight ? 0.72 : 0.8).lerp(_c.set('#b8c8e8'), sky.isNight ? 0 : 0.12 * (1 - k));
    uniforms.uUnder.value.lerp(_c.set(sky.glow || sky.cloud), k * 0.7);
    uniforms.uRim.value.set(sky.sunUp ? sky.sun : '#7080b0').multiplyScalar(sky.sunUp ? 0.6 + 0.6 * k : 0.25);
    uniforms.uSunDir.value.fromArray(sky.sunUp ? sky.sunDir : sky.moonDir);
    uniforms.uHaze.value.set(sky.horizon);
  }, [sky, uniforms]);

  useFrame((state, dt) => {
    const g = group.current;
    const m = mesh.current;
    if (!g || !m) return;
    if (animate) g.rotation.y += Math.min(dt, 0.1) * 0.006;
    // Low clouds ease to the height that keeps them in view, and melt away
    // on the camera's side of the island.
    let moved = false;
    _fwd.set(-camera.position.x, 0, -camera.position.z).normalize();
    for (const L of lows) {
      _w.set(Math.cos(L.def.a) * L.def.r, 0, Math.sin(L.def.a) * L.def.r);
      _w2.copy(_w).applyAxisAngle(UP, g.rotation.y);
      const wantY = Math.min(14, Math.max(4, heightAtNdc(camera, _w2.x, _w2.z, L.def.ndc, L.def.y) - 0.8 * L.def.s));
      const hd = (_w2.x - camera.position.x) * _fwd.x + (_w2.z - camera.position.z) * _fwd.z;
      const wantK = THREE.MathUtils.smoothstep(hd, 40, 54);
      const ease = !animate || L.y === null ? 1 : Math.min(1, dt * 0.5);
      const y = L.y === null ? wantY : L.y + (wantY - L.y) * ease;
      const k = L.k === null ? wantK : L.k + (wantK - L.k) * ease;
      if (L.y !== null && Math.abs(y - L.y) < 0.002 && Math.abs(k - L.k) < 0.001) continue;
      L.y = y;
      L.k = k;
      L.cloud.compose(_p.set(_w.x, y, _w.z), L.quat, _s.setScalar(Math.max(0.0001, L.def.s * k)));
      for (let i = L.from; i < L.to; i++) m.setMatrixAt(i, _m.multiplyMatrices(L.cloud, items[i].puff));
      moved = true;
    }
    if (!animate) {
      if (moved) m.instanceMatrix.needsUpdate = true;
      return;
    }
    // Wave hello: the raised arm swings back and forth.
    const t = state.clock.elapsedTime;
    for (const w of wavers) {
      const rot = 1.15 + 0.45 * Math.sin(t * 1.6 + w.phase);
      _m2.makeTranslation(1.25, 0.25, 0).multiply(_m.makeRotationZ(rot)).multiply(puffMatrix(_m, BOT_ARM));
      mesh.current.setMatrixAt(w.index, _m.multiplyMatrices(w.cloud, _m2));
    }
    if (wavers.length || moved) m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[geometry, material, items.length]} frustumCulled={false} />
    </group>
  );
}

// The ambient light also carries the sky show's glow: a soft teal while the
// northern lights are up, and a brief wash of color when a firework bursts.
const AURORA_TINT = new THREE.Color('#5fffc0');
function Lights({ sky }) {
  const dir = useRef();
  const amb = useRef();
  const pos = useMemo(() => new THREE.Vector3(...sky.lightDir).multiplyScalar(40), [sky.lightDir]);
  const base = useMemo(() => ({ color: new THREE.Color(), i: 0 }), []);
  useEffect(() => {
    base.color.set(sky.isNight ? '#8090ff' : '#ffffff');
    base.i = sky.isNight ? 0.25 : 0.15;
  }, [sky.isNight, base]);
  useFrame(() => {
    const a = amb.current;
    if (!a) return;
    const au = skyFx.aurora;
    const fl = skyFx.flash;
    a.color.copy(base.color).lerp(AURORA_TINT, au * 0.6);
    if (fl > 0.01) a.color.lerp(_c.setRGB(skyFx.flashColor[0], skyFx.flashColor[1], skyFx.flashColor[2]), fl * 0.7);
    a.intensity = base.i + au * 0.25 + fl * 0.45;
  });
  return (
    <>
      <hemisphereLight args={[sky.hemiSky, sky.hemiGround, sky.hemiI]} color={sky.hemiSky} groundColor={sky.hemiGround} intensity={sky.hemiI} />
      <directionalLight ref={dir} position={pos} color={sky.sun} intensity={sky.sunI} />
      <ambientLight ref={amb} intensity={sky.isNight ? 0.25 : 0.15} color={sky.isNight ? '#8090ff' : '#ffffff'} />
    </>
  );
}

// Fog starts past the island's far side (the camera sits 40-60 units out),
// so the island stays crisp, and has fully swallowed the far ocean well
// before its edge. The dome's horizon melts into the same fog color.
const FOG_NEAR = 80;
const FOG_FAR = 280;

export default function Sky({ sky, animate = true, useFog = true, onBuck }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = new THREE.Color(sky.horizon);
    scene.fog = useFog ? new THREE.Fog(sky.fog, FOG_NEAR, FOG_FAR) : null;
    return () => {
      scene.fog = null;
    };
  }, [scene, useFog]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <SkyDome sky={sky} animate={animate} />
      <Stars opacity={sky.stars} animate={animate} />
      <BuckConstellation visible={sky.isNight && sky.stars > 0.5} animate={animate} onTap={onBuck} />
      <Clouds sky={sky} animate={animate} />
      <Lights sky={sky} />
    </>
  );
}
