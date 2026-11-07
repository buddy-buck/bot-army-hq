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
  FLO_DECK,
  FLO_WALK,
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
  bungalowFront,
  groundY,
  islandE,
  islandWobble,
  ringPoints,
  smoothstep,
  terrainY,
  zonePathCurve,
} from '../utils/paths.js';
import { labelState } from './labels.js';
import { Foam, Water } from './Water.jsx';
import StaticMerge from '../utils/StaticMerge.jsx';

// Moving parts inside merged scenery (see StaticMerge).
const NO_MERGE = { noMerge: true };
import { claimTravel, rareGap, releaseTravel } from '../wild/director.js';

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
        <mesh ref={screen} userData={NO_MERGE} position={[0, 0, 0.0115]} geometry={SCREEN_GEO} material={mats[index % mats.length]} />
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
    const g = new THREE.PlaneGeometry(50, 46, 100, 92); // covers the bigger island and its shallows
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
      <group ref={ref} position={[0, 0.72, 0]} userData={NO_MERGE}>
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

// Helipad on top of Chief's canopy: a round pad with the H marking and
// edge lights that pulse softly at night. Chief's little helicopter sits on
// it and every few minutes lifts off, circles the island once and lands.
const PAD_R = 1.05;
const HM = {
  pad: std('#4a5059'),
  padRim: std('#f5f1e6'),
  body: std('#D63AF9'),
  stripe: std('#ffffff'),
  skid: std('#2e2a33'),
  rotor: std('#26232b'),
  glass: std('#8fd8ff', { roughness: 0.15, metalness: 0.2 }),
};

function helipadTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 256);
  x.strokeStyle = '#ffd23f';
  x.lineWidth = 14;
  x.beginPath();
  x.arc(128, 128, 104, 0, Math.PI * 2);
  x.stroke();
  x.setLineDash([16, 12]);
  x.lineWidth = 5;
  x.strokeStyle = '#ffffff';
  x.beginPath();
  x.arc(128, 128, 120, 0, Math.PI * 2);
  x.stroke();
  x.setLineDash([]);
  x.fillStyle = '#ffffff';
  x.font = '900 150px "Arial Black", Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('H', 128, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const HELI_R = 19; // circles just off the beach
const HELI_UP = 4.2; // cruising height above the pad
const HELI_OMEGA = (Math.PI * 2) / 32;
const HELI_FLIGHT = 51;

// Flight path at time t (seconds since takeoff), relative to the pad.
function heliPath(t, out) {
  const lift = smoothstep(3, 8, t) * (1 - smoothstep(40, 48, t));
  const rr = HELI_R * smoothstep(6, 13, t) * (1 - smoothstep(36, 45, t));
  const a = HELI_OMEGA * Math.max(0, t - 6);
  out.x = rr * Math.cos(a);
  out.y = lift * HELI_UP;
  out.z = rr * Math.sin(a);
  out.rr = rr;
  return out;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function Helicopter({ animate }) {
  const ref = useRef();
  const rotor = useRef();
  const tail = useRef();
  const st = useMemo(() => ({ clock: 0, next: rareGap(150, 300), flying: false, t0: 0, heading: 0, a: { x: 0, y: 0, z: 0, rr: 0 }, b: { x: 0, y: 0, z: 0, rr: 0 } }), []);
  useEffect(() => () => releaseTravel('helicopter'), []);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(delta, 0.1);
    if (!animate) return;
    st.clock += dt;
    if (!st.flying) {
      if (st.clock >= st.next) {
        if (claimTravel('helicopter', HELI_FLIGHT + 4)) {
          st.flying = true;
          st.t0 = st.clock;
        } else st.next = st.clock + 15;
      }
      if (!st.flying) return;
    }
    const t = st.clock - st.t0;
    if (t >= HELI_FLIGHT) {
      st.flying = false;
      st.next = st.clock + rareGap(150, 300);
      releaseTravel('helicopter');
      g.position.set(0, 0, 0);
      g.rotation.set(0, st.heading, 0);
      return;
    }
    const p = heliPath(t, st.a);
    const q = heliPath(t + 0.1, st.b);
    const vx = (q.x - p.x) * 10;
    const vz = (q.z - p.z) * 10;
    const speed = Math.hypot(vx, vz);
    const target = speed > 0.3 ? Math.atan2(vx, vz) : t > 30 ? 0 : st.heading;
    st.heading = wrapAngle(st.heading + wrapAngle(target - st.heading) * Math.min(1, dt * 2.2));
    g.position.set(p.x, p.y, p.z);
    const cruise = HELI_R * HELI_OMEGA;
    g.rotation.set(Math.min(0.22, (speed / cruise) * 0.16), st.heading, (p.rr / HELI_R) * 0.22, 'YXZ');
    const spin = smoothstep(0, 3, t) * (1 - smoothstep(47.5, HELI_FLIGHT, t));
    if (rotor.current) rotor.current.rotation.y += spin * 32 * dt;
    if (tail.current) tail.current.rotation.x += spin * 40 * dt;
  });
  // Built nose along +z, skids at y = 0.
  return (
    <group ref={ref}>
      {/* skids */}
      {[-0.22, 0.22].map((x) => (
        <group key={x}>
          <Box p={[x, 0.02, 0.02]} s={[0.04, 0.04, 0.8]} m={HM.skid} />
          <Beam a={[x, 0.02, 0.22]} b={[x * 0.6, 0.2, 0.16]} r={0.016} m={HM.skid} />
          <Beam a={[x, 0.02, -0.16]} b={[x * 0.6, 0.2, -0.12]} r={0.016} m={HM.skid} />
        </group>
      ))}
      {/* body, glass bubble, white stripe */}
      <mesh position={[0, 0.36, 0]} scale={[0.3, 0.26, 0.42]} material={HM.body}>
        <icosahedronGeometry args={[1, 1]} />
      </mesh>
      <mesh position={[0, 0.42, 0.2]} scale={[0.24, 0.2, 0.26]} material={HM.glass}>
        <icosahedronGeometry args={[1, 1]} />
      </mesh>
      <Box p={[0, 0.3, -0.05]} s={[0.61, 0.05, 0.5]} m={HM.stripe} />
      {/* tail boom, fin, tail rotor */}
      <Cyl p={[0, 0.42, -0.62]} rt={0.035} rb={0.08} h={0.75} seg={6} m={HM.body} r={[Math.PI / 2, 0, 0]} />
      <Box p={[0, 0.55, -0.98]} s={[0.03, 0.26, 0.14]} r={[-0.4, 0, 0]} m={HM.body} />
      <Box p={[0, 0.44, -0.95]} s={[0.3, 0.025, 0.08]} m={HM.stripe} />
      <group ref={tail} position={[0.05, 0.5, -0.98]}>
        <Box p={[0, 0, 0]} s={[0.015, 0.34, 0.035]} m={HM.rotor} />
      </group>
      {/* mast and main rotor */}
      <Cyl p={[0, 0.66, 0]} rt={0.03} h={0.1} m={HM.rotor} />
      <group ref={rotor} position={[0, 0.72, 0]}>
        <Box p={[0, 0, 0]} s={[1.5, 0.018, 0.08]} m={HM.rotor} />
        <Box p={[0, 0, 0]} s={[0.08, 0.018, 1.5]} m={HM.rotor} />
        <Cyl p={[0, 0.02, 0]} rt={0.05} h={0.05} seg={6} m={HM.stripe} />
      </group>
    </group>
  );
}

function Helipad({ y, night, animate }) {
  const deck = useMemo(() => {
    const map = helipadTexture();
    return new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  }, []);
  useEffect(() => () => (deck.map.dispose(), deck.dispose()), [deck]);
  const lights = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7dffb2', emissive: '#7dffb2', emissiveIntensity: 0.2, flatShading: true }), []);
  useEffect(() => () => lights.dispose(), [lights]);
  const nightRef = useRef(night);
  nightRef.current = night;
  useFrame((state) => {
    const n = nightRef.current;
    const pulse = animate ? 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 2.4) : 1;
    lights.emissiveIntensity = 0.2 + n * (0.5 + 1.4 * pulse);
  });
  const top = y + 0.08;
  return (
    <group>
      {/* mast through the roof apex and four struts down onto the rafters */}
      <Cyl p={[0, y - 0.25, 0]} rt={0.07} h={0.5} m={M.darkWood} />
      {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz], i) => (
        <Beam key={i} a={[sx * 0.62, y - 0.02, sz * 0.62]} b={[sx * 0.86, y - 0.53, sz * 0.86]} r={0.035} m={M.darkWood} />
      ))}
      <Cyl p={[0, y + 0.03, 0]} rt={PAD_R} h={0.1} seg={16} m={HM.pad} />
      <Cyl p={[0, y + 0.03, 0]} rt={PAD_R + 0.04} rb={PAD_R + 0.04} h={0.06} seg={16} m={HM.padRim} />
      <mesh position={[0, top + 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]} material={deck}>
        <planeGeometry args={[PAD_R * 1.95, PAD_R * 1.95]} />
      </mesh>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * (PAD_R - 0.02), top + 0.03, Math.sin(a) * (PAD_R - 0.02)]} material={lights}>
            <icosahedronGeometry args={[0.04, 0]} />
          </mesh>
        );
      })}
      <group position={[0, top, 0]} userData={NO_MERGE}>
        <Helicopter animate={animate} />
      </group>
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
      {/* helipad on the roof peak; Chief's flag flies from the pad's edge */}
      <Helipad y={canopyY + 1.36} night={night} animate={animate} />
      <Flag p={[0.75, canopyY + 1.44, -0.75]} color="#D63AF9" animate={animate} />
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
function CabanaThatch({ eaveY, apexY, hx, hz, ridgeX, m = M.thatchSee }) {
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
  return <mesh geometry={geo} material={m} renderOrder={m.transparent ? 3 : 0} />;
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
      <mesh ref={flame} userData={NO_MERGE} position={[0, 1.52, 0]} material={mat}>
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

// Small boats tied up along Launch's Pier, clear of Buddy's cruiser (north),
// the dock office (south) and the fishing spot at the end of the pier.
const BOAT_M = {
  row: std('#e8604c'),
  rowIn: std('#f3d9a8'),
  runHull: std('#fdf8ee'),
  runStripe: std('#2bb3c0'),
  seat: std('#2e5d8a'),
  motor: std('#2b2a33'),
  catHull: std('#f5f1e6'),
  net: std('#5bc0be'),
  sail: std('#ffffff'),
};
const MOORED = [
  // rowboat, south side near the land end
  { id: 'row', x: -15.35, z: 7.15, rotY: 0, ph: 0.4, amp: 0.05, cleat: [-0.7, 0.22, -0.1], bollard: [-15.85, DOCK.z1 - 0.12] },
  // runabout, north side between the cruiser's stern and the beach
  { id: 'run', x: -15.55, z: 3.35, rotY: 0, ph: 2.1, amp: 0.045, cleat: [-0.55, 0.32, 0.3], bollard: [-15.95, DOCK.z0 + 0.12] },
  // little catamaran off the west end of the pier (bows north)
  { id: 'cat', x: -23.35, z: 5.0, rotY: Math.PI, ph: 4.0, amp: 0.04, cleat: [-0.45, 0.28, 0.5], bollard: [DOCK.x0 + 0.14, 4.85] },
];

function Rowboat() {
  return (
    <group>
      <Box p={[0.05, 0.06, 0]} s={[1.0, 0.24, 0.52]} m={BOAT_M.row} />
      <mesh position={[-0.62, 0.06, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.34, 1, 0.74]} material={BOAT_M.row}>
        <coneGeometry args={[0.36, 0.3, 4, 1]} />
      </mesh>
      <Box p={[0.05, 0.19, 0]} s={[1.02, 0.03, 0.54]} m={M.white} />
      <Box p={[0.05, 0.15, 0]} s={[0.92, 0.03, 0.44]} m={BOAT_M.rowIn} />
      {[-0.25, 0.3].map((x) => (
        <Box key={x} p={[x, 0.2, 0]} s={[0.12, 0.03, 0.48]} m={M.wood} />
      ))}
      {/* oars resting across the seats */}
      <Box p={[0.05, 0.24, 0.12]} s={[0.95, 0.025, 0.03]} r={[0, 0.12, 0]} m={M.wood} />
      <Box p={[0.05, 0.24, -0.12]} s={[0.95, 0.025, 0.03]} r={[0, -0.12, 0]} m={M.wood} />
    </group>
  );
}

function Runabout() {
  return (
    <group>
      <Box p={[0.1, 0.08, 0]} s={[1.3, 0.3, 0.64]} m={BOAT_M.runHull} />
      <mesh position={[-0.75, 0.08, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.42, 1, 0.9]} material={BOAT_M.runHull}>
        <coneGeometry args={[0.36, 0.4, 4, 1]} />
      </mesh>
      <Box p={[0.1, 0.06, 0]} s={[1.32, 0.06, 0.66]} m={BOAT_M.runStripe} />
      <Box p={[0.15, 0.24, 0]} s={[1.0, 0.03, 0.54]} m={M.plank} />
      {/* windshield and two seats */}
      <Box p={[-0.2, 0.36, 0]} s={[0.03, 0.2, 0.56]} r={[0, 0, 0.45]} m={M.glass} />
      {[-0.13, 0.13].map((z) => (
        <group key={z} position={[0.15, 0.26, z]}>
          <Box p={[0, 0.06, 0]} s={[0.2, 0.08, 0.2]} m={BOAT_M.seat} />
          <Box p={[0.09, 0.16, 0]} s={[0.04, 0.2, 0.2]} m={BOAT_M.seat} />
        </group>
      ))}
      {/* outboard motor */}
      <Box p={[0.82, 0.3, 0]} s={[0.18, 0.24, 0.16]} m={BOAT_M.motor} />
      <Box p={[0.86, 0.06, 0]} s={[0.06, 0.3, 0.06]} m={BOAT_M.motor} />
    </group>
  );
}

function Catamaran() {
  return (
    <group>
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.75]} material={BOAT_M.catHull}>
          <capsuleGeometry args={[0.13, 1.4, 3, 6]} />
        </mesh>
      ))}
      <Box p={[0, 0.2, 0.05]} s={[0.9, 0.03, 1.1]} m={BOAT_M.net} />
      {[-0.5, 0.6].map((z) => (
        <Box key={z} p={[0, 0.22, z]} s={[0.98, 0.05, 0.06]} m={M.white} />
      ))}
      {/* mast, boom with a furled sail, a little pennant */}
      <Cyl p={[0, 1.05, -0.1]} rt={0.025} h={1.7} m={M.white} />
      <Cyl p={[0, 0.5, 0.3]} rt={0.02} h={0.85} m={M.white} r={[Math.PI / 2, 0, 0]} />
      <Cyl p={[0, 0.56, 0.3]} rt={0.05} rb={0.07} h={0.75} seg={6} m={BOAT_M.sail} r={[Math.PI / 2, 0, 0]} />
      <Box p={[0.1, 1.86, -0.1]} s={[0.2, 0.08, 0.01]} m={M.launch} />
    </group>
  );
}

const BOAT_MODELS = { row: Rowboat, run: Runabout, cat: Catamaran };

function MooredBoats({ animate }) {
  const refs = useRef([]);
  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    for (let i = 0; i < MOORED.length; i++) {
      const g = refs.current[i];
      if (!g) continue;
      const b = MOORED[i];
      g.position.y = 0.04 + Math.sin(t * 1.1 + b.ph) * b.amp;
      g.rotation.z = Math.sin(t * 0.85 + b.ph) * 0.05;
      g.rotation.x = Math.sin(t * 0.7 + b.ph * 1.3) * 0.035;
    }
  });
  return (
    <group>
      {MOORED.map((b, i) => {
        const Model = BOAT_MODELS[b.id];
        const c = Math.cos(b.rotY);
        const sn = Math.sin(b.rotY);
        const [lx, ly, lz] = b.cleat;
        const cleat = [b.x + lx * c + lz * sn, ly + 0.04, b.z - lx * sn + lz * c];
        return (
          <group key={b.id}>
            <group position={[b.x, 0, b.z]} rotation={[0, b.rotY, 0]}>
              <group ref={(el) => (refs.current[i] = el)}>
                <Model />
              </group>
            </group>
            <Cyl p={[b.bollard[0], DOCK.y + 0.13, b.bollard[1]]} rt={0.08} h={0.26} m={M.darkWood} />
            <Beam a={cleat} b={[b.bollard[0], DOCK.y + 0.22, b.bollard[1]]} r={0.012} m={M.rope} seg={4} />
          </group>
        );
      })}
    </group>
  );
}

// "Welcome to Bot Island": a hand-painted sign on carved posts at the land
// end of the pier (north edge, so it never hides the bots on the deck).
function welcomeTexture(back) {
  const W = 1024;
  const H = 330;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  // board outline: an arched top and a gently wavy bottom
  const shape = () => {
    x.beginPath();
    x.moveTo(24, 90);
    x.quadraticCurveTo(W / 2, -40, W - 24, 90);
    x.lineTo(W - 14, H - 34);
    x.quadraticCurveTo(W * 0.75, H - 6, W / 2, H - 22);
    x.quadraticCurveTo(W * 0.25, H - 38, 14, H - 20);
    x.closePath();
  };
  shape();
  const wood = x.createLinearGradient(0, 0, 0, H);
  wood.addColorStop(0, '#d79a5c');
  wood.addColorStop(1, '#a8683a');
  x.fillStyle = wood;
  x.fill();
  x.save();
  x.clip();
  x.strokeStyle = 'rgba(110,60,25,0.28)';
  x.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const yy = 40 + i * 22;
    x.beginPath();
    x.moveTo(0, yy);
    for (let k = 0; k <= 8; k++) x.lineTo((k / 8) * W, yy + Math.sin(k * 1.7 + i) * 5);
    x.stroke();
  }
  x.restore();
  shape();
  x.lineWidth = 12;
  x.strokeStyle = '#6b3b1c';
  x.stroke();
  // little hibiscus flowers in the corners
  const flower = (fx, fy, r, col) => {
    x.fillStyle = col;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      x.beginPath();
      x.arc(fx + Math.cos(a) * r * 0.62, fy + Math.sin(a) * r * 0.62, r * 0.55, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = '#ffe14d';
    x.beginPath();
    x.arc(fx, fy, r * 0.28, 0, Math.PI * 2);
    x.fill();
  };
  flower(86, H - 78, 34, '#ff5d8f');
  flower(W - 86, H - 78, 34, '#ff8a3d');
  flower(140, 112, 20, '#f25cff');
  flower(W - 140, 112, 20, '#ff5d8f');
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  const hand = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive';
  const small = back ? 'Come back soon!' : 'Welcome to';
  const big = back ? 'Aloha!' : 'Bot Island';
  x.font = `700 62px ${hand}`;
  x.lineWidth = 10;
  x.strokeStyle = '#1d6f78';
  x.strokeText(small, W / 2, 92);
  x.fillStyle = '#ffffff';
  x.fillText(small, W / 2, 92);
  x.font = `900 138px ${hand}`;
  x.lineWidth = 18;
  x.strokeStyle = '#5a2a10';
  x.strokeText(big, W / 2, 210);
  const paint = x.createLinearGradient(0, 150, 0, 270);
  paint.addColorStop(0, '#ffe14d');
  paint.addColorStop(1, '#ff8a2a');
  x.fillStyle = paint;
  x.fillText(big, W / 2, 210);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const SIGN_AT = { x: -13.4, z: 4.02, rotY: 0.12 };
const SIGN_W = 2.8;
const SIGN_H = SIGN_W * (330 / 1024);

function WelcomeSign({ night }) {
  const mats = useMemo(
    () =>
      [false, true].map((back) => {
        const map = welcomeTexture(back);
        return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: 0.06, alphaTest: 0.5, roughness: 0.85 });
      }),
    []
  );
  useEffect(() => {
    mats.forEach((m) => (m.emissiveIntensity = 0.06 + night * 0.4));
  }, [mats, night]);
  useEffect(() => () => mats.forEach((m) => (m.map.dispose(), m.dispose())), [mats]);
  const lights = useMemo(() => [[-1.42, 2.27, 0.1], [1.42, 2.27, 0.1]], []);
  const px = SIGN_W / 2 + 0.12;
  return (
    <group position={[SIGN_AT.x, DOCK.y, SIGN_AT.z]} rotation={[0, SIGN_AT.rotY, 0]}>
      {/* carved posts on pilings, with tiki caps */}
      {[-px, px].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Cyl p={[0, 0.45, 0]} rt={0.1} rb={0.12} h={3.5} seg={7} m={M.darkWood} />
          {[0.35, 1.1, 1.9].map((yy) => (
            <Cyl key={yy} p={[0, yy, 0]} rt={0.13} h={0.07} seg={7} m={M.wood} />
          ))}
          <Cone p={[0, 2.36, 0]} rad={0.17} h={0.26} seg={7} m={M.thatchDark} />
          <mesh position={[0, 2.54, 0]} material={M.coconut}>
            <icosahedronGeometry args={[0.08, 0]} />
          </mesh>
        </group>
      ))}
      <Box p={[0, 2.2, 0]} s={[px * 2 + 0.3, 0.12, 0.12]} m={M.wood} />
      {/* the board hangs from the beam on two short ropes */}
      {[-0.9, 0.9].map((x) => (
        <Cyl key={x} p={[x, 2.08, 0]} rt={0.012} h={0.14} m={M.rope} />
      ))}
      <mesh position={[0, 2.0 - SIGN_H / 2, 0.012]} material={mats[0]}>
        <planeGeometry args={[SIGN_W, SIGN_H]} />
      </mesh>
      <mesh position={[0, 2.0 - SIGN_H / 2, -0.012]} rotation={[0, Math.PI, 0]} material={mats[1]}>
        <planeGeometry args={[SIGN_W, SIGN_H]} />
      </mesh>
      <StringLights points={lights} sag={0.12} per={9} night={night} />
      <Lantern p={[-px, 2.0, 0.16]} night={night} />
      <Lantern p={[px, 2.0, 0.16]} night={night} />
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
      <group userData={NO_MERGE}>
        <Cruiser animate={animate} />
        <MooredBoats animate={animate} />
      </group>
      <WelcomeSign night={night} />
    </group>
  );
}

// Flo's Bungalow: a Maldives-style overwater villa off the east beach. A
// rope-railed boardwalk runs out from the sand to a platform on stilts. The
// villa (white walls, big glass sliding doors, a steep thatched hip roof)
// fills the north half; the sun deck wraps around it with a plunge pool,
// loungers, a ladder down into the lagoon, Flo's chair facing the sunrise,
// and a glass floor panel with fish and coral swimming underneath.
const VILLA = { x0: 17.4, x1: 20.2, z0: -9.4, z1: -7.6, h: 1.3 };
const POOL = { x0: 20.45, x1: 21.85, z0: -9.35, z1: -7.75 };
const GLASS = { x0: 19.0, x1: 20.2, z0: -6.05, z1: -5.0 };
const FLO_LADDER_Z = -5.3;

const VM = {
  thatch: std('#d8ae62', { side: THREE.DoubleSide }),
  thatchDark: std('#b98a45', { side: THREE.DoubleSide }),
  pool: std('#4fd6e6', { emissive: '#36c4dc', emissiveIntensity: 0.18, roughness: 0.15 }),
  glassFloor: new THREE.MeshStandardMaterial({ color: '#c8f6ff', emissive: '#6fe6ff', emissiveIntensity: 0.06, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false }),
  // Calm water seen through the glass floor (sits just above the wave crests).
  window: new THREE.MeshStandardMaterial({ color: '#5fe3ea', transparent: true, opacity: 0.32, roughness: 0.2, depthWrite: false }),
  coralPink: std('#ff6f91'),
  coralOrange: std('#ff9a3c'),
  coralPurple: std('#a46cf0'),
  coralYellow: std('#ffd23f'),
  sand: std('#e9d6a4'),
  float: std('#ff6f91'),
  lounger: std('#f2a3b8'),
};

// Little reef fish: a flat diamond body (nose along +z) with a tail fin.
const FISH_BODY = new THREE.OctahedronGeometry(0.075, 0).scale(0.5, 0.85, 1.6);
const FISH_TAIL = new THREE.ConeGeometry(0.06, 0.1, 4).rotateX(Math.PI / 2).scale(0.3, 1, 1).translate(0, 0, -0.15);
const FISH = [
  { c: std('#ff8a2a'), r: 0.42, w: 0.55, ph: 0, y: 0.15 },
  { c: std('#ffe14d'), r: 0.3, w: -0.75, ph: 1.7, y: 0.18 },
  { c: std('#3fb6ff'), r: 0.5, w: 0.4, ph: 3.4, y: 0.13 },
  { c: std('#ff5da2'), r: 0.24, w: 0.9, ph: 4.6, y: 0.19 },
  { c: std('#7cf0a0'), r: 0.36, w: -0.5, ph: 2.5, y: 0.16 },
];

function GlassFloorReef({ animate }) {
  const refs = useRef([]);
  const cx = (GLASS.x0 + GLASS.x1) / 2;
  const cz = (GLASS.z0 + GLASS.z1) / 2;
  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    for (let i = 0; i < FISH.length; i++) {
      const g = refs.current[i];
      if (!g) continue;
      const f = FISH[i];
      const a = f.ph + t * f.w;
      const r = f.r * (1 + 0.15 * Math.sin(t * 0.3 + f.ph));
      g.position.set(cx + Math.cos(a) * r, f.y + Math.sin(t * 1.3 + f.ph) * 0.02, cz + Math.sin(a) * r * 0.8);
      const s = Math.sign(f.w);
      g.rotation.y = Math.atan2(-Math.sin(a) * s, Math.cos(a) * 0.8 * s) + Math.sin(t * 9 + i) * 0.12;
    }
  });
  return (
    <group>
      {/* calm water under the glass */}
      <mesh position={[cx, 0.26, cz]} rotation={[-Math.PI / 2, 0, 0]} material={VM.window} renderOrder={3}>
        <planeGeometry args={[GLASS.x1 - GLASS.x0 + 0.5, GLASS.z1 - GLASS.z0 + 0.5]} />
      </mesh>
      {/* coral cluster rising from the lagoon floor */}
      <group position={[cx + 0.05, 0, cz + 0.05]}>
        <mesh position={[0, -0.65, 0]} scale={[0.7, 0.18, 0.55]} material={VM.sand}>
          <icosahedronGeometry args={[1, 0]} />
        </mesh>
        <Cone p={[-0.18, -0.3, 0.05]} rad={0.14} h={0.75} seg={5} m={VM.coralPink} />
        <Cyl p={[-0.05, -0.3, -0.12]} rt={0.03} rb={0.06} h={0.72} seg={5} m={VM.coralPink} r={[0.25, 0, -0.3]} />
        <Cyl p={[0.12, -0.32, -0.08]} rt={0.03} rb={0.06} h={0.68} seg={5} m={VM.coralOrange} r={[-0.2, 0, 0.35]} />
        <mesh position={[0.2, -0.05, 0.14]} scale={[0.17, 0.12, 0.15]} material={VM.coralPurple}>
          <icosahedronGeometry args={[1, 0]} />
        </mesh>
        <mesh position={[0.2, -0.4, 0.14]} material={VM.coralPurple}>
          <cylinderGeometry args={[0.07, 0.12, 0.6, 5]} />
        </mesh>
        <mesh position={[-0.3, -0.12, -0.2]} rotation={[0.2, 0.6, 0]} scale={[0.22, 0.26, 0.03]} material={VM.coralOrange}>
          <icosahedronGeometry args={[1, 0]} />
        </mesh>
        <Cyl p={[-0.3, -0.45, -0.2]} rt={0.03} rb={0.05} h={0.5} seg={4} m={VM.coralOrange} />
        {[[0.02, 0.07], [-0.12, -0.02], [0.08, 0.2]].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.06 - i * 0.03, z]} material={VM.coralYellow}>
            <icosahedronGeometry args={[0.045, 0]} />
          </mesh>
        ))}
      </group>
      {FISH.map((f, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el)}>
          <mesh geometry={FISH_BODY} material={f.c} />
          <mesh geometry={FISH_TAIL} material={f.c} />
        </group>
      ))}
    </group>
  );
}

// A rope rail: posts along a polyline with a gently sagging rope between them.
function RopeRail({ pts, y, h = 0.5, step = 1.0 }) {
  const { posts, ropes } = useMemo(() => {
    const posts = [];
    const ropes = [];
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, az] = pts[s];
      const [bx, bz] = pts[s + 1];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
      for (let i = 0; i <= n; i++) {
        if (s > 0 && i === 0) continue;
        posts.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]);
      }
    }
    for (let i = 0; i < posts.length - 1; i++) {
      const [ax, az] = posts[i];
      const [bx, bz] = posts[i + 1];
      const m = [(ax + bx) / 2, y + h - 0.12, (az + bz) / 2];
      ropes.push([[ax, y + h - 0.04, az], m], [m, [bx, y + h - 0.04, bz]]);
    }
    return { posts, ropes };
  }, [pts, y, h, step]);
  return (
    <group>
      {posts.map(([x, z], i) => (
        <group key={`p${i}`}>
          <Cyl p={[x, y + h / 2, z]} rt={0.035} rb={0.045} h={h} m={M.darkWood} />
          <Cyl p={[x, y + h + 0.02, z]} rt={0.05} h={0.05} m={M.wood} />
        </group>
      ))}
      {ropes.map(([a, b], i) => (
        <Beam key={`r${i}`} a={a} b={b} r={0.016} m={M.rope} seg={4} />
      ))}
    </group>
  );
}

// Planter box with flowers.
function Planter({ p }) {
  return (
    <group position={p}>
      <Box p={[0, 0.1, 0]} s={[0.36, 0.2, 0.24]} m={M.darkWood} />
      {[[-0.1, '#ff5d8f'], [0, '#ffd23f'], [0.1, '#f25cff']].map(([dx, c]) => (
        <mesh key={dx} position={[dx, 0.26, 0]}>
          <icosahedronGeometry args={[0.07, 0]} />
          <meshStandardMaterial color={c} flatShading />
        </mesh>
      ))}
      <Cone p={[0, 0.3, 0.05]} rad={0.08} h={0.22} seg={5} m={M.launch} />
    </group>
  );
}

function Bungalow({ night, animate }) {
  const W = FLO_WALK;
  const D = FLO_DECK;
  const y = D.y;
  const windowMat = useGlowMaterial('#ffe2a8', night, 0.05, 1.4);
  const edgeMat = useGlowMaterial('#6ff3ff', night, 0.35, 1.3);
  const seat = bungalowFront(1.55);
  const wz = (W.z0 + W.z1) / 2;
  const rampBottom = Math.max(terrainY(W.x0 - W.ramp.len, wz), 0);
  const rampAngle = Math.atan2(y - rampBottom, W.ramp.len);
  const vx = (VILLA.x0 + VILLA.x1) / 2;
  const vz = (VILLA.z0 + VILLA.z1) / 2;
  const vw = VILLA.x1 - VILLA.x0;
  const vd = VILLA.z1 - VILLA.z0;
  const eaveY = y + VILLA.h + 0.02;
  const apexY = y + VILLA.h + 1.45;
  const roofHX = vw / 2 + 0.45;
  const roofHZ = vd / 2 + 0.5;
  const roofZ = vz + 0.08;
  const deckPart = (x0, x1, z0, z1) => ({ p: [(x0 + x1) / 2, y - 0.07, (z0 + z1) / 2], s: [x1 - x0, 0.14, z1 - z0] });
  const deckParts = [
    deckPart(D.x0, D.x1, D.z0, GLASS.z0),
    deckPart(D.x0, D.x1, GLASS.z1, D.z1),
    deckPart(D.x0, GLASS.x0, GLASS.z0, GLASS.z1),
    deckPart(GLASS.x1, D.x1, GLASS.z0, GLASS.z1),
  ];
  const stilts = [];
  for (const x of [17.2, 18.4, 19.6, 20.8, 21.8]) {
    for (const z of [-9.4, -8.2, -7.0, -5.8, -4.6]) {
      if (x > GLASS.x0 - 0.15 && x < GLASS.x1 + 0.15 && z > GLASS.z0 - 0.15 && z < GLASS.z1 + 0.15) continue;
      stilts.push([x, z]);
    }
  }
  const walkPosts = [];
  for (let x = W.x0 + 0.3; x < W.x1; x += 1.2) walkPosts.push(x);
  const plankZs = [];
  for (let z = D.z0 + 0.35; z < D.z1; z += 0.5) plankZs.push(z);
  const glassCx = (GLASS.x0 + GLASS.x1) / 2;
  const glassCz = (GLASS.z0 + GLASS.z1) / 2;
  const gw = GLASS.x1 - GLASS.x0;
  const gd = GLASS.z1 - GLASS.z0;
  const ladderTop = y + 0.55;
  const ladderBot = -0.75;
  const ladderLen = ladderTop - ladderBot;
  // stable arrays for the rope rails (Beam memoizes on them)
  const rails = useMemo(
    () => ({
      walkN: [[W.x0 + 0.05, W.z0 + 0.04], [W.x1, W.z0 + 0.04]],
      walkS: [[W.x0 + 0.05, W.z1 - 0.04], [W.x1, W.z1 - 0.04]],
      south: [[D.x0 + 0.05, W.z1 + 0.05], [D.x0 + 0.05, D.z1 - 0.05], [D.x1 - 0.05, D.z1 - 0.05], [D.x1 - 0.05, FLO_LADDER_Z + 0.32]],
      east: [[D.x1 - 0.05, FLO_LADDER_Z - 0.32], [D.x1 - 0.05, D.z0 + 0.05], [VILLA.x1 + 0.1, D.z0 + 0.05]],
      west: [[D.x0 + 0.05, W.z0 - 0.05], [D.x0 + 0.05, VILLA.z1 - 0.1]],
    }),
    [W, D]
  );
  return (
    <group>
      {/* ---- boardwalk out from the beach ---- */}
      <Box p={[(W.x0 + W.x1) / 2, y - 0.06, wz]} s={[W.x1 - W.x0, 0.12, W.z1 - W.z0]} m={M.plank} />
      {Array.from({ length: 12 }, (_, i) => (
        <Box key={`wl${i}`} p={[W.x0 + 0.15 + i * 0.3, y + 0.002, wz]} s={[0.025, 0.005, W.z1 - W.z0 - 0.04]} m={M.darkWood} />
      ))}
      {walkPosts.flatMap((x) =>
        [W.z0 + 0.05, W.z1 - 0.05].map((z) => <Cyl key={`ws${x}${z}`} p={[x, y - 0.75, z]} rt={0.07} h={1.4} m={M.darkWood} />)
      )}
      <Box p={[W.x0 - W.ramp.len / 2, (y + rampBottom) / 2, wz]} s={[Math.hypot(W.ramp.len, y - rampBottom), 0.08, W.z1 - W.z0]} r={[0, 0, rampAngle]} m={M.plank} />
      <RopeRail pts={rails.walkN} y={y} step={1.2} />
      <RopeRail pts={rails.walkS} y={y} step={1.2} />
      <Lantern p={[W.x0 + 0.05, y + 0.68, W.z0 + 0.04]} night={night} />
      <Lantern p={[W.x0 + 0.05, y + 0.68, W.z1 - 0.04]} night={night} />

      {/* ---- platform on stilts, with a hole for the glass floor ---- */}
      {deckParts.map((d, i) => (
        <Box key={`dp${i}`} p={d.p} s={d.s} m={M.plank} />
      ))}
      {plankZs.flatMap((z) => {
        const inHole = z > GLASS.z0 && z < GLASS.z1;
        const segs = inHole ? [[D.x0, GLASS.x0], [GLASS.x1, D.x1]] : [[D.x0, D.x1]];
        return segs.map(([a, b]) => <Box key={`dl${z}${a}`} p={[(a + b) / 2, y + 0.002, z]} s={[b - a - 0.04, 0.005, 0.025]} m={M.darkWood} />);
      })}
      {/* fascia board around the edge */}
      <Box p={[(D.x0 + D.x1) / 2, y - 0.2, D.z1]} s={[D.x1 - D.x0, 0.14, 0.05]} m={M.darkWood} />
      <Box p={[(D.x0 + D.x1) / 2, y - 0.2, D.z0]} s={[D.x1 - D.x0, 0.14, 0.05]} m={M.darkWood} />
      <Box p={[D.x1, y - 0.2, (D.z0 + D.z1) / 2]} s={[0.05, 0.14, D.z1 - D.z0]} m={M.darkWood} />
      <Box p={[D.x0, y - 0.2, (D.z0 + D.z1) / 2]} s={[0.05, 0.14, D.z1 - D.z0]} m={M.darkWood} />
      {stilts.map(([x, z], i) => (
        <Cyl key={`st${i}`} p={[x, -0.2, z]} rt={0.09} h={1.4} m={M.darkWood} />
      ))}

      {/* ---- glass floor panel: look straight down at the reef ---- */}
      <mesh position={[glassCx, y - 0.03, glassCz]} material={VM.glassFloor} renderOrder={4}>
        <boxGeometry args={[gw, 0.04, gd]} />
      </mesh>
      <Box p={[glassCx, y + 0.008, GLASS.z0]} s={[gw + 0.08, 0.02, 0.06]} m={edgeMat} />
      <Box p={[glassCx, y + 0.008, GLASS.z1]} s={[gw + 0.08, 0.02, 0.06]} m={edgeMat} />
      <Box p={[GLASS.x0, y + 0.008, glassCz]} s={[0.06, 0.02, gd]} m={edgeMat} />
      <Box p={[GLASS.x1, y + 0.008, glassCz]} s={[0.06, 0.02, gd]} m={edgeMat} />
      <Box p={[glassCx, y + 0.004, glassCz]} s={[0.03, 0.012, gd]} m={M.darkWood} />
      <group userData={NO_MERGE}>
        <GlassFloorReef animate={animate} />
      </group>

      {/* ---- the villa ---- */}
      <Box p={[vx, y + VILLA.h / 2, vz]} s={[vw, VILLA.h, vd]} m={M.white} />
      <Box p={[vx, y + 0.08, vz]} s={[vw + 0.04, 0.16, vd + 0.04]} m={M.darkWood} />
      <Box p={[vx, y + VILLA.h - 0.04, vz]} s={[vw + 0.06, 0.08, vd + 0.06]} m={M.wood} />
      {[[VILLA.x0, VILLA.z0], [VILLA.x1, VILLA.z0], [VILLA.x0, VILLA.z1], [VILLA.x1, VILLA.z1]].map(([x, z], i) => (
        <Box key={`vc${i}`} p={[x, y + VILLA.h / 2, z]} s={[0.1, VILLA.h, 0.1]} m={M.wood} />
      ))}
      {/* big glass sliding doors on the sun deck side (one slid open) */}
      <Box p={[vx, y + 0.62, VILLA.z1 + 0.012]} s={[2.1, 1.12, 0.03]} m={M.darkWood} />
      <Box p={[vx, y + 0.6, VILLA.z1 + 0.03]} s={[1.98, 1.02, 0.01]} m={windowMat} />
      <Box p={[vx + 0.5, y + 0.6, VILLA.z1 + 0.06]} s={[0.97, 1.02, 0.025]} m={M.glass} />
      <Box p={[vx + 0.2, y + 0.6, VILLA.z1 + 0.1]} s={[0.97, 1.02, 0.025]} m={M.glass} />
      {[vx - 0.29, vx + 0.02, vx + 0.69, vx + 0.99].map((x, i) => (
        <Box key={`mu${i}`} p={[x, y + 0.6, VILLA.z1 + (i < 2 ? 0.1 : 0.06)]} s={[0.04, 1.02, 0.035]} m={M.darkWood} />
      ))}
      <Box p={[vx, y + 0.07, VILLA.z1 + 0.08]} s={[2.1, 0.03, 0.14]} m={M.darkWood} />
      {/* east window toward the pool, west door toward the boardwalk */}
      <Box p={[VILLA.x1 + 0.02, y + 0.75, vz]} s={[0.03, 0.5, 0.8]} m={windowMat} />
      <Box p={[VILLA.x1 + 0.035, y + 0.75, vz]} s={[0.02, 0.06, 0.86]} m={M.darkWood} />
      <Box p={[VILLA.x0 - 0.02, y + 0.5, vz + 0.2]} s={[0.04, 0.95, 0.5]} m={M.darkWood} />
      <mesh position={[VILLA.x0 - 0.05, y + 0.5, vz + 0.38]} material={M.brass}>
        <icosahedronGeometry args={[0.03, 0]} />
      </mesh>
      {/* steep thatched hip roof with a layered fringe */}
      {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz], i) => (
        <Beam key={`vr${i}`} a={[vx + sx * roofHX, eaveY, roofZ + sz * roofHZ]} b={[vx + sx * 0.45, apexY, roofZ]} r={0.04} m={M.darkWood} />
      ))}
      <group position={[vx, 0, roofZ]}>
        <CabanaThatch eaveY={eaveY} apexY={apexY} hx={roofHX} hz={roofHZ} ridgeX={0.45} m={VM.thatch} />
        <CabanaThatch eaveY={eaveY + 0.6} apexY={apexY + 0.1} hx={roofHX * 0.72} hz={roofHZ * 0.66} ridgeX={0.45} m={VM.thatchDark} />
        <Fringe p={[0, eaveY, 0]} halfX={roofHX} halfZ={roofHZ} drop={0.26} />
        <Beam a={[-0.6, apexY + 0.06, 0]} b={[0.6, apexY + 0.06, 0]} r={0.07} m={M.darkWood} />
        <Cone p={[-0.6, apexY + 0.2, 0]} rad={0.06} h={0.3} seg={5} m={M.darkWood} />
        <Cone p={[0.6, apexY + 0.2, 0]} rad={0.06} h={0.3} seg={5} m={M.darkWood} />
      </group>
      <Lantern p={[VILLA.x0 + 0.1, y + 1.05, roofZ + roofHZ - 0.1]} night={night} />
      <Lantern p={[VILLA.x1 - 0.1, y + 1.05, roofZ + roofHZ - 0.1]} night={night} />

      {/* ---- plunge pool ---- */}
      <Box p={[(POOL.x0 + POOL.x1) / 2, y + 0.06, (POOL.z0 + POOL.z1) / 2]} s={[POOL.x1 - POOL.x0, 0.12, POOL.z1 - POOL.z0]} m={M.white} />
      <Box p={[(POOL.x0 + POOL.x1) / 2, y + 0.1, (POOL.z0 + POOL.z1) / 2]} s={[POOL.x1 - POOL.x0 - 0.18, 0.03, POOL.z1 - POOL.z0 - 0.18]} m={VM.pool} />
      <mesh position={[POOL.x0 + 0.45, y + 0.13, POOL.z0 + 0.5]} rotation={[Math.PI / 2, 0, 0]} material={VM.float}>
        <torusGeometry args={[0.15, 0.05, 5, 10]} />
      </mesh>
      <Beam a={[POOL.x1 - 0.2, y + 0.1, POOL.z1 - 0.12]} b={[POOL.x1 - 0.2, y + 0.4, POOL.z1 - 0.02]} r={0.015} m={M.brass} />
      <Beam a={[POOL.x1 - 0.45, y + 0.1, POOL.z1 - 0.12]} b={[POOL.x1 - 0.45, y + 0.4, POOL.z1 - 0.02]} r={0.015} m={M.brass} />

      {/* ---- sun deck: loungers, Flo's chair, side table, planters ---- */}
      <group position={[0, y, 0]}>
        <Lounger s={{ x: 17.5, z: -5.2, rotY: 0 }} color={VM.lounger} />
        <Lounger s={{ x: 18.22, z: -5.2, rotY: 0 }} color={M.floCushion} />
        <TowerChair seat={{ x: seat.x, z: seat.z, rotY: BUNGALOW_ROT }} top={0} cushion={M.floCushion} />
        <group position={[seat.x, 0, seat.z - 0.62]}>
          <Cyl p={[0, 0.17, 0]} rt={0.03} h={0.34} m={M.darkWood} />
          <Cyl p={[0, 0.35, 0]} rt={0.16} h={0.04} seg={8} m={M.bamboo} />
          <mesh position={[0, 0.43, 0]} material={M.coconut}>
            <icosahedronGeometry args={[0.07, 0]} />
          </mesh>
          <Cyl p={[0.03, 0.52, 0]} rt={0.008} h={0.12} m={M.white} r={[0, 0, 0.3]} />
        </group>
        <Planter p={[D.x1 - 0.35, 0, D.z1 - 0.3]} />
        <Planter p={[D.x0 + 0.3, 0, W.z0 - 0.3]} />
        <group position={[VILLA.x1 - 0.25, 0, VILLA.z1 + 0.3]}>
          <Cyl p={[0, 0.09, 0]} rt={0.1} rb={0.08} h={0.18} seg={8} m={M.claude} />
          <Cone p={[0, 0.32, 0]} rad={0.14} h={0.32} seg={6} m={M.launch} />
        </group>
      </group>

      {/* ---- rope rails, ladder into the lagoon ---- */}
      <RopeRail pts={rails.south} y={y} h={0.45} />
      <RopeRail pts={rails.east} y={y} h={0.45} />
      <RopeRail pts={rails.west} y={y} h={0.45} />
      <group position={[D.x1 + 0.06, 0, FLO_LADDER_Z]}>
        {[-0.2, 0.2].map((z) => (
          <Box key={z} p={[0, (ladderTop + ladderBot) / 2, z]} s={[0.05, ladderLen, 0.05]} m={M.white} />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <Box key={`lr${i}`} p={[0, ladderBot + 0.15 + i * 0.25, 0]} s={[0.05, 0.035, 0.4]} m={M.white} />
        ))}
        {[-0.2, 0.2].map((z) => (
          <Beam key={`lh${z}`} a={[0, ladderTop, z]} b={[-0.25, ladderTop, z]} r={0.022} m={M.brass} />
        ))}
      </group>
      <Lantern p={[D.x1 - 0.05, y + 0.6, D.z1 - 0.05]} night={night} />
      <Lantern p={[D.x0 + 0.05, y + 0.6, W.z1 + 0.05]} night={night} />
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
      <Water tint={sky.water} animate={animate} onTap={onGroundTap} glow={animate ? sky.stars : 0} lowPower={lowPower} />
      <Foam animate={animate} />
      <SandPaths />
      <Palms animate={animate} />
      {/* Buildings never move (flags, torches, boats and the helicopter opt
          out with NO_MERGE), so they're merged into a few draw calls. */}
      <StaticMerge version={night > 0.3 ? 1 : 0}>
        <Flowers />
        <Rocks />
        <Tower night={night} animate={animate} />
        <Cabana night={night} />
        <Patio />
        <Lanai night={night} animate={animate} />
        <TikiHut night={night} animate={animate} />
        <MoneyDesk night={night} />
        <Dock night={night} animate={animate} />
        <Bungalow night={night} animate={animate} />
        <Lookout night={night} animate={animate} />
        <BeachChair />
      </StaticMerge>
      {showLabels && <ZoneLabels onZoneTap={onZoneTap} />}
    </group>
  );
}
