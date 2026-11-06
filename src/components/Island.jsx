import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  BUNGALOW_ROT,
  CABANA_DESK_Z,
  CABANA_STATIONS,
  DECKS,
  DOCK,
  PATIO_LOUNGERS,
  TOWER_SEATS,
  FLOWERS,
  HUB_RADIUS,
  ISLAND,
  LOOKOUT_H,
  PALMS,
  ROCKS,
  TOWER_LEG_H,
  ZONES,
  groundY,
  islandE,
  islandWobble,
  ringPoints,
  terrainY,
  zonePathCurve,
} from '../utils/paths.js';
import { labelState } from './labels.js';

// ---------------------------------------------------------------------------
// Shared materials and geometry
// ---------------------------------------------------------------------------

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

const M = {
  wood: std('#a8774a'),
  darkWood: std('#7a5232'),
  plank: std('#c08a57'),
  thatch: std('#dcb468'),
  thatchDark: std('#b98a45'),
  // See-through thatch for the open-air cabana, so the bots inside show.
  thatchSee: std('#e2bd72', { transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
  fringe: std('#c99a52', { side: THREE.DoubleSide }),
  thatchSeeTower: std('#dcb468', { transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  white: std('#fdf8ee'),
  bamboo: std('#d4b872'),
  bambooNode: std('#9c8240'),
  bambooGreen: std('#b9b465'),
  wire: std('#2e2a26'),
  mat: std('#e8d39c'),
  matStripe: std('#c79a5a'),
  stone: std('#9aa3a8'),
  dark: std('#3b3430'),
  lisnGreen: std('#2E5248'),
  lisnOrange: std('#F09024'),
  bbBlue: std('#19469D'),
  bbYellow: std('#FFDE69'),
  chief: std('#D63AF9'),
  nasty: std('#FF4500'),
  launch: std('#2BA84A'),
  research: std('#2BA84A'),
  claude: std('#D97757'),
  claudeSoft: std('#f2c4ae'),
  cash: std('#5fae6e'),
  cashBand: std('#ffffff'),
  shell: std('#ffd6e4'),
  football: std('#8a4b26'),
  coconut: std('#6b4a2a'),
  brass: std('#c9a24a', { roughness: 0.35, metalness: 0.5 }),
  porthole: std('#2c4a6e', { roughness: 0.3 }),
  glass: std('#bfe8ff', { transparent: true, opacity: 0.55, roughness: 0.2 }),
  rope: std('#d9c79a'),
  floCushion: std('#8fd3c1'),
  screenDTV: new THREE.MeshStandardMaterial({ color: '#FF04A0', emissive: '#FF04A0', emissiveIntensity: 0.7, flatShading: true }),
  screen: new THREE.MeshStandardMaterial({ color: '#bfe8ff', emissive: '#7cc8ff', emissiveIntensity: 0.5, flatShading: true }),
};

const PYRAMID = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4); // square base, half-extent 0.707
const PYR_K = 1 / Math.SQRT1_2;

function Box({ p, s, m, r }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <boxGeometry args={s} />
    </mesh>
  );
}

function Cyl({ p, rt = 0.06, rb, h, m, seg = 6, r }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <cylinderGeometry args={[rt, rb ?? rt, h, seg]} />
    </mesh>
  );
}

function Cone({ p, rad, h, m, seg = 8, r }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <coneGeometry args={[rad, h, seg]} />
    </mesh>
  );
}

// Square-based roof: halfX, halfZ are the half-widths of the base.
function Roof({ p, halfX, halfZ, h, m }) {
  return <mesh position={p} geometry={PYRAMID} material={m} scale={[halfX * PYR_K, h, halfZ * PYR_K]} />;
}

function useGlowMaterial(color, night, base = 0.1, boost = 1.3) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, flatShading: true }), [color, base]);
  useEffect(() => {
    mat.emissiveIntensity = base + night * boost;
  }, [mat, night, base, boost]);
  return mat;
}


// A beam between two points (rafters, bamboo braces).
const UP = new THREE.Vector3(0, 1, 0);
function Beam({ a, b, r = 0.04, m, seg = 5 }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    return {
      pos: va.clone().add(vb).multiplyScalar(0.5).toArray(),
      quat: new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()),
      len: dir.length(),
    };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} material={m}>
      <cylinderGeometry args={[r, r, len, seg]} />
    </mesh>
  );
}

// Bamboo pole: light cane with darker node rings.
function BambooPost({ p, h, r = 0.08, m = M.bamboo }) {
  const nodes = Math.max(2, Math.round(h / 0.55));
  return (
    <group position={p}>
      <Cyl p={[0, h / 2, 0]} rt={r * 0.92} rb={r} h={h} m={m} seg={7} />
      {Array.from({ length: nodes }, (_, i) => (
        <Cyl key={i} p={[0, ((i + 0.6) / (nodes + 0.2)) * h, 0]} rt={r * 1.12} h={0.04} m={M.bambooNode} seg={7} />
      ))}
    </group>
  );
}

// Ragged thatch skirt hanging under a rectangular (or round) eave.
function makeFringe(halfX, halfZ, drop, round = false) {
  const pos = [];
  const pts = [];
  if (round) {
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([Math.cos(a) * halfX, Math.sin(a) * halfZ]);
    }
  } else {
    const c = [[-halfX, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ], [-halfX, -halfZ]];
    for (let k = 0; k < 4; k++) {
      const [x0, z0] = c[k];
      const [x1, z1] = c[k + 1];
      const n = Math.max(4, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.16));
      for (let i = 0; i < n; i++) pts.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
    }
    pts.push(c[4]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const d = drop * (0.7 + 0.6 * hash2(mx * 3.1, mz * 2.7));
    pos.push(ax, 0, az, bx, 0, bz, mx, -d, mz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function Fringe({ p, halfX, halfZ, drop = 0.28, round = false, m = M.fringe }) {
  const geo = useMemo(() => makeFringe(halfX, halfZ, drop, round), [halfX, halfZ, drop, round]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh position={p} geometry={geo} material={m} />;
}

// Festoon string lights: bulbs hung along a sagging wire. They glow warmly
// at night and are just colored glass beads by day.
const BULB_COLORS = ['#ffd27a', '#ff8fb8', '#7fe3d8', '#ffb35c'];
const BULB_GEO = new THREE.IcosahedronGeometry(0.055, 0);
function StringLights({ points, sag = 0.3, per = 7, night }) {
  const mats = [
    useGlowMaterial(BULB_COLORS[0], night, 0.25, 1.8),
    useGlowMaterial(BULB_COLORS[1], night, 0.25, 1.8),
    useGlowMaterial(BULB_COLORS[2], night, 0.25, 1.8),
    useGlowMaterial(BULB_COLORS[3], night, 0.25, 1.8),
  ];
  const { bulbs, wire } = useMemo(() => {
    const bulbs = [];
    const wirePts = [];
    for (let s = 0; s < points.length - 1; s++) {
      const a = new THREE.Vector3(...points[s]);
      const b = new THREE.Vector3(...points[s + 1]);
      const at = (t) => a.clone().lerp(b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0));
      for (let i = 0; i <= 12; i++) if (s === 0 || i > 0) wirePts.push(at(i / 12));
      for (let i = 1; i <= per; i++) bulbs.push(at(i / (per + 1)).add(new THREE.Vector3(0, -0.05, 0)).toArray());
    }
    const curve = new THREE.CatmullRomCurve3(wirePts);
    return { bulbs, wire: new THREE.TubeGeometry(curve, wirePts.length * 2, 0.012, 3, false) };
  }, [points, sag, per]);
  useEffect(() => () => wire.dispose(), [wire]);
  return (
    <group>
      <mesh geometry={wire} material={M.wire} />
      {bulbs.map((b, i) => (
        <mesh key={i} position={b} geometry={BULB_GEO} material={mats[i % mats.length]} />
      ))}
    </group>
  );
}

// Brand screens for the lanai laptops: Buddy Buck RE, Duvall TV, and
// Living In SnoValley. Drawn once to small canvases.
export function brandTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 84;
  const x = c.getContext('2d');
  let text = 'BB';
  let fg = '#FFDE69';
  if (kind === 'bb') {
    x.fillStyle = '#19469D';
    x.fillRect(0, 0, 128, 84);
    x.fillStyle = '#FFDE69';
    x.fillRect(0, 70, 128, 6);
  } else if (kind === 'dtv') {
    x.fillStyle = '#FF04A0';
    x.fillRect(0, 0, 128, 84);
    text = 'DTV';
    fg = '#ffffff';
  } else {
    const gr = x.createLinearGradient(0, 0, 0, 84);
    gr.addColorStop(0, '#f3b624');
    gr.addColorStop(0.5, '#f09024');
    gr.addColorStop(1, '#d74525');
    x.fillStyle = gr;
    x.fillRect(0, 0, 128, 84);
    // a little setting sun
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.beginPath();
    x.arc(64, 84, 30, Math.PI, 0);
    x.fill();
    text = 'LIS';
    fg = '#ffffff';
  }
  x.fillStyle = fg;
  x.font = `900 ${text.length > 2 ? 40 : 50}px "Arial Black", Arial, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = 'rgba(0,0,0,0.3)';
  x.shadowBlur = 4;
  x.fillText(text, 64, 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const BRANDS = ['bb', 'dtv', 'lis'];
const SCREEN_GEO = new THREE.PlaneGeometry(0.38, 0.25);

function useBrandMaterials(night) {
  const mats = useMemo(
    () =>
      BRANDS.map((k) => {
        const map = brandTexture(k);
        return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.6 });
      }),
    []
  );
  useEffect(() => {
    mats.forEach((m) => (m.emissiveIntensity = 0.55 + night * 0.5));
  }, [mats, night]);
  useEffect(() => () => mats.forEach((m) => (m.map.dispose(), m.dispose())), [mats]);
  return mats;
}

// A laptop whose screen shows a brand logo. The logos rotate between the
// laptops every few seconds so all three brands get screen time.
function BrandLaptop({ p, index, mats, animate }) {
  const screen = useRef();
  useFrame((state) => {
    if (!screen.current) return;
    const step = animate ? Math.floor(state.clock.elapsedTime / 8) : 0;
    const m = mats[(index + step) % mats.length];
    if (screen.current.material !== m) screen.current.material = m;
  });
  return (
    <group position={p}>
      <Box p={[0, 0, 0.05]} s={[0.42, 0.03, 0.28]} m={M.dark} />
      <group position={[0, 0.14, -0.1]} rotation={[-0.25, 0, 0]}>
        <Box p={[0, 0, 0]} s={[0.42, 0.28, 0.02]} m={M.dark} />
        <mesh ref={screen} position={[0, 0, 0.0115]} geometry={SCREEN_GEO} material={mats[index % mats.length]} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Ground, water, foam, paths
// ---------------------------------------------------------------------------

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function Terrain({ onTap }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(48, 36, 96, 72);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrainY(pos.getX(i), pos.getZ(i)));
    const ng = g.toNonIndexed();
    g.dispose();
    const p = ng.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    const floor = new THREE.Color('#e3cf98');
    const deep = new THREE.Color('#4fb3b0');
    const grassA = new THREE.Color('#6fbf5c');
    const grassB = new THREE.Color('#8bd172');
    const sandA = new THREE.Color('#f3dea9');
    const sandB = new THREE.Color('#f8e8bd');
    for (let f = 0; f < p.count; f += 3) {
      const cx = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3;
      const cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
      const cz = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
      const e = islandE(cx, cz);
      const j = hash2(cx, cz);
      if (cy < -0.08) {
        c.copy(floor).lerp(deep, Math.min(1, (-cy - 0.08) / 0.6));
      } else if (cy < 0.07) {
        c.set('#e6cd93');
      } else if (e > 0.8) {
        c.copy(sandA).lerp(sandB, j);
      } else {
        c.copy(grassA).lerp(grassB, j);
        if (cy > 1.0) c.lerp(new THREE.Color('#9ad97c'), 0.35);
      }
      for (let k = 0; k < 3; k++) c.toArray(colors, (f + k) * 3);
    }
    ng.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    ng.computeVertexNormals();
    return ng;
  }, []);
  return (
    <mesh geometry={geometry} onClick={onTap}>
      <meshStandardMaterial vertexColors flatShading roughness={0.95} />
    </mesh>
  );
}

// Waves run on the GPU: the vertex shader lifts each vertex, and flat
// shading picks up the new slopes for free. At night a faint bioluminescent
// shimmer glints in the shallows (skipped on low-power devices).
const WAVE_GLSL = /* glsl */ `
  uniform float uTime;
  varying vec2 vXZ;
  float waveY(vec2 p, float t) {
    return 0.07 * sin(p.x * 0.35 + t * 0.8) + 0.05 * cos(p.y * 0.42 + t * 0.63) + 0.03 * sin((p.x + p.y) * 0.9 + t * 1.4);
  }
`;

function Water({ tint, animate, onTap, glow = 0 }) {
  const ref = useRef();
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(170, 170, 84, 84);
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

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uGlow: { value: 0 } }), []);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.82, roughness: 0.3, metalness: 0.05 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uGlow = uniforms.uGlow;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WAVE_GLSL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n  vXZ = position.xz;\n  transformed.y += waveY(position.xz, uTime);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uGlow;\nvarying vec2 vXZ;`)
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
  if (uGlow > 0.0) {
    float d = length(vXZ / vec2(${ISLAND.rx.toFixed(1)}, ${ISLAND.rz.toFixed(1)}));
    float band = smoothstep(0.95, 1.08, d) * (1.0 - smoothstep(1.2, 1.55, d));
    float s = sin(vXZ.x * 4.1 + uTime * 0.9) * sin(vXZ.y * 3.7 - uTime * 0.7) * sin((vXZ.x - vXZ.y) * 2.3 + uTime * 0.5);
    totalEmissiveRadiance += vec3(0.2, 0.85, 1.0) * pow(max(s, 0.0), 12.0) * band * uGlow * 0.9;
  }`
        );
    };
    m.customProgramCacheKey = () => 'island-water-v1';
    return m;
  }, [uniforms]);

  useEffect(() => {
    material.color.set(tint);
  }, [material, tint]);
  useEffect(() => {
    uniforms.uGlow.value = glow;
  }, [uniforms, glow]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    if (animate) uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group>
      <mesh ref={ref} geometry={geometry} material={material} onClick={onTap} renderOrder={1} />
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

function Foam({ animate }) {
  const ref = useRef();
  const geometry = useMemo(() => {
    const n = 160;
    const inner = 0.93;
    const outer = 1.07;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const dx = ISLAND.rx * Math.cos(a);
      const dz = ISLAND.rz * Math.sin(a);
      const w = islandWobble(dx, dz);
      for (const e of [inner, outer]) {
        const s = Math.sqrt(e) * w;
        const x = dx * s;
        const z = dz * s;
        pos.push(x, Math.max(terrainY(x, z), 0) + 0.05, z);
      }
      if (i < n) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, []);
  useFrame((state) => {
    if (!ref.current || !animate) return;
    const t = state.clock.elapsedTime;
    ref.current.material.opacity = 0.42 + 0.18 * Math.sin(t * 0.9);
    const s = 1 + 0.006 * Math.sin(t * 0.9);
    ref.current.scale.set(s, 1, s);
  });
  return (
    <mesh ref={ref} geometry={geometry} renderOrder={2}>
      <meshBasicMaterial color="#ffffff" transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function ribbon(points, width, out) {
  const base = out.pos.length / 3;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const nx = -tz * (width / 2);
    const nz = tx * (width / 2);
    for (const sgn of [1, -1]) {
      const x = points[i].x + nx * sgn;
      const z = points[i].z + nz * sgn;
      out.pos.push(x, groundY(x, z) + 0.06, z);
    }
    if (i < n - 1) {
      const k = base + i * 2;
      out.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
}

function SandPaths() {
  const geometry = useMemo(() => {
    const out = { pos: [], idx: [] };
    for (const key of Object.keys(ZONES)) {
      if (key === 'patio') continue; // shares the cabana's path
      const c = zonePathCurve(key);
      if (c) ribbon(c.getSpacedPoints(28), 0.75, out);
    }
    ribbon(ringPoints(HUB_RADIUS, 80), 0.8, out);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
    g.setIndex(out.idx);
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#f6e3b4" roughness={1} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Palms (instanced), flowers, rocks
// ---------------------------------------------------------------------------

const FRONDS = 7;
const BEND = 0.3;

function makeTrunkGeometry() {
  const g = new THREE.CylinderGeometry(0.09, 0.15, 1, 6, 4);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + BEND * y * y);
  }
  g.computeVertexNormals();
  return g;
}

function makeFrondGeometry() {
  const v = [
    0, 0, 0, // 0 base
    -0.24, 0.8, 0, // 1 left
    0.24, 0.8, 0, // 2 right
    0, 1.7, 0, // 3 tip
    0, 0.8, 0.07, // 4 ridge
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 4, 1, 0, 2, 4, 1, 4, 3, 4, 2, 3]);
  g.computeVertexNormals();
  return g;
}

function Palms({ animate }) {
  const trunkRef = useRef();
  const frondRef = useRef();
  const nutRef = useRef();
  const shadowRef = useRef();
  const trunkGeo = useMemo(makeTrunkGeometry, []);
  const frondGeo = useMemo(makeFrondGeometry, []);
  const nutGeo = useMemo(() => new THREE.IcosahedronGeometry(0.09, 0), []);
  const shadowGeo = useMemo(() => new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), []);

  const palms = useMemo(
    () =>
      PALMS.map((p) => {
        const gy = groundY(p.x, p.z) - 0.05;
        const local = new THREE.Vector3(BEND, p.h, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.tiltDir);
        return { ...p, gy, top: new THREE.Vector3(p.x + local.x, gy + local.y, p.z + local.z), s: p.h / 2.8 };
      }),
    []
  );

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const frondColors = useMemo(() => ['#3f9b4f', '#4fb35a', '#2f8a46', '#5cbf63'].map((c) => new THREE.Color(c)), []);

  useLayoutEffect(() => {
    palms.forEach((p, i) => {
      dummy.position.set(p.x, p.gy, p.z);
      dummy.rotation.set(0, p.tiltDir, 0);
      dummy.scale.set(1, p.h, 1);
      dummy.updateMatrix();
      trunkRef.current.setMatrixAt(i, dummy.matrix);
      trunkRef.current.setColorAt(i, new THREE.Color('#9a6b43').offsetHSL(0, 0, (hash2(p.x, p.z) - 0.5) * 0.08));

      for (let k = 0; k < 3; k++) {
        const a = p.yaw + (k / 3) * Math.PI * 2;
        dummy.position.set(p.top.x + Math.cos(a) * 0.12, p.top.y - 0.08, p.top.z + Math.sin(a) * 0.12);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        nutRef.current.setMatrixAt(i * 3 + k, dummy.matrix);
      }

      dummy.position.set(p.top.x, groundY(p.top.x, p.top.z) + 0.03, p.top.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1.1 * p.s, 1, 1.1 * p.s);
      dummy.updateMatrix();
      shadowRef.current.setMatrixAt(i, dummy.matrix);

      for (let f = 0; f < FRONDS; f++) frondRef.current.setColorAt(i * FRONDS + f, frondColors[(i + f) % frondColors.length]);
    });
    trunkRef.current.instanceMatrix.needsUpdate = true;
    if (trunkRef.current.instanceColor) trunkRef.current.instanceColor.needsUpdate = true;
    nutRef.current.instanceMatrix.needsUpdate = true;
    shadowRef.current.instanceMatrix.needsUpdate = true;
    if (frondRef.current.instanceColor) frondRef.current.instanceColor.needsUpdate = true;
    updateFronds(0);
  }, [palms]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close-up views: palms between the camera and what it's looking at fold
  // their fronds away so they don't block the view.
  const fold = useMemo(() => new Float32Array(palms.length).fill(1), [palms]);
  const controls = useThree((st) => st.controls);
  const seg = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), line: new THREE.Line3(), q: new THREE.Vector3() }), []);

  function updateFolds(camera, dt) {
    const target = controls?.target;
    const close = target && camera.position.distanceTo(target) < 18;
    if (close) {
      seg.line.set(camera.position, target);
    }
    palms.forEach((p, i) => {
      let want = 1;
      if (close) {
        seg.line.closestPointToPoint(p.top, true, seg.q);
        const d = seg.q.distanceTo(p.top);
        const toTarget = p.top.distanceTo(target);
        if (d < 2.4 && toTarget > 1.2) want = 0.15;
      }
      fold[i] += (want - fold[i]) * Math.min(1, dt * 4);
    });
  }

  function updateFronds(t) {
    const mesh = frondRef.current;
    if (!mesh) return;
    palms.forEach((p, i) => {
      for (let f = 0; f < FRONDS; f++) {
        const yaw = p.yaw + (f / FRONDS) * Math.PI * 2 + Math.sin(t * 0.7 + i + f) * 0.035;
        const droop = 0.35 + (f % 2) * 0.18 + Math.sin(t * 0.9 + i * 1.7 + f * 0.6) * 0.05;
        dummy.position.copy(p.top);
        dummy.rotation.set(-Math.PI / 2 - droop * (2 - fold[i]), yaw, 0, 'YXZ');
        dummy.scale.setScalar(p.s * fold[i]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i * FRONDS + f, dummy.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  useFrame((state, delta) => {
    updateFolds(state.camera, animate ? Math.min(delta, 0.1) : 1);
    updateFronds(animate ? state.clock.elapsedTime : 0);
  });

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[trunkGeo, undefined, palms.length]}>
        <meshStandardMaterial flatShading roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={frondRef} args={[frondGeo, undefined, palms.length * FRONDS]}>
        <meshStandardMaterial flatShading roughness={0.8} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={nutRef} args={[nutGeo, M.coconut, palms.length * 3]} />
      <instancedMesh ref={shadowRef} args={[shadowGeo, undefined, palms.length]}>
        <meshBasicMaterial color="#1d3b2a" transparent opacity={0.14} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

function Flowers() {
  const ref = useRef();
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.1, 0), []);
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    FLOWERS.forEach((f, i) => {
      d.position.set(f.x, groundY(f.x, f.z) + 0.08, f.z);
      d.scale.setScalar(f.s);
      d.updateMatrix();
      ref.current.setMatrixAt(i, d.matrix);
      ref.current.setColorAt(i, new THREE.Color(f.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, FLOWERS.length]}>
      <meshStandardMaterial flatShading roughness={0.6} />
    </instancedMesh>
  );
}

function Rocks() {
  const ref = useRef();
  const geo = useMemo(() => new THREE.DodecahedronGeometry(1, 0), []);
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    ROCKS.forEach((r, i) => {
      d.position.set(r.x, Math.max(terrainY(r.x, r.z), -0.3), r.z);
      d.rotation.set(r.rot, r.rot * 2, 0);
      d.scale.set(r.s * 1.3, r.s * 0.7, r.s);
      d.updateMatrix();
      ref.current.setMatrixAt(i, d.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, []);
  return <instancedMesh ref={ref} args={[geo, M.stone, ROCKS.length]} />;
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

function Flag({ p, color, animate, w = 0.6, h = 0.36 }) {
  const ref = useRef();
  useFrame((state) => {
    if (animate && ref.current) ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 2.2) * 0.25;
  });
  return (
    <group position={p}>
      <Cyl p={[0, 0.45, 0]} rt={0.025} h={0.9} m={M.darkWood} />
      <group ref={ref} position={[0, 0.72, 0]}>
        <mesh position={[w / 2, 0, 0]}>
          <boxGeometry args={[w, h, 0.02]} />
          <meshStandardMaterial color={color} flatShading side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

function Lantern({ p, night, color = '#ffcf6b' }) {
  const mat = useGlowMaterial(color, night, 0.15, 1.6);
  return (
    <group position={p}>
      <mesh material={mat}>
        <icosahedronGeometry args={[0.1, 0]} />
      </mesh>
      {night > 0.3 && (
        <mesh>
          <sphereGeometry args={[0.3, 10, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.22 * night} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
    </group>
  );
}

// Chief's Tower: the command center at the island's highest point. Open
// air on every side: bamboo legs, a wide deck, a low rail, and a thatched
// canopy up on tall posts. Two chairs (Chief and Claude), a little table
// with snacks, and a brass telescope pointed out to sea.
function TowerChair({ seat, top, cushion }) {
  return (
    <group position={[seat.x, top, seat.z]} rotation={[0, seat.rotY, 0]}>
      {[[-0.24, -0.2], [0.24, -0.2], [-0.24, 0.2], [0.24, 0.2]].map(([x, z], i) => (
        <Cyl key={i} p={[x, 0.15, z]} rt={0.03} h={0.3} m={M.bamboo} />
      ))}
      <Box p={[0, 0.32, 0]} s={[0.58, 0.06, 0.5]} m={M.bamboo} />
      <Box p={[0, 0.37, 0.02]} s={[0.5, 0.05, 0.42]} m={cushion} />
      <group position={[0, 0.34, -0.24]} rotation={[-0.32, 0, 0]}>
        <Box p={[0, 0.3, 0]} s={[0.58, 0.6, 0.05]} m={M.bamboo} />
        <Box p={[0, 0.3, 0.035]} s={[0.48, 0.5, 0.03]} m={cushion} />
      </group>
      {[-0.3, 0.3].map((x) => (
        <Box key={x} p={[x, 0.5, 0]} s={[0.06, 0.05, 0.46]} m={M.darkWood} />
      ))}
    </group>
  );
}

const TOWER_HALF = 1.55;

function Tower({ night, animate }) {
  const g = terrainY(0, 0);
  const top = g + TOWER_LEG_H;
  const deckTop = top + 0.08;
  const L = TOWER_HALF - 0.15;
  const legs = [[-L, -L], [L, -L], [-L, L], [L, L]];
  const ladderX = 1.0;
  const ladderBottom = terrainY(ladderX, TOWER_HALF + 0.6);
  const ladderLen = Math.hypot(top - ladderBottom, 0.5);
  const ladderTilt = Math.atan2(0.5, top - ladderBottom);
  const rungs = Math.floor(ladderLen / 0.35);
  const postH = 2.05;
  const canopyY = deckTop + postH;
  const braceY0 = g + 0.4;
  const braceY1 = top - 0.25;
  return (
    <group>
      {/* bamboo legs with cross braces */}
      {legs.map(([x, z], i) => (
        <BambooPost key={i} p={[x, g - 0.2, z]} h={TOWER_LEG_H + 0.2} r={0.11} />
      ))}
      {[
        [[-L, braceY0, -L], [L, braceY1, -L]], [[L, braceY0, -L], [-L, braceY1, -L]],
        [[-L, braceY0, L], [L, braceY1, L]], [[L, braceY0, L], [-L, braceY1, L]],
        [[-L, braceY0, -L], [-L, braceY1, L]], [[-L, braceY0, L], [-L, braceY1, -L]],
        [[L, braceY0, -L], [L, braceY1, L]], [[L, braceY0, L], [L, braceY1, -L]],
      ].map(([a, b], i) => (
        <Beam key={`b${i}`} a={a} b={b} r={0.035} m={M.bambooNode} />
      ))}
      {/* deck with plank lines */}
      <Box p={[0, top, 0]} s={[TOWER_HALF * 2, 0.16, TOWER_HALF * 2]} m={M.plank} />
      {[-1.0, -0.33, 0.33, 1.0].map((x) => (
        <Box key={`pl${x}`} p={[x, top + 0.081, 0]} s={[0.03, 0.005, TOWER_HALF * 2 - 0.05]} m={M.darkWood} />
      ))}
      {/* low bamboo rail: open on every side so the chairs show */}
      {[
        [[-TOWER_HALF, deckTop + 0.45, -TOWER_HALF], [TOWER_HALF, deckTop + 0.45, -TOWER_HALF]],
        [[-TOWER_HALF, deckTop + 0.45, -TOWER_HALF], [-TOWER_HALF, deckTop + 0.45, TOWER_HALF]],
        [[TOWER_HALF, deckTop + 0.45, -TOWER_HALF], [TOWER_HALF, deckTop + 0.45, TOWER_HALF]],
        [[-TOWER_HALF, deckTop + 0.45, TOWER_HALF], [ladderX - 0.4, deckTop + 0.45, TOWER_HALF]],
      ].map(([a, b], i) => (
        <Beam key={`r${i}`} a={a} b={b} r={0.03} m={M.bamboo} />
      ))}
      {/* tall corner posts holding the canopy up high */}
      {legs.map(([x, z], i) => (
        <BambooPost key={`cp${i}`} p={[x * 1.07, deckTop, z * 1.07]} h={postH} r={0.07} />
      ))}
      {/* see-through thatch on bamboo rafters, so the chairs show from above too */}
      {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z], i) => (
        <Beam key={`raf${i}`} a={[x * 2.15, canopyY + 0.02, z * 2.15]} b={[0, canopyY + 1.3, 0]} r={0.04} m={M.bambooNode} />
      ))}
      <Roof p={[0, canopyY + 0.65, 0]} halfX={2.2} halfZ={2.2} h={1.3} m={M.thatchSeeTower} />
      <Fringe p={[0, canopyY, 0]} halfX={2.2} halfZ={2.2} drop={0.3} m={M.thatchSeeTower} />
      <Flag p={[0, canopyY + 1.2, 0]} color="#D63AF9" animate={animate} />
      <StringLights
        points={[[-L * 1.07, canopyY - 0.12, L * 1.07], [L * 1.07, canopyY - 0.12, L * 1.07], [L * 1.07, canopyY - 0.12, -L * 1.07], [-L * 1.07, canopyY - 0.12, -L * 1.07], [-L * 1.07, canopyY - 0.12, L * 1.07]]}
        sag={0.2}
        per={5}
        night={night}
      />
      {/* two chairs, a little table between them */}
      <TowerChair seat={TOWER_SEATS[0]} top={deckTop} cushion={M.chief} />
      <TowerChair seat={TOWER_SEATS[1]} top={deckTop} cushion={M.claude} />
      <group position={[0, deckTop, 0.42]}>
        <Cyl p={[0, 0.2, 0]} rt={0.04} h={0.4} m={M.darkWood} />
        <Cyl p={[0, 0.42, 0]} rt={0.26} h={0.05} seg={10} m={M.bamboo} />
        <mesh position={[-0.08, 0.5, 0.02]} material={M.coconut}>
          <icosahedronGeometry args={[0.08, 0]} />
        </mesh>
        <mesh position={[0.09, 0.52, -0.04]} material={M.lisnOrange}>
          <icosahedronGeometry args={[0.07, 0]} />
        </mesh>
      </group>
      {/* brass telescope on a tripod, aimed out to sea */}
      <group position={[1.05, deckTop, -1.0]} rotation={[0, 2.4, 0]}>
        {[0, 2.1, 4.2].map((a, i) => (
          <Cyl key={i} p={[Math.sin(a) * 0.12, 0.3, Math.cos(a) * 0.12]} rt={0.015} h={0.62} m={M.darkWood} r={[Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2]} />
        ))}
        <Cyl p={[0, 0.72, 0.1]} rt={0.045} rb={0.065} h={0.7} m={M.brass} r={[1.25, 0, 0]} />
      </group>
      {/* ladder on the south side */}
      <group position={[ladderX, (top + ladderBottom) / 2, TOWER_HALF + 0.15]} rotation={[-ladderTilt, 0, 0]}>
        <Box p={[-0.24, 0, 0]} s={[0.06, ladderLen, 0.06]} m={M.darkWood} />
        <Box p={[0.24, 0, 0]} s={[0.06, ladderLen, 0.06]} m={M.darkWood} />
        {Array.from({ length: rungs }, (_, i) => (
          <Box key={i} p={[0, -ladderLen / 2 + 0.25 + i * 0.35, 0]} s={[0.48, 0.04, 0.05]} m={M.wood} />
        ))}
      </group>
      <Lantern p={[L, canopyY - 0.35, L]} night={night} />
      <Lantern p={[-L, canopyY - 0.35, L]} night={night} />
      <Lantern p={[L, canopyY - 0.35, -L]} night={night} />
      <Lantern p={[-L, canopyY - 0.35, -L]} night={night} />
    </group>
  );
}

// Content Cabana: wider now, with a double-sided work table inside (three
// workstations a side). The rest of the content crew works the beach patio
// next door.
const CAB_HX = 2.8;
const CAB_HZ = 1.9;

function Cabana({ night }) {
  const zone = ZONES.cabana;
  const cx = zone.x;
  const cz = zone.z;
  const g = groundY(cx, cz);
  const eaveY = 2.15;
  const apexY = 3.6;
  const hx = CAB_HX + 0.35;
  const hz = CAB_HZ + 0.4;
  const corners = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  const ridgeX = 1.2;
  const px = CAB_HX - 0.15;
  const pz = CAB_HZ - 0.15;
  return (
    <group position={[cx, g, cz]}>
      {/* deck with a woven mat */}
      <Box p={[0, 0.08, 0]} s={[CAB_HX * 2, 0.22, CAB_HZ * 2]} m={M.plank} />
      <Box p={[0, 0.195, 0]} s={[CAB_HX * 2 - 0.6, 0.02, CAB_HZ * 2 - 0.6]} m={M.mat} />
      {[-1.8, -0.6, 0.6, 1.8].map((x, i) => (
        <Box key={`ms${i}`} p={[x, 0.2, 0]} s={[0.12, 0.02, CAB_HZ * 2 - 0.6]} m={M.matStripe} />
      ))}
      {/* bamboo posts: corners plus one mid-span each long side */}
      {[[-px, -pz], [px, -pz], [-px, pz], [px, pz], [0, -pz], [0, pz]].map(([x, z], i) => (
        <BambooPost key={i} p={[x, 0.15, z]} h={2.05} r={0.09} />
      ))}
      <Beam a={[-px - 0.1, 2.12, -pz]} b={[px + 0.1, 2.12, -pz]} r={0.05} m={M.bamboo} />
      <Beam a={[-px - 0.1, 2.12, pz]} b={[px + 0.1, 2.12, pz]} r={0.05} m={M.bamboo} />
      <Beam a={[-px, 2.12, -pz - 0.1]} b={[-px, 2.12, pz + 0.1]} r={0.05} m={M.bamboo} />
      <Beam a={[px, 2.12, -pz - 0.1]} b={[px, 2.12, pz + 0.1]} r={0.05} m={M.bamboo} />
      {/* hip rafters + ridge under see-through thatch */}
      {corners.map(([x, z], i) => (
        <Beam key={`hr${i}`} a={[x, eaveY, z]} b={[Math.sign(x) * ridgeX, apexY, 0]} r={0.045} m={M.bambooNode} />
      ))}
      <Beam a={[-ridgeX - 0.1, apexY, 0]} b={[ridgeX + 0.1, apexY, 0]} r={0.06} m={M.bambooNode} />
      {[-2.0, -1.0, 0, 1.0, 2.0].flatMap((x) =>
        [-1, 1].map((sz) => (
          <Beam key={`cr${x}${sz}`} a={[x, eaveY, sz * hz]} b={[Math.max(-ridgeX, Math.min(ridgeX, x)), apexY, 0]} r={0.025} m={M.bamboo} />
        ))
      )}
      <CabanaThatch eaveY={eaveY} apexY={apexY} hx={hx} hz={hz} ridgeX={ridgeX} />
      <Fringe p={[0, eaveY, 0]} halfX={hx} halfZ={hz} drop={0.32} m={M.thatchSee} />
      {/* LISN banner under the front of the roof */}
      <Box p={[0, 1.9, pz + 0.06]} s={[1.9, 0.36, 0.05]} m={M.lisnGreen} />
      <Box p={[0, 1.78, pz + 0.09]} s={[1.9, 0.07, 0.03]} m={M.lisnOrange} />
      {/* double-sided work table with six laptops */}
      <Box p={[0, 0.75, CABANA_DESK_Z]} s={[4.3, 0.08, 0.95]} m={M.wood} />
      {[[-2.0, -0.35], [2.0, -0.35], [-2.0, 0.35], [2.0, 0.35]].map(([x, z], i) => (
        <Box key={`l${i}`} p={[x, 0.45, CABANA_DESK_Z + z]} s={[0.07, 0.6, 0.07]} m={M.bamboo} />
      ))}
      {CABANA_STATIONS.map((s, i) => (
        <group key={`lap${i}`} position={[s.x, 0.8, CABANA_DESK_Z + Math.sign(s.z) * 0.24]} rotation={[0, s.z < 0 ? Math.PI : 0, 0]}>
          <Box p={[0, 0, 0.05]} s={[0.42, 0.03, 0.28]} m={M.dark} />
          <Box p={[0, 0.14, -0.1]} s={[0.42, 0.28, 0.02]} r={[-0.25, 0, 0]} m={M.screen} />
        </group>
      ))}
      {/* Duvall TV monitor on the west end */}
      <group position={[-px + 0.25, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <Box p={[0, 0.65, 0]} s={[0.07, 1.1, 0.07]} m={M.dark} />
        <Box p={[0, 1.3, 0]} s={[1.0, 0.64, 0.07]} m={M.dark} />
        <Box p={[0, 1.3, 0.04]} s={[0.9, 0.54, 0.02]} m={M.screenDTV} />
      </group>
      {/* surfboard leaning on the east end */}
      <mesh position={[px + 0.35, 0.85, 0.9]} rotation={[0, 0.3, 0.22]} scale={[0.22, 0.95, 0.05]} material={M.lisnOrange}>
        <sphereGeometry args={[1, 10, 8]} />
      </mesh>
      <StringLights points={[[-px, 2.0, pz], [px, 2.0, pz], [px, 2.0, -pz], [-px, 2.0, -pz], [-px, 2.0, pz]]} sag={0.22} per={7} night={night} />
      <Lantern p={[-px, 1.75, pz]} night={night} />
      <Lantern p={[px, 1.75, pz]} night={night} />
    </group>
  );
}

// Hip roof (ridge along x) as four see-through thatch panels.
function CabanaThatch({ eaveY, apexY, hx, hz, ridgeX }) {
  const geo = useMemo(() => {
    const A = [-hx, eaveY, -hz];
    const B = [hx, eaveY, -hz];
    const C = [hx, eaveY, hz];
    const D = [-hx, eaveY, hz];
    const R0 = [-ridgeX, apexY, 0];
    const R1 = [ridgeX, apexY, 0];
    const tris = [
      A, R0, B, B, R0, R1, // back
      D, C, R0, C, R1, R0, // front
      A, D, R0, // left hip
      B, R1, C, // right hip
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
    g.computeVertexNormals();
    return g;
  }, [eaveY, apexY, hx, hz, ridgeX]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={M.thatchSee} renderOrder={3} />;
}

// Beach patio next to the cabana: five loungers facing the water, with
// LISN-striped umbrellas and a little side table.
function Lounger({ s, color }) {
  return (
    <group position={[s.x, 0, s.z]} rotation={[0, s.rotY, 0]}>
      <Box p={[0, 0.26, 0.12]} s={[0.62, 0.07, 1.0]} m={color} />
      <Box p={[0, 0.28, 0.12]} s={[0.18, 0.072, 1.01]} m={M.white} />
      <group position={[0, 0.28, -0.38]} rotation={[1.0, 0, 0]}>
        <Box p={[0, 0, -0.34]} s={[0.62, 0.07, 0.68]} m={color} />
        <Box p={[0, 0.002, -0.34]} s={[0.18, 0.072, 0.69]} m={M.white} />
      </group>
      {[[-0.28, 0.52], [0.28, 0.52], [-0.28, -0.32], [0.28, -0.32]].map(([x, z], i) => (
        <Box key={i} p={[x, 0.12, z]} s={[0.05, 0.24, 0.05]} m={M.bamboo} />
      ))}
    </group>
  );
}

function PatioUmbrella({ x, z, color }) {
  return (
    <group position={[x, groundY(x, z), z]}>
      <Cyl p={[0, 1.0, 0]} rt={0.03} h={2.0} m={M.white} />
      <Cone p={[0, 2.05, 0]} rad={0.95} h={0.4} seg={8} m={color} />
      <Cone p={[0, 2.28, 0]} rad={0.18} h={0.14} seg={8} m={M.white} />
    </group>
  );
}

function Patio() {
  const zone = ZONES.patio;
  const colors = [M.lisnOrange, M.lisnGreen, M.lisnOrange, M.lisnGreen, M.lisnOrange];
  return (
    <group>
      {PATIO_LOUNGERS.map((s) => {
        const x = zone.x + s.x;
        const z = zone.z + s.z;
        return (
          <group key={s.i} position={[0, groundY(x, z), 0]}>
            <Lounger s={{ ...s, x, z }} color={colors[s.i]} />
          </group>
        );
      })}
      {[-1.95, 0.65].map((dx, i) => (
        <PatioUmbrella key={i} x={zone.x + dx} z={zone.z + 0.75} color={i ? M.lisnGreen : M.lisnOrange} />
      ))}
      <group position={[zone.x + 1.95, groundY(zone.x + 1.95, zone.z + 0.9), zone.z + 0.9]}>
        <Cyl p={[0, 0.2, 0]} rt={0.03} h={0.4} m={M.bamboo} />
        <Cyl p={[0, 0.42, 0]} rt={0.2} h={0.04} seg={8} m={M.bamboo} />
        <mesh position={[0, 0.5, 0]} material={M.coconut}>
          <icosahedronGeometry args={[0.07, 0]} />
        </mesh>
      </group>
    </group>
  );
}

function Lanai({ night, animate }) {
  const brandMats = useBrandMaterials(night);
  const deck = DECKS.find((d) => d.id === 'lanai');
  const cx = (deck.x0 + deck.x1) / 2;
  const cz = (deck.z0 + deck.z1) / 2;
  const w = deck.x1 - deck.x0;
  const d = deck.z1 - deck.z0;
  const y = deck.y;
  const stilts = [];
  for (const x of [deck.x0 + 0.2, cx - 0.9, cx + 0.9, deck.x1 - 0.2]) for (const z of [deck.z0 + 0.2, cz, deck.z1 - 0.2]) stilts.push([x, z]);
  const railPosts = [];
  for (let z = deck.z0 + 0.1; z <= deck.z1; z += 0.9) railPosts.push([deck.x1 - 0.08, z]);
  for (let x = deck.x0 + 1.2; x < deck.x1; x += 0.9) {
    railPosts.push([x, deck.z0 + 0.08]);
    railPosts.push([x, deck.z1 - 0.08]);
  }
  const rampZ = (deck.ramp.z0 + deck.ramp.z1) / 2;
  const rampBottom = Math.max(terrainY(deck.x0 - 0.9, rampZ), 0);
  const rampAngle = Math.atan2(y - rampBottom, 0.9);
  return (
    <group>
      <Box p={[cx, y - 0.07, cz]} s={[w, 0.14, d]} m={M.plank} />
      {stilts.map(([x, z], i) => (
        <Cyl key={i} p={[x, y - 0.75, z]} rt={0.09} h={1.4} m={M.darkWood} />
      ))}
      {railPosts.map(([x, z], i) => (
        <Cyl key={`r${i}`} p={[x, y + 0.25, z]} rt={0.04} h={0.5} m={M.bamboo} />
      ))}
      <Beam a={[deck.x1 - 0.08, y + 0.5, deck.z0]} b={[deck.x1 - 0.08, y + 0.5, deck.z1]} r={0.035} m={M.bamboo} />
      <Beam a={[deck.x0 + 1.2, y + 0.5, deck.z0 + 0.08]} b={[deck.x1, y + 0.5, deck.z0 + 0.08]} r={0.035} m={M.bamboo} />
      <Beam a={[deck.x0 + 1.2, y + 0.5, deck.z1 - 0.08]} b={[deck.x1, y + 0.5, deck.z1 - 0.08]} r={0.035} m={M.bamboo} />
      {/* tall bamboo poles at the deck corners carry the string lights */}
      {[[deck.x0 + 0.15, deck.z0 + 0.15], [deck.x1 - 0.15, deck.z0 + 0.15], [deck.x1 - 0.15, deck.z1 - 0.15], [deck.x0 + 0.15, deck.z1 - 0.15]].map(([x, z], i) => (
        <BambooPost key={`lp${i}`} p={[x, y, z]} h={2.0} r={0.06} />
      ))}
      <StringLights
        points={[[deck.x0 + 0.15, y + 1.95, deck.z1 - 0.15], [deck.x0 + 0.15, y + 1.95, deck.z0 + 0.15], [deck.x1 - 0.15, y + 1.95, deck.z0 + 0.15], [deck.x1 - 0.15, y + 1.95, deck.z1 - 0.15]]}
        sag={0.3}
        per={8}
        night={night}
      />
      {/* woven rug under the desk */}
      <Box p={[cx, y + 0.01, cz + 0.1]} s={[4.4, 0.02, 2.4]} m={M.mat} />
      {[-1.6, -0.5, 0.5, 1.6].map((x, i) => (
        <Box key={`rs${i}`} p={[cx + x, y + 0.022, cz + 0.1]} s={[0.14, 0.02, 2.4]} m={M.matStripe} />
      ))}
      {/* steps up from the sand */}
      <Box p={[deck.x0 - 0.45, (y + rampBottom) / 2, rampZ]} s={[Math.hypot(0.9, y - rampBottom), 0.08, 1.2]} r={[0, 0, rampAngle]} m={M.plank} />
      {/* desk */}
      <Box p={[cx, y + 0.62, -0.5]} s={[4.0, 0.07, 0.6]} m={M.wood} />
      {[-1.9, 1.9].map((x, i) => (
        <Box key={`dl${i}`} p={[cx + x, y + 0.31, -0.5]} s={[0.07, 0.6, 0.5]} m={M.darkWood} />
      ))}
      {[-1.2, 0, 1.2].map((x, i) => (
        <BrandLaptop key={`lap${i}`} p={[cx + x, y + 0.67, -0.5]} index={i} mats={brandMats} animate={animate} />
      ))}
      {/* Buddy Buck Show umbrella */}
      <group position={[deck.x1 - 0.9, y, deck.z1 - 0.8]}>
        <Cyl p={[0, 1.0, 0]} rt={0.035} h={2.0} m={M.white} />
        <Cone p={[0, 2.05, 0]} rad={1.15} h={0.45} m={M.bbBlue} />
        <Fringe p={[0, 1.83, 0]} halfX={1.15} halfZ={1.15} drop={0.14} round m={M.bbYellow} />
        <Cone p={[0, 2.3, 0]} rad={0.3} h={0.18} m={M.bbYellow} />
      </group>
      <Flag p={[deck.x1 - 0.1, y, deck.z0 + 0.1]} color="#FFDE69" animate={animate} />
      <Lantern p={[deck.x1 - 0.08, y + 0.6, deck.z0 + 0.1]} night={night} />
      <Lantern p={[deck.x1 - 0.08, y + 0.6, deck.z1 - 0.1]} night={night} />
    </group>
  );
}

function Torch({ p, night, animate }) {
  const flame = useRef();
  const mat = useGlowMaterial('#ff8a2a', night, 0.6, 1.4);
  useFrame((state) => {
    if (!animate || !flame.current) return;
    const t = state.clock.elapsedTime;
    flame.current.scale.set(1, 1 + Math.sin(t * 9 + p[0]) * 0.15 + Math.sin(t * 13) * 0.08, 1);
  });
  return (
    <group position={p}>
      <Cyl p={[0, 0.65, 0]} rt={0.04} rb={0.06} h={1.3} m={M.bamboo} />
      <Cyl p={[0, 1.33, 0]} rt={0.1} rb={0.07} h={0.16} m={M.darkWood} />
      <mesh ref={flame} position={[0, 1.52, 0]} material={mat}>
        <coneGeometry args={[0.09, 0.26, 5]} />
      </mesh>
      {night > 0.3 && (
        <mesh position={[0, 1.5, 0]}>
          <sphereGeometry args={[0.35, 10, 8]} />
          <meshBasicMaterial color="#ff9a3c" transparent opacity={0.2 * night} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
    </group>
  );
}

function TikiHut({ night, animate }) {
  const cx = ZONES.tikihut.x;
  const cz = ZONES.tikihut.z;
  const t1 = [cx - 2.1, cz + 0.4];
  const t2 = [cx + 2.2, cz - 0.2];
  const g = groundY(cx, cz);
  return (
    <group>
      <group position={[cx, g, cz]}>
        <Cyl p={[0, 0.55, 0]} rt={1.02} rb={1.08} h={1.1} seg={10} m={M.bamboo} />
        <Box p={[0, 0.42, 1.03]} s={[0.5, 0.8, 0.06]} m={M.darkWood} />
        <Cone p={[0, 1.1 + 0.72, 0]} rad={1.55} h={1.45} seg={10} m={M.thatch} />
        <Cone p={[0, 1.1 + 0.25, 0]} rad={1.72} h={0.5} seg={10} m={M.thatchDark} />
        <Fringe p={[0, 1.1, 0]} halfX={1.7} halfZ={1.7} drop={0.3} round />
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return <Cyl key={i} p={[Math.cos(a) * 1.09, 0.55, Math.sin(a) * 1.09]} rt={0.045} h={1.1} m={i % 2 ? M.bambooNode : M.bambooGreen} />;
        })}
      </group>
      <StringLights
        points={[[t1[0], groundY(...t1) + 1.3, t1[1]], [cx, g + 1.15, cz + 1.75], [t2[0], groundY(...t2) + 1.3, t2[1]]]}
        sag={0.25}
        per={5}
        night={night}
      />
      <Torch p={[t1[0], groundY(...t1), t1[1]]} night={night} animate={animate} />
      <Torch p={[t2[0], groundY(...t2), t2[1]]} night={night} animate={animate} />
    </group>
  );
}

function MoneyDesk({ night }) {
  const cx = ZONES.moneydesk.x;
  const cz = ZONES.moneydesk.z;
  const g = groundY(cx, cz);
  return (
    <group position={[cx, g, cz]}>
      <Cyl p={[0, 0.36, 0]} rt={0.06} h={0.72} m={M.darkWood} />
      <Cyl p={[0, 0.74, 0]} rt={0.58} h={0.06} seg={10} m={M.white} />
      <Cyl p={[0, 1.3, 0]} rt={0.03} h={2.6} m={M.white} />
      <Cone p={[0, 2.3, 0]} rad={1.2} h={0.45} m={M.lisnGreen} />
      <Cone p={[0, 2.56, 0]} rad={0.25} h={0.16} m={M.white} />
      {/* stacks of cash */}
      {[[-0.22, 0.1, 2], [0.08, 0.22, 3], [0.22, -0.1, 1]].map(([x, z, n], i) => (
        <group key={i} position={[x, 0.77, z]} rotation={[0, i * 0.5, 0]}>
          <Box p={[0, n * 0.025, 0]} s={[0.2, n * 0.05, 0.1]} m={M.cash} />
          <Box p={[0, n * 0.025, 0]} s={[0.05, n * 0.05 + 0.004, 0.104]} m={M.cashBand} />
        </group>
      ))}
      <Lantern p={[0.4, 0.86, -0.2]} night={night} />
    </group>
  );
}

// Buddy's cabin cruiser, moored on the north side of Launch's Pier: a blue
// hull with gold trim, a white cabin and a flybridge. Bobs and rocks gently.
const CRUISER_AT = { x: DOCK.x0 + 3.4, z: DOCK.z0 - 1.25 };

function Cruiser({ animate }) {
  const ref = useRef();
  const sign = useMemo(() => new THREE.MeshStandardMaterial({ map: brandTexture('bb'), roughness: 0.6 }), []);
  useEffect(() => () => (sign.map.dispose(), sign.dispose()), [sign]);
  useFrame((state) => {
    if (!ref.current) return;
    const t = animate ? state.clock.elapsedTime : 0;
    ref.current.position.y = 0.1 + Math.sin(t * 0.9) * 0.06;
    ref.current.rotation.z = Math.sin(t * 0.75) * 0.04;
    ref.current.rotation.x = Math.sin(t * 0.6 + 1) * 0.02;
  });
  // Built pointing along -x (bow out to sea, west).
  return (
    <group position={[CRUISER_AT.x, 0, CRUISER_AT.z]}>
      <group ref={ref}>
        {/* hull */}
        <Box p={[0, 0.05, 0]} s={[3.2, 0.5, 1.25]} m={M.bbBlue} />
        <mesh position={[-2.0, 0.05, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.36, 1, 0.9]} material={M.bbBlue}>
          <coneGeometry args={[0.7, 0.8, 4, 1]} />
        </mesh>
        <Box p={[0, 0.27, 0]} s={[3.24, 0.07, 1.29]} m={M.bbYellow} />
        <mesh position={[-2.0, 0.27, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.1, 1, 0.92]} material={M.bbYellow}>
          <coneGeometry args={[0.7, 0.82, 4, 1]} />
        </mesh>
        <Box p={[0.1, 0.31, 0]} s={[3.1, 0.04, 1.15]} m={M.plank} />
        {/* cabin */}
        <Box p={[-0.2, 0.62, 0]} s={[1.5, 0.58, 1.0]} m={M.white} />
        <Box p={[-0.2, 0.93, 0]} s={[1.62, 0.06, 1.1]} m={M.bbYellow} />
        {[-0.65, -0.2, 0.25].map((x) => (
          <Box key={x} p={[x, 0.68, 0.505]} s={[0.3, 0.2, 0.02]} m={M.porthole} />
        ))}
        {[-0.65, -0.2, 0.25].map((x) => (
          <Box key={`b${x}`} p={[x, 0.68, -0.505]} s={[0.3, 0.2, 0.02]} m={M.porthole} />
        ))}
        <Box p={[-1.0, 0.75, 0]} s={[0.06, 0.32, 0.9]} r={[0, 0, 0.5]} m={M.glass} />
        {/* flybridge with a little wheel */}
        <Box p={[0.15, 1.05, 0]} s={[0.8, 0.16, 0.9]} m={M.white} />
        <Cyl p={[-0.05, 1.22, 0]} rt={0.12} h={0.03} seg={8} m={M.darkWood} r={[0, 0, Math.PI / 2]} />
        <Beam a={[0.55, 1.1, -0.42]} b={[0.55, 1.45, -0.42]} r={0.02} m={M.white} />
        <Beam a={[0.55, 1.1, 0.42]} b={[0.55, 1.45, 0.42]} r={0.02} m={M.white} />
        <Box p={[0.55, 1.47, 0]} s={[0.5, 0.04, 0.95]} m={M.bbBlue} />
        {/* stern rail, antenna and gold pennant */}
        <Beam a={[1.55, 0.36, -0.55]} b={[1.55, 0.36, 0.55]} r={0.02} m={M.bbYellow} />
        <Cyl p={[0.55, 1.8, 0.3]} rt={0.012} h={0.7} m={M.white} />
        <Box p={[0.68, 2.05, 0.3]} s={[0.24, 0.13, 0.01]} m={M.bbYellow} />
        {/* BB on the transom */}
        <mesh position={[1.61, 0.08, 0]} rotation={[0, Math.PI / 2, 0]} material={sign}>
          <planeGeometry args={[0.6, 0.34]} />
        </mesh>
      </group>
      {/* mooring lines to the pier */}
      <Beam a={[-1.1, 0.35, 0.6]} b={[-1.1, DOCK.y + 0.25, DOCK.z0 - CRUISER_AT.z + 0.1]} r={0.012} m={M.rope} />
      <Beam a={[1.2, 0.35, 0.6]} b={[1.2, DOCK.y + 0.25, DOCK.z0 - CRUISER_AT.z + 0.1]} r={0.012} m={M.rope} />
    </group>
  );
}

function Dock({ night, animate }) {
  const deck = DOCK;
  const cx = (deck.x0 + deck.x1) / 2;
  const cz = (deck.z0 + deck.z1) / 2;
  const y = deck.y;
  const rampBottom = Math.max(terrainY(deck.x1 + 0.8, cz), 0);
  const rampAngle = Math.atan2(y - rampBottom, 0.8);
  const stiltXs = [];
  for (let x = deck.x0 + 0.15; x < deck.x1; x += 1.6) stiltXs.push(x);
  return (
    <group>
      <Box p={[cx, y - 0.05, cz]} s={[deck.x1 - deck.x0, 0.1, deck.z1 - deck.z0]} m={M.plank} />
      {stiltXs.map((x) => (
        <Box key={`pl${x}`} p={[x + 0.8, y + 0.001, cz]} s={[0.03, 0.005, deck.z1 - deck.z0 - 0.04]} m={M.darkWood} />
      ))}
      {stiltXs.flatMap((x) =>
        [deck.z0 + 0.05, deck.z1 - 0.05].map((z) => <Cyl key={`${x}${z}`} p={[x, y - 0.55, z]} rt={0.09} h={1.3} m={M.darkWood} />)
      )}
      <Box p={[deck.x1 + 0.4, (y + rampBottom) / 2, cz]} s={[Math.hypot(0.8, y - rampBottom), 0.08, deck.z1 - deck.z0]} r={[0, 0, -rampAngle]} m={M.plank} />
      {/* bollards and lanterns along the edge */}
      {[deck.x0 + 1.0, deck.x0 + 5.0].map((x) => (
        <Cyl key={`bo${x}`} p={[x, y + 0.15, deck.z0 + 0.12]} rt={0.09} h={0.3} m={M.darkWood} />
      ))}
      <Cyl p={[deck.x0 + 0.15, y + 0.3, deck.z1 - 0.1]} rt={0.06} h={0.6} m={M.darkWood} />
      <Lantern p={[deck.x0 + 0.15, y + 0.7, deck.z1 - 0.1]} night={night} />
      <Cyl p={[deck.x0 + 0.15, y + 0.3, deck.z0 + 0.1]} rt={0.06} h={0.6} m={M.darkWood} />
      <Lantern p={[deck.x0 + 0.15, y + 0.7, deck.z0 + 0.1]} night={night} />
      <Flag p={[deck.x0 + 0.5, y, cz]} color="#2BA84A" animate={animate} />
      <Cruiser animate={animate} />
    </group>
  );
}

// Flo's bungalow: home base for the home and family bot. It faces the water
// and the sunset, with a porch, a chair for Flo, planters and flowers.
function Bungalow({ night }) {
  const zone = ZONES.bungalow;
  const g = groundY(zone.x, zone.z);
  const windowMat = useGlowMaterial('#ffd27a', night, 0.05, 1.5);
  return (
    <group position={[zone.x, g, zone.z]} rotation={[0, BUNGALOW_ROT, 0]}>
      {[[-0.9, -0.6], [0.9, -0.6], [-0.9, 2.05], [0.9, 2.05], [0, 2.05]].map(([x, z], i) => (
        <Cyl key={i} p={[x, 0.14, z]} rt={0.07} h={0.4} m={M.darkWood} />
      ))}
      <Box p={[0, 0.3, 0.75]} s={[2.1, 0.1, 2.9]} m={M.plank} />
      <Box p={[0, 0.9, -0.15]} s={[1.7, 1.1, 1.2]} m={M.white} />
      <Roof p={[0, 1.45 + 0.42, -0.15]} halfX={1.15} halfZ={0.9} h={0.85} m={M.thatch} />
      <Fringe p={[0, 1.46, -0.15]} halfX={1.15} halfZ={0.9} drop={0.2} />
      <Box p={[0, 0.75, 0.46]} s={[0.42, 0.8, 0.04]} m={M.darkWood} />
      <Box p={[-0.55, 1.0, 0.46]} s={[0.36, 0.3, 0.04]} m={windowMat} />
      <Box p={[0.55, 1.0, 0.46]} s={[0.36, 0.3, 0.04]} m={windowMat} />
      {/* short awning by the door; Flo's chair sits out in the open with the view */}
      <Cyl p={[-0.95, 0.85, 1.05]} rt={0.045} h={1.1} m={M.wood} />
      <Cyl p={[0.95, 0.85, 1.05]} rt={0.045} h={1.1} m={M.wood} />
      <Box p={[0, 1.42, 0.78]} s={[2.15, 0.06, 0.7]} r={[0.15, 0, 0]} m={M.thatchDark} />
      <Fringe p={[0, 1.36, 1.12]} halfX={1.07} halfZ={0.02} drop={0.14} />
      {/* porch rail, open in the middle so the view stays clear */}
      <Beam a={[-1.0, 0.68, 0.5]} b={[-1.0, 0.68, 2.15]} r={0.03} m={M.bamboo} />
      <Beam a={[1.0, 0.68, 0.5]} b={[1.0, 0.68, 2.15]} r={0.03} m={M.bamboo} />
      {/* Flo's chair on the porch (her seat slot sits right on it) */}
      <TowerChair seat={{ x: 0, z: 1.55, rotY: 0 }} top={0.35} cushion={M.floCushion} />
      {/* planters with flowers at the porch corners, and a pot by the door */}
      {[-0.78, 0.78].map((x) => (
        <group key={x} position={[x, 0.35, 2.0]}>
          <Box p={[0, 0.1, 0]} s={[0.36, 0.2, 0.24]} m={M.darkWood} />
          {[[-0.1, '#ff5d8f'], [0, '#ffd23f'], [0.1, '#f25cff']].map(([dx, c]) => (
            <mesh key={dx} position={[dx, 0.26, 0]}>
              <icosahedronGeometry args={[0.07, 0]} />
              <meshStandardMaterial color={c} flatShading />
            </mesh>
          ))}
        </group>
      ))}
      <group position={[0.42, 0.35, 0.65]}>
        <Cyl p={[0, 0.09, 0]} rt={0.1} rb={0.08} h={0.18} seg={8} m={M.claude} />
        <Cone p={[0, 0.32, 0]} rad={0.14} h={0.32} seg={6} m={M.launch} />
      </group>
      <Lantern p={[0.95, 1.2, 1.05]} night={night} />
    </group>
  );
}

function Lookout({ night, animate }) {
  const cx = ZONES.lookout.x;
  const cz = ZONES.lookout.z;
  const g = terrainY(cx, cz);
  const top = g + LOOKOUT_H;
  const rampFoot = groundY(cx, cz + 2.0);
  const rampLen = Math.hypot(1.25, top - rampFoot);
  const rampAngle = Math.atan2(top - rampFoot, 1.25);
  return (
    <group>
      <group position={[cx, g, cz]}>
        {[[-0.85, -0.65], [0.85, -0.65], [-0.85, 0.65], [0.85, 0.65]].map(([x, z], i) => (
          <Cyl key={i} p={[x, (LOOKOUT_H + 0.55) / 2 - 0.1, z]} rt={0.07} h={LOOKOUT_H + 0.6} m={M.wood} />
        ))}
        <Box p={[0, LOOKOUT_H, 0]} s={[1.9, 0.12, 1.5]} m={M.plank} />
        <Box p={[0, LOOKOUT_H + 0.45, -0.68]} s={[1.75, 0.06, 0.06]} m={M.wood} />
        <Box p={[-0.88, LOOKOUT_H + 0.45, 0]} s={[0.06, 0.06, 1.3]} m={M.wood} />
        <Box p={[0.88, LOOKOUT_H + 0.45, 0]} s={[0.06, 0.06, 1.3]} m={M.wood} />
        {/* telescope */}
        <group position={[0.6, LOOKOUT_H + 0.06, -0.45]}>
          <Cyl p={[0, 0.3, 0]} rt={0.02} h={0.6} m={M.dark} />
          <Cyl p={[0, 0.65, 0]} rt={0.05} rb={0.07} h={0.6} r={[0.9, 0.6, 0]} m={M.bbBlue} />
        </group>
        <Flag p={[-0.85, LOOKOUT_H + 0.06, -0.65]} color="#2BA84A" animate={animate} w={0.5} h={0.3} />
        <Lantern p={[0.88, LOOKOUT_H + 0.62, 0.65]} night={night} />
      </group>
      {/* ramp down to the sand path */}
      <group position={[cx, (top + rampFoot) / 2, cz + 0.75 + 0.625]} rotation={[rampAngle, 0, 0]}>
        <Box p={[0, 0, 0]} s={[0.62, 0.07, rampLen]} m={M.plank} />
        {Array.from({ length: 5 }, (_, i) => (
          <Box key={i} p={[0, 0.05, -rampLen / 2 + 0.25 + i * (rampLen - 0.5) / 4]} s={[0.62, 0.04, 0.06]} m={M.darkWood} />
        ))}
      </group>
    </group>
  );
}

// Nasty's umbrella: red and white striped canopy with a navy crown dotted
// with little white stars. The vibe, not a literal flag.
const CANOPY = (() => {
  const seg = 14;
  const g = new THREE.CylinderGeometry(0.46, 1.25, 0.34, seg, 1, true).toNonIndexed();
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  const red = new THREE.Color('#c8202f');
  const white = new THREE.Color('#fbf7ef');
  for (let i = 0; i < n; i++) (Math.floor(i / 6) % 2 ? white : red).toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
})();
const CANOPY_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, side: THREE.DoubleSide });
const NAVY = std('#1f3a8a');
const STAR_GEO = new THREE.OctahedronGeometry(0.045, 0).scale(1, 0.4, 1);

function StarsAndStripesCanopy() {
  return (
    <group position={[0, 1.98, 0]}>
      <mesh geometry={CANOPY} material={CANOPY_MAT} />
      <Cone p={[0, 0.27, 0]} rad={0.5} h={0.2} seg={14} m={NAVY} />
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return <mesh key={i} geometry={STAR_GEO} material={M.white} position={[Math.cos(a) * 0.3, 0.25, Math.sin(a) * 0.3]} rotation={[0.38 * Math.sin(a), a, -0.38 * Math.cos(a)]} />;
      })}
      <mesh geometry={STAR_GEO} material={M.white} position={[0, 0.38, 0]} />
      <Cyl p={[0, 0.42, 0]} rt={0.04} h={0.08} m={M.white} />
    </group>
  );
}

function BeachChair() {
  const cx = ZONES.beachchair.x;
  const cz = ZONES.beachchair.z;
  const g = groundY(cx, cz);
  const backAngle = 1.0;
  return (
    <group position={[cx, g, cz]}>
      <Box p={[0, 0.28, 0.12]} s={[0.66, 0.07, 1.05]} m={M.nasty} />
      <Box p={[0, 0.3, 0.12]} s={[0.2, 0.072, 1.06]} m={M.white} />
      <group position={[0, 0.3, -0.4]} rotation={[backAngle, 0, 0]}>
        <Box p={[0, 0, -0.36]} s={[0.66, 0.07, 0.72]} m={M.nasty} />
        <Box p={[0, 0.002, -0.36]} s={[0.2, 0.072, 0.73]} m={M.white} />
      </group>
      {[[-0.3, 0.55], [0.3, 0.55], [-0.3, -0.35], [0.3, -0.35]].map(([x, z], i) => (
        <Box key={i} p={[x, 0.13, z]} s={[0.05, 0.26, 0.05]} m={M.white} />
      ))}
      <group position={[0.9, 0, -0.5]} rotation={[0, 0, -0.12]}>
        <Cyl p={[0, 1.0, 0]} rt={0.03} h={2.0} m={M.white} />
        <StarsAndStripesCanopy />
      </group>
      {/* a cooler (Nasty keeps the coconut in hand) */}
      <group position={[-0.75, 0, 0.3]}>
        <Box p={[0, 0.13, 0]} s={[0.42, 0.26, 0.3]} m={M.white} />
        <Box p={[0, 0.28, 0]} s={[0.44, 0.05, 0.32]} m={M.nasty} />
      </group>
      {/* a fantasy football on the sand */}
      <mesh position={[-0.6, 0.1, 1.0]} rotation={[0, 0.6, 0]} scale={[0.17, 0.11, 0.11]} material={M.football}>
        <sphereGeometry args={[1, 8, 6]} />
      </mesh>
    </group>
  );
}


// A clickable tag floating over a zone. tagKey is its slot in the label
// director (so tags never overlap); zoneKey is where tapping flies to.
function ZoneTag({ zoneKey, tagKey = zoneKey, zone, label = zone.label, position, className = '', onZoneTap }) {
  const ref = useRef();
  const pos = useMemo(() => position || [zone.x, groundY(zone.x, zone.z) + zone.labelY, zone.z], [zone, position]);
  useEffect(() => {
    labelState.zones.set(tagKey, { x: pos[0], y: pos[1], z: pos[2], name: label });
    return () => labelState.zones.delete(tagKey);
  }, [tagKey, pos, label]);
  // Hide this tag while it would overlap a nearer one (the label director decides).
  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    const show = labelState.visibleZones.has(tagKey);
    const op = show ? '1' : '0';
    if (el.style.opacity !== op) {
      el.style.opacity = op;
      el.style.pointerEvents = show ? 'auto' : 'none';
      el.tabIndex = show ? 0 : -1;
    }
  });
  return (
    <Html position={pos} center zIndexRange={[10, 0]}>
      <button
        ref={ref}
        type="button"
        className={`zone-tag ${className}`}
        style={{ opacity: 0 }}
        onClick={(e) => {
          e.stopPropagation();
          onZoneTap?.(zoneKey);
        }}
      >
        {label}
      </button>
    </Html>
  );
}

function ZoneLabels({ onZoneTap }) {
  return Object.entries(ZONES)
    .filter(([, z]) => !z.noLabel)
    .map(([key, z]) => <ZoneTag key={key} zoneKey={key} zone={z} onZoneTap={onZoneTap} />);
}

// ---------------------------------------------------------------------------

export default function Island({ sky, animate = true, onGroundTap, onZoneTap, showLabels = true, lowPower = false }) {
  const night = sky.stars;
  return (
    <group>
      <Terrain onTap={onGroundTap} />
      <Water tint={sky.water} animate={animate} onTap={onGroundTap} glow={animate && !lowPower ? sky.stars : 0} />
      <Foam animate={animate} />
      <SandPaths />
      <Palms animate={animate} />
      <Flowers />
      <Rocks />
      <Tower night={night} animate={animate} />
      <Cabana night={night} />
      <Patio />
      <Lanai night={night} animate={animate} />
      <TikiHut night={night} animate={animate} />
      <MoneyDesk night={night} />
      <Dock night={night} animate={animate} />
      <Bungalow night={night} />
      <Lookout night={night} animate={animate} />
      <BeachChair />
      {showLabels && <ZoneLabels onZoneTap={onZoneTap} />}
    </group>
  );
}
