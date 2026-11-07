import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { CREW_COLORS } from '../MiniBot.jsx';
import { BOT_SCALE } from '../../components/Bot.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import { Box, Cyl, LM, SIT_DROP, StringLights, canvasTexture, glowMat, lerpAngle, makePath, resetBot, sitPose, smooth, std, usePoseOnce, walkPose } from './common.jsx';

// Byte Bites: a retro food truck on the south beach (tacos and shave ice).
// A little line shuffles up to the serving window, the cook hands over the
// food, and the lucky bot takes it to the picnic table to eat. When it's
// done it strolls around behind the truck and joins the back of the line
// again (it's that good). At bedtime the shutter comes down.
//
// Layout (world): the truck runs east-west, serving window on the south
// side facing the default camera; the line forms toward the east; the
// picnic table sits south-west of the truck. Everything stays inside the
// foodtruck site, clear of the sandcastle and the DJ booth.

const SITE = SITES.foodtruck;
const S = BOT_SCALE;
const SERVE = 6; // seconds between orders
const EAT = 8; // seconds at the table
const SIT_TIME = 0.7;
const SPEED = 0.85;

// Truck frame: long axis along x, window on the south (+z) side.
const TRUCK = { x: SITE.x + 0.1, z: SITE.z - 1.0 }; // (-4.5, 11.0)
const BODY = { x0: -1.1, x1: 0.55, z: 0.5, y0: 0.22, y1: 1.5 };
const WIN = { x0: -0.3, x1: 0.5, y0: 0.86, y1: 1.32 }; // serving window (local)
const WIN_X = TRUCK.x + (WIN.x0 + WIN.x1) / 2;
const truckG = (() => {
  let g = 0;
  for (const [dx, dz] of [[-1.1, -0.5], [1.2, -0.5], [-1.1, 0.5], [1.2, 0.5], [0, 0]]) g = Math.max(g, groundY(TRUCK.x + dx, TRUCK.z + dz));
  return g;
})();

// Picnic table (long axis along x), benches north and south of it.
const TABLE = { x: -5.85, z: 12.75 };
const BENCH_DZ = 0.55;
const BENCH_H = 0.36;
const tableG = (() => {
  let g = 0;
  for (const [dx, dz] of [[-0.75, -0.65], [0.75, -0.65], [-0.75, 0.65], [0.75, 0.65]]) g = Math.max(g, groundY(TABLE.x + dx, TABLE.z + dz));
  return g;
})();
const SEAT_Y = tableG + BENCH_H - SIT_DROP * S;

// The line: front of the line at the window, curving east; the last spot
// is a waiting spot by the join point if the line ever gets long.
const SLOTS = [
  [WIN_X + 0.22, 12.15], // a little east of center so the cook shows
  [-3.5, 12.45],
  [-2.9, 12.55],
  [-2.35, 12.35],
  [-2.05, 11.9],
  [-2.25, 11.3],
];
const JOIN = [-2.25, 11.25];

// Seats: 0 north-west, 1 north-east, 2 south-west, 3 south-east. Each seat
// is reached from its own end of the bench so nobody walks through anyone.
const NZ = TABLE.z - BENCH_DZ;
const SZ = TABLE.z + BENCH_DZ;
const WX = TABLE.x - 1.0;
const EX = TABLE.x + 1.0;
const SEATS = [
  { x: TABLE.x - 0.32, z: NZ, rotY: 0, stand: [WX, NZ] },
  { x: TABLE.x + 0.32, z: NZ, rotY: 0, stand: [EX, NZ] },
  { x: TABLE.x - 0.32, z: SZ, rotY: Math.PI, stand: [WX, SZ] },
  { x: TABLE.x + 0.32, z: SZ, rotY: Math.PI, stand: [EX, SZ] },
];
const GAP_Z = 11.82; // walkway between the truck and the table
const BACK = [[-6.05, 11.0], [-5.5, 10.15], [-3.4, 10.15], [-2.6, 10.6], JOIN];
const TO_SEAT = [
  makePath([SLOTS[0], [-4.75, GAP_Z], [-6.8, GAP_Z], SEATS[0].stand]),
  makePath([SLOTS[0], SEATS[1].stand]),
  makePath([SLOTS[0], [-4.75, GAP_Z], [-6.95, 11.9], SEATS[2].stand]),
  makePath([SLOTS[0], [-4.4, 12.75], SEATS[3].stand]),
];
const LEAVE = [
  makePath([SEATS[0].stand, [-6.45, 11.7], ...BACK]),
  makePath([SEATS[1].stand, [-4.95, GAP_Z], [-6.2, 11.75], ...BACK]),
  makePath([SEATS[2].stand, [-7.0, 12.75], [-6.6, 11.75], ...BACK]),
  makePath([SEATS[3].stand, [-5.0, 13.7], [-6.7, 13.7], [-7.05, 12.9], [-6.6, 11.75], ...BACK]),
];

// ---------------------------------------------------------------------------
// Materials, food and signs
// ---------------------------------------------------------------------------

const TM = {
  cream: std('#fff1d6'),
  coral: std('#ff7a59'),
  mint: std('#7fd8c8'),
  stripe: std('#ffd23f'),
  roof: std('#fdf8ee'),
  tire: std('#2b2a2e'),
  interior: std('#5a4a44'),
  griddle: std('#55595e', { roughness: 0.4, metalness: 0.4 }),
  windshield: std('#9fd6ee', { roughness: 0.2 }),
  awnRed: std('#e5533d', { side: THREE.DoubleSide }),
  awnWhite: std('#fdf8ee', { side: THREE.DoubleSide }),
  shutter: std('#c9ced2', { roughness: 0.5, metalness: 0.3 }),
  tableWood: std('#c08a57'),
  umbrellaA: std('#2fbfb0', { side: THREE.DoubleSide }),
  umbrellaB: std('#fdf8ee', { side: THREE.DoubleSide }),
  hotSauce: std('#d6342a'),
  shell: std('#f2c14e'),
  lettuce: std('#6cc24a'),
  tomato: std('#e5533d'),
  cup: std('#ffffff'),
  icePink: std('#ff7ab8'),
  iceBlue: std('#5fb8ff'),
  iceYellow: std('#ffe066'),
  spatula: std('#b9c2c8', { roughness: 0.4, metalness: 0.5 }),
  steam: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false }),
  lantern: std('#ffd9a0', { emissive: '#ffb066', emissiveIntensity: 1.6 }),
};

const FOOD_GEO = {
  shell: new THREE.CylinderGeometry(0.075, 0.075, 0.07, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2),
  lettuce: new THREE.BoxGeometry(0.13, 0.025, 0.05),
  bit: new THREE.IcosahedronGeometry(0.018, 0),
  cup: new THREE.ConeGeometry(0.055, 0.11, 8).rotateX(Math.PI).translate(0, 0.055, 0),
  ice: new THREE.IcosahedronGeometry(0.058, 1),
  spoon: new THREE.CylinderGeometry(0.006, 0.006, 0.1, 3),
  steam: new THREE.IcosahedronGeometry(0.09, 0),
};

function makeFood(type) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, s = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    g.add(m);
    return m;
  };
  if (type === 'taco') {
    add(FOOD_GEO.shell, TM.shell, 0, 0.075, 0);
    add(FOOD_GEO.lettuce, TM.lettuce, 0, 0.085, 0);
    add(FOOD_GEO.bit, TM.tomato, -0.03, 0.1, 0.01);
    add(FOOD_GEO.bit, TM.tomato, 0.035, 0.1, -0.01);
    add(FOOD_GEO.bit, TM.cup, 0.0, 0.1, 0.015, 0.8);
  } else {
    add(FOOD_GEO.cup, TM.cup, 0, 0, 0);
    add(FOOD_GEO.ice, TM.icePink, 0, 0.13, 0);
    add(FOOD_GEO.ice, TM.iceBlue, 0.02, 0.17, 0.01, 0.65);
    add(FOOD_GEO.ice, TM.iceYellow, -0.025, 0.16, -0.01, 0.55);
    const sp = add(FOOD_GEO.spoon, TM.spatula, 0.03, 0.2, 0);
    sp.rotation.z = -0.4;
  }
  g.position.set(0, 0.0, 0.06);
  g.scale.setScalar(1.35);
  g.visible = false;
  return g;
}

function makeSpatula() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4), TM.tire);
  handle.position.set(0, -0.06, 0.05);
  handle.rotation.x = Math.PI / 2;
  g.add(handle);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.1), TM.spatula);
  blade.position.set(0, -0.06, 0.17);
  g.add(blade);
  return g;
}

const SIGN_TEX = () =>
  canvasTexture('byte-bites-sign', 512, 128, (g, w, h) => {
    g.fillStyle = '#2fbfb0';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff1d6';
    g.lineWidth = 8;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#ffd23f';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 68px "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif';
    g.lineWidth = 8;
    g.strokeStyle = '#e5533d';
    g.strokeText('BYTE BITES', w / 2, h / 2 - 8);
    g.fillText('BYTE BITES', w / 2, h / 2 - 8);
    g.font = 'bold 22px "Trebuchet MS", Arial, sans-serif';
    g.fillStyle = '#fff1d6';
    g.fillText('TACOS  ·  SHAVE ICE', w / 2, h - 22);
  });

const MENU_TEX = () =>
  canvasTexture('byte-bites-menu', 256, 208, (g, w, h) => {
    g.fillStyle = '#2f3b35';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c99a52';
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#fff6e0';
    g.textBaseline = 'middle';
    g.font = 'bold 30px "Trebuchet MS", Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText('MENU', w / 2, 34);
    g.font = '21px "Trebuchet MS", Arial, sans-serif';
    const rows = [['Byte taco', '3'], ['Fish taco', '4'], ['Shave ice', '2'], ['Chips & salsa', '2'], ['Coconut', '3']];
    rows.forEach(([a, b], i) => {
      const y = 72 + i * 27;
      g.textAlign = 'left';
      g.fillStyle = i % 2 ? '#bfe8ff' : '#ffe066';
      g.fillText(a, 22, y);
      g.textAlign = 'right';
      g.fillStyle = '#fff6e0';
      g.fillText(b, w - 22, y);
    });
  });

const CLOSED_TEX = () =>
  canvasTexture('byte-bites-closed', 256, 96, (g, w, h) => {
    g.fillStyle = '#fff1d6';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e5533d';
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#e5533d';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 40px "Trebuchet MS", Arial, sans-serif';
    g.fillText('CLOSED', w / 2, 38);
    g.font = 'bold 18px "Trebuchet MS", Arial, sans-serif';
    g.fillStyle = '#3b3430';
    g.fillText('back at sunrise', w / 2, 72);
  });

// A texture that also glows at night (sign, menu).
function useSignMaterial(makeTex, night, base, boost) {
  const mat = useMemo(() => {
    const tex = makeTex();
    return new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: base, roughness: 0.7 });
  }, [makeTex, base]);
  useEffect(() => {
    mat.emissiveIntensity = base + night * boost;
  }, [mat, night, base, boost]);
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------

function Wheel({ lx, lz }) {
  const wx = TRUCK.x + lx;
  const wz = TRUCK.z + lz;
  const y = groundY(wx, wz) - truckG + 0.17;
  return (
    <group position={[lx, y, lz]}>
      <Cyl p={[0, 0, 0]} rt={0.17} h={0.12} m={TM.tire} seg={10} r={[Math.PI / 2, 0, 0]} />
      <Cyl p={[0, 0, lz > 0 ? 0.062 : -0.062]} rt={0.08} h={0.02} m={LM.chrome} seg={8} r={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

function Truck({ night, bedtime, cook, signMat, menuMat, closedMat, steam, headMat }) {
  const { x0, x1, z: hz, y0, y1 } = BODY;
  const midX = (x0 + x1) / 2;
  const len = x1 - x0;
  const stripeY = 0.62;
  const open = !bedtime;
  return (
    <group position={[TRUCK.x, truckG, TRUCK.z]}>
      {/* soft shadow under the truck */}
      <mesh position={[0.05, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={LM.shadow}>
        <planeGeometry args={[2.5, 1.2]} />
      </mesh>
      {[[-0.75, 0.48], [0.8, 0.48], [-0.75, -0.48], [0.8, -0.48]].map(([lx, lz]) => (
        <Wheel key={`${lx}${lz}`} lx={lx} lz={lz} />
      ))}
      {/* chassis and floor */}
      <Box p={[midX + 0.3, y0 + 0.02, 0]} s={[len + 0.65, 0.08, 0.9]} m={LM.dark} />
      {/* back (north) wall, both ends, roof */}
      <Box p={[midX, (y0 + y1) / 2, -hz + 0.025]} s={[len, y1 - y0, 0.05]} m={TM.cream} />
      <Box p={[x0 + 0.025, (y0 + y1) / 2, 0]} s={[0.05, y1 - y0, hz * 2]} m={TM.cream} />
      <Box p={[x1 - 0.025, (y0 + y1) / 2, 0]} s={[0.05, y1 - y0, hz * 2]} m={TM.cream} />
      <Box p={[midX, y1 + 0.03, 0]} s={[len + 0.06, 0.07, hz * 2 + 0.06]} m={TM.roof} />
      <Box p={[midX, y1 + 0.08, 0]} s={[len - 0.1, 0.05, hz * 2 - 0.1]} m={TM.mint} />
      {/* lower coral skirt and yellow stripe all the way round */}
      <Box p={[midX, y0 + 0.17, 0]} s={[len + 0.02, 0.3, hz * 2 + 0.02]} m={TM.coral} />
      <Box p={[midX, stripeY, 0]} s={[len + 0.03, 0.05, hz * 2 + 0.03]} m={TM.stripe} />
      {/* south wall with the serving window cut out */}
      <Box p={[midX, (y0 + WIN.y0) / 2, hz - 0.025]} s={[len, WIN.y0 - y0, 0.05]} m={TM.cream} />
      <Box p={[midX, (WIN.y1 + y1) / 2, hz - 0.025]} s={[len, y1 - WIN.y1, 0.05]} m={TM.cream} />
      <Box p={[(x0 + WIN.x0) / 2, (WIN.y0 + WIN.y1) / 2, hz - 0.025]} s={[WIN.x0 - x0, WIN.y1 - WIN.y0, 0.05]} m={TM.cream} />
      <Box p={[(WIN.x1 + x1) / 2, (WIN.y0 + WIN.y1) / 2, hz - 0.025]} s={[x1 - WIN.x1, WIN.y1 - WIN.y0, 0.05]} m={TM.cream} />
      {/* redo the stripe and skirt on the south face over the window wall */}
      <Box p={[midX, y0 + 0.17, hz + 0.005]} s={[len + 0.02, 0.3, 0.02]} m={TM.coral} />
      <Box p={[midX, stripeY, hz + 0.01]} s={[len + 0.03, 0.05, 0.02]} m={TM.stripe} />
      {/* inside: dark walls, griddle under the window */}
      <Box p={[midX, (y0 + y1) / 2, -hz + 0.06]} s={[len - 0.1, y1 - y0 - 0.05, 0.02]} m={TM.interior} />
      <Box p={[(WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.06, 0.25]} s={[WIN.x1 - WIN.x0, 0.06, 0.4]} m={TM.griddle} />
      {/* window frame and counter shelf */}
      <Box p={[(WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.02, hz + 0.1]} s={[WIN.x1 - WIN.x0 + 0.12, 0.04, 0.22]} m={LM.plank} />
      <Box p={[(WIN.x0 + WIN.x1) / 2, WIN.y1 + 0.015, hz + 0.01]} s={[WIN.x1 - WIN.x0 + 0.06, 0.03, 0.04]} m={LM.chrome} />
      <Box p={[WIN.x0 - 0.015, (WIN.y0 + WIN.y1) / 2, hz + 0.01]} s={[0.03, WIN.y1 - WIN.y0, 0.04]} m={LM.chrome} />
      <Box p={[WIN.x1 + 0.015, (WIN.y0 + WIN.y1) / 2, hz + 0.01]} s={[0.03, WIN.y1 - WIN.y0, 0.04]} m={LM.chrome} />
      {/* napkins and a hot sauce on the counter */}
      <Box p={[WIN.x1 - 0.08, WIN.y0 + 0.04, hz + 0.12]} s={[0.08, 0.07, 0.06]} m={LM.white} />
      <Cyl p={[WIN.x0 + 0.1, WIN.y0 + 0.06, hz + 0.13]} rt={0.02} h={0.1} m={TM.hotSauce} />
      {/* menu board on the south wall, west of the window */}
      <mesh position={[(x0 + WIN.x0) / 2, 1.06, hz + 0.006]} material={menuMat}>
        <planeGeometry args={[0.6, 0.49]} />
      </mesh>
      {/* cab at the east end: hood, windshield, headlights, bumpers */}
      <Box p={[x1 + 0.27, 0.62, 0]} s={[0.54, 0.8, hz * 2]} m={TM.mint} />
      <Box p={[x1 + 0.27, 0.22 + 0.17, 0]} s={[0.56, 0.3, hz * 2 + 0.02]} m={TM.coral} />
      <Box p={[x1 + 0.27, stripeY, 0]} s={[0.57, 0.05, hz * 2 + 0.03]} m={TM.stripe} />
      <Box p={[x1 + 0.3, 1.04, 0]} s={[0.5, 0.06, hz * 2 - 0.04]} m={TM.roof} />
      <Box p={[x1 + 0.55, 0.85, 0]} s={[0.03, 0.3, hz * 2 - 0.16]} r={[0, 0, 0.25]} m={TM.windshield} />
      <Box p={[x1 + 0.28, 0.86, hz + 0.003]} s={[0.36, 0.26, 0.02]} m={TM.windshield} />
      <Box p={[x1 + 0.28, 0.86, -hz - 0.003]} s={[0.36, 0.26, 0.02]} m={TM.windshield} />
      <Box p={[x1 + 0.7, 0.42, 0]} s={[0.32, 0.38, hz * 2 - 0.08]} m={TM.mint} />
      <Box p={[x1 + 0.7, 0.62, 0]} s={[0.33, 0.04, hz * 2 - 0.07]} m={TM.stripe} />
      {[-0.28, 0.28].map((z) => (
        <Cyl key={z} p={[x1 + 0.87, 0.47, z]} rt={0.055} h={0.03} m={headMat} seg={8} r={[0, 0, Math.PI / 2]} />
      ))}
      <Box p={[x1 + 0.9, 0.27, 0]} s={[0.05, 0.07, hz * 2 + 0.04]} m={LM.chrome} />
      <Box p={[x0 - 0.03, 0.27, 0]} s={[0.05, 0.07, hz * 2 + 0.04]} m={LM.chrome} />
      {/* rooftop sign, a giant taco on the cab, and the vent */}
      <group position={[midX + 0.05, y1 + 0.42, 0.05]}>
        <Box p={[0, 0, -0.03]} s={[1.32, 0.36, 0.04]} m={TM.cream} />
        <mesh position={[0, 0, -0.005]} material={signMat}>
          <planeGeometry args={[1.28, 0.32]} />
        </mesh>
        <Cyl p={[-0.45, -0.25, -0.04]} rt={0.02} h={0.18} m={LM.chrome} />
        <Cyl p={[0.45, -0.25, -0.04]} rt={0.02} h={0.18} m={LM.chrome} />
      </group>
      <group position={[x1 + 0.3, 1.07, 0]} rotation={[0, 0.5, 0]} scale={3.2}>
        <mesh geometry={FOOD_GEO.shell} material={TM.shell} position={[0, 0.075, 0]} />
        <mesh geometry={FOOD_GEO.lettuce} material={TM.lettuce} position={[0, 0.082, 0]} />
        <mesh geometry={FOOD_GEO.bit} material={TM.tomato} position={[-0.035, 0.095, 0.01]} />
        <mesh geometry={FOOD_GEO.bit} material={TM.tomato} position={[0.03, 0.095, -0.012]} />
      </group>
      <Cyl p={[x0 + 0.3, y1 + 0.2, -0.25]} rt={0.05} h={0.3} m={LM.metal} />
      <Cyl p={[x0 + 0.3, y1 + 0.37, -0.25]} rt={0.09} rb={0.06} h={0.05} m={LM.metal} />
      <group position={[x0 + 0.3, y1 + 0.42, -0.25]}>
        {steam.map((r, i) => (
          <mesh key={i} ref={r} geometry={FOOD_GEO.steam} material={TM.steam} />
        ))}
      </group>
      {/* striped awning over the window (folded away at bedtime) */}
      <group position={[0, WIN.y1 + 0.06, hz]} rotation={[0.3, 0, 0]} visible={open}>
        {Array.from({ length: 9 }, (_, i) => {
          const w = (WIN.x1 - WIN.x0 + 0.3) / 9;
          return <Box key={i} p={[WIN.x0 - 0.15 + w * (i + 0.5), 0, 0.16]} s={[w, 0.02, 0.32]} m={i % 2 ? TM.awnWhite : TM.awnRed} />;
        })}
        {Array.from({ length: 9 }, (_, i) => {
          const w = (WIN.x1 - WIN.x0 + 0.3) / 9;
          return <Box key={`v${i}`} p={[WIN.x0 - 0.15 + w * (i + 0.5), -0.04, 0.32]} s={[w, 0.08, 0.015]} m={i % 2 ? TM.awnWhite : TM.awnRed} />;
        })}
      </group>
      {open && (
        <group>
          <StringLights points={[[WIN.x0 - 0.12, WIN.y1 - 0.06, hz + 0.33], [WIN.x1 + 0.12, WIN.y1 - 0.06, hz + 0.33]]} sag={0.06} per={5} night={night} />
          <Beam2 x={WIN.x0 - 0.12} hz={hz} />
          <Beam2 x={WIN.x1 + 0.12} hz={hz} />
        </group>
      )}
      {/* shutter and a "closed" sign at bedtime */}
      <group visible={!open}>
        <Box p={[(WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2 + 0.01, hz + 0.02]} s={[WIN.x1 - WIN.x0 + 0.04, WIN.y1 - WIN.y0 + 0.04, 0.03]} m={TM.shutter} />
        {[0.2, 0.4, 0.6, 0.8].map((k) => (
          <Box key={k} p={[(WIN.x0 + WIN.x1) / 2, WIN.y0 + (WIN.y1 - WIN.y0) * k, hz + 0.04]} s={[WIN.x1 - WIN.x0, 0.012, 0.01]} m={LM.metal} />
        ))}
        <mesh position={[(WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, hz + 0.045]} rotation={[0, 0, 0.04]} material={closedMat}>
          <planeGeometry args={[0.42, 0.16]} />
        </mesh>
      </group>
      {cook}
    </group>
  );
}

// Thin pole from the wall up to the awning's front corner.
function Beam2({ x, hz }) {
  return <Cyl p={[x, WIN.y1 - 0.03, hz + 0.16]} rt={0.012} h={0.3} m={LM.chrome} r={[-1.1, 0, 0]} />;
}

function PicnicTable() {
  return (
    <group position={[TABLE.x, tableG, TABLE.z]}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={LM.shadow}>
        <planeGeometry args={[1.6, 1.5]} />
      </mesh>
      {/* table top and A-frame legs */}
      <Box p={[0, 0.66, 0]} s={[1.4, 0.05, 0.62]} m={TM.tableWood} />
      {[-0.5, 0.5].map((x) => (
        <group key={x}>
          <Box p={[x, 0.3, 0.2]} s={[0.05, 0.84, 0.06]} r={[0.55, 0, 0]} m={LM.darkWood} />
          <Box p={[x, 0.3, -0.2]} s={[0.05, 0.84, 0.06]} r={[-0.55, 0, 0]} m={LM.darkWood} />
          <Box p={[x, BENCH_H - 0.05, 0]} s={[0.05, 0.05, BENCH_DZ * 2 + 0.2]} m={LM.darkWood} />
        </group>
      ))}
      {/* benches */}
      {[-BENCH_DZ, BENCH_DZ].map((z) => (
        <Box key={z} p={[0, BENCH_H - 0.02, z]} s={[1.4, 0.04, 0.24]} m={TM.tableWood} />
      ))}
      {/* striped umbrella through the middle */}
      <Cyl p={[0, 1.1, 0]} rt={0.02} h={1.6} m={LM.white} />
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[0, 1.82, 0]} rotation={[0, (i / 8) * Math.PI * 2, 0]} material={i % 2 ? TM.umbrellaB : TM.umbrellaA}>
          <coneGeometry args={[0.95, 0.32, 3, 1, true, 0, Math.PI / 4]} />
        </mesh>
      ))}
      <Box p={[0.12, 0.72, 0.05]} s={[0.1, 0.08, 0.07]} m={LM.white} />
      <Cyl p={[-0.12, 0.74, -0.04]} rt={0.022} h={0.12} m={TM.hotSauce} />
      <Cyl p={[-0.05, 0.73, 0.08]} rt={0.022} h={0.1} m={TM.iceYellow} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// The crew
// ---------------------------------------------------------------------------

const COOK_POS = [(WIN.x0 + WIN.x1) / 2 + 0.05, BODY.y0 + 0.08, 0.1];
const COOK_SCALE = 1.15;

function freshSim(n) {
  const bots = [];
  for (let i = 0; i < n; i++) {
    bots.push({ state: 'queue', x: 0, y: 0, z: 0, rot: Math.PI, heading: Math.PI, moving: false, walk: i, path: null, s: 0, seat: -1, k: 0, eatT: 0, food: false, foodType: i % 2, phase: i * 1.7 });
  }
  const sim = { bots, line: [], seatTaken: [false, false, false, false], st: 0, served: 0, t: 0 };
  // Start mid-scene: four in line, one eating at each bench, the rest on
  // their way back round.
  const inLine = Math.min(4, n);
  for (let i = 0; i < inLine; i++) {
    const b = bots[i];
    sim.line.push(i);
    const sl = SLOTS[i];
    b.x = sl[0];
    b.z = sl[1];
  }
  const sitters = [0, 3];
  for (let i = inLine, k = 0; i < n && k < sitters.length; i++, k++) {
    const b = bots[i];
    const seat = SEATS[sitters[k]];
    b.state = 'eat';
    b.seat = sitters[k];
    sim.seatTaken[b.seat] = true;
    b.x = seat.x;
    b.z = seat.z;
    b.rot = b.heading = seat.rotY;
    b.food = true;
    b.eatT = k * 3;
  }
  for (let i = inLine + sitters.length; i < n; i++) {
    const b = bots[i];
    b.state = 'loop';
    b.path = LEAVE[1];
    b.s = b.path.length * 0.55;
  }
  for (const b of bots) {
    if (b.state === 'queue') b.y = groundY(b.x, b.z);
    if (b.state === 'eat') b.y = SEAT_Y;
  }
  return sim;
}

// Walk straight toward (tx, tz). Returns true once there.
function stepToward(b, tx, tz, dt) {
  const dx = tx - b.x;
  const dz = tz - b.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.02) {
    b.x = tx;
    b.z = tz;
    b.moving = false;
    return true;
  }
  const step = Math.min(d, SPEED * dt);
  b.x += (dx / d) * step;
  b.z += (dz / d) * step;
  b.y = groundY(b.x, b.z);
  b.heading = Math.atan2(dx, dz);
  b.moving = step > 0;
  return d - step < 0.02;
}

const PT = { x: 0, y: 0, z: 0, heading: 0 };

export default function FoodTruck({ animate = true, night = 0, bedtime = false, lowPower = false }) {
  const n = lowPower ? 5 : 7;
  const parts = useMemo(() => Array.from({ length: n }, () => ({ current: {} })), [n]);
  const cookParts = useRef({});
  const colors = useMemo(() => Array.from({ length: n }, (_, i) => CREW_COLORS[(i * 3 + 1) % CREW_COLORS.length]), [n]);
  const sim = useRef(null);
  if (!sim.current || sim.current.bots.length !== n) sim.current = freshSim(n);
  const crew = useRef();
  const steam = [useRef(), useRef(), useRef()];

  // Food props live in the hands (two per bot: a taco and a shave ice).
  const foods = useMemo(() => Array.from({ length: n }, () => [makeFood('taco'), makeFood('shave')]), [n]);
  const cookFood = useMemo(() => [makeFood('taco'), makeFood('shave')], []);
  const spatula = useMemo(() => makeSpatula(), []);
  useEffect(() => {
    const added = [];
    parts.forEach((p, i) => {
      const hand = p.current.handR;
      if (!hand) return;
      for (const f of foods[i]) {
        hand.add(f);
        added.push([hand, f]);
      }
    });
    const cp = cookParts.current;
    if (cp.handL) for (const f of cookFood) {
      cp.handL.add(f);
      added.push([cp.handL, f]);
    }
    if (cp.handR) {
      cp.handR.add(spatula);
      added.push([cp.handR, spatula]);
    }
    return () => added.forEach(([h, f]) => h.remove(f));
  }, [parts, foods, cookFood, spatula]);
  useEffect(
    () => () => {
      spatula.children.forEach((c) => c.geometry.dispose());
    },
    [spatula]
  );

  // A fresh start each morning.
  useEffect(() => {
    if (!bedtime) sim.current = freshSim(n);
  }, [bedtime, n]);

  const signMat = useSignMaterial(SIGN_TEX, bedtime ? night * 0.35 : night, 0.12, 0.9);
  const menuMat = useSignMaterial(MENU_TEX, bedtime ? 0 : night, 0.08, 0.6);
  const closedMat = useSignMaterial(CLOSED_TEX, night, 0.05, 0.35);
  const headMat = useMemo(() => std('#fff6c8', { emissive: '#ffe9a0', emissiveIntensity: 0.2 }), []);
  useEffect(() => {
    headMat.emissiveIntensity = 0.2 + night * 1.2;
  }, [headMat, night]);
  useEffect(() => () => headMat.dispose(), [headMat]);
  const lanternGlow = useMemo(() => glowMat('#ffc58a', 0.25), []);
  useEffect(() => {
    lanternGlow.opacity = 0.3 * night;
  }, [lanternGlow, night]);
  useEffect(() => () => lanternGlow.dispose(), [lanternGlow]);

  usePoseOnce(animate, bedtime, n);

  useFrame((_, delta) => {
    const dt = animate ? Math.min(delta, 0.1) : 0;
    const S0 = sim.current;
    S0.t += dt;
    const t = animate ? S0.t : 0;

    // Steam from the griddle vent.
    for (let i = 0; i < steam.length; i++) {
      const m = steam[i].current;
      if (!m) continue;
      m.visible = !bedtime;
      const u = (t * 0.35 + i / steam.length) % 1;
      m.position.set(Math.sin(u * 5 + i) * 0.06, u * 0.7, -u * 0.12);
      m.scale.setScalar((0.4 + u * 0.9) * (1 - u * 0.6) * (u < 0.1 ? u * 10 : 1));
    }

    if (crew.current) crew.current.visible = !bedtime;
    const cp = cookParts.current;
    if (cp.root) cp.root.visible = !bedtime;
    if (bedtime) return;

    // --- simulation -------------------------------------------------------
    const { bots, line, seatTaken } = S0;
    for (let q = 0; q < line.length; q++) {
      const b = bots[line[q]];
      const sl = SLOTS[Math.min(q, SLOTS.length - 1)];
      const there = stepToward(b, sl[0], sl[1], dt);
      if (there) {
        // face the window at the front, otherwise the bot ahead
        const ahead = q === 0 ? null : SLOTS[Math.min(q - 1, SLOTS.length - 1)];
        b.heading = ahead ? Math.atan2(ahead[0] - b.x, ahead[1] - b.z) : Math.PI;
      }
    }
    // The front of the line orders, waits, and gets served.
    const front = line.length ? bots[line[0]] : null;
    const frontReady = front && !front.moving && Math.hypot(front.x - SLOTS[0][0], front.z - SLOTS[0][1]) < 0.05;
    if (frontReady) S0.st += dt;
    let seat = -1;
    if (frontReady && S0.st >= SERVE) {
      const order = [1, 3, 0, 2];
      for (let k = 0; k < 4; k++) {
        const c = order[(S0.served + k) % 4];
        if (!seatTaken[c]) {
          seat = c;
          break;
        }
      }
      if (seat >= 0) {
        line.shift();
        seatTaken[seat] = true;
        front.state = 'toSeat';
        front.seat = seat;
        front.path = TO_SEAT[seat];
        front.s = 0;
        front.food = true;
        front.foodType = S0.served % 2;
        S0.served += 1;
        S0.st = 0;
      } else {
        S0.st = SERVE; // hold the order until a seat frees up
      }
    }
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      if (b.state === 'toSeat' || b.state === 'loop') {
        b.s += SPEED * dt;
        b.path.sample(b.s, PT);
        b.x = PT.x;
        b.y = PT.y;
        b.z = PT.z;
        b.heading = PT.heading;
        b.moving = dt > 0;
        if (b.s >= b.path.length) {
          if (b.state === 'toSeat') {
            b.state = 'sitDown';
            b.k = 0;
          } else {
            b.state = 'queue';
            line.push(i);
          }
        }
      } else if (b.state === 'sitDown' || b.state === 'standUp') {
        const st = SEATS[b.seat];
        b.k += dt / SIT_TIME;
        const k = smooth(b.state === 'sitDown' ? b.k : 1 - b.k);
        const gx = st.stand[0];
        const gz = st.stand[1];
        b.x = gx + (st.x - gx) * k;
        b.z = gz + (st.z - gz) * k;
        b.y = groundY(gx, gz) + (SEAT_Y - groundY(gx, gz)) * k + Math.sin(k * Math.PI) * 0.12;
        b.heading = st.rotY;
        b.moving = false;
        if (b.k >= 1) {
          if (b.state === 'sitDown') {
            b.state = 'eat';
            b.eatT = 0;
          } else {
            seatTaken[b.seat] = false;
            b.state = 'loop';
            b.path = LEAVE[b.seat];
            b.s = 0;
          }
        }
      } else if (b.state === 'eat') {
        b.eatT += dt;
        b.moving = false;
        b.x = SEATS[b.seat].x;
        b.z = SEATS[b.seat].z;
        b.y = SEAT_Y;
        if (b.eatT >= EAT) {
          b.state = 'standUp';
          b.k = 0;
          b.food = false;
        }
      }
    }

    // --- poses ------------------------------------------------------------
    const handoff = frontReady && S0.st > SERVE - 1.6;
    const passed = frontReady && S0.st > SERVE - 0.55;
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      const p = parts[i].current;
      if (!resetBot(p)) continue;
      b.rot = dt > 0 ? lerpAngle(b.rot, b.heading, Math.min(1, dt * 8)) : b.heading;
      p.root.position.set(b.x, b.y, b.z);
      p.root.rotation.y = b.rot;
      const tt = t + b.phase;
      const sitting = b.state === 'eat' || b.state === 'sitDown' || b.state === 'standUp';
      let showFood = b.food;
      if (b.moving) {
        b.walk += dt * 9;
        walkPose(p, b.walk, !b.food);
        if (b.food) {
          p.armR.rotation.x = -0.9;
          p.armL.rotation.x = Math.sin(b.walk) * 0.4;
        }
      } else if (sitting) {
        sitPose(p, Math.sin(tt * 1.6) * 0.8);
        if (b.state === 'eat') {
          // bites: food up to the mouth now and then, a happy wiggle after
          const cyc = (b.eatT * 0.45 + b.phase) % 1;
          const bite = cyc > 0.7 ? Math.sin(((cyc - 0.7) / 0.3) * Math.PI) : 0;
          p.armR.rotation.x = -1.0 - bite * 1.15;
          p.armR.rotation.z = bite * 0.25;
          p.head.rotation.x = -bite * 0.15 + 0.12 * (1 - bite);
          p.head.rotation.y = Math.sin(tt * 0.5) * 0.3 * (1 - bite);
          p.pose.rotation.z = Math.sin(tt * 2.2) * 0.03;
          p.armL.rotation.x = -0.7;
        }
      } else {
        // waiting in line: a little sway, looking around, peeking at the menu
        p.pose.rotation.z = Math.sin(tt * 0.9) * 0.04;
        p.pose.position.y = (Math.sin(tt * 1.4) + 1) * 0.006;
        p.head.rotation.y = Math.sin(tt * 0.4) * 0.45;
        p.head.rotation.x = -0.12 + Math.sin(tt * 0.3) * 0.08;
        p.armL.rotation.z = -0.12;
        p.armR.rotation.z = 0.12;
        if (b === front && handoff) {
          p.head.rotation.set(-0.2, 0, 0);
          const reach = smooth((S0.st - (SERVE - 1.6)) / 0.6);
          p.armR.rotation.x = -1.35 * reach;
          p.pose.position.y += passed ? Math.abs(Math.sin((S0.st - SERVE + 0.55) * 9)) * 0.03 : 0;
          if (passed) {
            showFood = true;
            b.foodType = S0.served % 2;
          }
        }
      }
      const f = foods[i];
      const eaten = b.state === 'eat' ? 1 - (b.eatT / EAT) * 0.55 : 1;
      f[0].visible = showFood && b.foodType === 0;
      f[1].visible = showFood && b.foodType === 1;
      f[0].scale.setScalar(1.35 * eaten);
      f[1].scale.setScalar(1.35 * eaten);
    }

    // The cook: flipping on the griddle, then a hand out the window.
    if (resetBot(cp)) {
      const nextType = S0.served % 2;
      const k = handoff ? smooth((S0.st - (SERVE - 1.6)) / 0.5) : 0;
      cookFood[0].visible = handoff && !passed && nextType === 0;
      cookFood[1].visible = handoff && !passed && nextType === 1;
      p0(cp, t, k);
    }
  });

  const cook = (
    <MiniBot color="#ffffff" parts={cookParts} position={COOK_POS} scale={COOK_SCALE} shadow={false}>
      {/* white cook hat */}
      <group position={[0, 1.06, 0]}>
        <mesh material={LM.white} position={[0, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.12, 0.12, 8]} />
        </mesh>
        <mesh material={LM.white} position={[0, 0.1, 0]} scale={[1, 0.7, 1]}>
          <icosahedronGeometry args={[0.15, 0]} />
        </mesh>
      </group>
    </MiniBot>
  );

  return (
    <group>
      <Truck night={night} bedtime={bedtime} cook={cook} signMat={signMat} menuMat={menuMat} closedMat={closedMat} steam={steam} headMat={headMat} />
      <PicnicTable />
      {/* lantern on a post by the truck's west end */}
      <group position={[TRUCK.x - 1.35, groundY(TRUCK.x - 1.35, TRUCK.z + 0.6), TRUCK.z + 0.6]}>
        <Cyl p={[0, 0.55, 0]} rt={0.025} h={1.1} m={LM.darkWood} />
        <Box p={[0.1, 1.08, 0]} s={[0.22, 0.03, 0.03]} m={LM.darkWood} />
        <mesh position={[0.18, 0.95, 0]} material={TM.lantern}>
          <icosahedronGeometry args={[0.07, 0]} />
        </mesh>
        <mesh position={[0.18, 0.95, 0]} material={lanternGlow}>
          <sphereGeometry args={[0.28, 10, 8]} />
        </mesh>
      </group>
      <group ref={crew}>
        {parts.map((p, i) => (
          <MiniBot key={i} color={colors[i]} parts={p} />
        ))}
      </group>
    </group>
  );
}

// Cook pose: k = 0 at the griddle, 1 reaching out the window.
function p0(cp, t, k) {
  const flip = Math.max(0, Math.sin(t * 5.5)) ** 3;
  cp.armR.rotation.x = -0.75 - flip * 0.55;
  cp.armR.rotation.z = 0.15;
  cp.head.rotation.x = 0.3 * (1 - k) - 0.05 * k;
  cp.head.rotation.y = Math.sin(t * 0.6) * 0.25 * (1 - k);
  cp.pose.rotation.z = Math.sin(t * 2.4) * 0.04; // humming along
  cp.armL.rotation.x = -0.4 - k * 1.1;
  cp.armL.rotation.z = -0.1;
}
