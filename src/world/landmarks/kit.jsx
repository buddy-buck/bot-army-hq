import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOWER_LEG_H, terrainY } from '../../utils/paths.js';

// The island's building kit: the shared low-poly material set and the small
// helpers (boxes, posts, thatch fringe, string lights, lanterns, torches)
// that Island.jsx and the landmarks are built from.

export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

export const M = {
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

export function Box({ p, s, m, r }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <boxGeometry args={s} />
    </mesh>
  );
}

export function Cyl({ p, rt = 0.06, rb, h, m, seg = 6, r }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <cylinderGeometry args={[rt, rb ?? rt, h, seg]} />
    </mesh>
  );
}

export function Cone({ p, rad, h, m, seg = 8, r }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <coneGeometry args={[rad, h, seg]} />
    </mesh>
  );
}

// Square-based roof: halfX, halfZ are the half-widths of the base.
export function Roof({ p, halfX, halfZ, h, m }) {
  return <mesh position={p} geometry={PYRAMID} material={m} scale={[halfX * PYR_K, h, halfZ * PYR_K]} />;
}

export function useGlowMaterial(color, night, base = 0.1, boost = 1.3) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, flatShading: true }), [color, base]);
  useEffect(() => {
    mat.emissiveIntensity = base + night * boost;
  }, [mat, night, base, boost]);
  return mat;
}


// A beam between two points (rafters, bamboo braces).
const UP = new THREE.Vector3(0, 1, 0);
export function Beam({ a, b, r = 0.04, m, seg = 5 }) {
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
export function BambooPost({ p, h, r = 0.08, m = M.bamboo }) {
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
export function makeFringe(halfX, halfZ, drop, round = false) {
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

export function Fringe({ p, halfX, halfZ, drop = 0.28, round = false, m = M.fringe }) {
  const geo = useMemo(() => makeFringe(halfX, halfZ, drop, round), [halfX, halfZ, drop, round]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh position={p} geometry={geo} material={m} />;
}

// Festoon string lights: bulbs hung along a sagging wire. They glow warmly
// at night and are just colored glass beads by day.
const BULB_COLORS = ['#ffd27a', '#ff8fb8', '#7fe3d8', '#ffb35c'];
const BULB_GEO = new THREE.IcosahedronGeometry(0.055, 0);
export function StringLights({ points, sag = 0.3, per = 7, night }) {
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

export function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
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

export function Flag({ p, color, animate, w = 0.6, h = 0.36 }) {
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

export function Lantern({ p, night, color = '#ffcf6b' }) {
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

// Bamboo chair with a cushion (tower chairs, Flo's porch chair).
export function TowerChair({ seat, top, cushion }) {
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

export function Torch({ p, night, animate }) {
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

// Tap targets: pointer cursor on hover, and a tap that isn't the end of a drag.
export const pointer = {
  onPointerOver: (e) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
  },
  onPointerOut: () => {
    document.body.style.cursor = '';
  },
};
export const tap = (fn) => (e) => {
  if (e.delta > 8) return;
  e.stopPropagation();
  fn(e);
};

// Soft additive glow ball (lamps, torches). Fog off so it reads at a distance.
export const GLOW_GEO = new THREE.SphereGeometry(1, 12, 8);
export function glowMaterial(color, opacity = 0.25) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
}

// A soft round glow: a camera-facing sprite with a radial falloff. Never
// catches taps. Set its material's opacity to fade it.
let glowTex = null;
export function softGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
export function spriteGlowMaterial(color, opacity = 0) {
  return new THREE.SpriteMaterial({ map: softGlowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
}
const noRay = () => null;
export function SoftGlow({ p, size = 1, material }) {
  return <sprite position={p} scale={[size, size, size]} material={material} raycast={noRay} />;
}

// A crisp canvas texture. draw(ctx, w, h) paints it.
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 0 by day, rising through golden hour to 1 at night: lamps and beams.
export function duskFactor(sky) {
  const h = sky.hour ?? 12;
  const golden = h >= 17 && h < 19.5 ? Math.min(1, Math.max(0, (h - 17.2) / 1.3)) * 0.85 : 0;
  return Math.min(1, Math.max(sky.stars || 0, golden));
}

// Chief's Tower helipad, on top of the canopy. y is the pad's top surface.
export const TOWER_CANOPY_Y = terrainY(0, 0) + TOWER_LEG_H + 0.08 + 2.05;
export const HELIPAD = { x: 0, z: 0, r: 1.45, y: TOWER_CANOPY_Y + 0.95 };
// Live helipad state, written by the helicopter every frame:
//   wash: 0..1 rotor downwash strength near the pad (ripples the thatch)
//   onPad: true while the helicopter sits on the pad
export const helipadState = { wash: 0, onPad: false };
