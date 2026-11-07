import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { extraColor } from '../MiniBot.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import { Box, Cyl, L, ShaveIce, Taco, canvasTexture, ease, keepLevel, lerpAngle, std, useGlow, walkCycle } from './kit.jsx';
import StaticMerge from '../../utils/StaticMerge.jsx';

// "Bytes & Bites" food truck on the south beach, with a cook in the window
// and a line of bots. Every few seconds the bot at the front gets a taco or
// a shave ice, walks off to the east eating it, the line shuffles forward and
// a new bot joins at the back. Closed at night (shutter down, no line).

const S = SITES.foodtruck;
const WIN_X0 = -1.0; // serving window, local x
const WIN_X1 = 0.0;
const WALL_Z = 0.65;
// Queue spots in world coordinates, front first (the line bends west, clear
// of the picnic table and the sandcastle).
const SLOTS = [
  [-1.1, 13.1],
  [-1.65, 13.1],
  [-2.2, 12.98],
  [-2.7, 12.78],
  [-3.15, 12.52],
  [-3.55, 12.22],
];
const EXIT = [
  [-1.1, 13.1],
  [0.3, 13.25],
  [1.45, 12.85],
];
const SPAWN = [-4.3, 11.5];
const PERIOD = 7;
const T_FOOD = 2.0; // food handed over
const T_GO = 2.8; // front bot leaves, everyone shuffles up
const EXIT_DUR = 3.0;
const SPAWN_DUR = 1.9;
const SHUFFLE = 0.9;

const TRUCK = std('#2ec4c8');
const TRUCK_DARK = std('#1d8f93');
const STRIPE = std('#ff7a59');
const GLASS = std('#2c4a6e', { roughness: 0.3 });
const TIRE = std('#25272c');
const AWN = [std('#ff5fa2'), std('#fdf8ee')];
const HAT = std('#ffffff');

let signTex = null;
let menuTex = null;
function textures() {
  if (!signTex) {
    signTex = canvasTexture(512, 112, (g, w, h) => {
      g.fillStyle = '#ffde69';
      g.beginPath();
      g.roundRect(4, 4, w - 8, h - 8, 26);
      g.fill();
      g.lineWidth = 8;
      g.strokeStyle = '#ff5fa2';
      g.stroke();
      g.fillStyle = '#19469d';
      g.font = 'bold 62px "Trebuchet MS", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('BYTES & BITES', w / 2, h / 2 + 3);
    });
    menuTex = canvasTexture(192, 200, (g, w, h) => {
      g.fillStyle = '#26332c';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#c08a57';
      g.lineWidth = 10;
      g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.font = 'bold 30px "Trebuchet MS", system-ui, sans-serif';
      g.fillText('MENU', w / 2, 42);
      g.font = 'bold 21px "Trebuchet MS", system-ui, sans-serif';
      g.textAlign = 'left';
      const rows = [
        ['#ffde69', 'TACOS', '3'],
        ['#7fe3d8', 'SHAVE ICE', '2'],
        ['#ff8fb8', 'CHIPS', '1'],
        ['#b9ec6f', 'MAI TAI', '4'],
      ];
      rows.forEach(([c, name, price], i) => {
        const y = 82 + i * 30;
        g.fillStyle = c;
        g.fillText(name, 18, y);
        g.textAlign = 'right';
        g.fillText(`$${price}`, w - 18, y);
        g.textAlign = 'left';
      });
    });
  }
  return { signTex, menuTex };
}

function Truck({ glow, open }) {
  const { signTex: st, menuTex: mt } = textures();
  const signMat = useMemo(() => new THREE.MeshStandardMaterial({ map: st, emissive: '#ffffff', emissiveMap: st, emissiveIntensity: 0.12 }), [st]);
  const menuMat = useMemo(() => new THREE.MeshStandardMaterial({ map: mt, emissive: '#ffffff', emissiveMap: mt, emissiveIntensity: 0.1 }), [mt]);
  signMat.emissiveIntensity = 0.12 + glow * 0.7;
  menuMat.emissiveIntensity = 0.1 + glow * 0.5;
  const lamp = useGlow('#ffd27a', glow, 0.2, 1.8);
  const y0 = 0.4;
  const top = 2.0;
  const winY0 = 0.95;
  const winY1 = 1.72;
  return (
    <group>
      {/* wheels */}
      {[[-0.85, -0.6], [-0.85, 0.6], [1.05, -0.6], [1.05, 0.6]].map(([x, z], i) => (
        <group key={i} position={[x, 0.2, z]} rotation={[Math.PI / 2, 0, 0]}>
          <Cyl p={[0, 0, 0]} rt={0.2} h={0.14} seg={10} m={TIRE} />
          <Cyl p={[0, z > 0 ? 0.075 : -0.075, 0]} rt={0.09} h={0.02} seg={8} m={L.metal} />
        </group>
      ))}
      {/* box: floor, roof, back, ends */}
      <Box p={[-0.28, y0 + 0.04, 0]} s={[2.1, 0.08, 1.3]} m={TRUCK_DARK} />
      <Box p={[-0.28, top, 0]} s={[2.2, 0.08, 1.4]} m={TRUCK} />
      <Box p={[-0.28, (y0 + top) / 2, -WALL_Z]} s={[2.1, top - y0, 0.06]} m={TRUCK} />
      <Box p={[-1.3, (y0 + top) / 2, 0]} s={[0.06, top - y0, 1.3]} m={TRUCK} />
      <Box p={[0.75, (y0 + top) / 2, 0]} s={[0.06, top - y0, 1.3]} m={TRUCK} />
      {/* front wall around the serving window */}
      <Box p={[-0.28, (y0 + winY0) / 2, WALL_Z]} s={[2.1, winY0 - y0, 0.06]} m={TRUCK} />
      <Box p={[-0.28, (winY1 + top) / 2, WALL_Z]} s={[2.1, top - winY1, 0.06]} m={TRUCK} />
      <Box p={[(-1.3 + WIN_X0) / 2, (winY0 + winY1) / 2, WALL_Z]} s={[WIN_X0 + 1.3, winY1 - winY0, 0.06]} m={TRUCK} />
      <Box p={[(WIN_X1 + 0.75) / 2, (winY0 + winY1) / 2, WALL_Z]} s={[0.75 - WIN_X1, winY1 - winY0, 0.06]} m={TRUCK} />
      <Box p={[-0.28, 0.62, WALL_Z + 0.035]} s={[2.1, 0.1, 0.02]} m={STRIPE} />
      <Box p={[-0.28, 0.62, -WALL_Z - 0.035]} s={[2.1, 0.1, 0.02]} m={STRIPE} />
      <Box p={[(WIN_X0 + WIN_X1) / 2, winY0, WALL_Z + 0.12]} s={[WIN_X1 - WIN_X0 + 0.1, 0.05, 0.26]} m={L.metal} />
      {!open && <Box p={[(WIN_X0 + WIN_X1) / 2, (winY0 + winY1) / 2, WALL_Z + 0.01]} s={[WIN_X1 - WIN_X0, winY1 - winY0, 0.04]} m={L.metal} />}
      {/* striped awning */}
      <group position={[(WIN_X0 + WIN_X1) / 2, winY1 + 0.06, WALL_Z]} rotation={[open ? 0.45 : 1.35, 0, 0]}>
        {Array.from({ length: 6 }, (_, i) => (
          <Box key={i} p={[-0.6 + i * 0.24 + 0.12, 0, 0.28]} s={[0.24, 0.03, 0.56]} m={AWN[i % 2]} />
        ))}
      </group>
      <mesh position={[(WIN_X0 + WIN_X1) / 2, winY1 + 0.12, WALL_Z + 0.05]} material={lamp}>
        <icosahedronGeometry args={[0.06, 0]} />
      </mesh>
      {/* menu board next to the window */}
      <mesh position={[0.38, 1.33, WALL_Z + 0.035]} material={menuMat}>
        <planeGeometry args={[0.58, 0.6]} />
      </mesh>
      {/* cab */}
      <Box p={[1.12, 0.84, 0]} s={[0.7, 0.88, 1.3]} m={TRUCK} />
      <Box p={[1.0, 1.36, 0]} s={[0.46, 0.18, 1.26]} m={TRUCK} />
      <Box p={[1.36, 1.12, 0]} s={[0.24, 0.3, 1.1]} m={GLASS} rotation={[0, 0, 0.5]} />
      <Box p={[1.08, 1.12, 0]} s={[0.3, 0.26, 1.32]} m={GLASS} />
      <Box p={[1.5, 0.55, 0]} s={[0.06, 0.16, 1.32]} m={L.metal} />
      {[-0.45, 0.45].map((z) => (
        <mesh key={z} position={[1.48, 0.78, z]} material={lamp}>
          <icosahedronGeometry args={[0.07, 0]} />
        </mesh>
      ))}
      {/* roof sign and a giant taco */}
      <mesh position={[-0.28, top + 0.3, WALL_Z - 0.05]} material={signMat}>
        <planeGeometry args={[1.9, 0.42]} />
      </mesh>
      <Box p={[-0.28, top + 0.08, WALL_Z - 0.07]} s={[1.5, 0.08, 0.04]} m={L.darkWood} />
      <group position={[-0.28, top + 0.04, -0.15]} scale={4.2}>
        <Taco />
        <mesh position={[0.05, 0.1, 0]} material={L.tomato}>
          <icosahedronGeometry args={[0.018, 0]} />
        </mesh>
        <mesh position={[-0.04, 0.1, 0.01]} material={L.tomato}>
          <icosahedronGeometry args={[0.018, 0]} />
        </mesh>
      </group>
    </group>
  );
}

function ChefHat() {
  return (
    <group position={[0, 0.25, 0]}>
      <Cyl p={[0, 0, 0]} rt={0.13} h={0.12} seg={9} m={HAT} />
      <mesh position={[0, 0.11, 0]} material={HAT} scale={[1, 0.7, 1]}>
        <icosahedronGeometry args={[0.17, 1]} />
      </mesh>
    </group>
  );
}

// Position along a polyline (by fraction of its length).
function along(pts, lens, total, f, out) {
  let d = Math.max(0, Math.min(1, f)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? Math.min(1, d / lens[i]) : 1;
      out.x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k;
      out.z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k;
      out.dx = pts[i + 1][0] - pts[i][0];
      out.dz = pts[i + 1][1] - pts[i][1];
      return out;
    }
    d -= lens[i];
  }
  return out;
}
const EXIT_LENS = EXIT.slice(1).map((p, i) => Math.hypot(p[0] - EXIT[i][0], p[1] - EXIT[i][1]));
const EXIT_TOTAL = EXIT_LENS.reduce((a, b) => a + b, 0);

export default function FoodTruck({ night, glow, animate, lowPower }) {
  const g0 = groundY(S.x, S.z);
  const n = lowPower ? 3 : 5;
  const bots = useRef([]);
  const tacos = useRef([]);
  const ices = useRef([]);
  const cook = useRef();
  const hat = useRef();
  const cookTaco = useRef();
  const cookIce = useRef();
  const tmp = useMemo(() => ({ x: 0, z: 0, dx: 0, dz: 1 }), []);
  const colors = useMemo(() => Array.from({ length: n + 1 }, (_, j) => extraColor(j * 5 + 1)), [n]);

  useFrame((state) => {
    if (night) return;
    const t = animate ? state.clock.elapsedTime + 1 : 1;
    const c = Math.floor(t / PERIOD);
    const u = t - c * PERIOD;
    const item = c % 2; // 0 taco, 1 shave ice
    // Cook: flipping on the grill, then reaching out the window with the order.
    const ck = cook.current;
    if (ck) {
      const reach = u > T_FOOD - 0.9 && u < T_FOOD + 0.15 ? Math.sin(Math.min(1, (u - (T_FOOD - 0.9)) / 0.5) * Math.PI * 0.5) : 0;
      ck.armR.rotation.set(reach ? -1.45 * reach : -0.9 + Math.sin(t * 9) * 0.35, 0, 0.1);
      ck.armL.rotation.set(-0.8 + (reach ? 0 : Math.cos(t * 9) * 0.2), 0, -0.15);
      ck.head.rotation.set(reach ? -0.05 : 0.3, reach ? 0.3 : Math.sin(t * 0.8) * 0.3, 0);
      if (hat.current) hat.current.rotation.copy(ck.head.rotation);
      if (cookTaco.current) {
        cookTaco.current.visible = reach > 0 && item === 0;
        cookIce.current.visible = reach > 0 && item === 1;
        keepLevel(cookTaco.current.parent, ck.armR);
      }
    }
    for (let j = 0; j <= n; j++) {
      const b = bots.current[j];
      if (!b) continue;
      b.reset();
      const q = (((j - c) % (n + 1)) + n + 1) % (n + 1);
      let x;
      let z;
      let rot = Math.PI;
      let walking = false;
      let scale = 1;
      let holding = false;
      if (q === 0) {
        if (u < T_GO) {
          [x, z] = SLOTS[0];
          holding = u > T_FOOD;
          b.head.rotation.x = holding ? 0.25 : -0.15; // looking up at the menu, then at the food
        } else {
          const f = (u - T_GO) / EXIT_DUR;
          along(EXIT, EXIT_LENS, EXIT_TOTAL, f, tmp);
          x = tmp.x;
          z = tmp.z;
          holding = true;
          if (f < 1) {
            walking = true;
            rot = Math.atan2(tmp.dx, tmp.dz);
          } else {
            rot = 1.2;
            scale = 1 - Math.min(1, (u - T_GO - EXIT_DUR) / 0.4);
          }
        }
      } else if (q === n) {
        if (u < T_GO) {
          scale = 0;
          [x, z] = SPAWN;
        } else {
          const f = Math.min(1, (u - T_GO) / SPAWN_DUR);
          const [tx, tz] = SLOTS[n - 1];
          x = SPAWN[0] + (tx - SPAWN[0]) * ease(f);
          z = SPAWN[1] + (tz - SPAWN[1]) * ease(f);
          scale = Math.min(1, (u - T_GO) / 0.35);
          walking = f < 1;
          const [ax, az] = SLOTS[n - 2];
          rot = walking ? Math.atan2(tx - SPAWN[0], tz - SPAWN[1]) : Math.atan2(ax - tx, az - tz);
        }
      } else {
        const start = T_GO + 0.18 * q;
        const f = Math.max(0, Math.min(1, (u - start) / SHUFFLE));
        const [ax, az] = SLOTS[q];
        const [bx, bz] = SLOTS[q - 1];
        x = ax + (bx - ax) * ease(f);
        z = az + (bz - az) * ease(f);
        walking = f > 0 && f < 1;
        // face the bot ahead (the front of the line faces the window)
        const ahead = f < 1 ? q - 1 : q - 2;
        rot = ahead < 0 ? Math.PI : Math.atan2(SLOTS[ahead][0] - x, SLOTS[ahead][1] - z);
        if (!walking) b.head.rotation.y = Math.sin(t * 0.6 + j * 1.7) * 0.4;
      }
      b.root.visible = scale > 0.01;
      if (!b.root.visible) continue;
      b.root.scale.setScalar(1.35 * scale);
      b.root.position.set(x, groundY(x, z), z);
      b.root.rotation.y = walking ? rot : lerpAngle(b.root.rotation.y, rot, 0.2);
      if (walking && animate) walkCycle(b, t + j);
      else b.pose.rotation.z = Math.sin(t * 1.3 + j) * 0.03;
      // Food in the right hand; a bite now and then on the way out.
      const bite = holding && q === 0 && u > T_GO ? Math.max(0, Math.sin(t * 2.4 + j)) ** 6 : 0;
      b.armR.rotation.set(holding ? -0.75 - bite * 1.0 : 0, 0, 0.12);
      if (tacos.current[j]) {
        tacos.current[j].visible = holding && item === 0;
        ices.current[j].visible = holding && item === 1;
        keepLevel(tacos.current[j].parent, b.armR);
      }
    }
  });

  return (
    <group>
      <group position={[S.x, g0, S.z]} rotation={[0, S.rotY, 0]}>
        <StaticMerge version={night ? 1 : 0}>
          <Truck glow={glow} open={!night} />
        </StaticMerge>
        {!night && (
          <MiniBot
            ref={cook}
            color="#f09024"
            position={[(WIN_X0 + WIN_X1) / 2, 0.44, 0.12]}
            scale={1.25}
            shadow={false}
            right={
              <group>
                <group ref={cookTaco} visible={false} scale={1.3}>
                  <Taco />
                </group>
                <group ref={cookIce} visible={false} scale={1.3}>
                  <ShaveIce flavor={1} />
                </group>
              </group>
            }
          >
            <group ref={hat} position={[0, 0.74, 0]}>
              <ChefHat />
            </group>
          </MiniBot>
        )}
      </group>
      {!night &&
        colors.map((col, j) => (
          <MiniBot
            key={`${n}-${j}`}
            ref={(r) => (bots.current[j] = r)}
            color={col}
            right={
              <group>
                <group ref={(r) => (tacos.current[j] = r)} visible={false} scale={1.2}>
                  <Taco />
                </group>
                <group ref={(r) => (ices.current[j] = r)} visible={false} scale={1.2}>
                  <ShaveIce flavor={j} />
                </group>
              </group>
            }
          />
        ))}
    </group>
  );
}
