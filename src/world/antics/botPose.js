import * as THREE from 'three';
import { bump, clamp01, ease, lerp, toPose } from './rig.js';

// How a team bot acts out an antic (see `antics` in labels.js). Bot.jsx
// calls applyAntic every frame while an entry is active and the bot is
// standing at its goal. Everything here is in the bot's own units (before
// BOT_SCALE): feet at y 0, shoulders at y 0.5, facing +z.
//
// The pose group (body) is tipped and lifted directly; arm targets, the
// drink and the props go into `o` (pose space) for Bot.jsx to apply.

export const ANTIC_TIMES = {
  highfive: 1.7,
  trip: 0, // set by the director (tPull + 2.6)
  pushups: { drop: 0.45, rep: 0.55, reps: 5, up: 1.1 },
  selfie: 4.4,
};
export const SELFIE_FLASHES = [1.55, 3.15];
export const PUSHUP_LEN = ANTIC_TIMES.pushups.drop + ANTIC_TIMES.pushups.rep * ANTIC_TIMES.pushups.reps + ANTIC_TIMES.pushups.up;
export const HELP_LEN = 2.6; // pull up, brush off, nod
export const FALLEN = 1.42; // how far a tripped bot tips over (radians)

const v = new THREE.Vector3();

export function makePoseOut() {
  return {
    L: new THREE.Vector3(),
    R: new THREE.Vector3(),
    hasL: false,
    hasR: false,
    drink: 'hand', // 'hand' | 'ground' | 'pose' | 'up'
    drinkPos: new THREE.Vector3(),
    drinkRotX: 0,
    phone: false,
    flash: 0,
    peace: false,
    rod: false,
    rodLift: 0,
    lift: 0,
    eyeL: 1,
    eyeR: 1,
    footY: 0.06,
    footZ: 0,
  };
}

export function resetPoseOut(o) {
  o.hasL = false;
  o.hasR = false;
  o.drink = 'hand';
  o.drinkRotX = 0;
  o.phone = false;
  o.flash = 0;
  o.peace = false;
  o.rod = false;
  o.rodLift = 0;
  o.lift = 0;
  o.eyeL = 1;
  o.eyeR = 1;
  o.footY = 0.06;
  o.footZ = 0;
}

function setL(o, x, y, z) {
  o.L.set(x, y, z);
  o.hasL = true;
}
function setR(o, x, y, z) {
  o.R.set(x, y, z);
  o.hasR = true;
}
// Hand on a spot given in the bot's upright frame while the body is tipped.
function reachL(o, x, Y, Z, tilt, py) {
  toPose(v, x, Y, Z, tilt, py);
  setL(o, v.x, v.y, v.z);
}
function reachR(o, x, Y, Z, tilt, py) {
  toPose(v, x, Y, Z, tilt, py);
  setR(o, v.x, v.y, v.z);
}
// Drink held up and level (upright frame), with the right hand on it.
function drinkUp(o, x, Y, Z, tilt, py) {
  toPose(o.drinkPos, x, Y, Z, tilt, py);
  o.drink = 'pose';
  o.drinkRotX = -tilt;
  reachR(o, x - 0.075, Y + 0.09, Z, tilt, py);
}

export function applyAntic(an, k, p, h, o, t) {
  switch (an.kind) {
    case 'highfive':
      return highFive(an, k, p, h, o, t);
    case 'trip':
      return trip(an, k, p, h, o, t);
    case 'help':
      return help(an, k, p, h, o, t);
    case 'pushups':
      return pushups(an, k, p, h, o, t);
    case 'selfie':
      return selfie(an, k, p, h, o, t);
    case 'fish':
      return fish(an, k, p, h, o, t);
    case 'guide':
      return guide(an, k, p, h, o, t);
    default:
      return undefined;
  }
}

// Wind up, slap hands in the middle, little hop. `reach` is half the gap to
// the partner (bot units), so both hands meet halfway.
function highFive(an, k, p, h, o) {
  const reach = Math.min(0.5, an.reach ?? 0.3);
  if (k < 0) {
    o.lift += Math.abs(Math.sin(k * 9)) * 0.015; // eager little bounce
    return;
  }
  const wind = ease(k / 0.42);
  const swing = ease((k - 0.42) / 0.14);
  const back = ease((k - 0.95) / 0.45);
  const lean = k < 0.42 ? -0.12 * wind : k < 0.95 ? lerp(-0.12, 0.1, swing) : 0.1 * (1 - back);
  p.rotation.x += lean;
  // back and up, then forward to the meeting point, then down
  const bx = -0.3;
  const by = 0.78;
  const bz = -0.12;
  const mx = -0.03;
  const my = 0.86;
  const mz = reach;
  let x = lerp(-0.23, bx, wind);
  let y = lerp(0.2, by, wind);
  let z = lerp(0.02, bz, wind);
  if (k >= 0.42) {
    x = lerp(bx, mx, swing);
    y = lerp(by, my, swing);
    z = lerp(bz, mz, swing);
  }
  if (k >= 0.95) {
    x = lerp(mx, -0.23, back);
    y = lerp(my, 0.2, back);
    z = lerp(mz, 0.02, back);
  }
  setL(o, x, y, z);
  o.lift += bump(k, 0.6, 1.15) * 0.16;
  h.rotation.z = bump(k, 0.6, 1.5) * 0.18;
  h.rotation.x = -bump(k, 0.4, 1.0) * 0.15;
}

// Trip, faceplant (drink saved, held high), lie there dizzy, get pulled up
// by a buddy, brush off. tPull: seconds after the trip when the pull starts.
function trip(an, k, p, h, o, t) {
  const tp = an.tPull;
  let tilt = 0;
  let py = 0;
  if (k < 0) return;
  if (k < 0.4) {
    // stumble: wobble forward, arms windmilling
    tilt = 0.32 * (k / 0.4) + 0.08 * Math.sin(k * 32);
    const a = k * 26;
    setL(o, -0.32, 0.62 + 0.24 * Math.sin(a), 0.08 + 0.24 * Math.cos(a));
    drinkUp(o, 0.3, 0.86, 0.06, tilt, 0);
    h.rotation.x = -0.3;
    o.eyeL = o.eyeR = 1.25;
  } else if (k < 0.7) {
    const u = (k - 0.4) / 0.3;
    tilt = 0.32 + (FALLEN - 0.32) * u * u;
    py = 0.15 * u;
    reachL(o, -0.26, 0.25, 0.6, tilt, py);
    drinkUp(o, 0.32, 0.72, 0.1, tilt, py);
    o.eyeL = o.eyeR = 1.25;
  } else if (k < tp) {
    // flat on the ground, feet kicking, then dizzy
    const u = (k - 0.7) / 0.3;
    tilt = FALLEN - (k < 1 ? Math.sin(u * Math.PI) * 0.12 * (1 - u) : 0);
    py = 0.15;
    const kick = k < 2.2 ? Math.abs(Math.sin(k * 8)) : 0;
    o.footZ = -0.12 * kick;
    o.footY = 0.06 + 0.04 * kick;
    h.rotation.z = Math.sin(t * 5) * 0.25;
    h.rotation.x = -0.5;
    o.eyeL = o.eyeR = 0.25;
    drinkUp(o, 0.3, 0.68, 0.0, tilt, py);
    // reach out for the helping hand
    const r = ease((k - (tp - 0.7)) / 0.6);
    reachL(o, lerp(-0.28, -0.05, r), lerp(0.18, 0.3, r), lerp(0.55, 0.85, r), tilt, py);
  } else {
    const u = ease((k - tp) / 0.7);
    tilt = FALLEN * (1 - u) - Math.sin(clamp01((k - tp - 0.6) / 0.4) * Math.PI) * 0.12;
    py = 0.15 * (1 - u);
    if (k < tp + 0.8) {
      reachL(o, -0.05, lerp(0.3, 0.72, u), lerp(0.85, 0.72, u), tilt, py);
      drinkUp(o, 0.3, lerp(0.68, 0.62, u), lerp(0, 0.1, u), tilt, py);
    } else if (k < tp + 2.2) {
      // brush off: pat pat pat
      const pat = Math.sin(k * 20);
      setL(o, -0.1 + pat * 0.03, 0.3 + Math.abs(pat) * 0.06, 0.2);
      p.rotation.z = Math.sin(k * 15) * 0.07;
      h.rotation.y = Math.sin(k * 9) * 0.3;
      o.lift += Math.abs(Math.sin(k * 10)) * 0.015;
    } else {
      // all good: proud little nod
      h.rotation.x = -bump(k, tp + 2.2, tp + 2.6) * 0.25;
    }
  }
  p.rotation.x = tilt;
  p.position.y = py;
}

// Helping hand: lean in, offer a hand, pull, brush off together.
function help(an, k, p, h, o) {
  let tilt = 0;
  if (k < 0) {
    tilt = 0.22;
    reachL(o, 0, 0.3, 0.34, tilt, 0);
    h.rotation.x = 0.35;
  } else if (k < 0.8) {
    const u = ease(k / 0.7);
    tilt = lerp(0.22, -0.16, u);
    reachL(o, 0, lerp(0.3, 0.72, u), lerp(0.34, 0.42, u), tilt, 0);
    h.rotation.x = lerp(0.35, -0.1, u);
  } else if (k < 2.2) {
    const pat = Math.sin(k * 20 + 1);
    setL(o, -0.1 + pat * 0.03, 0.3 + Math.abs(pat) * 0.06, 0.2);
    p.rotation.z = Math.sin(k * 15 + 1) * 0.06;
  } else {
    h.rotation.x = -bump(k, 2.2, 2.6) * 0.25;
  }
  p.rotation.x = tilt;
}

// Drop and give me five, then hop up and flex. The drink waits on the sand.
function pushups(an, k, p, h, o) {
  const P = ANTIC_TIMES.pushups;
  const plank = 1.15;
  const py = 0.05;
  o.drink = 'ground';
  o.drinkPos.set(0.45, 0, 0.3);
  if (k < 0) return;
  let tilt = 0;
  let lift = 0;
  const repsEnd = P.drop + P.rep * P.reps;
  if (k < P.drop) {
    tilt = plank * ease(k / P.drop);
  } else if (k < repsEnd) {
    const r = ((k - P.drop) / P.rep) % 1;
    tilt = plank + 0.18 * (0.5 - 0.5 * Math.cos(r * Math.PI * 2));
  } else {
    const u = (k - repsEnd) / P.up;
    tilt = plank * (1 - ease(u / 0.3));
    lift = bump(u, 0.2, 0.55) * 0.3;
    if (u > 0.25) {
      // flex!
      const f = bump(u, 0.25, 1);
      setL(o, -0.36, lerp(0.2, 0.78, Math.min(1, f * 2)), 0.02);
      setR(o, 0.36, lerp(0.2, 0.78, Math.min(1, f * 2)), 0.02);
      h.rotation.x = -0.25 * f;
      if (u > 0.9) o.drink = 'hand';
    }
  }
  if (k < repsEnd + P.up * 0.25) {
    const pY = k < P.drop ? py * ease(k / P.drop) : py;
    const sz = 0.5 * Math.sin(plank) + 0.02;
    reachL(o, -0.2, 0.0, sz, tilt, pY);
    reachR(o, 0.2, 0.0, sz, tilt, pY);
    p.position.y = pY;
    h.rotation.x = -0.75 * Math.min(1, tilt / plank);
  }
  p.rotation.x = tilt;
  o.lift += lift;
}

// Phone up at arm's length, two poses, two flashes. role 'phone' holds the
// phone; 'pose' throws a peace sign and leans in toward the phone holder
// (an.side: -1 = holder is on my left, +1 = on my right).
function selfie(an, k, p, h, o) {
  if (k < 0) return;
  const holder = an.role === 'phone';
  const inPose = ease(k / 0.5) * (1 - ease((k - 3.9) / 0.5));
  const second = ease((k - 2.2) / 0.3);
  const lean = (holder ? 0.05 : 0.13) * (an.side || 0);
  p.rotation.z = -lean * inPose;
  if (holder) {
    o.phone = true;
    setL(o, lerp(-0.23, -0.16, inPose), lerp(0.2, 1.0, inPose), lerp(0.02, 0.5, inPose));
    o.flash = Math.max(flashAt(k, SELFIE_FLASHES[0]), flashAt(k, SELFIE_FLASHES[1]));
    // pose 1: drink up, big smile; pose 2: head tilt and a wink
    if (k < 2.2) drinkUp(o, 0.3, lerp(0.3, 0.74, inPose), lerp(0.1, 0.2, inPose), 0, 0);
    h.rotation.x = -0.12 * inPose;
    h.rotation.z = 0.28 * second * inPose;
    if (second > 0.5 && k < 3.9) o.eyeL = 0.2;
  } else {
    o.peace = k < 2.2 && inPose > 0.3;
    if (k < 2.2) setL(o, lerp(-0.23, -0.3, inPose), lerp(0.2, 0.95, inPose), lerp(0.02, 0.12, inPose));
    else drinkUp(o, 0.3, lerp(0.3, 0.74, inPose), lerp(0.1, 0.2, inPose), 0, 0);
    h.rotation.z = (-0.22 * (an.side || 1)) * inPose;
    h.rotation.x = -0.1 * inPose;
  }
  o.lift += bump(k, 1.45, 1.75) * 0.05 + bump(k, 3.05, 3.35) * 0.05;
}
const flashAt = (k, at) => (k >= at && k < at + 0.18 ? 1 - (k - at) / 0.18 : 0);

// Sitting on the edge of the pier, feet over the water, rod in both hands.
function fish(an, k, p, h, o, t) {
  p.position.y = -0.17;
  p.rotation.x = -0.12;
  o.footZ = 0.2;
  o.footY = 0.0 + Math.sin(t * 1.3) * 0.02;
  o.drink = 'ground';
  o.drinkPos.set(0.42, 0, -0.05);
  o.rod = true;
  o.rodLift = an.rodLift || 0;
  const r = o.rodLift;
  setL(o, -0.04, 0.38 + r * 0.12, 0.24);
  setR(o, 0.05, 0.4 + r * 0.14, 0.3);
  h.rotation.x = 0.2 - r * 0.35 + Math.sin(t * 0.5) * 0.04;
  h.rotation.y = Math.sin(t * 0.23) * 0.2;
  if (k < 0) return;
}

// Showing a new recruit around (welcome/Arrivals.jsx): point the way with the
// free hand, chatty little head bobs.
function guide(an, k, p, h, o, t) {
  if (!an.point) return;
  setL(o, -0.3, 0.78, 0.36);
  h.rotation.x = -0.1 + Math.sin(t * 4) * 0.05;
  h.rotation.y = 0.25;
}
