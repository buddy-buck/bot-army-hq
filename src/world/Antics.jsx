import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { couriers } from '../components/Handoff.jsx';
import { antics, fxNow, labelState } from '../components/labels.js';
import { DECKS, groundY, islandE, siteDistance } from '../utils/paths.js';
import { aliveClock, claimSlot, releaseSlot, slotBusy, testOn } from '../wild/director.js';
import { DriftBottle } from '../wild/Easter.jsx';
import ArmWrestle from './antics/ArmWrestle.jsx';
import CameraWaves from './antics/CameraWaves.jsx';
import Arrivals from './welcome/Arrivals.jsx';
import { ANTIC_TIMES, HELP_LEN, PUSHUP_LEN, SELFIE_FLASHES } from './antics/botPose.js';
import Fishing, { FISH_SPOT } from './antics/Fishing.jsx';
import Fx, { fxBurst, fxCount } from './antics/Fx.jsx';
import Helper, { helperJob } from './antics/Helper.jsx';
import Pushups from './antics/Pushups.jsx';
import Sandcastle from './antics/Sandcastle.jsx';

// Bot personality: the antics director and the set pieces around the island.
//
// Team bots who are chillin' (idle, standing near their station with a
// drink) get up to things now and then: a high-five with a neighbor, a
// selfie (solo, with a buddy, or a group of three), a trip and faceplant
// with a buddy (or a crew bot) helping them up, or five quick push-ups.
// A courier handing over a package gets a high-five from the receiver.
// The director writes what each bot should do into `antics` (labels.js);
// Bot.jsx acts it out. Nobody leaves home for long, working and sleeping
// bots are never touched, and couriers are never interrupted.
//
// Pacing: one big antic somewhere every 20-40 s, through the shared
// 'antic' slot so only one plays at a time. Push-ups are small and can
// overlap. All of it by day only; at night the island sleeps (the fishing
// bot keeps at it by lantern light).
//
// Set pieces with the crew (MiniBot): fishing off Launch's Pier (Launch
// fishes when chillin'), arm-wrestling at the barrel, the push-up corner,
// the sandcastle builders. Plus the message bottles that drift in.
//
// Test: ?test=highfive, trip, selfie, pushups (or antics for all four),
// fishing, armwrestle, sandcastle, bottle; ?test=all for everything.

const WALK = 1.3; // Bot.jsx walking speed
const BIG = ['highfive', 'selfie', 'trip'];
const WEIGHT = { highfive: 0.42, selfie: 0.36, trip: 0.22 };

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const spot = (x, z) => ({ x, y: groundY(x, z), z });

function onDeck(x, z, m = 0.35) {
  return DECKS.some((d) => x >= d.x0 + m && x <= d.x1 - m && z >= d.z0 + m && z <= d.z1 - m);
}

// A spot a bot can stand on: level with where it came from, on land (or
// well inside a deck), not inside a landmark, not on top of another bot.
function standable(x, z, y0, skip) {
  if (Math.abs(groundY(x, z) - y0) > 0.12) return false;
  if (!onDeck(x, z) && (islandE(x, z) > 0.84 || siteDistance(x, z) < 0.25)) return false;
  for (const [id, p] of labelState.positions) {
    if (skip && skip.includes(id)) continue;
    if (Math.hypot(p.x - x, p.z - z) < 0.5) return false;
  }
  return true;
}

// Chillin' team bots standing at home, free for an antic.
function chillers(layout, extra = []) {
  const out = [];
  for (const l of Object.values(layout)) {
    if (l.mode !== 'chill' || l.home.raised || couriers.has(l.id) || antics.has(l.id) || extra.includes(l.id)) continue;
    const p = labelState.positions.get(l.id);
    if (!p || Math.hypot(p.x - l.home.x, p.z - l.home.z) > 0.08) continue;
    out.push(l);
  }
  return out;
}

export default function Antics({ ctx }) {
  return (
    <group>
      <Fx lowPower={ctx.lowPower} />
      <Director ctx={ctx} />
      <Helper />
      <Fishing ctx={ctx} />
      <ArmWrestle ctx={ctx} />
      <Pushups ctx={ctx} />
      <Sandcastle ctx={ctx} />
      <DriftBottle onNote={ctx.onNote} test={testOn('bottle')} />
      <CameraWaves ctx={ctx} />
      <Arrivals ctx={ctx} />
    </group>
  );
}

function Director({ ctx }) {
  const camera = useThree((s) => s.camera);
  const st = useRef(null);
  if (!st.current) {
    const tests = testOn('antics') ? BIG : BIG.filter((k) => testOn(k));
    st.current = {
      clock: aliveClock(),
      tests,
      testPush: testOn('pushups') || testOn('antics'),
      nextBig: tests.length ? 3 : rand(14, 24),
      nextSmall: testOn('pushups') || testOn('antics') ? 2 : rand(35, 70),
      events: [],
      active: null,
      watch: new Map(), // courier id -> { x, z, done }
    };
  }

  useFrame((_, delta) => {
    const s = st.current;
    const t = s.clock.tick(delta);
    const now = fxNow();
    const layout = ctx.layout || {};
    const day = !ctx.bedtime && (ctx.sky?.stars ?? 0) < 0.5;

    // Timed bursts (sparks, dust, counts) and delayed cues.
    if (s.events.length) {
      for (let i = s.events.length - 1; i >= 0; i--) {
        const e = s.events[i];
        if (now < e.at) continue;
        s.events.splice(i, 1);
        e.fn();
      }
    }

    // The big antic is over: give the slot back.
    if (s.active && now > s.active.end) {
      releaseSlot('antic', 'antics');
      s.active = null;
    }

    // Launch fishes off the pier while chillin' there.
    const L = layout.launch;
    const an = antics.get('launch');
    if (L && L.zone === 'dock' && L.mode === 'chill' && day && !couriers.has('launch')) {
      if (!an) antics.set('launch', { kind: 'fish', start: now, end: now + 3, goal: { x: FISH_SPOT.x, y: FISH_SPOT.y, z: FISH_SPOT.z }, faceY: FISH_SPOT.faceY });
      else if (an.kind === 'fish') an.end = now + 3;
    }

    if (!day) return;
    courierHighFives(s, layout, now);

    // Push-ups: small, any time a chillin' bot fancies it.
    if (t > s.nextSmall) {
      s.nextSmall = t + (s.testPush ? rand(5, 7) : rand(50, 95));
      startPushups(s, layout, now);
    }

    // The next big antic.
    if (!s.active && t > s.nextBig) {
      const gap = s.tests.length ? rand(5, 7) : rand(20, 40);
      if (slotBusy('antic')) {
        s.nextBig = t + 3;
        return;
      }
      const kinds = s.tests.length ? s.tests : BIG;
      // weighted shuffle, then try each until one fits
      const order = kinds.map((k) => [k, Math.random() * (WEIGHT[k] || 0.3)]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
      let plan = null;
      for (const k of order) {
        plan = k === 'highfive' ? planHighFive(layout, now) : k === 'selfie' ? planSelfie(layout, now, camera) : planTrip(layout, now);
        if (plan) break;
      }
      if (plan && claimSlot('antic', 'antics', plan.end - now + 0.5)) {
        for (const [id, entry] of plan.entries) antics.set(id, entry);
        s.events.push(...plan.events);
        s.active = { end: plan.end };
        s.nextBig = t + gap;
      } else {
        s.nextBig = t + 4; // nobody's free right now: look again soon
      }
    }
  });
  return null;
}

// --- High-five ------------------------------------------------------------------

function planHighFive(layout, now) {
  const free = chillers(layout);
  const pairs = [];
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const d = dist(free[i].home, free[j].home);
      if (d > 0.7 && d < 4.5 && Math.abs(free[i].home.y - free[j].home.y) < 0.15) pairs.push([free[i], free[j]]);
    }
  }
  while (pairs.length) {
    const [a, b] = pairs.splice(Math.floor(Math.random() * pairs.length), 1)[0];
    const d = dist(a.home, b.home);
    const ux = (b.home.x - a.home.x) / d;
    const uz = (b.home.z - a.home.z) / d;
    const mx = (a.home.x + b.home.x) / 2;
    const mz = (a.home.z + b.home.z) / 2;
    const ga = spot(mx - ux * 0.4, mz - uz * 0.4);
    const gb = spot(mx + ux * 0.4, mz + uz * 0.4);
    const skip = [a.id, b.id];
    if (!standable(ga.x, ga.z, a.home.y, skip) || !standable(gb.x, gb.z, b.home.y, skip)) continue;
    const walk = Math.max(dist(a.home, ga), dist(b.home, gb)) / WALK;
    const start = now + walk + 0.5;
    const end = start + ANTIC_TIMES.highfive + 0.1;
    const reach = dist(ga, gb) / 1.35 / 2;
    const y = Math.max(ga.y, gb.y) + 1.22;
    return {
      end,
      entries: [
        [a.id, { kind: 'highfive', start, end, goal: ga, face: gb, reach }],
        [b.id, { kind: 'highfive', start, end, goal: gb, face: ga, reach }],
      ],
      events: [{ at: start + 0.55, fn: () => fxBurst('sparks', mx, y, mz) }],
    };
  }
  return null;
}

// A courier pauses at the receiver to hand over the package: up top!
function courierHighFives(s, layout, now) {
  for (const id of s.watch.keys()) if (!couriers.has(id)) s.watch.delete(id);
  for (const [id, c] of couriers) {
    if (id === 'claude' || c.ride) continue;
    let w = s.watch.get(id);
    if (!w) {
      w = { x: c.x, z: c.z, done: false };
      s.watch.set(id, w);
      continue;
    }
    const still = Math.hypot(c.x - w.x, c.z - w.z) < 0.001;
    w.x = c.x;
    w.z = c.z;
    if (!still || w.done) continue;
    w.done = true;
    if (antics.has(id)) continue;
    // the receiver: the nearest standing bot right here
    let best = null;
    let bestD = 1.9;
    for (const l of Object.values(layout)) {
      if (l.id === id || couriers.has(l.id) || antics.has(l.id) || l.home.raised) continue;
      if (l.mode !== 'chill' && l.mode !== 'station') continue;
      const p = labelState.positions.get(l.id);
      if (!p) continue;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < bestD) {
        bestD = d;
        best = { id: l.id, x: p.x, y: p.y, z: p.z };
      }
    }
    if (!best || bestD < 0.4) continue;
    const start = now + 0.25;
    const end = start + 1.45;
    const reach = Math.min(0.5, bestD / 1.35 / 2);
    antics.set(id, { kind: 'highfive', courier: true, start, end, face: { x: best.x, z: best.z }, reach });
    antics.set(best.id, { kind: 'highfive', courier: true, start, end, face: { x: c.x, z: c.z }, reach });
    const mx = (best.x + c.x) / 2;
    const mz = (best.z + c.z) / 2;
    const my = Math.max(best.y, c.y) + 1.22;
    s.events.push({ at: start + 0.55, fn: () => fxBurst('sparks', mx, my, mz) });
  }
}

// --- Selfie -----------------------------------------------------------------------

function planSelfie(layout, now, camera) {
  const free = chillers(layout);
  if (!free.length) return null;
  const h = pick(free);
  const f = Math.atan2(camera.position.x - h.home.x, camera.position.z - h.home.z); // face the viewer
  const lat = { x: Math.cos(f), z: -Math.sin(f) }; // the holder's local +x
  const near = free.filter((l) => l.id !== h.id && dist(l.home, h.home) < 3.5).sort((a, b) => dist(a.home, h.home) - dist(b.home, h.home));
  const want = near.length >= 2 && Math.random() < 0.35 ? 2 : near.length >= 1 && Math.random() < 0.75 ? 1 : 0;
  const slots = [
    { side: -1, g: spot(h.home.x + lat.x * 0.62, h.home.z + lat.z * 0.62) },
    { side: 1, g: spot(h.home.x - lat.x * 0.62, h.home.z - lat.z * 0.62) },
  ];
  const posers = [];
  for (const l of near) {
    if (posers.length >= want) break;
    const open = slots.filter((sl) => !sl.taken && standable(sl.g.x, sl.g.z, h.home.y, [h.id, l.id])).sort((a, b) => dist(l.home, a.g) - dist(l.home, b.g));
    if (!open.length) continue;
    open[0].taken = true;
    posers.push({ l, slot: open[0] });
  }
  const walk = posers.reduce((m, p) => Math.max(m, dist(p.l.home, p.slot.g) / WALK), 0);
  const start = now + walk + 0.6;
  const end = start + ANTIC_TIMES.selfie;
  const entries = [[h.id, { kind: 'selfie', role: 'phone', side: 0, start, end, faceY: f }]];
  for (const p of posers) entries.push([p.l.id, { kind: 'selfie', role: 'pose', side: p.slot.side, start, end, faceY: f, goal: p.slot.g }]);
  // a little sparkle at the phone for each flash
  const px = h.home.x + Math.sin(f) * 0.68 - lat.x * 0.2;
  const pz = h.home.z + Math.cos(f) * 0.68 - lat.z * 0.2;
  const py = h.home.y + 1.42;
  const events = SELFIE_FLASHES.map((at) => ({ at: start + at, fn: () => fxBurst('glint', px, py, pz) }));
  return { end, entries, events };
}

// --- Trip and help --------------------------------------------------------------

function planTrip(layout, now) {
  const free = chillers(layout);
  while (free.length) {
    const f = free.splice(Math.floor(Math.random() * free.length), 1)[0];
    const h = f.home;
    let plan = null;
    for (const off of [0, 0.7, -0.7, 1.4, -1.4, Math.PI]) {
      const dir = (h.rotY || 0) + off;
      const fx = Math.sin(dir);
      const fz = Math.cos(dir);
      const goal = spot(h.x + fx * 0.5, h.z + fz * 0.5);
      const head = { x: goal.x + fx * 1.0, z: goal.z + fz * 1.0 };
      const hs = spot(goal.x + fx * 1.55, goal.z + fz * 1.55);
      const skip = [f.id];
      if (!standable(goal.x, goal.z, h.y, skip) || !standable(head.x, head.z, h.y, skip) || !standable(hs.x, hs.z, h.y, skip)) continue;
      plan = { dir, fx, fz, goal, head, hs };
      break;
    }
    if (!plan) continue;
    const { dir, fx, fz, goal, head, hs } = plan;
    // who helps: the nearest free teammate, or a crew bot jogging over
    const buddies = free.filter((l) => Math.abs(l.home.y - h.y) < 0.15 && dist(l.home, hs) < 5.5).sort((a, b) => dist(a.home, hs) - dist(b.home, hs));
    const buddy = buddies[0] || null;
    let from = null;
    if (!buddy) {
      if (helperJob.active) continue;
      for (const [sx, sz] of [
        [-fz, fx],
        [fz, -fx],
        [fx, fz],
      ]) {
        const c = { x: hs.x + sx * 3.6, z: hs.z + sz * 3.6 };
        if (islandE(c.x, c.z) < 0.84 || onDeck(c.x, c.z)) {
          from = c;
          break;
        }
      }
      if (!from) continue;
    }
    const react = 1.1;
    const walkH = (buddy ? dist(buddy.home, hs) : dist(from, hs)) / WALK;
    const tPull = Math.max(2.8, react + walkH + 0.9);
    const start = now + 0.5 / WALK + 0.35;
    const end = start + tPull + 2.7;
    const entries = [[f.id, { kind: 'trip', start, end, goal, faceY: dir, tPull }]];
    const events = [
      { at: start + 0.66, fn: () => fxBurst('dust', head.x, groundY(head.x, head.z), head.z) },
      { at: start + 0.95, fn: () => fxBurst('dizzy', head.x, groundY(head.x, head.z) + 0.55, head.z, { life: Math.max(1.2, tPull - 1.1) }) },
      { at: start + tPull + 0.35, fn: () => fxBurst('dust', goal.x + fx * 0.5, goal.y, goal.z + fz * 0.5, { color: '#f2e2c4' }) },
    ];
    if (buddy) {
      // the buddy notices a beat later and walks over
      events.push({
        at: start + react,
        fn: () => {
          if (antics.has(buddy.id) || couriers.has(buddy.id)) return;
          antics.set(buddy.id, { kind: 'help', start: start + tPull, end: start + tPull + HELP_LEN, goal: hs, face: goal });
        },
      });
    } else {
      Object.assign(helperJob, { active: true, from, to: { x: hs.x, z: hs.z }, face: { x: goal.x, z: goal.z }, go: start + react, pull: start + tPull });
    }
    return { end: buddy ? end : Math.max(end, start + tPull + HELP_LEN + walkH + 0.5), entries, events };
  }
  return null;
}

// --- Push-ups ---------------------------------------------------------------------

function startPushups(s, layout, now) {
  const free = chillers(layout);
  while (free.length) {
    const l = free.splice(Math.floor(Math.random() * free.length), 1)[0];
    const h = l.home;
    const dir = h.rotY || 0;
    const fx = Math.sin(dir);
    const fz = Math.cos(dir);
    if (!standable(h.x + fx * 0.9, h.z + fz * 0.9, h.y, [l.id])) continue;
    const start = now + 0.3;
    antics.set(l.id, { kind: 'pushups', start, end: start + PUSHUP_LEN, faceY: dir });
    const P = ANTIC_TIMES.pushups;
    for (let i = 0; i < P.reps; i++) {
      const n = i + 1;
      s.events.push({ at: start + P.drop + P.rep * (i + 0.5), fn: () => fxCount(n, h.x + fx * 0.55, h.y + 0.75, h.z + fz * 0.55, n === P.reps ? '#ffd23f' : '#ffffff') });
    }
    s.events.push({ at: start + P.drop + P.rep * P.reps + 0.4, fn: () => fxBurst('sparks', h.x, h.y + 1.5, h.z) });
    return;
  }
}
