import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FLO, terrainY } from '../../utils/paths.js';
import { Beam, Box, Cone, Cyl, Fringe, GLOW_GEO, Lantern, M, TowerChair, canvasTexture, glowMaterial, pointer, std, tap, useGlowMaterial } from './kit.jsx';
import FloPool, { POOL, SD } from './FloPool.jsx';

// Flo's overwater villa, Maldives style. A boardwalk with rope rails runs
// out from the beach to a platform on stilts. On it: the villa (white walls,
// glass sliding fronts, a curved layered thatch roof), Flo's porch chair
// looking west at the sunset, and a glass floor panel to watch the lagoon
// below. Out back, a sun deck with a plunge pool, loungers and a ladder down
// into the water. Warm windows and an underwater light glow at night.
// Tap the glass floor: the camera looks straight down through it at the
// coral garden and the fish. Crew bots drop by for a dip in the pool now
// and then (FloPool.jsx).

const P = FLO.platform;
const B = FLO.boardwalk;
const G = FLO.glass;
const H = FLO.house;
const DY = P.y; // deck top

// Where Flo's zone tag floats (clear of the roof ridge).
export const FLO_TAG_Y = DY + 4.05;

// House footprint in its own frame (+z = the porch side, looking west).
const HX = 1.6;
const HZ0 = -1.25;
const HZ1 = 0.6;
const HCZ = (HZ0 + HZ1) / 2;
const WALL_H = 1.9;

const VM = {
  glass: new THREE.MeshStandardMaterial({ color: '#d6f2fb', transparent: true, opacity: 0.38, roughness: 0.08, metalness: 0.1, emissive: '#ffc874', emissiveIntensity: 0, flatShading: true, depthWrite: false }),
  floorGlass: new THREE.MeshStandardMaterial({ color: '#9fe9f5', transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.1, emissive: '#48d8e8', emissiveIntensity: 0, depthWrite: false }),
  glassEdge: new THREE.MeshBasicMaterial({ color: '#e9fdff', transparent: true, opacity: 0.28, depthWrite: false }),
  frame: std('#5a3d26'),
  steel: std('#c9d3d8', { roughness: 0.35, metalness: 0.4 }),
  sheet: std('#fbfaf5'),
  throw: std('#5fc4b6'),
  rug: std('#e9dcc0'),
  pool: new THREE.MeshStandardMaterial({ color: '#4fe0ea', emissive: '#30c9db', emissiveIntensity: 0.25, roughness: 0.1, transparent: true, opacity: 0.88, flatShading: true }),
  poolTile: std('#f4fbfb'),
  cushion: std('#8fd3c1'),
  // the lagoon under the glass (see UnderGlass)
  sand: std('#b8d8c2'), // sand seen through a little water
  coralPink: std('#ff7aa8'),
  coralOrange: std('#ff9a4d'),
  coralPurple: std('#a27bff'),
  coralYellow: std('#ffd23f'),
  star: std('#ff8a3d'),
  pebble: std('#9aa3a8'),
  shell: std('#ffe3ec'),
  weed: std('#3fae6a'),
  // Invisible, depth only: keeps the sea surface (which writes depth) from
  // drawing over the view through the glass floor. See Platform.
  seaMask: new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, depthWrite: true }),
  rope: std('#d9c79a'),
  leaf: std('#3f9b4f'),
};

// A curved hip roof lofted through rings of [halfX, halfZ, y]. Flat shaded,
// so the rings read as layered thatch.
function loftRoof(rings, cz) {
  const pos = [];
  const corners = (hx, hz) => [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  const edges = [[3, 2], [2, 1], [1, 0], [0, 3]];
  for (let r = 0; r < rings.length - 1; r++) {
    const [ax, az, ay] = rings[r];
    const [bx, bz, by] = rings[r + 1];
    const c0 = corners(ax, az);
    const c1 = corners(bx, bz);
    for (const [i, j] of edges) {
      const a0 = [c0[i][0], ay, c0[i][1] + cz];
      const b0 = [c0[j][0], ay, c0[j][1] + cz];
      const a1 = [c1[i][0], by, c1[i][1] + cz];
      const b1 = [c1[j][0], by, c1[j][1] + cz];
      pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
    }
  }
  // close the ridge
  const [tx, tz, ty] = rings[rings.length - 1];
  pos.push(-tx, ty, -tz + cz, -tx, ty, tz + cz, tx, ty, tz + cz, -tx, ty, -tz + cz, tx, ty, tz + cz, tx, ty, -tz + cz);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Flared eaves, steep near the top: the swept look of a Maldives roof.
function roofRings(bot, top, y0, y1, n = 6) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k = (1 - t) ** 2;
    out.push([top[0] + (bot[0] - top[0]) * k, top[1] + (bot[1] - top[1]) * k, y0 + (y1 - y0) * t]);
  }
  return out;
}

const ROOF_MAIN = loftRoof(roofRings([2.15, 1.6], [0.32, 0.05], DY + WALL_H + 0.05, DY + 3.35), HCZ);
const ROOF_SKIRT = loftRoof(roofRings([2.3, 1.75], [1.55, 1.05], DY + WALL_H - 0.08, DY + WALL_H + 0.4, 3), HCZ);
const SOFFIT = new THREE.PlaneGeometry(4.3, 3.2).rotateX(Math.PI / 2);

const STAR_GEO = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.05 : 0.14;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i) s.lineTo(x, y);
    else s.moveTo(x, y);
  }
  return new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }).rotateX(-Math.PI / 2);
})();

// Pieces of the platform deck around the glass-floor hole (world coords).
const GX0 = G.x - G.hx;
const GX1 = G.x + G.hx;
const GZ0 = G.z - G.hz;
const GZ1 = G.z + G.hz;
const DECK_PIECES = [
  [P.x0, P.x1, P.z0, GZ0],
  [P.x0, P.x1, GZ1, P.z1],
  [P.x0, GX0, GZ0, GZ1],
  [GX1, P.x1, GZ0, GZ1],
];

const floorY = (x, z) => Math.max(terrainY(x, z), -0.95);

function Stilt({ x, z, top = DY - 0.1, r = 0.085 }) {
  const b = floorY(x, z) - 0.05;
  return <Cyl p={[x, (top + b) / 2, z]} rt={r} rb={r * 1.15} h={top - b} m={M.darkWood} />;
}

// A sagging rope between two post tops.
function Rope({ a, b, sag = 0.07 }) {
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - sag, (a[2] + b[2]) / 2];
  return (
    <>
      <Beam a={a} b={mid} r={0.018} m={VM.rope} seg={4} />
      <Beam a={mid} b={b} r={0.018} m={VM.rope} seg={4} />
    </>
  );
}

function Planter({ p, colors = ['#ff5d8f', '#ffd23f', '#f25cff'] }) {
  return (
    <group position={p}>
      <Box p={[0, 0.12, 0]} s={[0.36, 0.24, 0.36]} m={M.darkWood} />
      <Cone p={[0, 0.38, 0]} rad={0.2} h={0.32} seg={6} m={VM.leaf} />
      {colors.map((c, i) => {
        const a = (i / colors.length) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.12, 0.33 + i * 0.04, Math.sin(a) * 0.12]}>
            <icosahedronGeometry args={[0.07, 0]} />
            <meshStandardMaterial color={c} flatShading />
          </mesh>
        );
      })}
    </group>
  );
}

function Lounger({ p, rotY }) {
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <Box p={[0, 0.2, 0.12]} s={[0.5, 0.06, 0.95]} m={M.white} />
      <Box p={[0, 0.245, 0.12]} s={[0.44, 0.04, 0.9]} m={VM.cushion} />
      <group position={[0, 0.22, -0.34]} rotation={[0.9, 0, 0]}>
        <Box p={[0, 0, -0.26]} s={[0.5, 0.06, 0.52]} m={M.white} />
        <Box p={[0, 0.04, -0.26]} s={[0.44, 0.04, 0.48]} m={VM.cushion} />
      </group>
      {[[-0.2, 0.5], [0.2, 0.5], [-0.2, -0.3], [0.2, -0.3]].map(([x, z], i) => (
        <Box key={i} p={[x, 0.09, z]} s={[0.05, 0.18, 0.05]} m={M.white} />
      ))}
    </group>
  );
}

// A sliding glass front: two corner pillars, a lintel, two glass panes (one
// slid open) in dark frames.
function GlassFront({ z, flip = false }) {
  const s = flip ? -1 : 1;
  return (
    <group position={[0, DY, z]}>
      <Box p={[-HX + 0.15, WALL_H / 2, 0]} s={[0.3, WALL_H, 0.14]} m={M.white} />
      <Box p={[HX - 0.15, WALL_H / 2, 0]} s={[0.3, WALL_H, 0.14]} m={M.white} />
      <Box p={[0, WALL_H - 0.08, 0]} s={[HX * 2, 0.16, 0.16]} m={M.white} />
      {[
        [-0.68, 0],
        [0.42, -0.07 * s],
      ].map(([x, dz], i) => (
        <group key={i} position={[x, 0, dz]}>
          <mesh position={[0, (WALL_H - 0.16) / 2, 0]} material={VM.glass} renderOrder={4}>
            <boxGeometry args={[0.98, WALL_H - 0.16, 0.025]} />
          </mesh>
          <Box p={[-0.49, (WALL_H - 0.16) / 2, 0]} s={[0.04, WALL_H - 0.16, 0.05]} m={VM.frame} />
          <Box p={[0.49, (WALL_H - 0.16) / 2, 0]} s={[0.04, WALL_H - 0.16, 0.05]} m={VM.frame} />
          <Box p={[0, 0.02, 0]} s={[1.0, 0.04, 0.05]} m={VM.frame} />
        </group>
      ))}
      <Box p={[0, 0.015, 0]} s={[HX * 2 - 0.5, 0.03, 0.1]} m={VM.frame} />
    </group>
  );
}

function House({ night }) {
  const windowMat = useGlowMaterial('#ffd27a', night, 0.05, 1.6);
  const lampMat = useGlowMaterial('#ffe0a0', night, 0.2, 1.8);
  const warm = useMemo(() => glowMaterial('#ffbf6b', 0), []);
  useEffect(() => {
    VM.glass.emissiveIntensity = night * 1.6;
    VM.glass.opacity = 0.38 + night * 0.22;
    warm.opacity = 0.3 * night;
  }, [night, warm]);
  useEffect(() => () => warm.dispose(), [warm]);
  return (
    <group position={[H.x, 0, H.z]} rotation={[0, H.rotY, 0]}>
      {/* side walls with round windows */}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Box p={[sx * (HX - 0.07), DY + WALL_H / 2, HCZ]} s={[0.14, WALL_H, HZ1 - HZ0]} m={M.white} />
          <mesh position={[sx * (HX + 0.002), DY + 1.15, HCZ]} rotation={[0, 0, Math.PI / 2]} material={windowMat}>
            <cylinderGeometry args={[0.24, 0.24, 0.02, 12]} />
          </mesh>
          <mesh position={[sx * (HX + 0.01), DY + 1.15, HCZ]} rotation={[0, Math.PI / 2, 0]} material={VM.frame}>
            <torusGeometry args={[0.25, 0.035, 4, 14]} />
          </mesh>
        </group>
      ))}
      {/* glass fronts: west to the porch, east to the sun deck */}
      <GlassFront z={HZ1 - 0.07} />
      <GlassFront z={HZ0 + 0.07} flip />
      {/* inside: a bed with a teal throw, a rug and a floor lamp */}
      <Box p={[0, DY + 0.01, HCZ]} s={[2.6, 0.02, 1.4]} m={VM.rug} />
      <group position={[-0.95, DY, HCZ]}>
        <Box p={[0, 0.17, 0]} s={[1.05, 0.3, 1.25]} m={M.wood} />
        <Box p={[0.05, 0.36, 0]} s={[0.95, 0.1, 1.18]} m={VM.sheet} />
        <Box p={[0.25, 0.42, 0]} s={[0.45, 0.04, 1.2]} m={VM.throw} />
        <Box p={[-0.36, 0.45, 0.28]} s={[0.22, 0.1, 0.4]} m={VM.sheet} />
        <Box p={[-0.36, 0.45, -0.28]} s={[0.22, 0.1, 0.4]} m={VM.sheet} />
        <Box p={[-0.52, 0.55, 0]} s={[0.06, 0.75, 1.3]} m={M.darkWood} />
      </group>
      <group position={[1.15, DY, HZ0 + 0.45]}>
        <Cyl p={[0, 0.45, 0]} rt={0.015} h={0.9} m={M.dark} />
        <Cone p={[0, 0.95, 0]} rad={0.16} h={0.2} seg={8} m={lampMat} />
      </group>
      <Box p={[0, DY + WALL_H - 0.2, HCZ]} s={[1.2, 0.04, 0.6]} m={lampMat} />
      {/* warm light filling the room at night */}
      {night > 0.15 && <mesh geometry={GLOW_GEO} material={warm} position={[0, DY + 1.0, HCZ]} scale={[1.5, 0.9, 0.95]} />}
      {/* roof: a flared lower skirt, the curved main thatch, a ridge cap */}
      <mesh geometry={ROOF_SKIRT} material={M.thatchDark} />
      <Fringe p={[0, DY + WALL_H - 0.08, HCZ]} halfX={2.3} halfZ={1.75} drop={0.22} />
      <mesh geometry={ROOF_MAIN} material={M.thatch} />
      <mesh geometry={SOFFIT} material={M.darkWood} position={[0, DY + WALL_H, HCZ]} />
      <Cyl p={[0, DY + 3.37, HCZ]} rt={0.07} h={0.75} m={M.thatchDark} r={[0, 0, Math.PI / 2]} />
      {[-0.42, 0.42].map((x) => (
        <Cone key={x} p={[x, DY + 3.5, HCZ]} rad={0.06} h={0.22} seg={5} m={M.darkWood} />
      ))}
      {/* porch lanterns and a hanging flower basket */}
      <Lantern p={[-HX + 0.15, DY + 1.55, HZ1 + 0.25]} night={night} />
      <Lantern p={[HX - 0.15, DY + 1.55, HZ1 + 0.25]} night={night} />
      <group position={[0.95, DY + 1.62, HZ1 + 0.55]}>
        <Beam a={[0, 0.3, 0]} b={[0, 0.05, 0]} r={0.01} m={VM.rope} seg={3} />
        <Cyl p={[0, 0, 0]} rt={0.13} rb={0.07} h={0.12} seg={7} m={M.darkWood} />
        {['#ff5d8f', '#ffd23f', '#f25cff', '#ffffff'].map((c, i) => (
          <mesh key={c} position={[Math.cos(i * 1.6) * 0.09, 0.08, Math.sin(i * 1.6) * 0.09]}>
            <icosahedronGeometry args={[0.055, 0]} />
            <meshStandardMaterial color={c} flatShading />
          </mesh>
        ))}
      </group>
      <SunDeck night={night} />
    </group>
  );
}

// Out back (east, in the house frame -z): a sun deck a step down, a plunge
// pool, two loungers, a parasol and a ladder into the lagoon.
// (SD and POOL live in FloPool.jsx, which walks visitors into the pool.)
function SunDeck({ night }) {
  const poolGlow = useMemo(() => glowMaterial('#5ff0ff', 0), []);
  useEffect(() => {
    VM.pool.emissiveIntensity = 0.25 + night * 1.0;
    poolGlow.opacity = 0.22 * night;
  }, [night, poolGlow]);
  useEffect(() => () => poolGlow.dispose(), [poolGlow]);
  const cz = (SD.z0 + SD.z1) / 2;
  const pool = POOL;
  const pcx = (pool.x0 + pool.x1) / 2;
  const pcz = (pool.z0 + pool.z1) / 2;
  const pw = pool.x1 - pool.x0;
  const pd = pool.z1 - pool.z0;
  const ladderZ = SD.z0 - 0.05;
  return (
    <group>
      {/* deck around the pool */}
      <Box p={[0, SD.y - 0.06, (SD.z1 + pool.z1) / 2]} s={[SD.x1 - SD.x0, 0.12, SD.z1 - pool.z1]} m={M.plank} />
      <Box p={[0, SD.y - 0.06, (pool.z0 + SD.z0) / 2]} s={[SD.x1 - SD.x0, 0.12, pool.z0 - SD.z0]} m={M.plank} />
      <Box p={[(SD.x0 + pool.x0) / 2, SD.y - 0.06, pcz]} s={[pool.x0 - SD.x0, 0.12, pd]} m={M.plank} />
      <Box p={[(pool.x1 + SD.x1) / 2, SD.y - 0.06, pcz]} s={[SD.x1 - pool.x1, 0.12, pd]} m={M.plank} />
      {/* the plunge pool: white tile rim, glowing turquoise water */}
      <Box p={[pcx, SD.y - 0.55, pcz]} s={[pw, 0.96, pd]} m={VM.poolTile} />
      <mesh position={[pcx, SD.y - 0.07, pcz]} material={VM.pool}>
        <boxGeometry args={[pw - 0.04, 0.02, pd - 0.04]} />
      </mesh>
      {[
        [pcx, pool.z1 + 0.04, pw + 0.16, 0.08],
        [pcx, pool.z0 - 0.04, pw + 0.16, 0.08],
      ].map(([x, z, w, d], i) => (
        <Box key={i} p={[x, SD.y + 0.01, z]} s={[w, 0.04, d]} m={VM.poolTile} />
      ))}
      {[pool.x0 - 0.04, pool.x1 + 0.04].map((x, i) => (
        <Box key={`r${i}`} p={[x, SD.y + 0.01, pcz]} s={[0.08, 0.04, pd]} m={VM.poolTile} />
      ))}
      {night > 0.15 && <mesh geometry={GLOW_GEO} material={poolGlow} position={[pcx, SD.y, pcz]} scale={[0.9, 0.3, 0.8]} />}
      {/* stilts */}
      {[SD.x0 + 0.12, 0, SD.x1 - 0.12].flatMap((x) =>
        [SD.z0 + 0.1, cz].map((z) => {
          const wx = H.x - z;
          const wz = H.z + x;
          const b = floorY(wx, wz) - 0.05;
          const top = SD.y - 0.12;
          return <Cyl key={`${x}${z}`} p={[x, (top + b) / 2, z]} rt={0.08} h={top - b} m={M.darkWood} />;
        })
      )}
      {/* two loungers facing the sunrise, a parasol between them (set back
          so there's a walkway past the villa's glass front to the pool) */}
      <Lounger p={[0.6, SD.y, -2.6]} rotY={Math.PI} />
      <Lounger p={[1.3, SD.y, -2.6]} rotY={Math.PI} />
      <group position={[0.95, SD.y, -3.08]}>
        <Cyl p={[0, 0.85, 0]} rt={0.025} h={1.7} m={M.white} />
        <Cone p={[0, 1.72, 0]} rad={0.75} h={0.32} seg={8} m={M.thatch} />
        <Fringe p={[0, 1.56, 0]} halfX={0.75} halfZ={0.75} drop={0.1} round />
      </group>
      {/* steel ladder down into the lagoon */}
      <group position={[-0.8, 0, ladderZ]}>
        {[-0.18, 0.18].map((x) => (
          <group key={x}>
            <Beam a={[x, SD.y + 0.45, 0.12]} b={[x, SD.y + 0.05, -0.08]} r={0.022} m={VM.steel} />
            <Beam a={[x, SD.y + 0.05, -0.08]} b={[x, -0.75, -0.12]} r={0.022} m={VM.steel} />
          </group>
        ))}
        {[-0.1, -0.35, -0.6].map((y) => (
          <Box key={y} p={[0, SD.y + y, -0.1]} s={[0.36, 0.03, 0.07]} m={VM.steel} />
        ))}
      </group>
    </group>
  );
}

// The lagoon under the glass floor: a sandy patch with coral, sea grass,
// starfish and shells, a little school of reef fish circling in the shade,
// and caustic light rippling over the sand. A depth-only mask just under
// the glass (renderOrder SEA_MASK_ORDER, after the caustics, before the sea
// surface at 1) stops the tinted sea from drawing there, so the view down
// through the glass is crystal clear, like a Maldives lagoon.
const UNDER_ORDER = 0.2;
const SEA_MASK_ORDER = 0.5;
const UNDER_Y = -0.37;
const GLASS_FISH = 9;
const GLASS_FISH_GEO = (() => {
  const v = [0, 0, 0.13, 0, 0.055, 0, 0.032, 0, 0, 0, -0.045, 0, -0.032, 0, 0, 0, 0, -0.1, 0, 0.065, -0.18, 0, -0.065, -0.18];
  const idx = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1, 5, 2, 1, 5, 3, 2, 5, 4, 3, 5, 1, 4, 5, 6, 7, 5, 7, 6];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const shade = [1, 1.05, 1, 1.25, 1, 0.8, 0.7, 0.7];
  g.setAttribute('color', new THREE.Float32BufferAttribute(shade.flatMap((k) => [k, k, k]), 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  g.dispose();
  return flat;
})();
const GLASS_FISH_COLORS = ['#ffd23f', '#ff6fa8', '#3ec9ff', '#ff8a3d', '#b26bff', '#ffd23f', '#3fe0b0', '#ff8a3d', '#3ec9ff'];
// per fish: orbit radius (x, z), speed (signed), depth below the surface, phase, size
const FISH_ORBITS = Array.from({ length: GLASS_FISH }, (_, i) => ({
  rx: 0.35 + (i % 4) * 0.17,
  rz: 0.22 + (i % 3) * 0.13,
  sp: (0.32 + (i % 5) * 0.05) * (i % 3 === 2 ? -1 : 1),
  y: -0.11 - (i % 3) * 0.065,
  ph: i * 2.1,
  s: 1.1 + (i % 3) * 0.2,
}));

function causticTexture() {
  const tex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 4;
    // a wobbly cell net (jittered grid, tiles seamlessly)
    const n = 5;
    const jit = (i, j) => {
      const s = Math.sin((((i % n) + n) % n) * 12.9898 + (((j % n) + n) % n) * 78.233) * 43758.5453;
      return s - Math.floor(s);
    };
    const pt = (i, j) => [((i + 0.2 + jit(i, j) * 0.6) / n) * w, ((j + 0.2 + jit(j + 7, i + 3) * 0.6) / n) * h];
    for (let i = -1; i <= n; i++) {
      for (let j = -1; j <= n; j++) {
        const [x, y] = pt(i, j);
        for (const [di, dj] of [[1, 0], [0, 1]]) {
          const [x2, y2] = pt(i + di, j + dj);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo((x + x2) / 2 + (y2 - y) * 0.2, (y + y2) / 2 - (x2 - x) * 0.2, x2, y2);
          ctx.stroke();
        }
      }
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function UnderGlass({ night, animate }) {
  const root = useRef();
  const light = useRef();
  const fish = useRef();
  const glow = useMemo(() => glowMaterial('#6ff3ff', 0), []);
  const floorGlow = useMemo(() => glowMaterial('#7cf6ff', 0), []);
  const caustic = useMemo(() => {
    const a = causticTexture();
    const b = a.clone();
    b.needsUpdate = true;
    b.repeat.set(1.6, 1.6);
    const mk = (map) => new THREE.MeshBasicMaterial({ map, color: '#9ff6ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    return { a, b, ma: mk(a), mb: mk(b) };
  }, []);
  const fishMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, emissive: '#1a3a40', emissiveIntensity: 0.3 }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(
    () => () => {
      glow.dispose();
      floorGlow.dispose();
      caustic.a.dispose();
      caustic.b.dispose();
      caustic.ma.dispose();
      caustic.mb.dispose();
      fishMat.dispose();
    },
    [glow, floorGlow, caustic, fishMat]
  );
  useEffect(() => {
    VM.floorGlass.emissiveIntensity = 0.04 + night * 1.1;
    VM.floorGlass.opacity = 0.2 + night * 0.08;
    fishMat.emissiveIntensity = 0.3 + night * 0.9; // lit by the lagoon light
  }, [night, fishMat]);
  // the additive layers draw before the sea mask (see above)
  useLayoutEffect(() => {
    root.current?.traverse((o) => {
      if (o.isMesh) o.renderOrder = UNDER_ORDER;
    });
    const m = fish.current;
    if (!m) return;
    GLASS_FISH_COLORS.forEach((c, i) => m.setColorAt(i, new THREE.Color(c)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);
  // The coral garden sits on a raised bank just above the static far-ocean
  // disc (Water.jsx, y -0.4), which would hide anything deeper. Its sand
  // patch stays inside the platform's footprint so it never shows on the
  // open water.
  const fy = UNDER_Y;
  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    const k = 1 + Math.sin(t * 0.8) * 0.08;
    glow.opacity = (0.06 + night * 0.26) * k;
    floorGlow.opacity = (0.05 + night * 0.3) * k;
    if (light.current) light.current.scale.set(1.3 * k, 0.55, 0.95 * k);
    caustic.ma.opacity = 0.13 + night * 0.25;
    caustic.mb.opacity = 0.09 + night * 0.2;
    caustic.a.offset.set(t * 0.021, t * 0.013);
    caustic.b.offset.set(-t * 0.017, t * 0.019);
    const m = fish.current;
    if (!m) return;
    FISH_ORBITS.forEach((o, i) => {
      const a = o.ph + t * o.sp;
      const wob = Math.sin(t * 0.7 + i) * 0.06;
      dummy.position.set(Math.cos(a) * (o.rx + wob), o.y - fy + Math.sin(t * 1.3 + i) * 0.03, Math.sin(a) * (o.rz + wob));
      // facing along the orbit
      dummy.rotation.set(0, Math.atan2(-Math.sin(a) * o.rx * Math.sign(o.sp), Math.cos(a) * o.rz * Math.sign(o.sp)) + Math.sin(t * 8 + i) * 0.12, 0);
      dummy.scale.setScalar(o.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  const corals = [
    [-0.6, -0.2, VM.coralPink, 0.22],
    [0.55, 0.3, VM.coralOrange, 0.18],
    [-0.1, 0.45, VM.coralPurple, 0.16],
    [0.75, -0.4, VM.coralPink, 0.14],
    [-0.85, 0.35, VM.coralOrange, 0.12],
    [0.95, 0.42, VM.coralYellow, 0.15],
    [-0.95, -0.5, VM.coralPurple, 0.13],
    [0.25, -0.55, VM.coralYellow, 0.12],
  ];
  return (
    <group ref={root} position={[G.x, fy, G.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0, 0]} scale={[1.35, 1.0, 1]} material={VM.sand}>
        <circleGeometry args={[1, 12]} />
      </mesh>
      {corals.map(([x, z, m, s], i) => (
        <group key={i} position={[x, 0.0, z]} scale={(s / 0.18) * 0.8} rotation={[0, i * 1.3, 0]}>
          <Cyl p={[0, 0.12, 0]} rt={0.03} rb={0.05} h={0.24} m={m} />
          <Cyl p={[0.06, 0.2, 0]} rt={0.025} h={0.18} m={m} r={[0, 0, -0.6]} />
          <Cyl p={[-0.06, 0.22, 0.02]} rt={0.025} h={0.18} m={m} r={[0.3, 0, 0.6]} />
          <mesh position={[0, 0.27, 0]} material={m}>
            <icosahedronGeometry args={[0.07, 0]} />
          </mesh>
        </group>
      ))}
      {/* sea grass */}
      {[[-0.3, 0.6], [0.45, -0.2], [-0.7, 0.1], [0.1, 0.7], [0.6, 0.65]].map(([x, z], i) => (
        <Cone key={`w${i}`} p={[x, 0.16, z]} rad={0.035} h={0.3} seg={4} m={VM.weed} r={[Math.sin(i) * 0.25, 0, Math.cos(i) * 0.25]} />
      ))}
      <mesh geometry={STAR_GEO} material={VM.star} position={[0.15, 0.02, -0.35]} rotation={[0, 0.4, 0]} />
      <mesh geometry={STAR_GEO} material={VM.coralPurple} position={[-0.45, 0.02, 0.05]} rotation={[0, 1.3, 0]} scale={0.8} />
      <mesh geometry={STAR_GEO} material={VM.coralYellow} position={[0.7, 0.02, 0.05]} rotation={[0, 2.2, 0]} scale={0.7} />
      {[[0.3, 0.1], [-0.3, -0.45], [0.9, 0.05]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.03, z]} material={VM.pebble} scale={[0.14, 0.07, 0.11]}>
          <dodecahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
      {[[-0.15, -0.15], [0.45, 0.55], [-0.6, 0.55]].map(([x, z], i) => (
        <mesh key={`sh${i}`} position={[x, 0.02, z]} rotation={[0, i * 2, 0]} material={VM.shell} scale={[0.07, 0.035, 0.06]}>
          <icosahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
      {/* caustic light dancing on the sand */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} scale={[1.3, 0.95, 1]} material={caustic.ma}>
        <circleGeometry args={[1, 18]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0.3]} position={[0, 0.015, 0]} scale={[1.15, 0.85, 1]} material={caustic.mb}>
        <circleGeometry args={[1, 18]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]} scale={[1.2, 0.85, 1]} material={floorGlow}>
        <circleGeometry args={[1, 18]} />
      </mesh>
      <instancedMesh ref={fish} args={[GLASS_FISH_GEO, fishMat, GLASS_FISH]} frustumCulled={false} />
      <mesh ref={light} geometry={GLOW_GEO} material={glow} position={[0, 0.2, 0]} />
    </group>
  );
}

// Light from the lagoon light rising through the glass at night.
function GlassGlow({ night }) {
  const mat = useMemo(() => glowMaterial('#7cf2ff', 0), []);
  useEffect(() => {
    mat.opacity = 0.3 * night;
  }, [mat, night]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh position={[G.x, DY - 0.09, G.z]} rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={4}>
      <planeGeometry args={[G.hx * 2 - 0.05, G.hz * 2 - 0.05]} />
    </mesh>
  );
}

function Boardwalk({ night }) {
  const cx = (B.x0 + B.x1) / 2;
  const len = B.z1 - B.z0;
  const rampFoot = Math.max(terrainY(cx, B.z1 + B.rampLen), 0);
  const rampLen = Math.hypot(B.rampLen, DY - rampFoot);
  const rampAngle = Math.atan2(DY - rampFoot, B.rampLen);
  const posts = [];
  for (let z = B.z0 + 0.1; z <= B.z1 + 0.01; z += (len - 0.2) / 4) posts.push(z);
  const railX = [B.x0 + 0.08, B.x1 - 0.08];
  const slats = [];
  for (let z = B.z0 + 0.2; z < B.z1; z += 0.32) slats.push(z);
  return (
    <group>
      <Box p={[cx, DY - 0.06, (B.z0 + B.z1) / 2]} s={[B.x1 - B.x0, 0.12, len]} m={M.plank} />
      {slats.map((z) => (
        <Box key={z} p={[cx, DY + 0.002, z]} s={[B.x1 - B.x0 - 0.06, 0.006, 0.025]} m={M.darkWood} />
      ))}
      {[B.z0 + 0.7, (B.z0 + B.z1) / 2 + 0.3, B.z1 - 0.4].flatMap((z) => railX.map((x) => <Stilt key={`${x}${z}`} x={x} z={z} top={DY - 0.12} />))}
      {/* ramp onto the sand */}
      <group position={[cx, (DY + rampFoot) / 2 - 0.03, B.z1 + B.rampLen / 2]} rotation={[rampAngle, 0, 0]}>
        <Box p={[0, 0, 0]} s={[B.x1 - B.x0, 0.08, rampLen]} m={M.plank} />
        {[0.25, 0.5, 0.75].map((f) => (
          <Box key={f} p={[0, 0.045, -rampLen / 2 + f * rampLen]} s={[B.x1 - B.x0 - 0.06, 0.012, 0.04]} m={M.darkWood} />
        ))}
      </group>
      {/* bamboo posts with rope rails */}
      {railX.map((x) =>
        posts.map((z, i) => (
          <group key={`${x}${i}`}>
            <Cyl p={[x, DY + 0.3, z]} rt={0.04} h={0.6} m={M.bamboo} />
            <Cyl p={[x, DY + 0.61, z]} rt={0.05} h={0.03} m={M.bambooNode} />
            {i < posts.length - 1 && <Rope a={[x, DY + 0.55, z]} b={[x, DY + 0.55, posts[i + 1]]} />}
            {i < posts.length - 1 && <Rope a={[x, DY + 0.3, z]} b={[x, DY + 0.3, posts[i + 1]]} sag={0.04} />}
          </group>
        ))
      )}
      <Lantern p={[railX[0], DY + 0.72, posts[1]]} night={night} />
      <Lantern p={[railX[1], DY + 0.72, posts[3]]} night={night} />
      <Lantern p={[railX[0], DY + 0.72, posts[4]]} night={night} />
      {/* planters where the boardwalk meets the beach */}
      <Planter p={[B.x0 - 0.3, Math.max(terrainY(B.x0 - 0.3, B.z1 + 0.5), 0), B.z1 + 0.5]} />
      <Planter p={[B.x1 + 0.3, Math.max(terrainY(B.x1 + 0.3, B.z1 + 0.5), 0), B.z1 + 0.5]} colors={['#ff8a3d', '#ffffff', '#ff5d8f']} />
    </group>
  );
}

// Tap the glass floor: look straight down through it at the lagoon.
export const GLASS_SHOT = { target: [G.x - 0.15, -0.15, G.z], dist: 3.5, polar: 0.15, theta: -Math.PI / 2, hold: 12000 };

function Platform({ night, animate, onShot }) {
  const onGlass = useMemo(() => tap(() => onShot?.(GLASS_SHOT)), [onShot]);
  const stilts = [];
  for (const x of [P.x0 + 0.15, 8.55, 10.2, 11.2, P.x1 - 0.15]) for (const z of [P.z0 + 0.15, P.z1 - 0.15]) stilts.push([x, z]);
  stilts.push([P.x0 + 0.15, -18.2], [11.2, -18.2], [P.x1 - 0.15, -18.2]);
  // low bamboo rail: north and west edges, and the south edge either side
  // of the boardwalk (the east edge opens onto the sun deck)
  const rail = [
    [[P.x0 + 0.06, P.z0 + 0.06], [P.x1 - 0.06, P.z0 + 0.06]],
    [[P.x0 + 0.06, P.z0 + 0.06], [P.x0 + 0.06, P.z1 - 0.06]],
    [[P.x0 + 0.06, P.z1 - 0.06], [B.x0, P.z1 - 0.06]],
    [[B.x1, P.z1 - 0.06], [P.x1 - 0.06, P.z1 - 0.06]],
  ];
  const railPosts = [];
  for (const [[x0, z0], [x1, z1]] of rail) {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.9));
    for (let i = 0; i <= n; i++) railPosts.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
  }
  return (
    <group>
      {DECK_PIECES.map(([x0, x1, z0, z1], i) => (
        <Box key={i} p={[(x0 + x1) / 2, DY - 0.07, (z0 + z1) / 2]} s={[x1 - x0, 0.14, z1 - z0]} m={M.plank} />
      ))}
      {/* plank lines (they skip the glass) */}
      {[7.7, 8.2, 8.7, 9.2, 9.7, 10.2, 10.7, 11.2, 11.7].flatMap((x) =>
        x > GX0 && x < GX1
          ? [
              <Box key={`${x}a`} p={[x, DY + 0.002, (P.z0 + GZ0) / 2]} s={[0.025, 0.006, GZ0 - P.z0 - 0.04]} m={M.darkWood} />,
              <Box key={`${x}b`} p={[x, DY + 0.002, (GZ1 + P.z1) / 2]} s={[0.025, 0.006, P.z1 - GZ1 - 0.04]} m={M.darkWood} />,
            ]
          : [<Box key={x} p={[x, DY + 0.002, (P.z0 + P.z1) / 2]} s={[0.025, 0.006, P.z1 - P.z0 - 0.04]} m={M.darkWood} />]
      )}
      {stilts.map(([x, z], i) => (
        <Stilt key={i} x={x} z={z} />
      ))}
      {/* the glass floor: a dark frame and clear glass you can see the lagoon
          through (tap it to look straight down), with two faint sheen streaks */}
      <mesh position={[G.x, DY - 0.05, G.z]} material={VM.floorGlass} renderOrder={5} onClick={onGlass} {...pointer}>
        <boxGeometry args={[G.hx * 2, 0.04, G.hz * 2]} />
      </mesh>
      {[[-0.35, 0.09], [0.15, 0.05]].map(([dx, w], i) => (
        <mesh key={`sh${i}`} position={[G.x + dx, DY - 0.028, G.z]} rotation={[-Math.PI / 2, 0, 0.7]} material={VM.glassEdge} renderOrder={6}>
          <planeGeometry args={[w, G.hz * 2.2]} />
        </mesh>
      ))}
      {[
        [G.x, GZ0, G.hx * 2 + 0.12, 0.06],
        [G.x, GZ1, G.hx * 2 + 0.12, 0.06],
      ].map(([x, z, w, d], i) => (
        <Box key={`gf${i}`} p={[x, DY + 0.005, z]} s={[w, 0.03, d]} m={VM.frame} />
      ))}
      {[GX0, GX1].map((x, i) => (
        <Box key={`gs${i}`} p={[x, DY + 0.005, G.z]} s={[0.06, 0.03, G.hz * 2]} m={VM.frame} />
      ))}
      <Box p={[G.x, DY - 0.03, G.z]} s={[0.04, 0.02, G.hz * 2]} m={VM.frame} />
      <UnderGlass night={night} animate={animate} />
      <mesh position={[G.x, DY - 0.15, G.z]} rotation={[-Math.PI / 2, 0, 0]} material={VM.seaMask} renderOrder={SEA_MASK_ORDER} raycast={() => null}>
        <planeGeometry args={[G.hx * 2, G.hz * 2]} />
      </mesh>
      {night > 0.15 && <GlassGlow night={night} />}
      {/* rail */}
      {railPosts.map(([x, z], i) => (
        <Cyl key={`rp${i}`} p={[x, DY + 0.25, z]} rt={0.035} h={0.5} m={M.bamboo} />
      ))}
      {rail.map(([[x0, z0], [x1, z1]], i) => (
        <Beam key={`rl${i}`} a={[x0, DY + 0.5, z0]} b={[x1, DY + 0.5, z1]} r={0.03} m={M.bamboo} />
      ))}
      {/* Flo's porch chair (her seat slot sits right on it), a side table with a drink */}
      <TowerChair seat={FLO.seat} top={DY} cushion={M.floCushion} />
      <group position={[FLO.seat.x + 0.05, DY, FLO.seat.z + 0.55]}>
        <Cyl p={[0, 0.17, 0]} rt={0.03} h={0.34} m={M.darkWood} />
        <Cyl p={[0, 0.35, 0]} rt={0.17} h={0.03} seg={9} m={M.bamboo} />
        <mesh position={[0.02, 0.42, 0]} material={M.coconut}>
          <icosahedronGeometry args={[0.07, 0]} />
        </mesh>
        <Cyl p={[0.02, 0.52, 0.02]} rt={0.006} h={0.14} m={M.lisnOrange} r={[0.3, 0, 0.2]} />
      </group>
      {/* planters at the corners */}
      <Planter p={[P.x0 + 0.35, DY, P.z0 + 0.35]} />
      <Planter p={[P.x0 + 0.35, DY, P.z1 - 0.35]} colors={['#ff8a3d', '#ffd23f', '#ffffff']} />
      <Planter p={[P.x1 - 0.35, DY, P.z0 + 0.32]} colors={['#f25cff', '#ff5d8f', '#ffd23f']} />
      <Lantern p={[P.x0 + 0.06, DY + 0.68, -18.2]} night={night} />
    </group>
  );
}

export default function FloVilla({ night, animate, bedtime = false, onShot }) {
  return (
    <group>
      <Boardwalk night={night} />
      <Platform night={night} animate={animate} onShot={onShot} />
      <FloPool animate={animate} bedtime={bedtime} night={night} />
      <House night={night} />
    </group>
  );
}
