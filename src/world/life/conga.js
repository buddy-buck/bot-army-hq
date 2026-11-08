import { HUB_RADIUS, ZONES, groundY, hubPoint, zonePathCurve } from '../../utils/paths.js';
import { fxNow } from '../../components/labels.js';
import { onSpotifyTrack } from '../../utils/spotify.js';
import { testOn } from '../../wild/director.js';

// Conga line easter egg. When "Conga!" (Gloria Estefan & Miami Sound Machine)
// plays in the DJ booth's Spotify player, every bot drops what it's showing,
// lines up behind the leader (Bot of the Day, shaking maracas) and congas
// around the island's sand paths. When the song ends they scatter home.
//
// Only the 3D picture changes: the feed, statuses, "+X min" cheers and
// handoffs keep running (a bot carrying a handoff leaves the line to deliver
// it, then dances back in).
//
// Shared store, no React: Bot.jsx calls congaSpot(id) every frame.

export const CONGA_TRACKS = new Set(['spotify:track:3zVLix0PrmdxGg9fRGlz5y']); // "Conga!" on Bot Island Radio
export const CONGA_MS = 253493; // its length, for players that only report the playlist

export const GAP = 0.66; // world units between bots (close enough for hands on shoulders)
export const SPEED = 1.15; // units per second along the route
export const GATHER = 5; // seconds to fall in before the line starts moving
export const CATCH_SPEED = 3.2; // bots hurrying to their spot in the line
export const LOCK = 0.12; // close enough: ride the line
export const BEAT = 60 / 120; // conga step: 1, 2, 3, kick

export const conga = {
  on: false,
  since: 0,
  source: '',
  leader: null,
  order: new Map(), // bot id -> place in line (0 = leader)
  count: 0,
  locked: new Set(), // bots riding the line
};

const listeners = new Set();
export function onCongaChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn(conga.on));

// Line order: the leader first, then everyone else in the given order.
export function setCongaRoster(ids, leaderId) {
  const lead = ids.includes(leaderId) ? leaderId : ids[0] || null;
  conga.leader = lead;
  conga.order.clear();
  let i = 0;
  if (lead) conga.order.set(lead, i++);
  for (const id of ids) if (id !== lead) conga.order.set(id, i++);
  conga.count = i;
}

export function startConga(source = 'spotify') {
  if (conga.on) return;
  conga.on = true;
  conga.since = fxNow();
  conga.source = source;
  conga.locked.clear();
  emit();
}

export function stopConga() {
  if (!conga.on) return;
  conga.on = false;
  conga.locked.clear();
  emit();
}

// ---------------------------------------------------------------------------
// Route: a flower along the sand paths. Around the ring at the tower's foot,
// and at each zone's path, out to the zone (keeping right), a little U-turn,
// and back on the other side of the path.
// ---------------------------------------------------------------------------
const SIDE = 0.32; // keep-right offset on the zone paths
const STEP = 0.18; // sampling step
const SHORT = 1.1; // turn around this far before a zone's path ends

function buildRoute() {
  const keys = Object.keys(ZONES).filter((k) => k !== 'tower');
  const ang = (k) => {
    const h = hubPoint(k);
    return Math.atan2(h.z, h.x);
  };
  keys.sort((a, b) => ang(a) - ang(b));
  const pts = [];
  const push = (x, z) => {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(x - last.x, z - last.z) > 0.02) pts.push({ x, z });
  };
  const R = HUB_RADIUS + 0.25;
  keys.forEach((k, i) => {
    const curve = zonePathCurve(k); // entry -> hub
    const a0 = ang(k);
    if (curve) {
      const len = curve.getLength();
      // turn around a little before the path meets the building
      const u0 = Math.min(0.5, SHORT / len);
      const n = Math.max(4, Math.ceil((len * (1 - u0)) / STEP));
      // out: hub -> entry, keeping right
      for (let j = 0; j <= n; j++) {
        const u = 1 - (j / n) * (1 - u0);
        const p = curve.getPointAt(u);
        const t = curve.getTangentAt(u); // points toward the hub
        // walking outward (direction -t): right-hand side is (t.z, -t.x)
        push(p.x + t.z * SIDE, p.z - t.x * SIDE);
      }
      // U-turn around the entry
      const e = curve.getPointAt(u0);
      const t0 = curve.getTangentAt(u0);
      const out = Math.atan2(-t0.z, -t0.x);
      const m = 10;
      for (let j = 1; j < m; j++) {
        const a = out + Math.PI / 2 - (j / m) * Math.PI;
        push(e.x + Math.cos(a) * SIDE, e.z + Math.sin(a) * SIDE);
      }
      // back: entry -> hub, keeping right (direction t: right is (-t.z, t.x))
      for (let j = 0; j <= n; j++) {
        const u = u0 + (j / n) * (1 - u0);
        const p = curve.getPointAt(u);
        const t = curve.getTangentAt(u);
        push(p.x - t.z * SIDE, p.z + t.x * SIDE);
      }
    }
    // around the ring to the next path
    const a1 = ang(keys[(i + 1) % keys.length]) + (i === keys.length - 1 ? Math.PI * 2 : 0);
    const steps = Math.max(2, Math.ceil(((a1 - a0) * R) / STEP));
    for (let j = 0; j <= steps; j++) {
      const a = a0 + ((a1 - a0) * j) / steps;
      push(Math.cos(a) * R, Math.sin(a) * R);
    }
  });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const closing = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
  return { pts, cum, length: cum[cum.length - 1] + closing };
}

let route = null;
export function congaRoute() {
  return route || (route = buildRoute());
}

// Point and heading at distance s along the loop.
export function routeAt(s, out) {
  const r = congaRoute();
  const L = r.length;
  let d = ((s % L) + L) % L;
  const { pts, cum } = r;
  let lo = 0;
  let hi = pts.length - 1;
  if (d >= cum[hi]) {
    // closing segment back to the start
    const a = pts[hi];
    const b = pts[0];
    const k = (d - cum[hi]) / Math.max(1e-6, L - cum[hi]);
    return fill(out, a, b, k);
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  return fill(out, pts[lo], pts[hi], (d - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]));
}

function fill(out, a, b, k) {
  const x = a.x + (b.x - a.x) * k;
  const z = a.z + (b.z - a.z) * k;
  out.x = x;
  out.z = z;
  out.y = groundY(x, z);
  out.heading = Math.atan2(b.x - a.x, b.z - a.z);
  return out;
}

// Where this bot belongs in the line right now, or null if no conga.
// Returns the shared `out` object: { x, y, z, heading, place, leader, moving }.
export function congaSpot(id, out) {
  if (!conga.on) return null;
  const place = conga.order.get(id);
  if (place === undefined) return null;
  const t = fxNow() - conga.since;
  const moving = t > GATHER;
  // The leader starts far enough along that the whole line fits on the route.
  const lead = (conga.count - 1) * GAP + (moving ? (t - GATHER) * SPEED : 0);
  routeAt(lead - place * GAP, out);
  out.place = place;
  out.leader = place === 0;
  out.moving = moving;
  return out;
}

// Conga step for the pose: beat 0..3, kick on 4 (alternating legs).
export function congaBeat() {
  const b = (fxNow() - conga.since) / BEAT;
  return { beat: Math.floor(b) % 4, k: b % 1, bar: Math.floor(b / 4) };
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------
const isCongaTrack = (tr) =>
  !!tr && (CONGA_TRACKS.has(tr.uri) || (tr.uri.startsWith('spotify:playlist:') && Math.abs(tr.duration - CONGA_MS) < 2500));

// Spotify: on while "Conga!" plays. A pause (or a stall) of a few seconds
// ends it; a new song ends it right away.
let offTimer = 0;
onSpotifyTrack((tr) => {
  const conga_ = isCongaTrack(tr);
  if (conga_ && (!tr.paused || tr.buffering)) {
    clearTimeout(offTimer);
    offTimer = 0;
    if (!conga.on) startConga('spotify');
    return;
  }
  if (!conga.on || conga.source !== 'spotify' || offTimer) return;
  offTimer = setTimeout(
    () => {
      offTimer = 0;
      if (conga.source === 'spotify') stopConga();
    },
    conga_ ? 3000 : 400
  );
});

// ?test=conga: a short conga soon after load, then one every few minutes.
if (typeof window !== 'undefined' && testOn('conga')) {
  const run = () => {
    if (!conga.on) {
      startConga('test');
      setTimeout(() => conga.source === 'test' && stopConga(), 60000);
    }
  };
  setTimeout(run, 6000);
  setInterval(run, 150000);
}
