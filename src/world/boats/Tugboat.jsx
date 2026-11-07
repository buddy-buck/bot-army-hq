import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DOCK } from '../../utils/paths.js';
import { aliveClock, testOn } from '../../wild/director.js';
import { world } from '../state.js';
import MiniBot from '../MiniBot.jsx';
import { crateTexture, hullGeometry, registerBoat, ridePose, setNightLights, smooth, Spray, std, wakeSpray } from './kit.js';
import { Beam, Box, Light, SideLights } from './parts.jsx';

// The prompt tug: every few minutes a chunky little tugboat chugs in from the
// horizon pushing a barge of wooden crates stenciled PROMPTS. It noses the
// barge up to the end of Launch's Pier (clear of Buddy's cruiser and the
// houseboat), toots a puff of steam, lifts one crate onto the pier with the
// barge's little crane, then backs off, spins round and heads out to sea.
// The captain waves from the wheelhouse. The crate pops open on the pier a
// little later and its prompts sparkle away.
//
// ?test=tug: the first delivery starts right away (already close in) and
// another follows about 25 seconds after each one.

const ID = 'tug';
const TEST = testOn('tug');

// Tug (nose +z, centered on the group) pushing the barge ahead of it.
const T_LEN = 2.6;
const T_BEAM = 1.3;
const DECK = 0.32;
const B_Z0 = 1.38; // barge stern
const B_LEN = 2.8;
const B_BEAM = 1.7;
const B_DECK = 0.28;
const NOSE = B_Z0 + B_LEN; // barge bow, from the tug's center
const MID = NOSE / 2 - T_LEN / 4; // middle of tug + barge
const SIZE = T_LEN / 2 + NOSE;

// Crane on the barge: a post near the bow, a boom that swings from the crate
// stack (aft) over the pier (ahead).
const CRATE = 0.55;
const POST = [0.55, 3.7];
const PIVOT_Y = 2.0;
const STACK_TOP = [0, 2.5];
const DROP_Z = NOSE + 0.72;
const BOOM_R = Math.hypot(STACK_TOP[0] - POST[0], STACK_TOP[1] - POST[1]);
const YAW_STACK = Math.atan2(STACK_TOP[0] - POST[0], STACK_TOP[1] - POST[1]);
const YAW_DROP = Math.atan2(-POST[0], DROP_Z - POST[1]);
const CABLE_STACK = PIVOT_Y - 0.05 - CRATE / 2 - (B_DECK + CRATE * 1.5);
const CABLE_UP = 0.25;
const CABLE_DROP = PIVOT_Y - 0.05 - CRATE / 2 - (DOCK.y + CRATE / 2);

// The berth: barge bow just off the pier's west end, on the pier's center line.
const BERTH = new THREE.Vector3(DOCK.x0 - 0.12 - NOSE, 0, (DOCK.z0 + DOCK.z1) / 2);
const BACK_DIST = 3.5;
const v3 = (x, z) => new THREE.Vector3(x, 0, z);
const IN_PATH = new THREE.CubicBezierCurve3(v3(-128, -58), v3(-86, -30), v3(BERTH.x - 18, BERTH.z), BERTH.clone());
const OUT_START = v3(BERTH.x - BACK_DIST, BERTH.z);
const OUT_PATH = new THREE.CubicBezierCurve3(OUT_START.clone(), v3(BERTH.x - 18, BERTH.z), v3(-74, 26), v3(-128, 52));
const V0 = 2.4;
const DECEL = 8;
const ACCEL = 6;
const L_IN = IN_PATH.getLength();
const L_OUT = OUT_PATH.getLength();
const IN_T1 = (L_IN - DECEL) / V0;
const IN_T = IN_T1 + (2 * DECEL) / V0;
const DOCK_T = 16;
const BACK_T = 4.5;
const PIVOT_T = 7;
const OUT_TA = (2 * ACCEL) / V0;
const OUT_T = OUT_TA + (L_OUT - ACCEL) / V0;
const T1 = IN_T;
const T2 = T1 + DOCK_T;
const T3 = T2 + BACK_T;
const T4 = T3 + PIVOT_T;
const T5 = T4 + OUT_T;

const nextGap = () => (TEST ? 25 : 150 + Math.random() * 100);

const HULL_GEO = hullGeometry(T_LEN, T_BEAM, 0.66, { bow: 0.22, stern: 0.9, taper: 0.62, sheer: 0.2 });
const BAND_GEO = hullGeometry(T_LEN * 1.01, T_BEAM * 1.02, 0.15, { bow: 0.22, stern: 0.9, taper: 1, sheer: 0.2 });
const TIRE_GEO = new THREE.TorusGeometry(0.11, 0.05, 5, 10);
const STACK_GEO = new THREE.CylinderGeometry(0.15, 0.17, 0.72, 8);
const CAP_GEO = new THREE.CylinderGeometry(0.165, 0.155, 0.14, 8);
const CRATE_GEO = new THREE.BoxGeometry(CRATE, CRATE, CRATE);
const LID_GEO = new THREE.BoxGeometry(CRATE * 1.04, 0.06, CRATE * 1.04);
const CABLE_GEO = new THREE.CylinderGeometry(0.012, 0.012, 1, 4).translate(0, -0.5, 0);
const BOOM_GEO = new THREE.BoxGeometry(0.08, 0.08, BOOM_R + 0.15).translate(0, 0, (BOOM_R + 0.15) / 2 - 0.08);
const HAT_GEO = new THREE.CylinderGeometry(0.15, 0.17, 0.1, 8);
const BRIM_GEO = new THREE.CylinderGeometry(0.21, 0.21, 0.02, 10);

const M = {
  red: std('#d6453a'),
  black: std('#24252b'),
  deck: std('#9a8f84'),
  white: std('#fdf8ee'),
  tire: std('#1d1d22', { roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: '#9fd8ff', emissive: '#ffcf7a', emissiveIntensity: 0, transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false }),
  brass: std('#d9a640', { metalness: 0.4, roughness: 0.35 }),
  bargeHull: std('#4f5a66'),
  bargeBand: std('#f09024'),
  bargeDeck: std('#a37a4f'),
  crane: std('#ffc93c'),
  cable: std('#3a3a40'),
  navy: std('#19469D'),
  hatWhite: std('#ffffff'),
};
const CRATE_SIDE = std('#ffffff', { map: crateTexture(), roughness: 0.8 });
const CRATE_TOP = std('#b8874f', { roughness: 0.85 });
const CRATE_MATS = [CRATE_SIDE, CRATE_SIDE, CRATE_TOP, CRATE_TOP, CRATE_SIDE, CRATE_SIDE];

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();
const _w = new THREE.Vector3();

function Crate(props) {
  return <mesh geometry={CRATE_GEO} material={CRATE_MATS} {...props} />;
}

// Where the trip is at `tt` seconds in: writes into out { x, z, h, v, travel }.
function tripPose(tt, out) {
  if (tt < T1) {
    let d;
    if (tt < IN_T1) {
      d = V0 * tt;
      out.v = V0;
    } else {
      const tau = Math.min(tt - IN_T1, (2 * DECEL) / V0);
      const t2 = (2 * DECEL) / V0;
      d = L_IN - DECEL + V0 * tau - (V0 * tau * tau) / (2 * t2);
      out.v = V0 * (1 - tau / t2);
    }
    const u = Math.min(1, d / L_IN);
    IN_PATH.getPointAt(u, _v);
    IN_PATH.getTangentAt(u, _t);
    out.x = _v.x;
    out.z = _v.z;
    out.h = Math.atan2(_t.x, _t.z);
    out.travel = out.h;
    return 'in';
  }
  if (tt < T2) {
    out.x = BERTH.x;
    out.z = BERTH.z;
    out.h = Math.PI / 2;
    out.v = 0;
    out.travel = out.h;
    return 'dock';
  }
  if (tt < T3) {
    const k = (tt - T2) / BACK_T;
    out.x = BERTH.x - BACK_DIST * smooth(k);
    out.z = BERTH.z;
    out.h = Math.PI / 2;
    out.v = (BACK_DIST * 6 * k * (1 - k)) / BACK_T;
    out.travel = -Math.PI / 2; // backing out, west
    return 'back';
  }
  if (tt < T4) {
    const k = (tt - T3) / PIVOT_T;
    out.x = OUT_START.x;
    out.z = OUT_START.z;
    out.h = Math.PI / 2 + Math.PI * smooth(k); // spins round through north
    out.v = 0;
    out.travel = out.h;
    return 'pivot';
  }
  const tau = tt - T4;
  let d;
  if (tau < OUT_TA) {
    d = 0.5 * (V0 / OUT_TA) * tau * tau;
    out.v = (V0 * tau) / OUT_TA;
  } else {
    d = ACCEL + V0 * (tau - OUT_TA);
    out.v = V0;
  }
  const u = Math.min(1, d / L_OUT);
  OUT_PATH.getPointAt(u, _v);
  OUT_PATH.getTangentAt(u, _t);
  out.x = _v.x;
  out.z = _v.z;
  out.h = Math.atan2(_t.x, _t.z);
  out.travel = out.h;
  return 'out';
}

export default function Tugboat({ ctx }) {
  const group = useRef();
  const boom = useRef();
  const hook = useRef();
  const cable = useRef();
  const liftCrate = useRef();
  const topCrate = useRef();
  const delivered = useRef();
  const lid = useRef();
  const captain = useRef({});
  const night = useRef(0);
  night.current = ctx.sky?.stars ?? 0;
  const clock = useMemo(() => aliveClock(), []);

  const spray = useMemo(() => new Spray(ctx.lowPower ? 30 : 60, { gravity: 7, drag: 1.3 }), [ctx.lowPower]);
  const smoke = useMemo(() => new Spray(ctx.lowPower ? 20 : 36, { gravity: -0.4, drag: 0.9, grow: 1.8, floor: -9, round: true, color: '#e9ecf0', emissive: '#ffffff', emissiveIntensity: 0.3, opacity: 0.55 }), [ctx.lowPower]);
  const sparkle = useMemo(() => new Spray(40, { gravity: -1.1, drag: 1.0, floor: -9, color: '#ffe9a8', emissive: '#ffcf5a', emissiveIntensity: 1.1, opacity: 0.95 }), []);
  useEffect(
    () => () => {
      spray.dispose();
      smoke.dispose();
      sparkle.dispose();
    },
    [spray, smoke, sparkle]
  );
  useEffect(() => () => world.boats.delete(ID), []);

  // A captain's hat for the captain.
  const hat = useMemo(() => {
    const h = new THREE.Group();
    const crown = new THREE.Mesh(HAT_GEO, M.hatWhite);
    const band = new THREE.Mesh(HAT_GEO, M.navy);
    band.scale.set(1.03, 0.35, 1.03);
    band.position.y = -0.02;
    const brim = new THREE.Mesh(BRIM_GEO, M.black);
    brim.position.set(0, -0.05, 0.04);
    h.add(crown, band, brim);
    h.position.set(0, 0.24, 0);
    return h;
  }, []);
  useEffect(() => {
    captain.current.head?.add(hat);
    return () => hat.parent?.remove(hat);
  }, [hat]);

  const st = useMemo(
    () => ({ trip: null, nextAt: TEST ? 1.5 : 30 + Math.random() * 40, pose: { x: 0, z: 0, h: 0, v: 0, travel: 0 }, puff: 0, horned: false, dropped: false, crate: null }),
    []
  );

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(delta, 0.1);
    const now = clock.tick(delta);
    const t = state.clock.elapsedTime;
    const s = st;
    const n = night.current;
    setNightLights(n);
    M.glass.emissiveIntensity = n * 1.3;

    spray.update(dt);
    smoke.update(dt);
    sparkle.update(dt);
    updateDelivered(s, now);

    if (!s.trip) {
      g.visible = false;
      if (now < s.nextAt) return;
      // A fresh barge load: the top crate is back on the stack.
      s.trip = { t0: TEST && s.nextAt < 3 ? now - (IN_T1 - 12 / V0) : now };
      s.horned = false;
      s.dropped = false;
      if (topCrate.current) topCrate.current.visible = true;
      if (liftCrate.current) liftCrate.current.visible = false;
    }
    const tt = now - s.trip.t0;
    if (tt >= T5) {
      s.trip = null;
      g.visible = false;
      world.boats.delete(ID);
      s.nextAt = now + nextGap();
      return;
    }
    g.visible = true;
    const p = s.pose;
    const phase = tripPose(tt, p);

    ridePose(g, p.x, p.z, p.h, t, SIZE, B_BEAM, 1.4);
    // rise over the horizon at the start, sink below it at the end
    const far = Math.min(1, tt / 6, (T5 - tt) / 6);
    g.position.y -= (1 - far) * 1.4;
    g.updateMatrixWorld();

    // world.boats: the middle of tug + barge, heading the way it is travelling
    const cx = p.x + Math.sin(p.h) * MID;
    const cz = p.z + Math.cos(p.h) * MID;
    registerBoat(ID, cx, cz, p.travel, p.v, SIZE, 3);
    if (phase === 'back') wakeSpray(spray, cx, cz, p.travel, p.v, SIZE, T_BEAM, t, { bow: 0, wash: 1.4 });
    else wakeSpray(spray, cx, cz, p.h, p.v, SIZE, B_BEAM, t, { bow: 1.2, wash: 0.2 });
    // prop wash under the tug's stern (busy while spinning or backing)
    const churn = phase === 'pivot' || phase === 'back' ? 0.9 : Math.min(1, p.v / V0) * 0.7;
    if (Math.random() < churn) {
      g.localToWorld(_w.set((Math.random() - 0.5) * 0.6, 0, -T_LEN / 2 - 0.1));
      spray.emit(_w.x, _w.y + 0.05, _w.z, (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6, 0.6, 0.09);
    }

    // Gentle smoke puffs from the stack; a white steam toot on arrival.
    s.puff -= dt;
    if (s.puff <= 0) {
      s.puff = phase === 'dock' ? 1.1 : 0.45 + Math.random() * 0.2;
      g.localToWorld(_w.set(0, DECK + 1.32, -0.42));
      smoke.emit(_w.x, _w.y, _w.z, 0.15 + Math.random() * 0.1, 0.5, 0.1 + Math.random() * 0.1, 3.2, 0.14 + Math.random() * 0.05);
    }
    if (phase === 'dock' && !s.horned && tt - T1 > 0.4) {
      s.horned = true;
      g.localToWorld(_w.set(-0.25, DECK + 1.42, 0.25));
      for (let i = 0; i < 10; i++) {
        smoke.emit(_w.x, _w.y, _w.z, (Math.random() - 0.5) * 0.5, 1.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.5, 1.6, 0.1 + Math.random() * 0.06, '#ffffff');
      }
    }

    // The crane: hoist, swing over the pier, lower, let go, swing back.
    const dk = phase === 'dock' ? tt - T1 : phase === 'in' ? -1 : 99;
    let yaw = YAW_STACK;
    let c = CABLE_STACK - 0.2;
    let carrying = false;
    if (dk >= 1.5 && dk < 3.5) {
      const k = smooth((dk - 1.5) / 2);
      c = CABLE_STACK + (CABLE_UP - CABLE_STACK) * k;
      carrying = true;
    } else if (dk >= 3.5 && dk < 6.5) {
      yaw = YAW_STACK + (YAW_DROP - YAW_STACK) * smooth((dk - 3.5) / 3);
      c = CABLE_UP;
      carrying = true;
    } else if (dk >= 6.5 && dk < 8.5) {
      yaw = YAW_DROP;
      c = CABLE_UP + (CABLE_DROP - CABLE_UP) * smooth((dk - 6.5) / 2);
      carrying = true;
    } else if (dk >= 8.5 && dk < 9) {
      yaw = YAW_DROP;
      c = CABLE_DROP;
    } else if (dk >= 9 && dk < 11.5) {
      const k = smooth((dk - 9) / 2.5);
      yaw = YAW_DROP + (YAW_STACK - YAW_DROP) * k;
      c = CABLE_DROP + (CABLE_STACK - 0.2 - CABLE_DROP) * k;
    }
    if (boom.current) boom.current.rotation.y = yaw;
    if (hook.current) hook.current.position.y = -c;
    if (cable.current) cable.current.scale.y = c;
    if (dk >= 1.5 && topCrate.current?.visible) topCrate.current.visible = false;
    if (liftCrate.current) liftCrate.current.visible = carrying;
    if (dk >= 8.5 && !s.dropped && liftCrate.current) {
      // let go: the crate stays on the pier
      s.dropped = true;
      liftCrate.current.getWorldPosition(_w);
      s.crate = { x: _w.x, z: _w.z, yaw: p.h + yaw, placed: now, openAt: now + DOCK_T - dk + BACK_T + PIVOT_T + 6 };
      showDelivered(s.crate);
    }

    // The captain waves on arrival and again when leaving.
    const cp = captain.current;
    if (cp.armR) {
      const waving = (phase === 'dock' && (dk < 4 || dk > 12.5)) || (phase === 'in' && T1 - tt < 4);
      const target = waving ? 2.5 + Math.sin(t * 8) * 0.35 : 0.15;
      cp.armR.rotation.z += (target - cp.armR.rotation.z) * Math.min(1, dt * 6);
      cp.armL.rotation.x = -0.9; // hands on the wheel
      cp.armL.rotation.z = 0.2;
      cp.head.rotation.y = waving ? 0.7 : Math.sin(t * 0.4) * 0.2;
    }
  });

  // The crate on the pier: sits a while, then pops open and its prompts
  // sparkle off into the sky.
  function showDelivered(c) {
    const d = delivered.current;
    if (!d) return;
    d.position.set(c.x, DOCK.y, c.z);
    d.rotation.set(0, c.yaw, 0);
    d.scale.setScalar(1);
    d.visible = true;
    if (lid.current) {
      lid.current.position.set(0, CRATE + 0.03, 0);
      lid.current.rotation.set(0, 0, 0);
    }
  }
  function updateDelivered(s, now) {
    const d = delivered.current;
    const c = s.crate;
    if (!d || !c) return;
    const k = now - c.openAt;
    if (k < 0) return;
    if (lid.current) {
      const up = Math.min(1, k / 0.5);
      lid.current.position.y = CRATE + 0.03 + up * 0.35 - Math.max(0, k - 0.5) * 0.5;
      lid.current.rotation.z = up * 0.9;
    }
    if (k < 2.2 && Math.random() < 0.7) {
      sparkle.emit(c.x + (Math.random() - 0.5) * 0.3, DOCK.y + CRATE, c.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.8, 1.2 + Math.random(), (Math.random() - 0.5) * 0.8, 1.8, 0.05 + Math.random() * 0.03);
    }
    if (k > 2.4) {
      const sc = Math.max(0, 1 - (k - 2.4) / 1.2);
      d.scale.setScalar(Math.max(0.001, sc));
      if (sc <= 0) {
        d.visible = false;
        s.crate = null;
      }
    }
  }

  return (
    <>
      <group ref={group} visible={false}>
        {/* --- the tug --- */}
        <mesh geometry={HULL_GEO} material={M.red} position={[0, DECK, 0]} />
        <mesh geometry={BAND_GEO} material={M.black} position={[0, DECK + 0.02, 0]} />
        <Box p={[0, DECK + 0.03, -0.05]} s={[T_BEAM * 0.86, 0.04, T_LEN * 0.85]} m={M.deck} />
        {/* push knees at the bow, tire fenders all round */}
        <Box p={[0.32, DECK + 0.05, T_LEN / 2 - 0.02]} s={[0.14, 0.6, 0.12]} m={M.black} />
        <Box p={[-0.32, DECK + 0.05, T_LEN / 2 - 0.02]} s={[0.14, 0.6, 0.12]} m={M.black} />
        {[-0.85, -0.3, 0.25, 0.75].map((z) => (
          <group key={z}>
            <mesh geometry={TIRE_GEO} material={M.tire} position={[T_BEAM / 2 + 0.02, DECK - 0.12, z]} rotation={[0, Math.PI / 2, 0]} />
            <mesh geometry={TIRE_GEO} material={M.tire} position={[-T_BEAM / 2 - 0.02, DECK - 0.12, z]} rotation={[0, Math.PI / 2, 0]} />
          </group>
        ))}
        <mesh geometry={TIRE_GEO} material={M.tire} position={[0, DECK - 0.1, -T_LEN / 2 - 0.02]} />
        {/* deckhouse, wheelhouse with big windows (open on the port side so the captain can wave) */}
        <Box p={[0, DECK + 0.25, -0.15]} s={[0.92, 0.46, 1.25]} m={M.white} />
        <Box p={[0, DECK + 0.5, 0.18]} s={[0.98, 0.06, 0.92]} m={M.black} />
        <Box p={[0, DECK + 0.68, 0.18]} s={[0.94, 0.3, 0.86]} m={M.white} />
        <Box p={[0, DECK + 1.0, 0.6]} s={[0.86, 0.34, 0.02]} m={M.glass} />
        <Box p={[-0.46, DECK + 1.0, 0.18]} s={[0.02, 0.34, 0.8]} m={M.glass} />
        <Box p={[0, DECK + 1.0, -0.24]} s={[0.86, 0.34, 0.02]} m={M.glass} />
        {[
          [0.45, 0.59],
          [-0.45, 0.59],
          [0.45, -0.23],
          [-0.45, -0.23],
        ].map(([x, z]) => (
          <Box key={`${x}${z}`} p={[x, DECK + 1.0, z]} s={[0.05, 0.36, 0.05]} m={M.white} />
        ))}
        <Box p={[0, DECK + 1.21, 0.18]} s={[1.08, 0.07, 1.0]} m={M.white} />
        <Box p={[0, DECK + 1.25, 0.18]} s={[1.1, 0.03, 1.02]} m={M.black} />
        <MiniBot color="#ff8a5c" parts={captain} position={[0.18, DECK + 0.53, 0.2]} scale={0.6} shadow={false} />
        {/* smokestack and brass horn */}
        <mesh geometry={STACK_GEO} material={M.red} position={[0, DECK + 0.9, -0.42]} rotation={[-0.12, 0, 0]} />
        <mesh geometry={CAP_GEO} material={M.black} position={[0, DECK + 1.27, -0.46]} rotation={[-0.12, 0, 0]} />
        <Beam a={[-0.25, DECK + 1.27, 0.2]} b={[-0.25, DECK + 1.4, 0.32]} r={0.035} m={M.brass} />
        {/* mast with masthead and towing lights */}
        <Beam a={[0, DECK + 1.27, 0.35]} b={[0, DECK + 1.95, 0.35]} r={0.025} m={M.white} />
        <Light p={[0, DECK + 1.97, 0.35]} kind="white" />
        <Light p={[0, DECK + 1.78, 0.35]} kind="white" s={0.8} />
        <SideLights x={0.5} y={DECK + 0.78} z={0.45} s={0.9} />
        <Light p={[0, DECK + 0.3, -T_LEN / 2]} kind="white" s={0.7} />
        {/* --- the barge --- */}
        <Box p={[0, B_DECK - 0.2, B_Z0 + B_LEN / 2]} s={[B_BEAM, 0.5, B_LEN]} m={M.bargeHull} />
        <Box p={[0, B_DECK - 0.02, B_Z0 + B_LEN / 2]} s={[B_BEAM + 0.02, 0.08, B_LEN + 0.02]} m={M.bargeBand} />
        <Box p={[0, B_DECK + 0.02, B_Z0 + B_LEN / 2]} s={[B_BEAM - 0.1, 0.03, B_LEN - 0.1]} m={M.bargeDeck} />
        {[0.84, -0.84].map((x) =>
          [B_Z0 + 0.15, NOSE - 0.15].map((z) => <Box key={`${x}${z}`} p={[x, B_DECK + 0.1, z]} s={[0.1, 0.16, 0.1]} m={M.black} />)
        )}
        {/* the crate stack: four below, one on top */}
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => <Crate key={`${sx}${sz}`} position={[sx * 0.29, B_DECK + 0.03 + CRATE / 2, STACK_TOP[1] + sz * 0.29]} rotation={[0, (sx + sz) * 0.04, 0]} />)
        )}
        <mesh ref={topCrate} geometry={CRATE_GEO} material={CRATE_MATS} position={[STACK_TOP[0], B_DECK + 0.03 + CRATE * 1.5, STACK_TOP[1]]} rotation={[0, 0.08, 0]} />
        {/* crane: post, swinging boom, cable, hook and the crate it carries */}
        <Beam a={[POST[0], B_DECK, POST[1]]} b={[POST[0], PIVOT_Y + 0.05, POST[1]]} r={0.06} m={M.crane} />
        <group ref={boom} position={[POST[0], PIVOT_Y, POST[1]]} rotation={[0, YAW_STACK, 0]}>
          <mesh geometry={BOOM_GEO} material={M.crane} />
          <mesh ref={cable} geometry={CABLE_GEO} material={M.cable} position={[0, -0.04, BOOM_R]} />
          <group ref={hook} position={[0, -CABLE_STACK, BOOM_R]}>
            <Box p={[0, -0.03, 0]} s={[0.1, 0.06, 0.1]} m={M.cable} />
            <mesh ref={liftCrate} geometry={CRATE_GEO} material={CRATE_MATS} position={[0, -0.05 - CRATE / 2, 0]} visible={false} />
          </group>
        </group>
      </group>
      {/* the delivered crate on the pier */}
      <group ref={delivered} visible={false}>
        <mesh geometry={CRATE_GEO} material={CRATE_MATS} position={[0, CRATE / 2, 0]} />
        <mesh ref={lid} geometry={LID_GEO} material={CRATE_TOP} position={[0, CRATE + 0.03, 0]} />
      </group>
      <primitive object={spray.mesh} />
      <primitive object={smoke.mesh} />
      <primitive object={sparkle.mesh} />
    </>
  );
}
