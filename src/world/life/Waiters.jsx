import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { CREW_COLORS } from '../MiniBot.jsx';
import { aliveClock } from '../../wild/director.js';
import { groundY } from '../../utils/paths.js';
import { BAR_PICKUPS } from './TikiBar.jsx';
import { LM, lerpAngle, makePath, resetBot, std, usePoseOnce, walkPose } from './common.jsx';

// Two waiters with round trays of drinks held up on one hand, walking from
// the tiki bar out to the lounging spots and back: one serves Nasty's beach
// chair and the Networking Tiki Hut, the other carries a tray up the ramp to
// the Real Estate Lanai. They stop, hand a drink over, and carry on.
// Routes are hand-checked: on land, around palms, clear of the team bots'
// stations and hammocks and the other landmarks. Off at bedtime.

const SPEED = 0.85;

// Each route: walking points (out and back the same way) and stops.
// kind: 'pickup' fills the tray, 'serve' hands over `give` drinks.
const ROUTES = [
  {
    color: CREW_COLORS[6],
    pts: [[BAR_PICKUPS.front.x, BAR_PICKUPS.front.z], [10.95, 8.05], [9.6, 9.0], [7.6, 8.9], [4.9, 8.75], [3.5, 8.6]],
    stops: [
      { at: 0, kind: 'pickup', face: BAR_PICKUPS.front.face, wait: 3.5 },
      { at: 1, kind: 'serve', face: -1.75, wait: 3.2, give: 1 }, // Nasty, lying back in the beach chair
      { at: 5, kind: 'serve', face: Math.atan2(2.19 - 3.5, 8.94 - 8.6), wait: 3.6, give: 2 }, // the tiki hut crew
    ],
    offset: 0,
  },
  {
    color: CREW_COLORS[8],
    pts: [[BAR_PICKUPS.back.x, BAR_PICKUPS.back.z], [13.6, 7.2], [13.22, 5.2], [13.5, 3.4], [13.9, 1.2], [14.4, 1.2], [15.75, 1.2]],
    stops: [
      { at: 0, kind: 'pickup', face: BAR_PICKUPS.back.face, wait: 3.5 },
      { at: 6, kind: 'serve', face: Math.PI / 2, wait: 4.4, give: 3 }, // top of the lanai ramp
    ],
    offset: 9,
  },
];

// Build a looping timeline: walk out stop to stop, then walk home.
function buildTimeline(route) {
  const legs = [];
  const stops = [...route.stops].sort((a, b) => a.at - b.at);
  let t = 0;
  let tray = 0;
  const push = (leg) => {
    leg.t0 = t;
    t += leg.dur;
    legs.push(leg);
  };
  const walk = (from, to) => {
    const pts = from <= to ? route.pts.slice(from, to + 1) : route.pts.slice(to, from + 1).reverse();
    const path = makePath(pts);
    push({ type: 'walk', path, dur: path.length / SPEED, tray });
  };
  let at = 0;
  for (const s of stops) {
    if (s.at !== at) walk(at, s.at);
    at = s.at;
    const before = tray;
    tray = s.kind === 'pickup' ? 3 : Math.max(0, tray - (s.give || 1));
    const [x, z] = route.pts[s.at];
    push({ type: 'stop', kind: s.kind, x, z, y: groundY(x, z), face: s.face, dur: s.wait, before, after: tray });
  }
  if (at !== 0) walk(at, 0);
  return { legs, period: t };
}

const GEO = {
  tray: new THREE.CylinderGeometry(0.2, 0.18, 0.025, 14),
  rim: new THREE.TorusGeometry(0.195, 0.012, 4, 18).rotateX(Math.PI / 2),
  glass: new THREE.CylinderGeometry(0.04, 0.032, 0.12, 8).translate(0, 0.06, 0),
  top: new THREE.CylinderGeometry(0.041, 0.041, 0.02, 8).translate(0, 0.11, 0),
  bow: new THREE.ConeGeometry(0.04, 0.07, 4).rotateZ(Math.PI / 2),
};
const DRINK_MATS = [std('#ff6b3d', { emissive: '#ff6b3d', emissiveIntensity: 0.15 }), std('#b9ec6f', { emissive: '#b9ec6f', emissiveIntensity: 0.12 }), std('#4fd3ff', { emissive: '#4fd3ff', emissiveIntensity: 0.15 })];
const TRAY_MAT = std('#c9a24a', { roughness: 0.35, metalness: 0.5 });
const BOW_MAT = std('#1d2230');

function makeTray() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(GEO.tray, TRAY_MAT));
  g.add(new THREE.Mesh(GEO.rim, TRAY_MAT));
  const drinks = [];
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Group();
    const a = (i / 3) * Math.PI * 2 + 0.4;
    d.position.set(Math.cos(a) * 0.1, 0.012, Math.sin(a) * 0.1);
    d.add(new THREE.Mesh(GEO.glass, LM.glass));
    d.add(new THREE.Mesh(GEO.top, DRINK_MATS[i]));
    g.add(d);
    drinks.push(d);
  }
  g.userData.drinks = drinks;
  return g;
}

// A drink in the free hand while handing it over.
function makeHandDrink() {
  const d = new THREE.Group();
  d.add(new THREE.Mesh(GEO.glass, LM.glass));
  d.add(new THREE.Mesh(GEO.top, DRINK_MATS[0]));
  d.position.set(0, -0.02, 0.04);
  return d;
}

function Bow() {
  return (
    <group position={[0, 0.6, 0.165]}>
      <mesh geometry={GEO.bow} material={BOW_MAT} position={[-0.035, 0, 0]} />
      <mesh geometry={GEO.bow} material={BOW_MAT} position={[0.035, 0, 0]} rotation={[0, 0, Math.PI]} />
    </group>
  );
}

export default function Waiters({ animate, bedtime }) {
  const timelines = useMemo(() => ROUTES.map(buildTimeline), []);
  const parts = [useRef({}), useRef({})];
  const trays = useMemo(() => ROUTES.map(makeTray), []);
  const handDrinks = useMemo(() => ROUTES.map(makeHandDrink), []);
  const clock = useMemo(() => aliveClock(), []);
  const tmp = useMemo(() => ({ pos: { x: 0, y: 0, z: 0, heading: 0 }, inv: new THREE.Quaternion(), up: new THREE.Vector3() }), []);
  usePoseOnce(animate, bedtime);

  useEffect(() => {
    if (bedtime) return undefined;
    parts.forEach((p, i) => {
      p.current.handL?.add(trays[i]);
      p.current.handR?.add(handDrinks[i]);
    });
    return () => {
      trays.forEach((t) => t.parent?.remove(t));
      handDrinks.forEach((d) => d.parent?.remove(d));
    };
  }, [bedtime, trays, handDrinks]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((state, delta) => {
    if (bedtime) return;
    const t = animate ? clock.tick(delta) : 0;
    ROUTES.forEach((route, i) => {
      const p = parts[i].current;
      if (!resetBot(p)) return;
      const tl = timelines[i];
      const tt = animate ? (t + route.offset) % tl.period : route.offset % tl.period;
      let leg = tl.legs[tl.legs.length - 1];
      for (let k = 0; k < tl.legs.length; k++) {
        if (tt < tl.legs[k].t0 + tl.legs[k].dur) {
          leg = tl.legs[k];
          break;
        }
      }
      const u = (tt - leg.t0) / leg.dur;
      const tray = trays[i];
      const hand = handDrinks[i];
      hand.visible = false;
      let count = leg.tray ?? 0;
      // tray hand: up beside the head while walking, lowered a bit at a stop
      let trayX = -2.85;
      if (leg.type === 'walk') {
        const s = leg.path.length * u;
        leg.path.sample(s, tmp.pos);
        p.root.position.set(tmp.pos.x, tmp.pos.y, tmp.pos.z);
        p.root.rotation.y = tmp.pos.heading;
        walkPose(p, s * 7.5, false);
        p.armR.rotation.x = Math.sin(s * 7.5) * 0.4;
      } else {
        p.root.position.set(leg.x, leg.y, leg.z);
        // turn to face the bar or the guest during the first moments
        const turn = Math.min(1, u * leg.dur * 2.5);
        const prev = p.root.rotation.y;
        p.root.rotation.y = lerpAngle(prev, leg.face, animate ? turn : 1);
        p.head.rotation.y = Math.sin(tt * 0.9) * 0.15;
        if (leg.kind === 'pickup') {
          // tray down to the counter, filled, back up
          const k = u < 0.5 ? 0 : 1;
          count = k ? leg.after : leg.before;
          const dip = Math.sin(Math.min(1, u * 1.2) * Math.PI);
          trayX = -2.85 + dip * 1.2;
          p.head.rotation.x = 0.2 * dip;
        } else {
          // hand over drinks one at a time with the free hand
          const give = leg.before - leg.after;
          const slot = Math.min(give - 1, Math.floor(u * give));
          const su = u * give - slot;
          count = leg.before - slot - (su > 0.55 ? 1 : 0);
          const reach = Math.sin(su * Math.PI);
          p.armR.rotation.set(-0.4 - reach * 1.0, 0, -0.12);
          hand.visible = su > 0.12 && su < 0.55;
          p.pose.rotation.x = reach * 0.12; // a polite little bow
          p.head.rotation.x = reach * 0.2;
          trayX = -2.85 + reach * 0.2;
        }
      }
      p.armL.rotation.set(trayX, 0, -0.35);
      // keep the tray level whatever the arm does
      tmp.inv.copy(p.armL.quaternion).invert();
      tray.quaternion.copy(tmp.inv);
      tmp.up.set(0, 0.055, 0).applyQuaternion(tmp.inv);
      tray.position.copy(tmp.up);
      const drinks = tray.userData.drinks;
      for (let k = 0; k < 3; k++) drinks[k].visible = k < count;
    });
  });

  if (bedtime) return null;
  return (
    <group>
      {ROUTES.map((r, i) => (
        <MiniBot key={i} parts={parts[i]} color={r.color} position={[r.pts[0][0], groundY(r.pts[0][0], r.pts[0][1]), r.pts[0][1]]}>
          <Bow />
        </MiniBot>
      ))}
    </group>
  );
}
