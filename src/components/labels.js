import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { couriers } from './Handoff.jsx';

// Shared label state. Bots write their live position here; the director
// decides which name tags show, so tags never pile up on top of each other.
//
// Zoom tiers (compared with the fitted "default" camera distance):
//   close   : every name shows, minus any that would overlap a nearer one
//   default : only the hovered, selected or walking bot shows its name
//   far     : names hidden (except the selected bot)
export const labelState = {
  positions: new Map(), // id -> { x, y, z, labelY, name }
  visible: new Set(),
  zones: new Map(), // zone key -> { x, y, z, name }
  visibleZones: new Set(),
  hovered: null,
  selected: null,
  spotlight: null,
  baseDist: 24,
  tier: 'default',
  towerScreen: null, // { x, y } in CSS pixels: where confetti bursts from
  obstacles: [], // name and zone tags placed this frame: { sx, sy, w, h } (bubbles keep clear of them)
};

// ---------------------------------------------------------------------------
// Speech bubbles and "+X min" floats: a tiny screen-space layout so they
// never cover each other or the name tags. Each bubble is a drei <Html> whose
// inner wrapper element we move with a CSS transform.
//
// addBubble(entry) returns an unregister function. Entry fields:
//   ref      : React ref to the wrapper element (measured once, then moved)
//   x, y, z  : anchor in world space (where the Html sits)
//   bot      : optional bot id: the anchor follows that bot's live position
//              (y = head + lift), and `group` (the Html's parent) moves with it
//   group    : optional Object3D to keep at the anchor
//   lift     : world units above the bot's name tag height (with `bot`)
//   prio     : higher places first and never gets pushed by lower ones
//   seq      : tie-break (lower places first)
//   hideable : true = may hide when it can't find room
//   tail     : true = writes --tail (px) so a speech tail points at the speaker
//   bottom   : true = the anchor is the bubble's bottom edge (tail tip), not its center
//   rise, dur, born : floats drift up `rise` px over `dur` s from `born` (fxNow)
// ---------------------------------------------------------------------------
const bubbleList = [];
let bubbleSeq = 0;
export function addBubble(entry) {
  const b = { x: 0, y: 0, z: 0, lift: 0, prio: 0, seq: ++bubbleSeq, hideable: false, tail: false, rise: 0, dur: 1, born: 0, ...entry };
  b.el = null;
  b.w = 0;
  b.h = 0;
  b.ox = 0; // current (smoothed) offset in px
  b.oy = 0;
  b.tx = 0; // target offset
  b.ty = 0;
  b.op = -1; // last written opacity
  b.wx = NaN; // last written transform
  b.wy = NaN;
  b.wt = NaN; // last written tail
  b.fresh = true;
  bubbleList.push(b);
  return () => {
    const i = bubbleList.indexOf(b);
    if (i >= 0) bubbleList.splice(i, 1);
  };
}

// Candidate spots, in units of the bubble's own size: stay put, then up, then
// up-and-sideways, then further out.
const CANDS = [
  [0, -1],
  [-0.6, -0.6],
  [0.6, -0.6],
  [0, -2],
  [-1.08, 0],
  [1.08, 0],
  [-0.9, -1.5],
  [0.9, -1.5],
  [0, -3],
  [-1.15, -2.4],
  [1.15, -2.4],
];
const placed = []; // reused rects { cx, cy, w, h }
let placedN = 0;
let bubbleFrom = 0; // placed[bubbleFrom..placedN) are bubbles
function bubbleHits(a) {
  for (let i = bubbleFrom; i < placedN; i++) {
    const r = placed[i];
    if (Math.abs(r.cx - a.sx) < (r.w + a.w) / 2 + 2 && Math.abs(r.cy - a.sy) < (r.h + a.h) / 2) return true;
  }
  return false;
}
// Story bubbles (hideable) only try the near spots; floats try them all.
const NEAR_CANDS = 8;
function pushRect(cx, cy, w, h) {
  const r = placed[placedN] || (placed[placedN] = { cx: 0, cy: 0, w: 0, h: 0 });
  r.cx = cx;
  r.cy = cy;
  r.w = w;
  r.h = h;
  placedN++;
}
function hits(cx, cy, w, h) {
  for (let i = 0; i < placedN; i++) {
    const r = placed[i];
    if (Math.abs(r.cx - cx) < (r.w + w) / 2 + 4 && Math.abs(r.cy - cy) < (r.h + h) / 2 + 3) return true;
  }
  return false;
}
const byPrio = (a, b) => b.prio - a.prio || a.seq - b.seq;
const easeOut = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
const bv = new THREE.Vector3();

// Lays out every bubble around the given obstacles (the pinned bot tags).
// Afterwards `bubbleHits` tells the director which other tags would land on
// a bubble, so zone tags and close-up names give way to bubbles.
function layoutBubbles(camera, size, dt, invalidate, obstacles) {
  placedN = 0;
  for (const o of obstacles) pushRect(o.sx, o.sy, o.w, o.h);
  bubbleFrom = placedN;
  if (!bubbleList.length) return;
  bubbleList.sort(byPrio);
  const now = fxNow();
  const k = 1 - Math.exp(-dt * 12);
  let moving = false;
  for (const b of bubbleList) {
    if (!b.el) {
      b.el = b.ref?.current || null;
      if (!b.el) continue;
    }
    if (!b.w) {
      b.w = b.el.offsetWidth;
      b.h = b.el.offsetHeight;
      if (!b.w) continue;
    }
    if (b.bot) {
      const p = labelState.positions.get(b.bot);
      if (p) {
        b.x = p.x;
        b.y = p.y + p.labelY + b.lift;
        b.z = p.z;
      }
      if (b.group) b.group.position.set(b.x, b.y, b.z);
    }
    bv.set(b.x, b.y, b.z).project(camera);
    let show = bv.z <= 1 && Math.abs(bv.x) < 1.2 && Math.abs(bv.y) < 1.2;
    const sx = ((bv.x + 1) / 2) * size.width;
    const w = b.w;
    const h = b.h;
    const base = b.bottom ? -(h / 2 + 12) : 0;
    const sy = ((1 - bv.y) / 2) * size.height + base;
    const rise = b.rise ? b.rise * easeOut(Math.min(1, Math.max(0, (now - b.born) / b.dur))) : 0;
    if (show) {
      // Natural spot first, then where it was, then the candidates.
      let fx = 0;
      let fy = 0;
      let found = !hits(sx, sy - rise, w, h);
      if (!found && (b.tx || b.ty) && !hits(sx + b.tx, sy + b.ty - rise, w, h)) {
        fx = b.tx;
        fy = b.ty;
        found = true;
      }
      const nc = b.hideable ? NEAR_CANDS : CANDS.length;
      for (let i = 0; !found && i < nc; i++) {
        const cx = CANDS[i][0] * (w + 6);
        const cy = CANDS[i][1] * (h + 6);
        if (!hits(sx + cx, sy + cy - rise, w, h)) {
          fx = cx;
          fy = cy;
          found = true;
        }
      }
      if (!found && b.hideable) show = false;
      else {
        if (!found) {
          fx = b.tx;
          fy = b.ty;
        }
        b.tx = fx;
        b.ty = fy;
        pushRect(sx + fx, sy + fy - rise, w, h);
      }
    }
    if (b.fresh) {
      // First frame: start where it belongs, no slide in.
      b.ox = b.tx;
      b.oy = b.ty;
      b.fresh = false;
    } else {
      b.ox += (b.tx - b.ox) * k;
      b.oy += (b.ty - b.oy) * k;
      if (Math.abs(b.tx - b.ox) > 0.4 || Math.abs(b.ty - b.oy) > 0.4) moving = true;
    }
    const X = Math.round(b.ox * 2) / 2;
    const Y = Math.round((b.oy - rise + base) * 2) / 2;
    if (X !== b.wx || Y !== b.wy) {
      b.wx = X;
      b.wy = Y;
      b.el.style.transform = `translate3d(${X}px,${Y}px,0)`;
    }
    const op = show ? 1 : 0;
    if (op !== b.op) {
      b.op = op;
      b.el.style.opacity = op ? '' : '0';
    }
    if (b.tail) {
      const t = Math.round(Math.max(-w / 2 + 18, Math.min(w / 2 - 18, -b.ox)));
      if (t !== b.wt) {
        b.wt = t;
        b.el.style.setProperty('--tail', `${t}px`);
      }
    }
  }
  if (moving) invalidate();
}

// One-shot bot reactions, keyed by bot id -> performance.now() in seconds.
//   cheer  : this bot just earned minutes (little spin and hop)
//   sipHop : this bot just finished a task (happy hop and a sip)
//   wave   : photo booth: wave at the camera
//   talk   : campfire story: this bot is telling it (hand gestures, nods)
//   salute : a crisp little salute (one bot, right after the page loads)
//   look   : turn to face the camera while waving or saluting (fourth wall)
export const botFx = { cheer: new Map(), sipHop: new Map(), wave: new Map(), talk: new Map(), salute: new Map(), look: new Map() };
export const fxNow = () => performance.now() / 1000;

// Bot antics (src/world/Antics.jsx), keyed by bot id. The antics director
// writes an entry; Bot.jsx reads it every frame and acts it out, then drops
// it once it's over. Times are fxNow() seconds.
//   { kind, start, end, goal?: { x, y, z }, face?: { x, z }, faceY?, ...extra }
//   kind  : 'highfive' | 'trip' | 'help' | 'pushups' | 'selfie' | 'fish'
//   start : when the move itself begins (the bot walks to `goal` before that)
//   end   : when the bot lets go and strolls back home
//   goal  : where to stand meanwhile (null = stay put)
//   face  : a point to turn toward; faceY: a heading instead
// Only chillin' bots get antics, except a quick high-five between a courier
// and the bot it just handed a package to (arms only, nobody moves).
export const antics = new Map();

const v = new THREE.Vector3();

export function LabelDirector({ controls }) {
  useFrame(({ camera, size, invalidate }, delta) => {
    const target = controls?.current?.target;
    const camDist = target ? camera.position.distanceTo(target) : labelState.baseDist;
    const base = labelState.baseDist || 24;
    const tier = camDist < base * 0.62 ? 'close' : camDist > base * 1.12 ? 'far' : 'default';
    labelState.tier = tier;
    v.set(0, 6.6, 0).project(camera);
    labelState.towerScreen = v.z <= 1 ? { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height } : null;

    const kept = [];
    const overlaps = (a) => kept.some((k) => Math.abs(k.sx - a.sx) < (k.w + a.w) / 2 + 2 && Math.abs(k.sy - a.sy) < (k.h + a.h) / 2);

    // Zone tags first (nearest wins), then bot names. Anything that would
    // overlap a tag already placed stays hidden.
    const zoneCands = [];
    for (const [key, z] of labelState.zones) {
      v.set(z.x, z.y, z.z).project(camera);
      if (v.z > 1) continue;
      zoneCands.push({ key, sx: ((v.x + 1) / 2) * size.width, sy: ((1 - v.y) / 2) * size.height, w: 9.6 * z.name.length + 26, h: 32, d: camera.position.distanceToSquared(v.set(z.x, z.y, z.z)) });
    }
    zoneCands.sort((a, b) => a.d - b.d);

    const cands = [];
    for (const [id, p] of labelState.positions) {
      const pinned = id === labelState.selected || id === labelState.spotlight;
      const wanted = pinned || tier === 'close' || (tier === 'default' && (id === labelState.hovered || couriers.has(id)));
      if (!wanted) continue;
      v.set(p.x, p.y + p.labelY, p.z).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      const sx = ((v.x + 1) / 2) * size.width;
      const sy = ((1 - v.y) / 2) * size.height;
      const w = 9 * p.name.length + 26;
      const rank = pinned ? 0 : id === labelState.hovered ? 1 : couriers.has(id) ? 2 : 3;
      cands.push({ id, sx, sy, w, h: 26, rank, d: camera.position.distanceToSquared(v.set(p.x, p.y, p.z)) });
    }
    cands.sort((a, b) => a.rank - b.rank || a.d - b.d);

    const next = new Set();
    const nextZones = new Set();
    for (const c of cands) {
      if (c.rank > 1) continue;
      kept.push(c);
      next.add(c.id);
    }
    // Speech bubbles and "+X min" floats keep clear of those names; zone tags
    // and the other names then give way to the bubbles.
    layoutBubbles(camera, size, Math.min(delta, 0.1), invalidate, kept);
    for (const z of zoneCands) {
      if (overlaps(z) || bubbleHits(z)) continue;
      kept.push(z);
      nextZones.add(z.key);
    }
    for (const c of cands) {
      if (c.rank <= 1 || overlaps(c) || bubbleHits(c)) continue;
      kept.push(c);
      next.add(c.id);
    }
    const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
    const changed = !same(next, labelState.visible) || !same(nextZones, labelState.visibleZones);
    labelState.visible = next;
    labelState.visibleZones = nextZones;
    labelState.obstacles = kept;
    // On-demand rendering (reduced motion): draw again so the tags catch up.
    if (changed || labelState.zones.size === 0 || labelState.positions.size === 0) invalidate();
  }, -0.5);
  return null;
}
