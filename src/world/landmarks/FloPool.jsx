import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { CREW_COLORS } from '../MiniBot.jsx';
import { BOT_SCALE } from '../../components/Bot.jsx';
import { FLO, groundY, zonePathCurve } from '../../utils/paths.js';
import { aliveClock, testOn } from '../../wild/director.js';
import { resetBot, walkPose } from '../life/common.jsx';

// Pool party at Flo's: every few minutes by day one or two crew bots stroll
// down Flo's sand path, out along the boardwalk, squeeze past the villa on
// the south side of the platform and step down onto the sun deck. They hop
// into the plunge pool (splash!), one lounges in a pink floatie with a
// drink, the other paddles around and does the odd splashy jump. Then they
// climb out, shake off and walk back to shore. No new visits at bedtime.
// ?test=pool: the first visit starts within seconds and they keep coming.

const H = FLO.house;
const P = FLO.platform;

// Sun deck and plunge pool, in the villa's frame (FloVilla draws them).
export const SD = { x0: -1.7, x1: 1.7, z0: -3.25, z1: -1.45, y: P.y - 0.08 };
export const POOL = { x0: -1.6, x1: 0.15, z0: -3.1, z1: -1.65 };
export const POOL_WATER_Y = SD.y - 0.07;

// Villa frame -> world [x, z] (same as the villa group's position/rotation).
const toW = (lx, lz) => {
  const c = Math.cos(H.rotY);
  const s = Math.sin(H.rotY);
  return [H.x + lx * c + lz * s, H.z - lx * s + lz * c];
};
const POOL_W = (() => {
  const a = toW(POOL.x0, POOL.z0);
  const b = toW(POOL.x1, POOL.z1);
  return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) };
})();

// Standing height: decks and sand from groundY, the sun deck (east of the
// platform, a step down) by hand.
function deckY(x, z) {
  if (x > P.x1 - 0.02 && z > P.z0 && z < P.z1) return SD.y;
  return groundY(x, z);
}

const S = BOT_SCALE;
const SPEED = 0.85;
const PAUSE = 0.6; // at the pool edge before the hop
const HOP = 0.8;
const SHAKE = 1.0;
const DELAY = 1.8; // the second bot follows this far behind
const POP = 0.35; // pop in / out at the inland end of the walk

// The walk: a little way up Flo's sand path, the beach end of the
// boardwalk, along it, east along the narrow strip between the villa and the
// platform's south rail, round the corner onto the sun deck and up its west
// side (between the villa's glass front and the loungers) to the pool.
const EDGE = [POOL_W.x0 - 0.1, POOL_W.z1 + 0.27];
const ROUTE = (() => {
  const curve = zonePathCurve('bungalow');
  const inland = [0.42, 0.3, 0.18, 0.08].map((t) => {
    const p = curve.getPoint(t);
    return [p.x, p.z];
  });
  const cx = (FLO.boardwalk.x0 + FLO.boardwalk.x1) / 2;
  const strip = P.z1 - 0.3; // between the rail and the villa's south wall
  return [...inland, FLO.entry, [cx, FLO.boardwalk.z1 - 0.3], [cx, P.z1 + 0.05], [cx + 0.35, strip], [P.x1 - 0.15, strip], [P.x1 + 0.22, P.z1 - 0.72], EDGE];
})();

function makeRoute(points) {
  const segs = [];
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, dx: bx - ax, dz: bz - az, len, s0: length });
    length += len;
  }
  return {
    length,
    sample(s, out) {
      const d = Math.min(Math.max(s, 0), length);
      let seg = segs[segs.length - 1];
      for (let i = 0; i < segs.length; i++) {
        if (d <= segs[i].s0 + segs[i].len) {
          seg = segs[i];
          break;
        }
      }
      const k = seg.len > 0 ? (d - seg.s0) / seg.len : 0;
      out.x = seg.ax + seg.dx * k;
      out.z = seg.az + seg.dz * k;
      out.heading = Math.atan2(seg.dx, seg.dz);
      return out;
    },
  };
}
const PATH = makeRoute(ROUTE);
const WALK = PATH.length / SPEED;

// Where each bot ends up in the water: the floatie lounger in the far
// (north-east) half, head back toward the far corner; the paddler near the
// steps in the south-west corner.
const SPOTS = (() => {
  const a = { x: POOL_W.x1 - 0.55, z: POOL_W.z0 + 0.62 };
  const hx = POOL_W.x1 - 0.08 - a.x;
  const hz = POOL_W.z0 + 0.08 - a.z;
  return [
    { ...a, rotY: Math.atan2(-hx, -hz) }, // feet toward the steps, head back to the corner
    { x: POOL_W.x0 + 0.46, z: POOL_W.z1 - 0.46 },
  ];
})();

const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Pink and white striped floatie (vertex colors), lying flat (axis = y).
const RING_GEO = (() => {
  const g = new THREE.TorusGeometry(0.25, 0.08, 6, 16).rotateX(Math.PI / 2);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const pink = new THREE.Color('#ff6fae');
  const white = new THREE.Color('#fff6fa');
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i)) + Math.PI;
    (Math.floor(a / (Math.PI / 4)) % 2 ? white : pink).toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
})();
const RING_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5 });

// Splashes: a ring spreading on the pool and a few droplets.
const SPLASH_RING = new THREE.RingGeometry(0.8, 1.0, 20).rotateX(-Math.PI / 2);
const DROP_GEO = new THREE.IcosahedronGeometry(0.035, 0);
const DROPS = 6;

function Splash({ fx }) {
  const ring = useRef();
  const drops = useRef([]);
  const mats = useMemo(
    () => ({
      ring: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
      drop: new THREE.MeshBasicMaterial({ color: '#d9fbff', transparent: true, opacity: 0, depthWrite: false }),
    }),
    []
  );
  useEffect(() => () => (mats.ring.dispose(), mats.drop.dispose()), [mats]);
  fx.draw = (t) => {
    const k = (t - fx.t0) / 0.9;
    const on = k >= 0 && k < 1;
    if (ring.current) {
      ring.current.visible = on;
      if (on) {
        ring.current.position.set(fx.x, POOL_WATER_Y + 0.015, fx.z);
        ring.current.scale.setScalar(0.12 + k * fx.size);
        mats.ring.opacity = 0.75 * (1 - k);
      }
    }
    mats.drop.opacity = on ? 0.9 * (1 - k * k) : 0;
    drops.current.forEach((d, i) => {
      if (!d) return;
      d.visible = on;
      if (!on) return;
      const a = (i / DROPS) * Math.PI * 2 + fx.x * 3;
      const r = k * 0.32 * fx.size * 2;
      d.position.set(fx.x + Math.cos(a) * r, POOL_WATER_Y + 0.02 + Math.sin(k * Math.PI) * 0.32 * fx.size * 2, fx.z + Math.sin(a) * r);
    });
  };
  return (
    <group>
      <mesh ref={ring} geometry={SPLASH_RING} material={mats.ring} visible={false} renderOrder={6} />
      {Array.from({ length: DROPS }, (_, i) => (
        <mesh key={i} ref={(el) => (drops.current[i] = el)} geometry={DROP_GEO} material={mats.drop} visible={false} />
      ))}
    </group>
  );
}

const tmp = { x: 0, z: 0, heading: 0 };

export default function FloPool({ animate = true, bedtime = false, night = 0 }) {
  const test = testOn('pool');
  const clock = useMemo(() => aliveClock(), []);
  const parts = [useRef({}), useRef({})];
  const rings = [useRef(), useRef()];
  const wrap = useRef();
  const splashes = useMemo(() => [0, 1, 2].map(() => ({ t0: -99, x: 0, z: 0, size: 0.3, draw: null })), []);
  const st = useMemo(() => ({ plan: null, next: test ? 2 : rand(40, 110), splashI: 0 }), [test]);
  const [visit, setVisit] = useState({ n: 0, colors: [CREW_COLORS[2], CREW_COLORS[5]], drink: 'maitai' });
  const mood = useRef({ bedtime, night });
  mood.current = { bedtime, night };

  const splash = (t, x, z, size) => {
    const s = splashes[st.splashI++ % splashes.length];
    s.t0 = t;
    s.x = x;
    s.z = z;
    s.size = size;
  };

  function startVisit(t) {
    const n = test || Math.random() < 0.55 ? 2 : 1;
    const poolTime = test ? rand(12, 16) : rand(24, 38);
    const base = (n - 1) * DELAY + WALK + PAUSE + HOP + poolTime;
    const bots = Array.from({ length: n }, (_, i) => ({
      delay: i * DELAY,
      spot: SPOTS[i],
      // the paddler (closer to the steps) climbs out first
      exit: base + (n - 1 - i) * DELAY - i * DELAY,
      phase: Math.random() * 10,
      splashed: false,
      climbed: false,
    }));
    const end = Math.max(...bots.map((b) => b.delay + b.exit + HOP + SHAKE + WALK)) + 0.2;
    st.plan = { t0: t, n, bots, end };
    const c0 = Math.floor(Math.random() * CREW_COLORS.length);
    setVisit((v) => ({ n: v.n + 1, colors: [CREW_COLORS[c0], CREW_COLORS[(c0 + 3 + Math.floor(Math.random() * 5)) % CREW_COLORS.length]], drink: Math.random() < 0.5 ? 'maitai' : 'coconut' }));
  }

  useFrame((_, delta) => {
    if (wrap.current) wrap.current.visible = animate && !!st.plan;
    if (!animate) return;
    const t = clock.tick(delta);
    const plan = st.plan;
    if (!plan && t >= st.next) {
      const { bedtime: bed, night: nt } = mood.current;
      if (bed || nt > 0.55) st.next = t + 20;
      else startVisit(t);
    }
    if (plan && t - plan.t0 > plan.end) {
      st.plan = null;
      st.next = t + (test ? 4 : rand(120, 240));
    }
    for (let i = 0; i < 2; i++) poseBot(i, t);
    for (const s of splashes) s.draw?.(t);
  });

  function hide(i) {
    const p = parts[i].current;
    if (p.root) p.root.visible = false;
  }

  function poseBot(i, t) {
    const p = parts[i].current;
    const plan = st.plan;
    if (!p || !p.root) return;
    const b = plan && plan.bots[i];
    if (!b) return hide(i);
    const lt = t - plan.t0 - b.delay;
    const out = lt - b.exit; // time since climbing out started
    if (lt < 0 || out > HOP + SHAKE + WALK) return hide(i);
    resetBot(p);
    const root = p.root;
    root.visible = true;
    root.scale.setScalar(S);
    const ring = rings[i].current;
    const floatie = i === 0;
    if (ring) {
      ring.visible = floatie;
      ring.position.set(0, 0.32, 0); // around the waist while walking
      ring.rotation.set(0, 0, 0);
    }
    const spot = b.spot;
    const edgeY = deckY(EDGE[0], EDGE[1]);
    const toSpot = Math.atan2(spot.x - EDGE[0], spot.z - EDGE[1]);

    if (lt < WALK) {
      // walking in
      PATH.sample(lt * SPEED, tmp);
      root.position.set(tmp.x, deckY(tmp.x, tmp.z), tmp.z);
      root.rotation.y = tmp.heading;
      root.scale.setScalar(S * ease(lt / POP));
      walkPose(p, lt * 7 + b.phase);
      return;
    }
    if (out < 0 && lt < WALK + PAUSE) {
      // at the edge: a little crouch, arms back
      const k = (lt - WALK) / PAUSE;
      root.position.set(EDGE[0], edgeY, EDGE[1]);
      root.rotation.y = toSpot;
      p.pose.position.y = -0.05 * Math.sin(k * Math.PI * 0.5);
      p.pose.rotation.x = 0.25 * k;
      p.armL.rotation.x = 0.6 * k;
      p.armR.rotation.x = 0.6 * k;
      return;
    }
    const waterY = floatie ? POOL_WATER_Y - 0.13 : POOL_WATER_Y - 0.85;
    if (out < 0 && lt < WALK + PAUSE + HOP) {
      // hop in
      const k = (lt - WALK - PAUSE) / HOP;
      hopPose(p, root, EDGE[0], edgeY, EDGE[1], spot.x, waterY, spot.z, k, toSpot);
      if (k > 0.82 && !b.splashed) {
        b.splashed = true;
        splash(t, spot.x, spot.z, 0.45);
      }
      return;
    }
    if (out < 0) {
      // in the pool
      const pt = lt - WALK - PAUSE - HOP + b.phase;
      if (floatie) floatPose(p, root, ring, spot, pt, waterY);
      else if (paddlePose(p, root, spot, pt, waterY)) {
        const sp = Math.floor(pt / 7);
        if (sp !== b.lastJump) {
          b.lastJump = sp;
          splash(t, root.position.x, root.position.z, 0.28);
        }
      }
      return;
    }
    if (out < HOP) {
      // climb out: a hop back up onto the deck
      const k = out / HOP;
      hopPose(p, root, spot.x, waterY, spot.z, EDGE[0], edgeY, EDGE[1], k, toSpot + Math.PI);
      if (!b.climbed) {
        b.climbed = true;
        splash(t, spot.x, spot.z, 0.22);
      }
      return;
    }
    if (out < HOP + SHAKE) {
      // shake off like a wet dog
      const k = (out - HOP) / SHAKE;
      root.position.set(EDGE[0], edgeY, EDGE[1]);
      root.rotation.y = toSpot + Math.PI;
      const w = Math.sin(k * Math.PI * 9) * (1 - k);
      p.pose.rotation.z = w * 0.22;
      p.head.rotation.y = -w * 0.5;
      p.armL.rotation.z = -0.5 - w * 0.3;
      p.armR.rotation.z = 0.5 + w * 0.3;
      return;
    }
    // walking back to shore
    const wt = out - HOP - SHAKE;
    PATH.sample(PATH.length - wt * SPEED, tmp);
    root.position.set(tmp.x, deckY(tmp.x, tmp.z), tmp.z);
    root.rotation.y = tmp.heading + Math.PI;
    root.scale.setScalar(S * ease((WALK - wt) / POP));
    walkPose(p, wt * 7 + b.phase);
  }

  return (
    <group ref={wrap} visible={false}>
      {[0, 1].map((i) => (
        <MiniBot key={i} color={visit.colors[i]} parts={parts[i]} drink={i === 0 ? visit.drink : null}>
          <mesh ref={rings[i]} geometry={RING_GEO} material={RING_MAT} visible={false} />
        </MiniBot>
      ))}
      {splashes.map((fx, i) => (
        <Splash key={i} fx={fx} />
      ))}
    </group>
  );
}

// A hop from one spot to another: arms up, a little arc, landing tilt.
function hopPose(p, root, ax, ay, az, bx, by, bz, k, heading) {
  const e = ease(k);
  root.position.set(ax + (bx - ax) * e, ay + (by - ay) * e + Math.sin(k * Math.PI) * 0.45, az + (bz - az) * e);
  root.rotation.y = heading;
  p.pose.rotation.x = 0.35 * Math.sin(k * Math.PI);
  p.armL.rotation.x = -2.6 * Math.sin(k * Math.PI);
  p.armR.rotation.x = -2.6 * Math.sin(k * Math.PI);
  p.footL.position.z = -0.06;
  p.footR.position.z = 0.06;
}

// Lounging in the floatie: leaning back, butt in the hole, feet and drink
// up, drifting in a slow circle.
function floatPose(p, root, ring, spot, t, y) {
  const dx = Math.sin(t * 0.16) * 0.05;
  const dz = Math.cos(t * 0.13) * 0.04;
  root.position.set(spot.x + dx, y + Math.sin(t * 1.3) * 0.02, spot.z + dz);
  root.rotation.y = spot.rotY + Math.sin(t * 0.09) * 0.2;
  p.pose.rotation.x = -0.75;
  p.pose.rotation.z = Math.sin(t * 0.7) * 0.04;
  p.footL.position.set(-0.08, 0.08, 0.24 + Math.sin(t * 1.6) * 0.03);
  p.footR.position.set(0.08, 0.08, 0.24 - Math.sin(t * 1.6) * 0.03);
  p.armL.rotation.z = -0.95;
  p.armL.rotation.x = -0.4;
  const cyc = (t * 0.12) % 1;
  const sip = cyc > 0.8 ? Math.sin(((cyc - 0.8) / 0.2) * Math.PI) : 0;
  p.armR.rotation.x = -0.7 - sip * 0.9;
  p.armR.rotation.z = 0.35;
  p.head.rotation.x = -0.35 - sip * 0.25;
  p.head.rotation.y = Math.sin(t * 0.3) * 0.3;
  if (ring) {
    // level on the water, at the hips
    ring.position.set(0, 0.13, 0.02);
    ring.rotation.set(0.75, 0, 0);
  }
}

// Paddling around near the steps; every 7 s a splashy jump with arms up.
// Returns true on the frame band where the jump lands (for the splash).
function paddlePose(p, root, spot, t, y) {
  const cyc = t % 7;
  const a = t * 0.55;
  root.position.set(spot.x + Math.cos(a) * 0.09, y, spot.z + Math.sin(a) * 0.08);
  root.rotation.y = -a; // swimming along the little circle
  if (cyc < 1.1) {
    // jump: up out of the water, arms high, back down with a splash
    const k = cyc / 1.1;
    root.position.y = y + Math.sin(k * Math.PI) * 0.5;
    p.armL.rotation.x = -2.8;
    p.armR.rotation.x = -2.8;
    p.armL.rotation.z = -0.3;
    p.armR.rotation.z = 0.3;
    p.head.rotation.x = -0.3;
    return k > 0.85;
  }
  // doggy paddle: leaning forward, arms churning
  p.pose.rotation.x = 0.3;
  p.pose.position.y = Math.sin(t * 3) * 0.02;
  p.armL.rotation.x = -1.3 + Math.sin(t * 6) * 0.6;
  p.armR.rotation.x = -1.3 - Math.sin(t * 6) * 0.6;
  p.head.rotation.x = -0.45;
  return false;
}
