import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { aliveClock, claimTravel, releaseTravel, testOn } from '../../wild/director.js';
import { CAMPFIRE, PALMS, ZONES, groundY, islandE, siteDistance } from '../../utils/paths.js';
import MiniBot, { CREW_COLORS } from '../MiniBot.jsx';
import { canvasTexture, resetBot, walkPose } from '../life/common.jsx';
import { GLOW_TEX, clamp01, isDaytime, pick, rand, smooth, std } from './common.js';

// Supply drop: now and then by day a little cargo plane crosses high over
// the island and drops a BYOB crate on a red-and-white striped parachute. It
// sways down onto open sand or grass, lands with a dust puff, the chute
// collapses, and a few crew bots run over, pry the lid off (confetti!) and
// find something fun inside (a new laptop, a surfboard or a glowing bot
// part). They celebrate, one carries the prize off, and everything tidies
// itself away. About 40 seconds in all.
//
// Every 5-9 minutes of daytime viewing, never at bedtime. The plane takes
// the travel slot; if the sky is busy it waits, and after a few tries the
// crate just appears high up without a plane. ?test=drop: right away and
// every ~50 seconds.

const OWNER = 'supplydrop';
const PLANE_Y = 16.5;
const PLANE_SPEED = 8;
const T_RELEASE = 5; // plane is over the spot
const T_LAND = 15;
const T_CREW = 15.6;
const T_PRY = 20.6;
const T_POP = 23.8;
const T_CARRY = 30.5;
const T_LEAVE = 32;
const T_END = 39.5;
const CRATE = 0.66; // crate size
const HANG = 1.9; // chute rim above the crate center

// Landing spots: open sand or grass, clear of landmarks, zones, palms and the
// campfire circle. Checked once at load.
const LANDING = (() => {
  const candidates = [[-1.0, -12.0], [-2.0, -9.0], [-3.0, 5.6], [6.5, 4.6], [-6.5, -0.6], [9.0, 1.6], [0.0, -10.5], [-4.0, -6.0]];
  const ok = ([x, z]) =>
    siteDistance(x, z) > 1.2 &&
    islandE(x, z) < 0.8 &&
    Object.values(ZONES).every((zn) => Math.hypot(x - zn.x, z - zn.z) > 3.2) &&
    PALMS.every((p) => Math.hypot(p.x - x, p.z - z) > 1.3) &&
    Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z) > 4.6 &&
    Math.hypot(x, z) > 5;
  const list = candidates.filter(ok);
  return (list.length ? list : candidates.slice(0, 1)).map(([x, z]) => ({ x, z }));
})();

// Where the crew run in from: a few units out, on the island, with a clear
// straight line to the crate.
function approaches(spot, n) {
  const out = [];
  const base = rand(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = base + (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
    let found = null;
    for (const r of [6.5, 5.5, 4.5, 3.5]) {
      const x = spot.x + Math.sin(a) * r;
      const z = spot.z + Math.cos(a) * r;
      if (islandE(x, z) > 0.82) continue;
      let clear = true;
      for (let k = 0; k <= 4 && clear; k++) {
        const f = k / 4;
        if (siteDistance(spot.x + (x - spot.x) * f, spot.z + (z - spot.z) * f) < 0.25) clear = false;
      }
      if (clear) {
        found = { x, z };
        break;
      }
    }
    out.push(found || { x: spot.x + Math.sin(a) * 3, z: spot.z + Math.cos(a) * 3 });
  }
  return out;
}

// --- shapes ------------------------------------------------------------------

const M = {
  wood: std('#b07a45'),
  plank: std('#8a5a30'),
  body: std('#e9a23b'),
  trim: std('#2c3e55'),
  window: std('#bfe6ff', { emissive: '#5aa8d8', emissiveIntensity: 0.25 }),
  prop: std('#3a3f48', { metalness: 0.4, roughness: 0.4 }),
  shadow: new THREE.MeshBasicMaterial({ color: '#13261b', transparent: true, opacity: 0.2, depthWrite: false }),
  rope: new THREE.LineBasicMaterial({ color: '#f2efe6' }),
  laptop: std('#c9ced4', { metalness: 0.4, roughness: 0.35 }),
  board: std('#2ec4c8'),
  boardStripe: std('#ffde69'),
  part: std('#3a3f48', { metalness: 0.5, roughness: 0.35 }),
};

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  ball: new THREE.IcosahedronGeometry(1, 1),
  disc: new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2),
  label: new THREE.PlaneGeometry(1, 1),
  nose: new THREE.ConeGeometry(0.24, 0.5, 6).rotateZ(-Math.PI / 2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 6),
};

// Striped canopy: alternating red and white gores.
const CHUTE = (() => {
  const prof = [[0.02, 0.66], [0.4, 0.62], [0.72, 0.46], [0.92, 0.2], [0.98, 0.0]].map(([r, y]) => new THREE.Vector2(r, y));
  const gores = 10;
  const g = new THREE.LatheGeometry(prof, gores).toNonIndexed();
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const red = new THREE.Color('#e5333d');
  const white = new THREE.Color('#fbf7ef');
  for (let i = 0; i < pos.count; i += 3) {
    let x = 0;
    let z = 0;
    for (let k = 0; k < 3; k++) {
      x += pos.getX(i + k);
      z += pos.getZ(i + k);
    }
    const ang = (Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2);
    const c = Math.floor((ang / (Math.PI * 2)) * gores) % 2 ? red : white;
    for (let k = 0; k < 3; k++) c.toArray(cols, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
})();
const M_CHUTE = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, side: THREE.DoubleSide });
const LINES = (() => {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    pts.push(Math.sin(a) * 0.95, 0, Math.cos(a) * 0.95, 0, -HANG + CRATE / 2, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
})();

// BYOB stencil for the crate sides.
function labelMaterial() {
  const map = canvasTexture('byob-crate', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,24,10,0.85)';
    g.lineWidth = 6;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = 'rgba(40,24,10,0.9)';
    g.font = 'bold 40px "Arial Black", Impact, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('BYOB', w / 2, h / 2 - 4);
    g.font = 'bold 13px Arial, sans-serif';
    g.fillText('BOT PARTS', w / 2, h / 2 + 30);
  });
  return new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
}

const CONFETTI_N = 56;
const CONFETTI_GEO = new THREE.PlaneGeometry(0.07, 0.11);
const CONFETTI_COLORS = ['#ff5d8f', '#ffd23f', '#2ec4c8', '#9b7bff', '#5fd16b', '#ff8a2b', '#ffffff'].map((c) => new THREE.Color(c));
const DUST_N = 9;

// --- the scheduler -----------------------------------------------------------

export default function SupplyDrop({ ctx }) {
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const test = testOn('drop');
  const clock = useMemo(aliveClock, []);
  const [run, setRun] = useState(null);
  const S = useRef({ next: test ? 3 : rand(300, 540), tries: 0, busy: false });

  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const s = S.current;
    if (s.busy || t < s.next) return;
    const c = ctxRef.current;
    if (!test && (c.bedtime || !isDaytime(c.sky))) {
      s.next = t + 30;
      return;
    }
    const plane = claimTravel(OWNER, 12);
    if (!plane && s.tries < 4) {
      s.tries += 1;
      s.next = t + 6;
      return;
    }
    s.tries = 0;
    s.busy = true;
    const spot = pick(LANDING);
    const n = c.lowPower ? 3 : Math.random() < 0.5 ? 3 : 4;
    const colors = [...CREW_COLORS].sort(() => Math.random() - 0.5).slice(0, n);
    setRun({ id: t, spot, plane, dir: Math.random() < 0.5 ? 1 : -1, crew: colors, starts: approaches(spot, n), item: pick(['laptop', 'surfboard', 'part']) });
  });

  useEffect(() => () => releaseTravel(OWNER), []);

  if (!run) return null;
  return (
    <DropRun
      key={run.id}
      run={run}
      ctxRef={ctxRef}
      onDone={() => {
        releaseTravel(OWNER);
        S.current.busy = false;
        S.current.next = clock.t + (test ? 50 : rand(300, 540));
        setRun(null);
      }}
    />
  );
}

// --- one drop ----------------------------------------------------------------

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

function DropRun({ run, ctxRef, onDone }) {
  const { spot, crew, starts, dir } = run;
  const gy = useMemo(() => groundY(spot.x, spot.z), [spot]);
  const clock = useMemo(aliveClock, []);
  const plane = useRef();
  const prop = useRef();
  const chute = useRef();
  const lines = useRef();
  const crate = useRef();
  const lid = useRef();
  const shadow = useRef();
  const item = useRef();
  const itemGlow = useRef();
  const dust = useRef();
  const confetti = useRef();
  const crewGroup = useRef();
  const parts = useMemo(() => crew.map(() => ({ current: {} })), [crew]);

  const mats = useMemo(
    () => ({
      label: labelMaterial(),
      dust: new THREE.MeshBasicMaterial({ color: '#f1e3c2', transparent: true, opacity: 0, depthWrite: false }),
      confetti: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 1, depthWrite: false }),
      glow: new THREE.SpriteMaterial({ map: GLOW_TEX, color: '#ffe9a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      screen: new THREE.MeshStandardMaterial({ color: '#3fa0ff', emissive: '#59b8ff', emissiveIntensity: 0.9, flatShading: true }),
      bulb: new THREE.MeshStandardMaterial({ color: '#ffe36a', emissive: '#ffd23f', emissiveIntensity: 1.2, flatShading: true }),
    }),
    []
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // Per-drop random bits, set once.
  const D = useMemo(() => {
    const conf = [];
    for (let i = 0; i < CONFETTI_N; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.6, 2.0);
      conf.push({ vx: Math.cos(a) * sp, vy: rand(3.2, 5.4), vz: Math.sin(a) * sp, rx: rand(0, 6), ry: rand(0, 6), sx: rand(4, 10), sy: rand(4, 10) });
    }
    const dustP = [];
    for (let i = 0; i < DUST_N; i++) dustP.push({ a: (i / DUST_N) * Math.PI * 2 + rand(-0.2, 0.2), s: rand(0.18, 0.3) });
    const slots = crew.map((_, i) => {
      const a = Math.PI / crew.length + (i / crew.length) * Math.PI * 2;
      return { x: spot.x + Math.sin(a) * 0.85, z: spot.z + Math.cos(a) * 0.85 };
    });
    // Arrival times: run in at ~1.7 units/second, a little staggered.
    const legs = starts.map((s, i) => {
      const d = Math.hypot(slots[i].x - s.x, slots[i].z - s.z);
      return { d, t0: T_CREW + i * 0.25, dur: d / 1.7 };
    });
    return { conf, dustP, slots, legs, lidV: { x: rand(-0.8, 0.8), z: rand(0.4, 1.0) }, sway: rand(0, 6) };
  }, [crew, spot, starts]);

  // Confetti colors, once.
  useEffect(() => {
    const c = confetti.current;
    if (!c) return;
    for (let i = 0; i < CONFETTI_N; i++) c.setColorAt(i, CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
  }, []);

  const st = useRef({ landed: false, popped: false, done: false, released: false, lid: null });

  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const s = st.current;
    if (s.done) return;
    if (t > T_END) {
      s.done = true;
      onDone();
      return;
    }

    // --- the plane ---
    const pl = plane.current;
    if (pl) {
      pl.visible = run.plane && t < 10.5;
      if (pl.visible) {
        const x = spot.x + dir * (t - T_RELEASE) * PLANE_SPEED;
        pl.position.set(x, PLANE_Y + Math.sin(t * 0.8) * 0.15, spot.z);
        pl.rotation.set(Math.sin(t * 1.1) * 0.05, dir > 0 ? 0 : Math.PI, 0);
        if (prop.current) prop.current.rotation.x = t * 40;
      }
    }
    if (!s.released && t > 10.5) {
      s.released = true;
      releaseTravel(OWNER);
    }

    // --- falling crate on its chute ---
    const cr = crate.current;
    const ch = chute.current;
    if (!cr || !ch) return;
    const yLand = gy + CRATE / 2;
    let cx = spot.x;
    let cy = yLand;
    let cz = spot.z;
    let sway = 0;
    if (t < T_RELEASE) {
      cr.visible = false;
      ch.visible = false;
    } else if (t < T_LAND) {
      const u = (t - T_RELEASE) / (T_LAND - T_RELEASE);
      const top = PLANE_Y - 0.6;
      cy = top - (top - yLand) * (0.15 * smooth(0, 1, Math.min(1, u * 6)) + 0.85 * u);
      const drift = 1 - smooth(0, 1, Math.min(1, u * 1.6));
      cx = spot.x - dir * 2.2 * drift;
      cz = spot.z + Math.sin(t * 0.7 + D.sway) * 0.25 * (1 - u);
      sway = Math.sin(t * 1.5 + D.sway) * (0.28 * (1 - u) + 0.05) * Math.min(1, (t - T_RELEASE) * 2);
      cr.visible = true;
      ch.visible = true;
      // pop in out of the plane's hold
      cr.scale.setScalar(CRATE * Math.min(1, (t - T_RELEASE) * 3 + 0.2));
      const open = smooth(0, 1, (t - T_RELEASE - 0.35) / 0.7);
      ch.scale.set(Math.max(0.01, open), Math.max(0.01, 0.3 + 0.7 * open), Math.max(0.01, open));
      ch.position.set(cx - Math.sin(sway) * HANG, cy + Math.cos(sway) * HANG, cz);
      ch.rotation.set(0, 0, sway);
      if (lines.current) lines.current.visible = open > 0.3;
    } else {
      // landed: the chute sags over to one side, flattens and melts away
      const k = smooth(0, 1, (t - T_LAND) / 2.2);
      const gone = smooth(0, 1, (t - T_LAND - 2.6) / 1.8);
      ch.visible = gone < 1;
      if (lines.current) lines.current.visible = k < 0.4;
      ch.position.set(spot.x + dir * 0.9 * k, yLand + HANG * (1 - k) + (gy + 0.15 - yLand) * k, spot.z - 0.2 * k);
      ch.rotation.set(0, 0, -dir * 1.35 * k);
      const sq = 1 - gone;
      ch.scale.set(Math.max(0.01, (1 + 0.15 * k) * sq), Math.max(0.01, (1 - 0.75 * k) * sq), Math.max(0.01, (1 + 0.15 * k) * sq));
      cr.scale.setScalar(CRATE);
    }

    // landing
    if (!s.landed && t >= T_LAND) {
      s.landed = true;
      ctxRef.current.onToast?.('Supply drop! New bot parts just landed.');
    }

    // crate shake while being pried, shrink away at the end
    let shake = 0;
    if (t > T_PRY && t < T_POP) shake = 0.04 + 0.08 * ((t - T_PRY) / (T_POP - T_PRY));
    const tidy = smooth(0, 1, (t - (T_LEAVE + 1.5)) / 2.5);
    const landBounce = t > T_LAND && t < T_LAND + 0.5 ? Math.sin(((t - T_LAND) / 0.5) * Math.PI) * 0.08 : 0;
    cr.position.set(cx + (shake ? Math.sin(t * 47) * shake * 0.4 : 0), cy + landBounce - tidy * CRATE * 0.5, cz);
    cr.rotation.set(shake ? Math.sin(t * 31) * shake : 0, 0.4, sway + (shake ? Math.sin(t * 53) * shake * 0.5 : 0));
    if (tidy > 0) cr.scale.setScalar(Math.max(0.001, CRATE * (1 - tidy)));
    cr.visible = t >= T_RELEASE && tidy < 1;

    // shadow on the ground under the falling crate
    const sh = shadow.current;
    if (sh) {
      sh.visible = t > T_RELEASE && tidy < 1;
      const h = cy - yLand;
      const r = (0.55 + h * 0.03) * (1 - tidy);
      sh.position.set(cx, gy + 0.03, cz);
      sh.scale.set(r, 1, r);
      M.shadow.opacity = 0.22 * clamp01(1 - h / 16) + 0.03;
    }

    // --- lid ---
    const ld = lid.current;
    if (ld) {
      if (!s.popped && t >= T_POP) {
        s.popped = true;
        s.lid = { x: spot.x, y: yLand + CRATE / 2 + 0.04, z: spot.z, vx: D.lidV.x, vy: 3.6, vz: D.lidV.z, rx: 0, rz: 0 };
      }
      if (!s.popped) {
        // the lid rides on the crate (a child would inherit the shrink, so
        // it's placed by hand)
        ld.position.set(cr.position.x, cr.position.y + CRATE / 2 + 0.03, cr.position.z);
        ld.rotation.copy(cr.rotation);
        if (t > T_PRY) ld.position.y += Math.max(0, Math.sin(t * 23)) * 0.04;
        ld.visible = cr.visible;
        ld.scale.set(CRATE * 1.06, 0.07, CRATE * 1.06);
      } else {
        const L = s.lid;
        const dt = Math.min(delta, 0.05);
        const floor = groundY(L.x, L.z) + 0.04;
        if (L.y > floor || L.vy > 0) {
          L.vy -= 9 * dt;
          L.x += L.vx * dt;
          L.z += L.vz * dt;
          L.y += L.vy * dt;
          L.rx += 7 * dt;
          L.rz += 4 * dt * Math.sign(L.vx || 1);
          if (L.y <= floor) {
            L.y = floor;
            L.vy = 0;
            L.rx = 0;
            L.rz = 0;
          }
        }
        ld.position.set(L.x, L.y - tidy * 0.1, L.z);
        ld.rotation.set(L.rx, 0.4, L.rz);
        ld.visible = tidy < 1;
        ld.scale.set(CRATE * 1.06 * (1 - tidy) + 0.001, 0.07, CRATE * 1.06 * (1 - tidy) + 0.001);
      }
    }

    // --- dust puff on landing ---
    const du = dust.current;
    if (du) {
      const k = (t - T_LAND) / 1.6;
      du.visible = k > 0 && k < 1;
      if (du.visible) {
        const e = 1 - (1 - k) ** 2;
        D.dustP.forEach((p, i) => {
          const r = 0.4 + e * 1.0;
          _v.set(spot.x + Math.sin(p.a) * r, gy + 0.12 + e * 0.25, spot.z + Math.cos(p.a) * r);
          _s.setScalar(p.s * (0.8 + e * 1.4));
          du.setMatrixAt(i, _m.compose(_v, _q.identity(), _s));
        });
        du.instanceMatrix.needsUpdate = true;
        mats.dust.opacity = 0.75 * (1 - k);
      }
    }

    // --- confetti ---
    const cf = confetti.current;
    if (cf) {
      const k = t - T_POP;
      cf.visible = k > 0 && k < 4.5;
      if (cf.visible) {
        D.conf.forEach((c, i) => {
          // up and out, then a slow flutter down
          const up = Math.min(k, 0.6);
          const fall = Math.max(0, k - 0.6);
          const x = spot.x + c.vx * (up + fall * 0.3);
          const z = spot.z + c.vz * (up + fall * 0.3);
          const y = yLand + CRATE / 2 + c.vy * up - 4.5 * up * up - fall * 0.55;
          _v.set(x + Math.sin(k * 3 + i) * 0.08, Math.max(gy + 0.04, y), z);
          _e.set(c.rx + k * c.sx, c.ry + k * c.sy, 0);
          _s.setScalar(1);
          cf.setMatrixAt(i, _m.compose(_v, _q.setFromEuler(_e), _s));
        });
        cf.instanceMatrix.needsUpdate = true;
        mats.confetti.opacity = clamp01((4.5 - k) / 1.2);
      }
    }

    // --- the prize ---
    const it = item.current;
    if (it) {
      it.visible = t > T_POP && t < T_END - 0.7;
      if (it.visible) {
        const rise = smooth(0, 1, (t - T_POP) / 1.4);
        let x = spot.x;
        let y = yLand + CRATE * 0.2 + rise * 1.0 + Math.sin(t * 2.2) * 0.06;
        let z = spot.z;
        // one bot hoists it overhead and carries it off
        const p0 = parts[0].current;
        if (t > T_CARRY && p0.root) {
          const k = smooth(0, 1, (t - T_CARRY) / 1.0);
          const bx = p0.root.position.x;
          const bz = p0.root.position.z;
          const by = p0.root.position.y + 1.3 * p0.root.scale.x + (p0.pose ? p0.pose.position.y * p0.root.scale.x : 0);
          x += (bx - x) * k;
          y += (by - y) * k;
          z += (bz - z) * k;
        }
        const shrink = 1 - smooth(0, 1, (t - (T_END - 1.4)) / 0.7);
        it.position.set(x, y, z);
        it.rotation.y = t * (t > T_CARRY ? 0.6 : 1.6);
        it.scale.setScalar(Math.max(0.001, (0.3 + 0.7 * rise) * shrink));
        mats.glow.opacity = (t < T_CARRY + 1 ? 0.85 : 0.35) * rise * shrink;
        if (itemGlow.current) itemGlow.current.scale.setScalar(1.6 + Math.sin(t * 5) * 0.15);
        mats.bulb.emissiveIntensity = 1 + Math.sin(t * 6) * 0.4;
      }
    }

    // --- the crew ---
    if (crewGroup.current) crewGroup.current.visible = t > T_CREW - 0.1;
    crew.forEach((_, i) => {
      const p = parts[i].current;
      if (!resetBot(p)) return;
      const root = p.root;
      const leg = D.legs[i];
      const from = starts[i];
      const slot = D.slots[i];
      const faceCrate = Math.atan2(spot.x - slot.x, spot.z - slot.z);
      if (t < leg.t0) {
        root.visible = false;
        return;
      }
      root.visible = true;
      let x;
      let z;
      let heading;
      let scale = 1;
      const k = (t - leg.t0) / leg.dur;
      if (k < 1) {
        // running in
        x = from.x + (slot.x - from.x) * k;
        z = from.z + (slot.z - from.z) * k;
        heading = Math.atan2(slot.x - from.x, slot.z - from.z);
        walkPose(p, k * leg.d * 7.5);
        p.pose.rotation.x = 0.12;
        scale = Math.min(1, (t - leg.t0) / 0.35);
      } else if (t < T_LEAVE + i * 0.3) {
        x = slot.x;
        z = slot.z;
        heading = faceCrate;
        if (t < T_PRY) {
          // waiting, bouncing a little with excitement
          p.pose.position.y = Math.abs(Math.sin(t * 6 + i)) * 0.04;
          p.head.rotation.x = 0.15;
        } else if (t < T_POP) {
          // prying: lean in, arms on the lid, tugging
          const tug = Math.sin(t * 9 + i * 1.3);
          p.pose.rotation.x = 0.35 + tug * 0.08;
          p.armL.rotation.x = -1.25 + tug * 0.2;
          p.armR.rotation.x = -1.25 - tug * 0.2;
          p.head.rotation.x = 0.3;
        } else if (t < T_POP + 0.5) {
          // whoa! jump back
          const b = (t - T_POP) / 0.5;
          p.pose.rotation.x = -0.35 * Math.sin(b * Math.PI);
          p.pose.position.y = Math.sin(b * Math.PI) * 0.12;
          p.armL.rotation.z = -0.9 * Math.sin(b * Math.PI);
          p.armR.rotation.z = 0.9 * Math.sin(b * Math.PI);
        } else {
          // celebrate: hops, arms up, a happy spin now and then
          const c = t - T_POP;
          const hop = Math.abs(Math.sin(c * 5.5 + i * 0.9));
          p.pose.position.y = hop * 0.16;
          p.armL.rotation.z = -2.5 + Math.sin(c * 11 + i) * 0.3;
          p.armR.rotation.z = 2.5 - Math.sin(c * 11 + i) * 0.3;
          p.head.rotation.x = -0.25;
          if (i % 2 === 1 && c > 2 && c < 3) heading += (c - 2) * Math.PI * 2;
          // the carrier raises both hands to take the prize
          if (i === 0 && t > T_CARRY) {
            p.pose.position.y *= 0.3;
            p.armL.rotation.z = -2.9;
            p.armR.rotation.z = 2.9;
          }
        }
      } else {
        // wander off the way they came, shrinking away at the end
        const t1 = T_LEAVE + i * 0.3;
        const dur = Math.max(1.5, T_END - 0.4 - t1);
        const w = Math.min(1, (t - t1) / dur);
        const walk = w * leg.d * 0.75; // a slower, contented stroll
        const f = walk / leg.d;
        x = slot.x + (from.x - slot.x) * f;
        z = slot.z + (from.z - slot.z) * f;
        heading = Math.atan2(from.x - slot.x, from.z - slot.z);
        walkPose(p, walk * 7.5, i !== 0);
        if (i === 0) {
          p.armL.rotation.z = -2.9;
          p.armR.rotation.z = 2.9;
        }
        scale = 1 - smooth(0, 1, (w - 0.82) / 0.18);
      }
      root.position.set(x, groundY(x, z), z);
      root.rotation.y = heading;
      root.scale.setScalar(Math.max(0.001, 1.35 * scale));
    });
  });

  const kind = run.item;
  return (
    <group>
      {/* cargo plane, nose along +x */}
      <group ref={plane} visible={false}>
        <mesh geometry={G.box} material={M.body} scale={[2.2, 0.48, 0.5]} />
        <mesh geometry={G.nose} material={M.body} position={[1.33, 0, 0]} />
        <mesh geometry={G.box} material={M.trim} scale={[0.5, 0.06, 3.4]} position={[0.2, 0.2, 0]} />
        <mesh geometry={G.box} material={M.trim} scale={[0.36, 0.5, 0.06]} position={[-0.95, 0.42, 0]} />
        <mesh geometry={G.box} material={M.trim} scale={[0.32, 0.05, 1.2]} position={[-0.98, 0.15, 0]} />
        <mesh geometry={G.box} material={M.window} scale={[0.3, 0.16, 0.52]} position={[0.85, 0.12, 0]} />
        <mesh geometry={G.box} material={M.trim} scale={[1.3, 0.08, 0.52]} position={[0, -0.05, 0]} />
        <group ref={prop} position={[1.6, 0, 0]}>
          <mesh geometry={G.box} material={M.prop} scale={[0.04, 0.95, 0.09]} />
        </group>
      </group>

      {/* parachute and its lines */}
      <group ref={chute} visible={false}>
        <mesh geometry={CHUTE} material={M_CHUTE} />
        <lineSegments ref={lines} geometry={LINES} material={M.rope} />
      </group>

      {/* the BYOB crate (unit box scaled to CRATE) */}
      <group ref={crate} visible={false}>
        <mesh geometry={G.box} material={M.wood} />
        {/* plank bands and corner posts */}
        <mesh geometry={G.box} material={M.plank} scale={[1.04, 0.12, 1.04]} position={[0, 0.3, 0]} />
        <mesh geometry={G.box} material={M.plank} scale={[1.04, 0.12, 1.04]} position={[0, -0.3, 0]} />
        {[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz], k) => (
          <mesh key={k} geometry={G.box} material={M.plank} scale={[0.12, 1.02, 0.12]} position={[sx * 0.47, 0, sz * 0.47]} />
        ))}
        {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((r, k) => (
          <mesh key={k} geometry={G.label} material={mats.label} rotation={[0, r, 0]} position={[Math.sin(r) * 0.521, 0, Math.cos(r) * 0.521]} scale={0.7} />
        ))}
      </group>
      <mesh ref={lid} geometry={G.box} material={M.plank} visible={false} />
      <mesh ref={shadow} geometry={G.disc} material={M.shadow} visible={false} />

      <instancedMesh ref={dust} args={[G.ball, mats.dust, DUST_N]} visible={false} frustumCulled={false} />
      <instancedMesh ref={confetti} args={[CONFETTI_GEO, mats.confetti, CONFETTI_N]} visible={false} frustumCulled={false} />

      {/* the prize */}
      <group ref={item} visible={false}>
        <sprite ref={itemGlow} material={mats.glow} />
        {kind === 'laptop' && (
          <group rotation={[0, 0, 0]}>
            <mesh geometry={G.box} material={M.laptop} scale={[0.56, 0.035, 0.4]} />
            <group position={[0, 0.02, -0.2]} rotation={[-0.35, 0, 0]}>
              <mesh geometry={G.box} material={M.laptop} scale={[0.56, 0.38, 0.03]} position={[0, 0.19, 0]} />
              <mesh geometry={G.box} material={mats.screen} scale={[0.5, 0.32, 0.01]} position={[0, 0.19, 0.017]} />
            </group>
          </group>
        )}
        {kind === 'surfboard' && (
          <group rotation={[0, 0, 0.15]}>
            <mesh geometry={G.ball} material={M.board} scale={[0.17, 0.62, 0.05]} />
            <mesh geometry={G.box} material={M.boardStripe} scale={[0.04, 1.0, 0.105]} />
          </group>
        )}
        {kind === 'part' && (
          <group>
            <mesh geometry={G.cyl} material={M.part} scale={[0.04, 0.45, 0.04]} position={[0, -0.1, 0]} />
            <mesh geometry={G.cyl} material={M.part} scale={[0.14, 0.08, 0.14]} position={[0, -0.34, 0]} />
            <mesh geometry={G.ball} material={mats.bulb} scale={0.17} position={[0, 0.2, 0]} />
          </group>
        )}
      </group>

      <group ref={crewGroup} visible={false}>
        {crew.map((color, i) => (
          <MiniBot key={i} color={color} parts={parts[i]} position={[starts[i].x, groundY(starts[i].x, starts[i].z), starts[i].z]} />
        ))}
      </group>
    </group>
  );
}
