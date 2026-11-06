import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { couriers } from '../components/Handoff.jsx';
import { CLAUDE_VISIT, groundY, routeBetween } from '../utils/paths.js';
import { claimTravel, claudeTrip, releaseTravel, TEST } from './director.js';

// Claude commutes by speedboat.
//   Status turns "working": the boat pulls up to Launch's Pier, Claude hops
//   off and walks to the zone the work is about (lastAction.text): the pier
//   for builds, the Content Cabana for content, the Real Estate Lanai for
//   real estate.
//   Status turns idle: Claude walks back to the pier, the boat carries him
//   around to the beach below the guest bungalow, and he strolls home to
//   his mai tai.
// One boat, one trip at a time, and only when the travel slot is free.
// ?boat=test makes Claude come and go every 50 seconds for review.

export function claudeZoneFor(text = '') {
  const t = text.toLowerCase();
  if (/(listing|buyer|seller|escrow|comps?\b|real estate|open house|offer|mls|home value|closing)/.test(t)) return 'lanai';
  if (/(caption|post|video|newsletter|content|social|blog|reel|script|photo|episode|podcast)/.test(t)) return 'cabana';
  return 'dock'; // builds, ships, fixes, anything else
}

// Layout slot for Claude while visiting a zone for work.
export function visitSlot(slot, zone) {
  const v = CLAUDE_VISIT[zone];
  if (!v || !slot) return slot;
  const y = groundY(v.x, v.z) + (v.lift || 0);
  const home = { x: v.x, y, z: v.z, rotY: v.rotY, raised: false };
  return { ...slot, zone, x: v.x, y, z: v.z, rotY: v.rotY, raised: false, lounge: false, doorstep: null, hammock: null, mode: 'station', home };
}

const v3 = (x, z) => new THREE.Vector3(x, 0, z);
const SEA_IN = new THREE.CatmullRomCurve3([v3(-36, -9), v3(-27, -3), v3(-19.5, 2.0), v3(-14.8, 2.95)]);
const SEA_OUT = new THREE.CatmullRomCurve3([v3(-14.8, 2.95), v3(-17.6, 1.5), v3(-25, -3.5), v3(-37, -10)]);
const TO_BEACH = new THREE.CatmullRomCurve3([v3(-14.8, 2.95), v3(-17.9, 2.6), v3(-19.3, 5.4), v3(-17.2, 8.9), v3(-12, 11.3), v3(-6.5, 11.6), v3(-3.3, 10.5)]);
const BEACH_OUT = new THREE.CatmullRomCurve3([v3(-3.3, 10.5), v3(-0.5, 12.6), v3(4, 17.5), v3(10, 26)]);
const BERTH = SEA_IN.getPointAt(1);
const BEACH = TO_BEACH.getPointAt(1);
const HOP_DOCK = { x: -14.8, y: 0.45, z: 3.95 }; // on the pier, next to the berth
const HOP_BEACH = { x: -3.25, z: 9.3 };
const BOAT_SPEED = 4.5;
const WALK = 1.5;
const HOP = 0.9;

const easeOut = (u) => 1 - (1 - u) * (1 - u);
const easeIn = (u) => u * u;
const easeInOut = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);
const curveTime = (c) => Math.max(4, c.getLength() / BOAT_SPEED);

function boatOn(curve, u) {
  const p = curve.getPointAt(Math.min(1, Math.max(0, u)));
  const tan = curve.getTangentAt(Math.min(0.999, Math.max(0.001, u)));
  return { x: p.x, z: p.z, heading: Math.atan2(tan.x, tan.z), moving: u > 0.001 && u < 0.999 };
}
const boatAt = (curve, end) => ({ ...boatOn(curve, end ? 1 : 0), moving: false });

// Claude's seat in the boat (local: a little behind the middle).
function seat(b) {
  const s = Math.sin(b.heading);
  const c = Math.cos(b.heading);
  return { x: b.x - s * 0.25, y: 0.2, z: b.z - c * 0.25, heading: b.heading, ride: true };
}

function hop(a, b, u, heading) {
  const k = easeInOut(u);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k + Math.sin(Math.PI * u) * 0.55, z: a.z + (b.z - a.z) * k, heading, ride: true };
}

function walkOn(route, u) {
  const p = route.pointAt(u);
  const t = route.tangentAt(Math.min(0.999, Math.max(0.001, u)));
  return { x: p.x, y: p.y, z: p.z, heading: Math.atan2(t.x, t.z) };
}

// Straight walk from the beach up to the bungalow.
function lineRoute(a, b) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  return {
    length: len,
    pointAt(u) {
      const x = a.x + (b.x - a.x) * u;
      const z = a.z + (b.z - a.z) * u;
      const y = u > 0.85 ? THREE.MathUtils.lerp(groundY(x, z), b.y, (u - 0.85) / 0.15) : groundY(x, z);
      return { x, y, z };
    },
    tangentAt: () => ({ x: b.x - a.x, z: b.z - a.z }),
  };
}

// Lay out steps back to back: [{ dur, fn(u), onStart? }]
function seq(steps) {
  let t = 0;
  return steps.map((s) => {
    const o = { ...s, t0: t, t1: t + s.dur };
    t += s.dur;
    return o;
  });
}
const endOf = (steps) => (steps.length ? steps[steps.length - 1].t1 : 0);
function sample(steps, t) {
  const s = steps.find((x) => t < x.t1) || steps[steps.length - 1];
  return { step: s, value: s.fn(s.dur > 0 ? Math.min(1, Math.max(0, (t - s.t0) / s.dur)) : 1) };
}

function planArrival(zone) {
  const v = CLAUDE_VISIT[zone];
  const to = { x: v.x, y: groundY(v.x, v.z) + (v.lift || 0), z: v.z, zone };
  const route = routeBetween({ ...HOP_DOCK, zone: 'dock' }, to);
  const tIn = curveTime(SEA_IN);
  const tWalk = Math.max(1.5, route.length / WALK);
  const seatAtBerth = seat(boatAt(SEA_IN, true));
  const boat = seq([
    { dur: tIn, fn: (u) => boatOn(SEA_IN, easeOut(u)) },
    { dur: 1.4, fn: () => boatAt(SEA_IN, true) },
    { dur: curveTime(SEA_OUT), fn: (u) => boatOn(SEA_OUT, easeIn(u)) },
  ]);
  const claude = seq([
    { dur: tIn, fn: (u) => seat(boatOn(SEA_IN, easeOut(u))) },
    { dur: 0.25, fn: () => seatAtBerth },
    { dur: HOP, fn: (u) => hop(seatAtBerth, HOP_DOCK, u, Math.PI / 2) },
    { dur: tWalk, fn: (u) => walkOn(route, u) },
    { dur: 0.6, fn: () => ({ ...to, heading: v.rotY }), onStart: 'arrived' },
  ]);
  return { boat, claude, total: Math.max(endOf(boat), endOf(claude)), zone };
}

function planDeparture(zone, homeSpot) {
  const v = CLAUDE_VISIT[zone] || CLAUDE_VISIT.dock;
  const from = { x: v.x, y: groundY(v.x, v.z) + (v.lift || 0), z: v.z, zone };
  const route = routeBetween(from, { ...HOP_DOCK, zone: 'dock' });
  const tWalk = Math.max(1.5, route.length / WALK);
  const tIn = curveTime(SEA_IN);
  const tBeach = curveTime(TO_BEACH);
  const ready = Math.max(tWalk, tIn) + 0.3;
  const seatAtBerth = seat(boatAt(SEA_IN, true));
  const seatAtBeach = seat(boatAt(TO_BEACH, true));
  const landing = { x: HOP_BEACH.x, y: groundY(HOP_BEACH.x, HOP_BEACH.z), z: HOP_BEACH.z };
  const stroll = lineRoute(landing, homeSpot);
  const boat = seq([
    { dur: tIn, fn: (u) => boatOn(SEA_IN, easeOut(u)) },
    { dur: ready + HOP - tIn, fn: () => boatAt(SEA_IN, true) },
    { dur: tBeach, fn: (u) => boatOn(TO_BEACH, easeInOut(u)) },
    { dur: HOP + 0.4, fn: () => boatAt(TO_BEACH, true) },
    { dur: curveTime(BEACH_OUT), fn: (u) => boatOn(BEACH_OUT, easeIn(u)) },
  ]);
  const claude = seq([
    { dur: tWalk, fn: (u) => walkOn(route, u), onStart: 'left' },
    { dur: ready - tWalk, fn: () => ({ ...HOP_DOCK, heading: -Math.PI / 2 }) },
    { dur: HOP, fn: (u) => hop(HOP_DOCK, seatAtBerth, u, Math.PI) },
    { dur: tBeach, fn: (u) => seat(boatOn(TO_BEACH, easeInOut(u))) },
    { dur: HOP, fn: (u) => hop(seatAtBeach, landing, u, Math.PI) },
    { dur: Math.max(1.5, stroll.length / WALK), fn: (u) => walkOn(stroll, u) },
    { dur: 0.4, fn: () => ({ ...homeSpot, heading: homeSpot.rotY ?? 0 }) },
  ]);
  return { boat, claude, total: Math.max(endOf(boat), endOf(claude)), zone: null };
}

// --- The speedboat ------------------------------------------------------------

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, ...extra });
const MAT = {
  hull: std('#fdf8ee'),
  stripe: std('#D97757'),
  deck: std('#c08a57'),
  motor: std('#2b2a33'),
  glass: new THREE.MeshStandardMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.55, flatShading: true }),
  wake: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
};
const WAKE_GEO = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.9, -1.1, 0, -3.6, -0.75, 0, -3.6, 0, 0, -1.0, 1.1, 0, -3.6, 0.75, 0, -3.6], 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 3, 5, 0, 0, 5, 4]);
  return g;
})();

function Speedboat({ boatRef, wakeRef }) {
  return (
    <group ref={boatRef} visible={false} scale={1.3}>
      <mesh material={MAT.hull} position={[0, 0.12, 0]}>
        <boxGeometry args={[0.85, 0.34, 1.7]} />
      </mesh>
      <mesh material={MAT.hull} position={[0, 0.12, 1.12]} rotation={[Math.PI / 2, Math.PI / 4, 0]} scale={[0.6, 1, 0.24]}>
        <coneGeometry args={[0.72, 0.6, 4]} />
      </mesh>
      <mesh material={MAT.stripe} position={[0, 0.2, 0.05]}>
        <boxGeometry args={[0.87, 0.08, 1.72]} />
      </mesh>
      <mesh material={MAT.deck} position={[0, 0.3, -0.2]}>
        <boxGeometry args={[0.7, 0.03, 1.1]} />
      </mesh>
      <mesh material={MAT.glass} position={[0, 0.48, 0.42]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[0.66, 0.3, 0.03]} />
      </mesh>
      <mesh material={MAT.motor} position={[0, 0.28, -0.95]}>
        <boxGeometry args={[0.22, 0.42, 0.2]} />
      </mesh>
      <mesh ref={wakeRef} geometry={WAKE_GEO} material={MAT.wake} position={[0, 0.03, 0]} />
    </group>
  );
}

const lerpAngle = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

const TEST_ORDER = [null, 'cabana', null, 'lanai', null, 'dock'];
const TEST_PERIOD = 50;

export default function ClaudeShuttle({ desired, visit, homeSpot, onVisit, animate = true }) {
  const boatRef = useRef();
  const wakeRef = useRef();
  const trip = useRef(null);
  const inited = useRef(false);
  const heading = useRef(0);
  const alive = useRef(0);
  const latest = useRef({ desired, visit, homeSpot, onVisit });
  latest.current = { desired, visit, homeSpot, onVisit };

  useEffect(
    () => () => {
      claudeTrip.active = false;
      couriers.delete('claude');
      releaseTravel('claude-boat');
    },
    []
  );

  useFrame((state, delta) => {
    const { visit: actual, homeSpot: home, onVisit: setVisit } = latest.current;
    let want = latest.current.desired;
    alive.current += Math.min(delta, 0.1); // seconds of frames drawn: trips pause with the tab
    const now = alive.current;
    if (TEST.boat && now > 6) want = TEST_ORDER[Math.floor((now - 6) / TEST_PERIOD) % TEST_ORDER.length];

    if (!inited.current) {
      inited.current = true;
      setVisit(want); // take over from the starting spot
      return;
    }

    // Start a trip when Claude's status changed and the travel slot is free.
    if (!trip.current && want !== actual) {
      if (!animate || !home) {
        setVisit(want);
        return;
      }
      if (want && actual) {
        setVisit(want); // already on the island: just walk over
        return;
      }
      const plan = want ? planArrival(want) : planDeparture(actual, home);
      if (!claimTravel('claude-boat', plan.total + 1)) return;
      trip.current = { ...plan, start: now, fired: new Set() };
      claudeTrip.active = true;
    }

    const tr = trip.current;
    const boat = boatRef.current;
    if (!tr) {
      if (boat) boat.visible = false;
      return;
    }
    const t = now - tr.start;
    if (t < tr.total) claimTravel('claude-boat', 2); // keep the travel slot while the trip runs
    if (t >= tr.total) {
      claudeTrip.active = false;
      couriers.delete('claude');
      releaseTravel('claude-boat');
      trip.current = null;
      if (boat) boat.visible = false;
      return;
    }

    const c = sample(tr.claude, t);
    if (c.step.onStart && !tr.fired.has(c.step.onStart)) {
      tr.fired.add(c.step.onStart);
      setVisit(c.step.onStart === 'arrived' ? tr.zone : null);
    }
    couriers.set('claude', { x: c.value.x, y: c.value.y, z: c.value.z, heading: c.value.heading, ride: !!c.value.ride });

    if (boat) {
      const b = sample(tr.boat, Math.min(t, endOf(tr.boat) - 0.001)).value;
      const dt = Math.min(delta, 0.1);
      heading.current = boat.visible ? lerpAngle(heading.current, b.heading, Math.min(1, dt * 3)) : b.heading;
      boat.visible = t < endOf(tr.boat);
      boat.position.set(b.x, 0.06 + Math.sin(now * 2.1) * 0.035, b.z);
      boat.rotation.set(b.moving ? -0.06 : Math.sin(now * 1.7) * 0.03, heading.current, Math.sin(now * 1.3) * 0.03);
      if (wakeRef.current) {
        wakeRef.current.visible = b.moving;
        wakeRef.current.material.opacity = 0.35 + Math.sin(now * 8) * 0.08;
      }
    }
  });

  return <Speedboat boatRef={boatRef} wakeRef={wakeRef} />;
}
