import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { CREW_COLORS } from '../MiniBot.jsx';
import { BOT_SCALE } from '../../components/Bot.jsx';
import { couriers } from '../../components/Handoff.jsx';
import { antics, botFx, fxNow, labelState } from '../../components/labels.js';
import { DOCK, ZONES, groundY, hubPoint, teamLabel } from '../../utils/paths.js';
import { conga } from '../life/conga.js';
import { testOn } from '../../wild/director.js';
import { arrivalsBus, world } from '../state.js';
import { hullGeometry, ridePose } from '../boats/kit.js';
import { fxBurst } from '../antics/Fx.jsx';
import { LM, SIT_DROP, glowMat, lerpAngle, makePath, resetBot, sitPose, smooth, std, walkPose } from '../life/common.jsx';
import { dedupe, tripPoints } from './route.js';
import { FROM_TAXI, GATE_STOP, GREETER_HOME, GREET_AT, MEET, PLANE_DOOR, SIGHTS, TAXI_X, TEAM_STOPS, TOWER_STOP } from './stops.js';

// Arrivals at Bot Island.
//
// The greeter: a crew bot on the welcome lawn just inside the arch, with a
// stack of leis on one arm. Every new arrival stops at the gate, turns to face
// the camera, and gets a lei placed over their head (about 3 seconds). Only
// new arrivals get one.
//
// The tourist: when the page opens, a small anonymous tourist (sun hat,
// camera, no name) rides in on the water taxi, gets a lei, and wanders the
// sights: the Visitor Center, the dance floor, the end of
// the pier. It's the person looking at the page. If the tab is hidden for a
// while (closed, or they went somewhere else) the tourist has gone home, and
// coming back brings a fresh one on the next taxi. Tap it: "That's you."
//
// Recruits: now and then a new recruit steps off the island-hopper (or the
// water taxi), walks to the gate for a lei, and a teammate who's chillin'
// meets them at their new team's spot and shows them around. Then they join
// up (painted in team colors, a cheer, a toast) and head in to get started.
//
// ?test=arrivals: recruits every ~40 s on the taxi, and every plane landing.

const TEST = testOn('arrivals');
const S = BOT_SCALE;
const TOURIST_S = S * 0.82;
const RECRUIT_S = S * 0.92;
const LEFT_FOR = 60; // seconds hidden before the tourist counts as gone home
const FRESH = '#e2e6ec'; // a recruit before the team paint
const TMP = { x: 0, y: 0, z: 0, heading: 0 };
const V = new THREE.Vector3();

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const headingTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);

// ---------------------------------------------------------------------------
// Props: leis, the tourist's hat and camera, a recruit's backpack
// ---------------------------------------------------------------------------

const LEI_MATS = ['#ff5d8f', '#ffd23f', '#ff8a3d', '#f25cff', '#ffffff', '#ff4d4d'].map((c) => std(c));
const FLOWER_GEO = new THREE.IcosahedronGeometry(0.048, 0);
const LEAF_MAT = std('#3fae5a');

// A ring of flowers around the neck, drooping a little at the front (+z).
const Lei = forwardRef(function Lei({ r = 0.21, n = 13, ...rest }, ref) {
  return (
    <group ref={ref} {...rest}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return <mesh key={i} geometry={FLOWER_GEO} material={i % 4 === 3 ? LEAF_MAT : LEI_MATS[i % LEI_MATS.length]} position={[Math.sin(a) * r, -0.08 * (0.5 + 0.5 * Math.cos(a)), Math.cos(a) * r]} />;
      })}
    </group>
  );
});

const M = {
  straw: std('#e8c97a'),
  band: std('#e5533d'),
  camera: std('#2b2a33'),
  lens: std('#9fb8d0', { roughness: 0.3, metalness: 0.4 }),
  pack: std('#3d7be5'),
  packFlap: std('#2a5bb3'),
  hull: std('#fdf8ee'),
  stripe: std('#2ec4c8'),
  deck: std('#c08a57'),
  canopy: std('#ffd23f', { side: THREE.DoubleSide }),
  pole: std('#dfe6ea', { roughness: 0.3, metalness: 0.6 }),
  cap: std('#19469D'),
};
const FLASH_MAT = glowMat('#ffffff', 0);

// Hang an object on a MiniBot part once it has mounted.
function useAttach(parts, key, make) {
  useEffect(() => {
    const host = parts.current && parts.current[key];
    if (!host) return undefined;
    const obj = make();
    host.add(obj);
    return () => host.remove(obj);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function sunHat() {
  const g = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 12), M.straw);
  brim.position.y = 0.2;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.11, 10), M.straw);
  crown.position.y = 0.26;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.035, 10), M.band);
  band.position.y = 0.23;
  g.add(brim, crown, band);
  g.rotation.x = -0.12;
  return g;
}

function captainCap() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.09, 10), M.hull);
  top.position.y = 0.23;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.182, 0.182, 0.04, 10), M.cap);
  band.position.y = 0.19;
  const peak = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.1), M.cap);
  peak.position.set(0, 0.18, 0.18);
  g.add(top, band, peak);
  return g;
}

// The tourist: a sun hat, a camera on a strap (raised to the face for a
// photo, with a flash), and the lei once they've been greeted.
function Tourist({ parts, camRef, flashRef, leiRef, onTap }) {
  useAttach(parts, 'head', sunHat);
  return (
    <group
      onClick={(e) => {
        if (e.delta > 8) return;
        e.stopPropagation();
        onTap();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      <MiniBot color="#ff9f6b" parts={parts} position={[0, -50, 0]} scale={TOURIST_S}>
        <group ref={camRef} position={[0, 0.42, 0.21]}>
          <mesh material={M.camera}>
            <boxGeometry args={[0.12, 0.08, 0.06]} />
          </mesh>
          <mesh material={M.lens} position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.028, 0.03, 8]} />
          </mesh>
          <mesh ref={flashRef} material={FLASH_MAT} position={[0.04, 0.03, 0.06]} visible={false}>
            <sphereGeometry args={[0.09, 8, 6]} />
          </mesh>
        </group>
        <Lei ref={leiRef} position={[0, 0.6, 0]} visible={false} />
      </MiniBot>
    </group>
  );
}

function Recruit({ parts, color, leiRef, onTap }) {
  return (
    <group
      onClick={(e) => {
        if (e.delta > 8) return;
        e.stopPropagation();
        onTap();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      <MiniBot color={color} parts={parts} position={[0, -50, 0]} scale={RECRUIT_S}>
        <group position={[0, 0.42, -0.21]}>
          <mesh material={M.pack}>
            <boxGeometry args={[0.24, 0.26, 0.12]} />
          </mesh>
          <mesh material={M.packFlap} position={[0, 0.1, 0.01]}>
            <boxGeometry args={[0.25, 0.08, 0.13]} />
          </mesh>
        </group>
        <Lei ref={leiRef} position={[0, 0.6, 0]} visible={false} />
      </MiniBot>
    </group>
  );
}

function Greeter({ parts }) {
  // a few spare leis hanging off the left forearm
  useAttach(parts, 'handL', () => {
    const g = new THREE.Group();
    for (let k = 0; k < 2; k++) {
      const n = 11;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const m = new THREE.Mesh(FLOWER_GEO, i % 4 === 3 ? LEAF_MAT : LEI_MATS[(i + k * 2) % LEI_MATS.length]);
        m.position.set(0.02 + k * 0.03, -0.14 + Math.cos(a) * 0.13, Math.sin(a) * 0.1);
        m.scale.setScalar(0.85);
        g.add(m);
      }
    }
    return g;
  });
  return (
    <MiniBot color={CREW_COLORS[5]} parts={parts} position={[GREETER_HOME.x, -50, GREETER_HOME.z]} scale={S} />
  );
}

// ---------------------------------------------------------------------------
// The water taxi: a little open launch with a striped canopy and a captain
// ---------------------------------------------------------------------------

const T_LEN = 1.8;
const T_BEAM = 0.82;
const HULL = hullGeometry(T_LEN, T_BEAM, 0.34, { bow: 0.34, stern: 0.88, taper: 0.6, sheer: 0.12 });
const BAND = hullGeometry(T_LEN * 1.01, T_BEAM * 1.02, 0.07, { bow: 0.34, stern: 0.88, taper: 1, sheer: 0.12 });
const T_LIFT = 0.16;
const SEAT = new THREE.Vector3(0, 0.12, -0.05);
const BERTH = { x: TAXI_X, z: DOCK.z0 - 0.1 - T_LEN / 2 };
const T_IN = 13;
const T_OUT = 12;
// in from the north-west, ending nose-in to the pier (heading south, +z)
const IN_PTS = [new THREE.Vector3(TAXI_X - 2, 0, -16), new THREE.Vector3(TAXI_X - 0.4, 0, -6), new THREE.Vector3(BERTH.x, 0, BERTH.z)];
const OUT_PTS = [new THREE.Vector3(BERTH.x, 0, BERTH.z - 1.6), new THREE.Vector3(TAXI_X - 0.6, 0, -6), new THREE.Vector3(TAXI_X - 7, 0, -17)];
const qbez = (pts, u, out) => {
  const a = 1 - u;
  out.x = a * a * pts[0].x + 2 * a * u * pts[1].x + u * u * pts[2].x;
  out.z = a * a * pts[0].z + 2 * a * u * pts[1].z + u * u * pts[2].z;
  return out;
};

function Taxi({ rootRef, captain }) {
  useAttach(captain, 'head', captainCap);
  return (
    <group ref={rootRef} visible={false}>
      <mesh geometry={HULL} material={M.hull} />
      <mesh geometry={BAND} material={M.stripe} position={[0, -0.04, 0]} />
      <mesh material={M.deck} position={[0, 0.005, -0.05]}>
        <boxGeometry args={[T_BEAM * 0.8, 0.02, T_LEN * 0.7]} />
      </mesh>
      {/* passenger bench */}
      <mesh material={LM.plank} position={[0, 0.1, -0.1]}>
        <boxGeometry args={[T_BEAM * 0.78, 0.04, 0.22]} />
      </mesh>
      {/* striped canopy on four poles */}
      {[[-0.32, -0.55], [0.32, -0.55], [-0.32, 0.25], [0.32, 0.25]].map(([x, z]) => (
        <mesh key={`${x}${z}`} material={M.pole} position={[x, 0.5, z]}>
          <cylinderGeometry args={[0.014, 0.014, 1.0, 5]} />
        </mesh>
      ))}
      <mesh material={M.canopy} position={[0, 1.01, -0.15]}>
        <boxGeometry args={[0.76, 0.03, 0.95]} />
      </mesh>
      <mesh material={M.stripe} position={[0, 0.975, -0.15]}>
        <boxGeometry args={[0.78, 0.04, 0.2]} />
      </mesh>
      <MiniBot color={CREW_COLORS[6]} parts={captain} position={[0, 0.02, -0.68]} scale={S * 0.8} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Walkers: a tiny step runner (walk a path, wait, wait until, run a callback)
// ---------------------------------------------------------------------------

function newWalker(kind) {
  return { kind, on: false, x: 0, y: 0, z: 0, heading: 0, steps: [], i: 0, t: 0, s: 0, pose: 'stand', phase: 0, lei: false, hop: -9, leiAsked: false, leiDone: false, fade: 1, flash: 0, data: {} };
}

const walk = (pts, speed = 0.9) => ({ t: 'walk', path: makePath(dedupe(pts)), speed });
const wait = (dur, pose = 'stand', look = null) => ({ t: 'wait', dur, pose, look });
const until = (fn, pose = 'stand', look = null) => ({ t: 'until', fn, pose, look });
const run = (fn) => ({ t: 'run', fn });

function advance(w) {
  w.i++;
  w.t = 0;
  w.s = 0;
}

function runWalker(w, dt, now) {
  for (let guard = 0; guard < 6; guard++) {
    const st = w.steps[w.i];
    if (!st || st.t !== 'run') break;
    advance(w);
    st.fn(w, now);
  }
  const st = w.steps[w.i];
  if (!st) {
    w.pose = 'stand';
    return;
  }
  w.t += dt;
  if (st.t === 'walk') {
    w.s += st.speed * dt;
    st.path.sample(w.s, TMP);
    w.x = TMP.x;
    w.z = TMP.z;
    w.y = TMP.y;
    w.heading = lerpAngle(w.heading, TMP.heading, Math.min(1, dt * 8));
    w.pose = 'walk';
    w.phase += dt * st.speed * 10;
    if (w.s >= st.path.length) advance(w);
    return;
  }
  if (st.t === 'hop') {
    if (!st.from) st.from = { x: w.x, y: w.y, z: w.z };
    const k = Math.min(1, w.t / st.dur);
    const e = smooth(k);
    w.x = st.from.x + (st.to[0] - st.from.x) * e;
    w.z = st.from.z + (st.to[1] - st.from.z) * e;
    const gy = groundY(st.to[0], st.to[1]);
    w.y = st.from.y + (gy - st.from.y) * e + Math.sin(k * Math.PI) * 0.35;
    w.pose = 'hop';
    if (k >= 1) advance(w);
    return;
  }
  w.pose = st.pose || 'stand';
  const look = typeof st.look === 'function' ? st.look(w) : st.look;
  if (look != null) {
    const want = typeof look === 'number' ? look : headingTo(w.x, w.z, look[0], look[1]);
    w.heading = lerpAngle(w.heading, want, Math.min(1, dt * 5));
  }
  if (st.t === 'wait' ? w.t >= st.dur : st.fn(w, now)) advance(w);
}

// Pose a walker's MiniBot for this frame.
function poseWalker(w, p, t, scale) {
  if (!resetBot(p)) return;
  p.root.position.set(w.x, w.y, w.z);
  p.root.rotation.y = w.heading;
  const hopK = t - w.hop;
  const hop = hopK >= 0 && hopK < 0.9 ? Math.abs(Math.sin((hopK / 0.9) * Math.PI * 2)) * 0.12 : 0;
  switch (w.pose) {
    case 'walk':
      walkPose(p, w.phase);
      break;
    case 'sit':
      p.root.position.y -= SIT_DROP * scale;
      sitPose(p, t * 1.2);
      p.armL.rotation.x = -0.4;
      p.armR.rotation.x = -0.4;
      p.head.rotation.y = Math.sin(t * 0.6) * 0.35;
      break;
    case 'hop':
      p.armL.rotation.z = -1.2;
      p.armR.rotation.z = 1.2;
      break;
    case 'photo': {
      // camera up for a shot every few seconds, otherwise looking around
      const k = w.t % 3.4;
      const up = k > 0.6 && k < 2.6 ? Math.min(1, (k - 0.6) * 5, (2.6 - k) * 5) : 0;
      p.armL.rotation.x = -1.45 * up;
      p.armR.rotation.x = -1.45 * up;
      p.armL.rotation.z = 0.42 * up;
      p.armR.rotation.z = -0.42 * up;
      p.head.rotation.x = -0.05 * up;
      p.head.rotation.y = (1 - up) * Math.sin(t * 0.8) * 0.4;
      w.cam = up;
      w.flash = k > 1.6 && k < 1.75 ? 1 : 0;
      break;
    }
    case 'read':
      p.head.rotation.x = -0.12;
      p.head.rotation.z = Math.sin(t * 0.9) * 0.08;
      p.armR.rotation.x = -0.9;
      p.armR.rotation.z = -0.45;
      p.head.rotation.y = Math.sin(t * 0.5) * 0.2;
      break;
    case 'dance': {
      const b = t * 1.75;
      p.pose.position.y = Math.abs(Math.sin(b * Math.PI)) * 0.05;
      p.pose.rotation.z = Math.sin(b * Math.PI * 0.5) * 0.1;
      p.armL.rotation.z = -0.5 - Math.max(0, Math.sin(b * Math.PI)) * 0.6;
      p.armR.rotation.z = 0.5 + Math.max(0, -Math.sin(b * Math.PI)) * 0.6;
      break;
    }
    case 'lei':
      // standing tall for the lei, head bowed a touch
      p.head.rotation.x = 0.18;
      p.armL.rotation.z = -0.15;
      p.armR.rotation.z = 0.15;
      break;
    case 'wave':
      p.armR.rotation.z = 2.5 + Math.sin(t * 11) * 0.3;
      p.head.rotation.z = Math.sin(t * 5) * 0.08;
      break;
    case 'cheer':
      p.armL.rotation.z = -2.6;
      p.armR.rotation.z = 2.6;
      p.pose.position.y = Math.abs(Math.sin(t * 7)) * 0.08;
      break;
    case 'look':
      p.armR.rotation.x = -2.2;
      p.armR.rotation.z = -0.55;
      p.head.rotation.x = -0.15;
      p.head.rotation.y = Math.sin(t * 0.7) * 0.25;
      break;
    default:
      p.head.rotation.y = Math.sin(t * 0.5 + w.x) * 0.3;
      p.pose.rotation.z = Math.sin(t * 1.1) * 0.02;
  }
  p.pose.position.y += hop;
  p.root.scale.setScalar(scale * w.fade);
}

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------

export default function Arrivals({ ctx }) {
  const tourist = useRef({});
  const recruit = useRef({});
  const greeter = useRef({});
  const captain = useRef({});
  const taxiRoot = useRef();
  const flying = useRef();
  const tCam = useRef();
  const tFlash = useRef();
  const tLei = useRef();
  const rLei = useRef();
  const [touristOn, setTouristOn] = useState(false);
  const [recruitOn, setRecruitOn] = useState(false);
  const [recruitColor, setRecruitColor] = useState(FRESH);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const st = useMemo(
    () => ({
      // seconds of frames actually drawn (hidden tabs don't advance it)
      clock: { t: 0, tick(d) { this.t += d; return this.t; } },
      tourist: newWalker('tourist'),
      recruit: newWalker('recruit'),
      greeter: { x: GREETER_HOME.x, z: GREETER_HOME.z, y: groundY(GREETER_HOME.x, GREETER_HOME.z), heading: GREETER_HOME.heading, mode: 'idle', t: 0, path: null, s: 0, guest: null, phase: 0 },
      queue: [],
      taxi: { phase: 'away', t: 0, passenger: null, x: IN_PTS[0].x, z: IN_PTS[0].z, heading: 0, speed: 0, hopped: false },
      plane: arrivalsBus.planeLanded,
      nextBoatRecruit: TEST ? 40 : rand(300, 480),
      hiddenAt: 0,
      greetedToast: false,
    }),
    []
  );

  // The tourist is the viewer: gone home after a long absence, a new one
  // arrives on return.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        st.hiddenAt = performance.now();
      } else if (st.hiddenAt && performance.now() - st.hiddenAt > LEFT_FOR * 1000) {
        st.tourist.on = false;
        st.tourist.data.gone = true;
        st.queue = st.queue.filter((w) => w !== st.tourist);
        setTouristOn(false);
        st.hiddenAt = 0;
      } else st.hiddenAt = 0;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [st]);
  useEffect(
    () => () => {
      world.boats.delete('taxi');
      if (st.recruit.data.guide) antics.delete(st.recruit.data.guide);
    },
    [st]
  );

  // --- taxi -----------------------------------------------------------------
  const taxiFree = () => st.taxi.phase === 'away' && !st.taxi.passenger;
  const bookTaxi = (w, head = 0) => {
    const tx = st.taxi;
    tx.phase = 'in';
    tx.t = head; // seconds already travelled (the first tourist is close in)
    tx.passenger = w;
    tx.hopped = false;
  };

  // Arrivals by taxi: ride in, hop onto the pier, walk to the gate.
  const boatSteps = (w) => [
    until(() => st.taxi.phase === 'docked', 'sit'),
    run(() => (st.taxi.hopped = true)),
    { t: 'hop', to: FROM_TAXI[0], dur: 0.6 },
    walk(FROM_TAXI, w.kind === 'tourist' ? 0.95 : 0.9),
  ];
  const leiSteps = () => [
    until((w) => {
      if (!w.leiAsked) {
        w.leiAsked = true;
        st.queue.push(w);
      }
      return w.leiDone;
    }, 'lei', 0),
    wait(0.9, 'cheer', 0),
  ];

  // --- tourist --------------------------------------------------------------
  const sightLoop = (w, from) => {
    const day = !ctxRef.current.bedtime && (ctxRef.current.sky?.stars ?? 0) < 0.5;
    const list = SIGHTS.filter((s) => !s.day || day);
    const at = list.indexOf(from);
    const next = list[(at + 1) % list.length] || list[0];
    w.steps = [
      walk(tripPoints(from, next), 0.95),
      wait(rand(6, 9), next.pose, next.look),
      run((ww) => sightLoop(ww, next)),
    ];
    w.i = 0;
  };
  const spawnTourist = () => {
    const w = st.tourist;
    Object.assign(w, newWalker('tourist'));
    w.on = true;
    w.steps = [...boatSteps(w), ...leiSteps(), run((ww) => sightLoop(ww, GATE_STOP))];
    bookTaxi(w, st.clock.t < 2 ? 4.5 : 0);
    setTouristOn(true);
  };

  // --- recruits -------------------------------------------------------------
  const teamsOnIsland = () => {
    const have = new Set((ctxRef.current.bots || []).map((b) => b.team));
    return Object.keys(TEAM_STOPS).filter((t) => have.has(t));
  };
  const findGuide = (team, stop) => {
    const c = ctxRef.current;
    const byId = new Map((c.bots || []).map((b) => [b.id, b]));
    let best = null;
    let bestD = Infinity;
    for (const l of Object.values(c.layout || {})) {
      const b = byId.get(l.id);
      if (!b || b.team !== team || l.mode !== 'chill' || l.home.raised) continue;
      if (antics.has(l.id) || couriers.has(l.id) || !labelState.positions.has(l.id)) continue;
      const d = Math.hypot(l.home.x - stop.at[0], l.home.z - stop.at[1]);
      if (d < bestD && d < 9) {
        best = b;
        bestD = d;
      }
    }
    return best;
  };
  const startTour = (w) => {
    const teams = teamsOnIsland();
    if (!teams.length) {
      w.steps = [walk(tripPoints(GATE_STOP, TOWER_STOP), 0.9), ...joinSteps(w, null, null)];
      w.i = 0;
      return;
    }
    const team = pick(teams);
    const stop = TEAM_STOPS[team];
    const zone = ZONES[stop.zone];
    w.data.team = team;
    const guide = findGuide(team, stop);
    const firstOfTeam = (ctxRef.current.bots || []).find((b) => b.team === team);
    w.data.color = guide?.color || firstOfTeam?.color || CREW_COLORS[0];
    // the guide waits beside the team's spot, facing the way the recruit comes in
    const dx = zone.x - stop.at[0];
    const dz = zone.z - stop.at[1];
    const len = Math.hypot(dx, dz) || 1;
    const gx = stop.at[0] - (dz / len) * 0.75;
    const gz = stop.at[1] + (dx / len) * 0.75;
    const hub = hubPoint(stop.zone);
    if (guide && !conga.on) {
      const now = fxNow();
      antics.set(guide.id, { kind: 'guide', start: now, end: now + 300, goal: { x: gx, y: groundY(gx, gz), z: gz }, face: { x: hub.x, z: hub.z } });
      w.data.guide = guide.id;
    }
    w.steps = [
      walk(tripPoints(GATE_STOP, stop), 0.9),
      run(() => {
        if (w.data.guide) botFx.wave.set(w.data.guide, fxNow());
      }),
      wait(1.4, 'wave', [gx, gz]),
      run(() => {
        const an = w.data.guide && antics.get(w.data.guide);
        if (an) {
          an.face = { x: zone.x, z: zone.z };
          an.point = true;
        }
      }),
      wait(3.2, 'look', [zone.x, zone.z]),
      ...joinSteps(w, guide, zone),
    ];
    w.i = 0;
  };
  const joinSteps = (w, guide, zone) => [
    run(() => {
      if (w.data.guide) {
        antics.delete(w.data.guide);
        botFx.cheer.set(w.data.guide, fxNow());
        w.data.guide = null;
      }
      setRecruitColor(w.data.color || CREW_COLORS[0]);
      fxBurst('sparks', w.x, w.y + 0.6, w.z);
      w.hop = st.clock.t;
      const team = w.data.team ? teamLabel(w.data.team) : 'the crew';
      w.data.joined = true;
      ctxRef.current.onToast?.(`New recruit! Welcome to ${w.data.team ? `the ${team}` : team}. The Bot Army keeps growing.`);
    }),
    wait(1.6, 'cheer'),
    wait(rand(24, 36), 'stand', zone ? [zone.x, zone.z] : null),
    // in to get started: shrink away with a sparkle
    run(() => fxBurst('sparks', w.x, w.y + 0.5, w.z)),
    { t: 'wait', dur: 0.8, pose: 'stand', fadeOut: true },
    run(() => {
      w.on = false;
      setRecruitOn(false);
      setRecruitColor(FRESH);
    }),
  ];
  const spawnRecruit = (how) => {
    const w = st.recruit;
    Object.assign(w, newWalker('recruit'));
    w.on = true;
    if (how === 'plane') {
      w.x = PLANE_DOOR.x;
      w.z = PLANE_DOOR.z;
      w.y = groundY(w.x, w.z);
      w.heading = Math.PI; // stepping out of the door, north
      w.hop = st.clock.t;
      w.steps = [wait(1.0, 'look', null), walk(tripPoints({ zone: 'lookout', at: [PLANE_DOOR.x, PLANE_DOOR.z] }, GATE_STOP), 1.0), ...leiSteps(), run(startTour)];
    } else {
      w.steps = [...boatSteps(w), ...leiSteps(), run(startTour)];
      bookTaxi(w);
    }
    setRecruitColor(FRESH);
    setRecruitOn(true);
  };

  // --- per frame ------------------------------------------------------------
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = st.clock.tick(dt);
    const c = ctxRef.current;
    const day = !c.bedtime && (c.sky?.stars ?? 0) < 0.5;

    // who's coming
    if (!st.tourist.on && taxiFree() && !document.hidden) spawnTourist();
    if (arrivalsBus.planeLanded !== st.plane) {
      st.plane = arrivalsBus.planeLanded;
      if (!st.recruit.on && day && (TEST || Math.random() < 0.6)) spawnRecruit('plane');
    }
    if (t >= st.nextBoatRecruit) {
      if (!st.recruit.on && day && taxiFree() && st.tourist.leiDone) {
        spawnRecruit('boat');
        st.nextBoatRecruit = t + (TEST ? 40 : rand(360, 600));
      } else st.nextBoatRecruit = t + 20;
    }

    // taxi
    const tx = st.taxi;
    const root = taxiRoot.current;
    if (root) {
      if (tx.phase === 'away') {
        root.visible = false;
        world.boats.delete('taxi');
      } else {
        root.visible = true;
        tx.t += dt;
        let speed = 0;
        if (tx.phase === 'in') {
          const u = Math.min(1, tx.t / T_IN);
          const e = 1 - (1 - u) * (1 - u);
          qbez(IN_PTS, e, TMP);
          qbez(IN_PTS, Math.min(1, e + 0.01), V);
          if (u < 0.995) tx.heading = headingTo(TMP.x, TMP.z, V.x, V.z);
          speed = (2 * (1 - u) * 19) / T_IN;
          tx.x = TMP.x;
          tx.z = TMP.z;
          if (u >= 1) {
            tx.phase = 'docked';
            tx.t = 0;
          }
        } else if (tx.phase === 'docked') {
          // wait for the passenger to hop off, then a moment more
          if (!tx.hopped && tx.passenger?.on) tx.t = 0;
          if (tx.t > 3.2) {
            tx.phase = 'back';
            tx.t = 0;
            tx.passenger = null;
          }
        } else if (tx.phase === 'back') {
          const u = Math.min(1, tx.t / 2.4);
          tx.z = BERTH.z - 1.6 * smooth(u);
          tx.x = BERTH.x;
          speed = 0.6;
          if (u >= 1) {
            tx.phase = 'out';
            tx.t = 0;
          }
        } else if (tx.phase === 'out') {
          const u = Math.min(1, tx.t / T_OUT);
          const e = u * u;
          qbez(OUT_PTS, e, TMP);
          qbez(OUT_PTS, Math.min(1, e + 0.01), V);
          const want = headingTo(TMP.x, TMP.z, V.x, V.z);
          tx.heading = lerpAngle(tx.heading, want, Math.min(1, dt * 2.5));
          tx.x = TMP.x;
          tx.z = TMP.z;
          speed = (2 * u * 20) / T_OUT;
          if (u >= 1) tx.phase = 'away';
        }
        tx.speed = speed;
        ridePose(root, tx.x, tx.z, tx.heading, state.clock.elapsedTime, T_LEN, T_BEAM, 1.4, T_LIFT);
        if (speed > 0.05) world.boats.set('taxi', { x: tx.x, z: tx.z, heading: tx.heading, speed, size: T_LEN, prio: 2 });
        else world.boats.delete('taxi');
        root.updateMatrixWorld();
        const cp = captain.current;
        if (resetBot(cp)) {
          cp.armR.rotation.z = tx.phase === 'docked' ? 2.4 + Math.sin(t * 9) * 0.3 : 0.2;
          cp.armL.rotation.x = -0.9;
          cp.head.rotation.y = Math.sin(t * 0.5) * 0.3;
        }
      }
    }

    // walkers
    for (const w of [st.tourist, st.recruit]) {
      if (!w.on) continue;
      const step = w.steps[w.i];
      if (step && step.t === 'until' && step.pose === 'sit' && root) {
        // riding the taxi
        V.copy(SEAT);
        root.localToWorld(V);
        w.x = V.x;
        w.y = V.y;
        w.z = V.z;
        w.heading = tx.heading;
      }
      runWalker(w, dt, t);
      const cur = w.steps[w.i];
      if (cur && cur.fadeOut) w.fade = Math.max(0.01, 1 - w.t / cur.dur);
    }

    // greeter
    const g = st.greeter;
    g.t += dt;
    if (g.mode === 'idle') {
      g.heading = lerpAngle(g.heading, GREETER_HOME.heading, Math.min(1, dt * 3));
      const guest = st.queue[0];
      if (guest && (!guest.on || guest.data.gone)) st.queue.shift();
      else if (guest && Math.hypot(guest.x - MEET.x, guest.z - MEET.z) < 0.6) {
        g.guest = st.queue.shift();
        g.mode = 'go';
        g.t = 0;
        g.path = makePath([[g.x, g.z], [GREET_AT.x, GREET_AT.z]]);
        g.s = 0;
      }
    } else if (g.mode === 'go' || g.mode === 'back') {
      g.s += 1.1 * dt;
      g.path.sample(g.s, TMP);
      g.x = TMP.x;
      g.z = TMP.z;
      g.heading = lerpAngle(g.heading, TMP.heading, Math.min(1, dt * 8));
      g.phase += dt * 11;
      if (g.s >= g.path.length) {
        g.mode = g.mode === 'go' ? 'place' : 'idle';
        g.t = 0;
      }
    } else if (g.mode === 'place') {
      g.heading = lerpAngle(g.heading, Math.PI, Math.min(1, dt * 8)); // face north, toward the guest
      const guest = g.guest;
      if (g.t >= 1.85 && guest && !guest.lei) {
        guest.lei = true;
        guest.hop = t;
        if (guest.kind === 'tourist' && !st.greetedToast) {
          st.greetedToast = true;
          c.onToast?.('Aloha! See the little tourist with the camera at the gate? That\'s you.');
        }
      }
      if (g.t >= 3.2) {
        if (guest) guest.leiDone = true;
        g.guest = null;
        g.mode = 'back';
        g.t = 0;
        g.path = makePath([[g.x, g.z], [GREETER_HOME.x, GREETER_HOME.z]]);
        g.s = 0;
      }
    }
    g.y = groundY(g.x, g.z);

    // pose the greeter
    const gp = greeter.current;
    if (resetBot(gp)) {
      gp.root.position.set(g.x, g.y, g.z);
      gp.root.rotation.y = g.heading;
      gp.armL.rotation.x = -0.5; // forearm up, the spare leis hanging off it
      gp.armL.rotation.z = -0.15;
      if (g.mode === 'go' || g.mode === 'back') {
        walkPose(gp, g.phase, false);
        gp.armR.rotation.x = Math.sin(g.phase) * 0.45;
      } else if (g.mode === 'place') {
        const k = g.t;
        const lift = k < 0.45 ? smooth(k / 0.45) : k < 1.7 ? 1 : 1 - smooth((k - 1.7) / 0.4);
        gp.armL.rotation.x = -0.5 - 2.0 * lift;
        gp.armR.rotation.x = -2.5 * lift;
        gp.armL.rotation.z = 0.25 * lift;
        gp.armR.rotation.z = -0.25 * lift;
        gp.head.rotation.x = -0.15 * lift;
        if (k > 2.1) {
          // a little bow: "aloha"
          const b = Math.sin(Math.min(1, (k - 2.1) / 1.1) * Math.PI);
          gp.pose.rotation.x = 0.35 * b;
          gp.armR.rotation.z = 0.9 * b;
          gp.armR.rotation.x = -1.2 * b;
        }
      } else {
        gp.head.rotation.y = Math.sin(t * 0.45) * 0.4;
        gp.pose.rotation.z = Math.sin(t * 1.2) * 0.025;
        // now and then, a friendly wave toward the camera
        const wk = t % 17;
        if (wk < 1.6) gp.armR.rotation.z = 2.4 + Math.sin(wk * 12) * 0.3;
      }
    }

    // the lei in flight: from the greeter's hands, up over the guest's head and down
    const fl = flying.current;
    if (fl) {
      const guest = g.guest;
      const k = g.t;
      const show = g.mode === 'place' && guest && k > 0.45 && k < 1.85;
      fl.visible = !!show;
      if (show) {
        const gs = guest.kind === 'tourist' ? TOURIST_S : RECRUIT_S;
        const hx = g.x + Math.sin(g.heading) * 0.3;
        const hz = g.z + Math.cos(g.heading) * 0.3;
        const u1 = smooth((k - 0.45) / 0.6);
        const u2 = smooth((k - 1.05) / 0.8);
        const topY = guest.y + 1.45 * gs;
        fl.position.set(hx + (guest.x - hx) * u1, g.y + 1.25 * S + (topY - g.y - 1.25 * S) * u1 - (topY - guest.y - 0.6 * gs) * u2, hz + (guest.z - hz) * u1);
        fl.rotation.y = guest.heading;
        fl.scale.setScalar(gs);
      }
    }

    // pose the walkers
    const tw = st.tourist;
    if (tw.on) {
      poseWalker(tw, tourist.current, t, TOURIST_S);
      if (tLei.current) tLei.current.visible = tw.lei;
      if (tCam.current) {
        const k = tw.pose === 'photo' ? tw.cam || 0 : 0;
        tCam.current.position.set(0, 0.42 + 0.33 * k, 0.21 + 0.08 * k);
      }
      if (tFlash.current) {
        tFlash.current.visible = tw.pose === 'photo' && tw.flash > 0;
        FLASH_MAT.opacity = 0.85;
      }
    }
    const rw = st.recruit;
    if (rw.on) {
      poseWalker(rw, recruit.current, t, RECRUIT_S);
      if (rLei.current) rLei.current.visible = rw.lei;
      // keep the guide walking alongside (Bot.jsx walks it to `goal`)
      const an = rw.data.guide && antics.get(rw.data.guide);
      if (rw.data.guide && !an) rw.data.guide = null; // the guide got called away
    }
  });

  const onTourist = () =>
    ctxRef.current.onNote?.({
      title: "That's you!",
      body: [
        'The little tourist with the sun hat and camera is you, the person looking at this page.',
        'You rode in on the water taxi when you opened Bot Island HQ, got a lei at the gate, and now you are taking in the sights.',
        'Close the tab and the tourist heads home. Come back any time.',
      ],
      from: 'The greeter at the gate',
    });
  const onRecruit = () => {
    const w = st.recruit;
    const team = w.data.team ? `the ${teamLabel(w.data.team)}` : 'a team';
    ctxRef.current.onNote?.({
      title: 'New recruit',
      body: [w.data.joined ? `Fresh off the boat or plane and now part of ${team}.` : `Fresh off the boat or plane, on the way to join ${team}.`, 'The Bot Army keeps growing. Want one of your own? Every bot here is at Boss Your Own Bots.'],
      from: 'Bot Island HQ',
    });
  };

  return (
    <group>
      <Greeter parts={greeter} />
      <Taxi rootRef={taxiRoot} captain={captain} />
      <Lei ref={flying} visible={false} />
      {touristOn && <Tourist parts={tourist} camRef={tCam} flashRef={tFlash} leiRef={tLei} onTap={onTourist} />}
      {recruitOn && <Recruit parts={recruit} color={recruitColor} leiRef={rLei} onTap={onRecruit} />}
    </group>
  );
}
