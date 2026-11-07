import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Drink } from '../../components/Bot.jsx';
import MiniBot from '../MiniBot.jsx';
import { PATIO_LOUNGERS, ZONES, groundY } from '../../utils/paths.js';
import { Box, Cyl, L, keepLevel, lerpAngle, std, walkCycle } from './kit.jsx';
import StaticMerge from '../../utils/StaticMerge.jsx';

// Two waiters (bow tie, towel over the arm) carry trays of drinks: one works
// the Cabana Patio loungers from a little drinks cart, the other runs drinks
// from the tiki bar over to Nasty's Chair. They pause to serve with a bow.
// Daytime only.

const SPEED = 0.85;
const CART = { x: -0.5, z: -7.3 };

// Loop of [x, z, pause seconds, face rotY (when pausing)].
function patioRoute() {
  const zone = ZONES.patio;
  const pts = [[CART.x, CART.z - 0.45, 2.2, 0]];
  for (const s of [...PATIO_LOUNGERS].reverse()) pts.push([zone.x + s.x, zone.z + s.z + 1.2, 2.0, Math.PI]);
  pts.push([zone.x - 2.6, -7.75, 0, 0], [zone.x + 0.4, -7.6, 0, 0]);
  return pts;
}
const NASTY = ZONES.beachchair;
const TIKI_ROUTE = [
  [6.75, 13.0, 2.4, -0.2 - Math.PI / 2],
  [6.75, 12.2, 0, 0],
  [6.35, 11.4, 0, 0],
  [6.0, 10.15, 0, 0],
  [9.08, 8.27, 0, 0],
  [9.55, 7.75, 2.6, Math.atan2(NASTY.x - 9.55, NASTY.z - 7.75)],
  [9.08, 8.27, 1.6, 2.1], // stop to watch the volleyball
  [6.0, 10.15, 0, 0],
  [6.35, 11.4, 0, 0],
  [6.75, 12.2, 0, 0],
];

function timeline(pts) {
  const segs = [];
  let t = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, z, pause, face] = pts[i];
    const [nx, nz] = pts[(i + 1) % pts.length];
    if (pause > 0) {
      segs.push({ t0: t, dur: pause, x, z, face, stop: true });
      t += pause;
    }
    const d = Math.hypot(nx - x, nz - z);
    if (d > 0.01) {
      segs.push({ t0: t, dur: d / SPEED, x, z, nx, nz, rot: Math.atan2(nx - x, nz - z), stop: false });
      t += d / SPEED;
    }
  }
  return { segs, total: t };
}
const ROUTES = [timeline(patioRoute()), timeline(TIKI_ROUTE)];

const TRAY = std('#d8dee6', { roughness: 0.3, metalness: 0.5 });
const BOW = std('#1d2230');

function Tray({ drinks }) {
  return (
    <group position={[0, 0.06, 0]}>
      <Cyl p={[0, 0, 0]} rt={0.2} h={0.025} seg={12} m={TRAY} />
      {drinks.map((d, i) => (
        <group key={i} position={[i ? 0.08 : -0.08, 0.012, i ? -0.04 : 0.05]} scale={1.05}>
          <Drink type={d} />
        </group>
      ))}
    </group>
  );
}

function DrinkCart() {
  const y = groundY(CART.x, CART.z);
  return (
    <group position={[CART.x, y, CART.z]} rotation={[0, 0.15, 0]}>
      <Box p={[0, 0.55, 0]} s={[0.8, 0.06, 0.45]} m={L.darkWood} />
      <Box p={[0, 0.3, 0]} s={[0.7, 0.04, 0.38]} m={L.bamboo} />
      {[[-0.35, -0.18], [0.35, -0.18], [-0.35, 0.18], [0.35, 0.18]].map(([x, z], i) => (
        <Cyl key={i} p={[x, 0.28, z]} rt={0.025} h={0.56} m={L.bamboo} />
      ))}
      {[-0.42, 0.42].map((x) => (
        <Cyl key={x} p={[x, 0.12, 0]} rt={0.12} h={0.04} seg={10} m={L.dark} r={[0, 0, Math.PI / 2]} />
      ))}
      <group position={[-0.2, 0.58, 0]} scale={1.4}>
        <Drink type="maitai" />
      </group>
      <group position={[0.05, 0.58, 0.05]} scale={1.4}>
        <Drink type="margarita" />
      </group>
      <group position={[0.25, 0.58, -0.05]} scale={1.4}>
        <Drink type="coconut" />
      </group>
      <Cyl p={[0, 1.05, 0]} rt={0.02} h={1.0} m={L.white} />
      <mesh position={[0, 1.6, 0]} material={L.tomato}>
        <coneGeometry args={[0.55, 0.25, 8]} />
      </mesh>
    </group>
  );
}

export default function Waiters({ night, animate, lowPower }) {
  const bots = [useRef(), useRef()];
  const trays = [useRef(), useRef()];
  const count = lowPower ? 1 : 2;

  useFrame((state) => {
    if (night) return;
    const clock = animate ? state.clock.elapsedTime : 0;
    for (let w = 0; w < count; w++) {
      const b = bots[w].current;
      if (!b) continue;
      const route = ROUTES[w];
      const t = (clock + w * 7) % route.total;
      let seg = route.segs[0];
      for (let k = route.segs.length - 1; k >= 0; k--) {
        if (t >= route.segs[k].t0) {
          seg = route.segs[k];
          break;
        }
      }
      const f = (t - seg.t0) / seg.dur;
      b.reset();
      let x;
      let z;
      let serve = 0;
      if (seg.stop) {
        x = seg.x;
        z = seg.z;
        b.root.rotation.y = animate ? lerpAngle(b.root.rotation.y, seg.face, 0.15) : seg.face;
        serve = Math.sin(Math.min(1, f) * Math.PI); // lower the tray and bow
      } else {
        x = seg.x + (seg.nx - seg.x) * f;
        z = seg.z + (seg.nz - seg.z) * f;
        b.root.rotation.y = lerpAngle(b.root.rotation.y, seg.rot, animate ? 0.2 : 1);
        if (animate) walkCycle(b, clock + w * 2, 0.8);
      }
      b.root.position.set(x, groundY(x, z), z);
      b.pose.rotation.x += serve * 0.18;
      b.head.rotation.x = serve * 0.2;
      b.armR.rotation.set(-2.75 + serve * 1.3, 0, 0.35 - serve * 0.25);
      b.armL.rotation.set(-0.55, 0, 0.1); // towel arm tucked in front
      keepLevel(trays[w].current, b.armR);
    }
  });

  if (night) return null;
  return (
    <group>
      <StaticMerge>
        <DrinkCart />
      </StaticMerge>
      {[0, 1].slice(0, count).map((w) => (
        <MiniBot
          key={w}
          ref={bots[w]}
          color={w ? '#19469D' : '#2BA84A'}
          right={
            <group ref={trays[w]}>
              <Tray drinks={w ? ['coconut', 'maitai'] : ['margarita', 'maitai']} />
            </group>
          }
          left={<Box p={[0, 0.02, 0.02]} s={[0.07, 0.03, 0.26]} m={L.white} />}
        >
          {/* bow tie */}
          <group position={[0, 0.56, 0.175]}>
            <mesh material={BOW} position={[-0.045, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <coneGeometry args={[0.035, 0.07, 4]} />
            </mesh>
            <mesh material={BOW} position={[0.045, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <coneGeometry args={[0.035, 0.07, 4]} />
            </mesh>
            <mesh material={BOW} position={[0, 0, 0.01]}>
              <icosahedronGeometry args={[0.02, 0]} />
            </mesh>
          </group>
        </MiniBot>
      ))}
    </group>
  );
}
