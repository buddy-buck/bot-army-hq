import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DECKS, ROCKS, islandE, nearestZone, seaClear, siteDistance, terrainY } from '../../utils/paths.js';
import { aliveClock, testOn } from '../../wild/director.js';
import { fx, ripple } from './fx.js';
import { waveY } from './glsl.js';
import { splash } from './Spray.jsx';
import { BODY_GEO, CONE4, LOW_GEO, angleDiff, lanePoint, rnd, std } from './kit.js';

// Green sea turtles cruising the shallows just under the surface, front
// flippers sweeping like wings. Every so often one comes up for a breath
// (head out, a ripple, a puff of spray) and slips back down. The first
// turtle sometimes swims ashore, hauls out on a quiet stretch of beach for
// a rest, turns around and paddles back out.

const MAT = {
  shell: std('#4f7f45'),
  plates: std('#7f9c4f'),
  rim: std('#3b5e36'),
  skin: std('#a2b682'),
  belly: std('#e3d29a'),
  eye: std('#1d2421'),
};

const SWIM_DEPTH = -0.5;
const REST_E = 0.935; // up on the sand, above the swash
const LANE_E = [1.38, 1.62, 1.9];

function TurtleModel({ flippers }) {
  const [fl, fr, bl, br] = flippers;
  return (
    <group scale={1.1}>
      <mesh geometry={BODY_GEO} material={MAT.shell} scale={[0.42, 0.15, 0.5]} />
      <mesh geometry={BODY_GEO} material={MAT.rim} position={[0, -0.02, 0]} scale={[0.45, 0.08, 0.53]} />
      <mesh geometry={LOW_GEO} material={MAT.plates} position={[0, 0.07, -0.02]} scale={[0.29, 0.12, 0.36]} />
      <mesh geometry={BODY_GEO} material={MAT.belly} position={[0, -0.07, 0]} scale={[0.36, 0.05, 0.43]} />
      {/* head and eyes */}
      <mesh geometry={BODY_GEO} material={MAT.skin} position={[0, 0.03, 0.57]} scale={[0.11, 0.09, 0.15]} />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={LOW_GEO} material={MAT.eye} position={[s * 0.07, 0.07, 0.63]} scale={0.022} />
      ))}
      <mesh geometry={CONE4} material={MAT.skin} position={[0, -0.01, -0.55]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.05, 0.14, 0.03]} />
      {/* front flippers: long paddles swept back */}
      <group ref={fl} position={[-0.3, -0.02, 0.24]}>
        <mesh geometry={BODY_GEO} material={MAT.skin} position={[-0.27, 0, -0.08]} rotation={[0, -0.45, 0]} scale={[0.32, 0.025, 0.085]} />
      </group>
      <group ref={fr} position={[0.3, -0.02, 0.24]}>
        <mesh geometry={BODY_GEO} material={MAT.skin} position={[0.27, 0, -0.08]} rotation={[0, 0.45, 0]} scale={[0.32, 0.025, 0.085]} />
      </group>
      {/* rear flippers */}
      <group ref={bl} position={[-0.2, -0.03, -0.38]}>
        <mesh geometry={BODY_GEO} material={MAT.skin} position={[-0.09, 0, -0.06]} rotation={[0, 0.6, 0]} scale={[0.13, 0.02, 0.07]} />
      </group>
      <group ref={br} position={[0.2, -0.03, -0.38]}>
        <mesh geometry={BODY_GEO} material={MAT.skin} position={[0.09, 0, -0.06]} rotation={[0, -0.6, 0]} scale={[0.13, 0.02, 0.07]} />
      </group>
    </group>
  );
}

// A quiet bit of beach for a nap: clear of landmarks, zones, decks and rocks,
// with open water in front of it.
const spot = { x: 0, z: 0 };
const wspot = { x: 0, z: 0 };
function beachClear(theta) {
  lanePoint(theta, REST_E, spot);
  lanePoint(theta, 1.3, wspot);
  if (siteDistance(spot.x, spot.z) < 2.2 || nearestZone(spot.x, spot.z).distance < 4) return false;
  if (DECKS.some((d) => spot.x > d.x0 - 2.5 && spot.x < d.x1 + 2.5 && spot.z > d.z0 - 2.5 && spot.z < d.z1 + 2.5)) return false;
  if (ROCKS.some((r) => Math.hypot(r.x - spot.x, r.z - spot.z) < 1.5)) return false;
  return seaClear(wspot.x, wspot.z, 2);
}

function Turtle({ index, beachgoer }) {
  const ref = useRef();
  const flippers = [useRef(), useRef(), useRef(), useRef()];
  const clock = useMemo(aliveClock, []);
  const test = testOn('turtles');
  const st = useMemo(
    () => ({
      theta: index * 2.1 + 0.6,
      dir: index % 2 ? -1 : 1,
      e: LANE_E[index % 3],
      eTarget: LANE_E[index % 3],
      y: SWIM_DEPTH,
      heading: 0,
      stroke: rnd(0, 6),
      mode: 'swim',
      sub: null, // ashore steps: in, rest, turn, out
      beachTheta: null,
      restFor: 30,
      t0: 0,
      nextBreath: test ? 4 + index * 3 : rnd(15, 40),
      nextBeach: test ? 12 : rnd(90, 200),
      nextLane: rnd(15, 30),
      px: 0,
      pz: 0,
    }),
    [index, test]
  );
  const pos = useMemo(() => ({ x: 0, z: 0 }), []);

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(delta, 0.05);
    const t = clock.tick(delta);
    let speed = 0.45; // world units per second
    let yWant = SWIM_DEPTH + Math.sin(t * 0.5 + index) * 0.05;
    let strokeRate = 2.0;
    let headUp = 0;
    let faceIn = false; // heading toward / away from the beach instead of along the lane

    if (st.mode === 'swim') {
      if (t > st.nextLane) {
        st.eTarget = rnd(1.32, 2.0);
        st.nextLane = t + rnd(20, 40);
      }
      st.e += (st.eTarget - st.e) * Math.min(1, dt * 0.08);
      lanePoint(st.theta, st.e, pos);
      if (t > st.nextBreath && seaClear(pos.x, pos.z, 1.2)) {
        st.mode = 'breathe';
        st.t0 = t;
      } else if (beachgoer && t > st.nextBeach) {
        // find a quiet bit of beach a little way ahead, swim to it, go ashore
        if (st.beachTheta === null) {
          for (let d = 0; d < 1.6 && st.beachTheta === null; d += 0.04) if (beachClear(st.theta + st.dir * d)) st.beachTheta = st.theta + st.dir * d;
          if (st.beachTheta === null) st.nextBeach = t + 20;
        } else if ((st.theta - st.beachTheta) * st.dir >= 0) {
          st.theta = st.beachTheta;
          st.beachTheta = null;
          st.mode = 'ashore';
          st.sub = 'in';
          st.t0 = t;
        }
      }
    } else if (st.mode === 'breathe') {
      const k = t - st.t0;
      speed = 0.22;
      strokeRate = 1.1;
      yWant = k < 5 ? waveY(pos.x, pos.z, fx.now) - 0.05 : SWIM_DEPTH; // bobbing on the waves
      headUp = k < 5 ? 0.25 : 0;
      if (k > 1.1 && k - dt <= 1.1) {
        ripple(pos.x, pos.z, 0.9);
        splash(pos.x + Math.sin(st.heading) * 0.6, pos.z + Math.cos(st.heading) * 0.6, 0.25, 4, false); // a puff as it breathes out
      }
      if (k > 5 && k - dt <= 5) ripple(pos.x, pos.z, 0.7);
      if (k > 7) {
        st.mode = 'swim';
        st.nextBreath = t + (test ? rnd(6, 10) : rnd(30, 70));
      }
    } else if (st.mode === 'ashore') {
      // swim in, haul out, rest, turn around, paddle back out
      const onSand = islandE(pos.x, pos.z) < 1.0;
      const k = t - st.t0;
      faceIn = true;
      if (st.sub === 'in') {
        st.e -= dt * (onSand ? 0.012 : 0.05);
        strokeRate = onSand ? 1.4 : 2.0;
        if (st.e <= REST_E) {
          st.e = REST_E;
          st.sub = 'rest';
          st.t0 = t;
          st.restFor = test ? 8 : rnd(25, 40);
        }
      } else if (st.sub === 'rest') {
        strokeRate = 0;
        headUp = Math.sin(k * 0.6) * 0.08;
        if (k > st.restFor) {
          st.sub = 'turn';
          st.t0 = t;
        }
      } else if (st.sub === 'turn') {
        strokeRate = 1.2;
        if (k > 4) {
          st.sub = 'out';
          st.t0 = t;
        }
      } else {
        st.e += dt * (onSand ? 0.012 : 0.05);
        strokeRate = onSand ? 1.4 : 2.0;
        if (st.e >= LANE_E[0]) {
          st.mode = 'swim';
          st.sub = null;
          st.eTarget = LANE_E[0];
          st.nextBeach = t + (test ? 25 : rnd(180, 320));
        }
      }
      lanePoint(st.theta, st.e, pos);
      speed = 0;
      yWant = Math.max(SWIM_DEPTH, terrainY(pos.x, pos.z) + 0.12);
    }

    // along the lane
    if (speed > 0) {
      st.theta += (st.dir * speed * dt) / (Math.sqrt(st.e) * 17);
      lanePoint(st.theta, st.e, pos);
    }
    st.y += (yWant - st.y) * Math.min(1, dt * (st.mode === 'ashore' ? 6 : 1.2));

    // face where it's going
    let want;
    if (faceIn) {
      const inward = Math.atan2(-pos.x, -pos.z);
      want = st.sub === 'out' || st.sub === 'turn' ? inward + Math.PI : inward;
    } else {
      want = Math.atan2(pos.x - st.px, pos.z - st.pz);
    }
    if (Math.hypot(pos.x - st.px, pos.z - st.pz) > 1e-5 || faceIn) st.heading += angleDiff(want, st.heading) * Math.min(1, dt * (st.sub === 'turn' ? 0.9 : 2));
    st.px = pos.x;
    st.pz = pos.z;

    g.position.set(pos.x, st.y, pos.z);
    g.rotation.set(-headUp, st.heading, Math.sin(t * 0.7 + index) * 0.04);

    // flippers: big slow wing-beats up front, little steering paddles behind
    st.stroke += dt * strokeRate;
    const ph = st.stroke * Math.PI;
    const flap = Math.sin(ph) * 0.45 * Math.min(1, strokeRate);
    const sweep = Math.sin(ph + 1.3) * 0.45 * Math.min(1, strokeRate);
    flippers[0].current.rotation.set(0, sweep, -flap);
    flippers[1].current.rotation.set(0, -sweep, flap);
    flippers[2].current.rotation.set(0, Math.sin(ph * 0.5) * 0.3, 0);
    flippers[3].current.rotation.set(0, -Math.sin(ph * 0.5) * 0.3, 0);
  });

  return (
    <group ref={ref} rotation-order="YXZ">
      <TurtleModel flippers={flippers} />
    </group>
  );
}

export default function Turtles({ lowPower = false }) {
  const n = lowPower ? 2 : 3;
  return Array.from({ length: n }, (_, i) => <Turtle key={i} index={i} beachgoer={i === 0} />);
}
