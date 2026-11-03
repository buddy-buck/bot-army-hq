// Island geography: terrain height, zones, bot slots, palms and the
// bezier walking routes bots use to carry handoffs between zones.
//
// Coordinates: x = east (+) / west (-), z = south (+) / north (-), y = up.
// The default camera sits to the south looking north.
import * as THREE from 'three';

export const ISLAND = { rx: 13, rz: 9.5 };
export const HUB_RADIUS = 2.6; // sand ring around the tower hill
export const TOWER_LEG_H = 2.4;
export const LOOKOUT_H = 1.6;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

export function islandWobble(x, z) {
  const a = Math.atan2(z, x);
  return 1 + 0.045 * Math.sin(a * 3 + 0.7) + 0.03 * Math.sin(a * 5 + 2.1) + 0.02 * Math.sin(a * 9 + 4.0);
}

// 0 at the island center, 1 roughly at the waterline.
export function islandE(x, z) {
  const w = islandWobble(x, z);
  return ((x / ISLAND.rx) ** 2 + (z / ISLAND.rz) ** 2) / (w * w);
}

export function hillY(x, z) {
  return 1.5 * Math.exp(-(x * x + z * z) / 4.5);
}

export function terrainY(x, z) {
  const e = islandE(x, z);
  let y;
  if (e < 0.8) y = 0.35;
  else if (e < 0.98) y = lerp(0.35, 0.03, (e - 0.8) / 0.18);
  else y = lerp(0.03, -0.75, smoothstep(0.98, 1.25, e));
  const inland = 1 - smoothstep(0.7, 0.95, e);
  y += inland * 0.07 * Math.sin(x * 1.3 + z * 0.7) * Math.cos(z * 1.1 - x * 0.4);
  y += hillY(x, z);
  return y;
}

// Wooden decks over the water. Each has a short ramp onto the sand.
export const DECKS = [
  { id: 'lanai', x0: 10.2, x1: 15.6, z0: -1.2, z1: 3.2, y: 0.62, ramp: { side: 'x0', len: 0.9, z0: 0.4, z1: 1.6 } },
  { id: 'dock', x0: -16.5, x1: -10.4, z0: 3.75, z1: 5.05, y: 0.45, ramp: { side: 'x1', len: 0.8, z0: 3.75, z1: 5.05 } },
];

// Height a bot stands at: decks, ramps, then sand/grass, never under water.
export function groundY(x, z) {
  for (const d of DECKS) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d.y;
    const r = d.ramp;
    if (r && z >= r.z0 && z <= r.z1) {
      if (r.side === 'x0' && x < d.x0 && x >= d.x0 - r.len) {
        const t = (x - (d.x0 - r.len)) / r.len;
        return lerp(Math.max(terrainY(x, z), 0), d.y, t);
      }
      if (r.side === 'x1' && x > d.x1 && x <= d.x1 + r.len) {
        const t = (d.x1 + r.len - x) / r.len;
        return lerp(Math.max(terrainY(x, z), 0), d.y, t);
      }
    }
  }
  return Math.max(terrainY(x, z), 0);
}

export const towerTopY = () => terrainY(0, 0) + TOWER_LEG_H + 0.08;
export const lookoutTopY = () => terrainY(5.2, -3.0) + LOOKOUT_H + 0.07;

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------
// entry: where the zone's sand path starts. labelY: tag height above ground.
// bend: how much the sand path curves on its way to the tower ring.
export const ZONES = {
  tower: { label: "Chief's Tower", x: 0, z: 0, entry: [0, 2.6], labelY: 5.6, bend: 0, focusY: 2.6 },
  cabana: { label: 'Content Cabana', x: -6.5, z: -4.5, entry: [-5.4, -1.5], labelY: 3.3, bend: 0.7 },
  lanai: { label: 'Real Estate Lanai', x: 13, z: 1, entry: [9.4, 1.0], labelY: 2.6, bend: -0.6 },
  tikihut: { label: 'Networking Tiki Hut', x: 0.5, z: 6.8, entry: [2.4, 5.5], labelY: 3.3, bend: 0.5 },
  moneydesk: { label: 'Money Desk', x: -9.5, z: 0.5, entry: [-8.3, 1.5], labelY: 2.3, bend: -0.5 },
  dock: { label: 'Launch Dock', x: -13.4, z: 4.4, entry: [-10.0, 4.4], labelY: 2.2, bend: 0.6 },
  bungalow: { label: "Flo's Bungalow", x: 1.8, z: -7.3, entry: [1.7, -5.4], labelY: 2.8, bend: -0.4 },
  lookout: { label: 'Research Lookout', x: 5.2, z: -3.0, entry: [5.2, -1.0], labelY: 3.6, bend: 0.5 },
  beachchair: { label: "Nasty's Chair", x: 8.6, z: 6.0, entry: [7.6, 4.9], labelY: 2.0, bend: -0.6 },
  guestdesk: { label: 'Guest Desk', x: -2.6, z: 2.9, entry: [-2.4, 1.8], labelY: 1.6, bend: 0.3, noLabel: true },
};

export const TEAM_ZONE = {
  leadership: 'tower',
  content: 'cabana',
  realestate: 'lanai',
  networking: 'tikihut',
  money: 'moneydesk',
  product: 'dock',
  home: 'bungalow',
  research: 'lookout',
  fun: 'beachchair',
  guest: 'guestdesk',
};

export const TEAM_LABELS = {
  leadership: 'Leadership',
  content: 'Content Crew',
  realestate: 'Real Estate',
  networking: 'Networking',
  money: 'Money',
  product: 'Product',
  home: 'Home',
  research: 'Research',
  fun: 'Fun',
  guest: 'Guest',
};

export function teamLabel(team) {
  return TEAM_LABELS[team] || (team ? team.charAt(0).toUpperCase() + team.slice(1) : 'Team');
}

export function nearestZone(x, z) {
  let best = 'tower';
  let bestD = Infinity;
  for (const [key, zone] of Object.entries(ZONES)) {
    const d = Math.hypot(zone.x - x, zone.z - z);
    if (d < bestD) {
      bestD = d;
      best = key;
    }
  }
  return { zone: best, distance: bestD };
}

// ---------------------------------------------------------------------------
// Bot slots
// ---------------------------------------------------------------------------

function arc(cx, cz, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = ((a0 + (a1 - a0) * t) * Math.PI) / 180;
    out.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) });
  }
  return out;
}

function grid(cx, cz, cols, dx, dz, n) {
  const out = [];
  const rows = Math.ceil(n / cols);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const col = i % cols;
    out.push({ x: cx + (col - (inRow - 1) / 2) * dx, z: cz + (row - (rows - 1) / 2) * dz });
  }
  return out;
}

const SLOT_RULES = {
  tower: (n) => [{ x: 0, z: 0.2, y: towerTopY(), raised: true }, ...arc(0, 0, 3.4, 40, 140, Math.max(0, n - 1))],
  cabana: (n) => arc(-6.5, -4.5, 3.2, 15, 165, n).map((p) => ({ ...p, faceOut: true })),
  lanai: (n) => grid(12.9, 0.9, 4, 1.1, 1.1, n),
  tikihut: (n) => arc(0.5, 6.8, 1.75, 25, 155, n).map((p) => ({ ...p, faceOut: true })),
  moneydesk: (n) => arc(-9.5, 0.5, 0.85, 250, 290, n),
  dock: (n) => grid(-12.6, 4.4, 3, 0.8, 0.6, n),
  bungalow: (n) => arc(1.8, -7.3, 1.5, 70, 110, n),
  lookout: (n) => grid(5.2, -3.0, 2, 0.75, 0.6, n).map((p) => ({ ...p, y: lookoutTopY(), raised: true })),
  beachchair: (n) => [{ x: 8.6, z: 6.0, lounge: true }, ...arc(8.6, 6.0, 1.5, 200, 340, Math.max(0, n - 1))],
  guestdesk: (n) => [{ x: -2.6, z: 2.35 }, ...arc(-2.6, 2.9, 1.1, 200, 340, Math.max(0, n - 1))],
};

// Returns { [botId]: { id, zone, x, y, z, rotY, raised, lounge, doorstep, hammock } }
export function layoutBots(bots) {
  const byZone = {};
  for (const b of bots) {
    const key = ZONES[b.zone] ? b.zone : 'tower';
    const extra = !ZONES[b.zone];
    (byZone[key] ||= []).push({ bot: b, extra });
  }
  const out = {};
  for (const [key, list] of Object.entries(byZone)) {
    const zone = ZONES[key];
    const normal = list.filter((l) => !l.extra);
    const extras = list.filter((l) => l.extra);
    const slots = SLOT_RULES[key](normal.length);
    const extraSlots = arc(0, 0, 4.3, 200, 340, extras.length);
    const all = [
      ...normal.map((l, i) => ({ l, s: slots[i] })),
      ...extras.map((l, i) => ({ l, s: extraSlots[i] })),
    ];
    all.forEach(({ l, s }, i) => {
      const y = s.y ?? groundY(s.x, s.z);
      const dx = s.x - zone.x;
      const dz = s.z - zone.z;
      const rotY = s.faceOut ? Math.atan2(dx, dz) : 0;
      // Hammock spot for sleeping bots at night: a little outward from their slot.
      let ox = dx;
      let oz = dz;
      const ol = Math.hypot(ox, oz);
      if (ol < 0.3) {
        ox = 0;
        oz = 1;
      } else {
        ox /= ol;
        oz /= ol;
      }
      const hDist = s.raised ? 2.3 + (i % 2) * 0.4 : 1.15;
      const hx = s.x + ox * hDist;
      const hz = s.z + oz * hDist;
      out[l.bot.id] = {
        id: l.bot.id,
        zone: key,
        x: s.x,
        y,
        z: s.z,
        rotY,
        raised: !!s.raised,
        lounge: !!s.lounge,
        doorstep: s.raised ? { x: zone.entry[0], z: zone.entry[1] } : null,
        hammock: { x: hx, y: groundY(hx, hz), z: hz, rotY: Math.atan2(ox, oz) },
      };
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sand paths and walking routes (bezier curves)
// ---------------------------------------------------------------------------

const v3 = (x, z) => new THREE.Vector3(x, 0, z);

export function hubPoint(key) {
  const [ex, ez] = ZONES[key].entry;
  const len = Math.hypot(ex, ez) || 1;
  return { x: (ex / len) * HUB_RADIUS, z: (ez / len) * HUB_RADIUS };
}

// The sand path from a zone's entry to the ring around the tower.
export function zonePathCurve(key) {
  const zone = ZONES[key];
  if (!zone) return null;
  const a = v3(zone.entry[0], zone.entry[1]);
  const h = hubPoint(key);
  const b = v3(h.x, h.z);
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 0.05) return null;
  const perp = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(zone.bend * Math.min(1, len / 4));
  const c1 = a.clone().addScaledVector(d, 0.33).add(perp);
  const c2 = a.clone().addScaledVector(d, 0.66).add(perp.clone().multiplyScalar(0.6));
  return new THREE.CubicBezierCurve3(a, c1, c2, b);
}

function reverseCubic(c) {
  return new THREE.CubicBezierCurve3(c.v3.clone(), c.v2.clone(), c.v1.clone(), c.v0.clone());
}

function cubicBetween(a, b, bend = 0) {
  const d = b.clone().sub(a);
  const perp = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(bend * Math.min(1, d.length() / 2));
  return new THREE.CubicBezierCurve3(
    a.clone(),
    a.clone().addScaledVector(d, 0.33).add(perp),
    a.clone().addScaledVector(d, 0.66).add(perp),
    b.clone()
  );
}

// Arc around the tower ring, as cubic beziers, taking the shorter way.
export function arcCubics(a0, a1, R) {
  let diff = a1 - a0;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) < 0.05) return [];
  const n = Math.ceil(Math.abs(diff) / (Math.PI / 2));
  const step = diff / n;
  const k = (4 / 3) * Math.tan(step / 4) * R;
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = a0 + i * step;
    const e = s + step;
    const p0 = v3(R * Math.cos(s), R * Math.sin(s));
    const p3 = v3(R * Math.cos(e), R * Math.sin(e));
    const c1 = p0.clone().add(v3(-Math.sin(s) * k, Math.cos(s) * k));
    const c2 = p3.clone().sub(v3(-Math.sin(e) * k, Math.cos(e) * k));
    out.push(new THREE.CubicBezierCurve3(p0, c1, c2, p3));
  }
  return out;
}

export function ringPoints(R = HUB_RADIUS, n = 64) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(v3(R * Math.cos(a), R * Math.sin(a)));
  }
  return pts;
}

// Walking route between two bot slots, along the sand paths.
// Returns { length, pointAt(u) -> {x,y,z}, tangentAt(u) -> {x,z} } with u in 0..1.
export function routeBetween(from, to) {
  const sameZone = from.zone === to.zone;
  const useDoorstep = to.raised && to.doorstep && !(sameZone && from.raised);
  const endP = useDoorstep ? to.doorstep : to;
  const start = v3(from.x, from.z);
  const end = v3(endP.x, endP.z);
  const path = new THREE.CurvePath();
  const add = (c) => {
    if (c && c.getLength() > 0.02) path.add(c);
  };

  if (sameZone) {
    const zc = ZONES[from.zone] || { x: 0, z: 0 };
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const out = v3(mid.x - zc.x, mid.z - zc.z);
    if (out.length() < 0.1) out.set(0, 0, 1);
    out.normalize().multiplyScalar(0.9);
    add(
      new THREE.CubicBezierCurve3(
        start.clone(),
        start.clone().lerp(end, 0.25).add(out),
        start.clone().lerp(end, 0.75).add(out),
        end.clone()
      )
    );
  } else {
    const za = ZONES[from.zone];
    const zb = ZONES[to.zone];
    const ea = v3(za.entry[0], za.entry[1]);
    const eb = v3(zb.entry[0], zb.entry[1]);
    add(cubicBetween(start, ea, 0.3));
    add(zonePathCurve(from.zone));
    const ha = hubPoint(from.zone);
    const hb = hubPoint(to.zone);
    arcCubics(Math.atan2(ha.z, ha.x), Math.atan2(hb.z, hb.x), HUB_RADIUS).forEach(add);
    const pb = zonePathCurve(to.zone);
    if (pb) add(reverseCubic(pb));
    add(cubicBetween(eb, end, -0.3));
  }
  if (!path.curves.length) path.add(new THREE.LineCurve3(start, end.clone().add(v3(0.05, 0))));

  const length = path.getLength();
  const linearY = sameZone && from.raised && to.raised;
  const startY = from.y;
  const endY = useDoorstep ? groundY(end.x, end.z) : to.y;
  const D = 1.6;

  return {
    length,
    pointAt(u) {
      const uu = clamp01(u);
      const p = path.getPointAt(uu);
      let y;
      if (linearY) {
        y = lerp(startY, endY, uu);
      } else {
        y = groundY(p.x, p.z);
        const s = uu * length;
        if (s < D) y = lerp(startY, y, smoothstep(0, 1, s / D));
        const se = length - s;
        if (se < D) y = lerp(endY, y, smoothstep(0, 1, se / D));
      }
      return { x: p.x, y, z: p.z };
    },
    tangentAt(u) {
      const t = path.getTangentAt(clamp01(u));
      return { x: t.x, z: t.z };
    },
  };
}

// ---------------------------------------------------------------------------
// Scenery placement (deterministic, so the island looks the same every visit)
// ---------------------------------------------------------------------------

function seeded(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const AVOID = [
  { k: 'tower', r: 3.6 },
  { k: 'cabana', r: 4.1 },
  { k: 'lanai', r: 3.6 },
  { k: 'tikihut', r: 2.9 },
  { k: 'moneydesk', r: 2.0 },
  { k: 'dock', r: 2.6 },
  { k: 'bungalow', r: 2.5 },
  { k: 'lookout', r: 2.3 },
  { k: 'beachchair', r: 2.1 },
  { k: 'guestdesk', r: 1.8 },
];

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp01(((px - ax) * dx + (pz - az) * dz) / l2);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function clearOfPaths(x, z, margin) {
  for (const { k, r } of AVOID) {
    const zone = ZONES[k];
    if (Math.hypot(x - zone.x, z - zone.z) < r) return false;
  }
  const rr = Math.hypot(x, z);
  if (Math.abs(rr - HUB_RADIUS) < margin + 0.4) return false;
  for (const k of Object.keys(ZONES)) {
    const [ex, ez] = ZONES[k].entry;
    const h = hubPoint(k);
    if (distToSegment(x, z, ex, ez, h.x, h.z) < margin + 0.6) return false;
  }
  return true;
}

export const PALMS = (() => {
  const r = seeded(42);
  const list = [];
  const count = 40;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (r() - 0.5) * 0.14;
    const e = 0.6 + r() * 0.26;
    const s = Math.sqrt(e);
    let x = ISLAND.rx * s * Math.cos(a);
    let z = ISLAND.rz * s * Math.sin(a);
    const w = islandWobble(x, z);
    x *= w;
    z *= w;
    if (!clearOfPaths(x, z, 0.5)) continue;
    list.push({ x, z, h: 2.3 + r() * 1.2, tilt: 0.08 + r() * 0.2, tiltDir: r() * Math.PI * 2, yaw: r() * Math.PI * 2 });
  }
  // Hand-placed groves: palms around the tiki hut, a screen in front of
  // Flo's private bungalow, and a few near the cabana and lookout.
  const groves = [
    [-1.7, 5.7], [-1.4, 8.1], [3.3, 8.0], [3.7, 6.5],
    [-0.4, -5.0], [3.2, -5.2], [4.0, -6.2], [-1.3, -6.3], [0.2, -8.6], [3.4, -8.3],
    [-9.7, -5.6], [-3.4, -6.6],
    [6.9, -4.3], [3.5, -4.4],
  ];
  for (const [x, z] of groves) {
    list.push({ x, z, h: 2.4 + r() * 1.0, tilt: 0.08 + r() * 0.16, tiltDir: r() * Math.PI * 2, yaw: r() * Math.PI * 2 });
  }
  return list;
})();

export const FLOWERS = (() => {
  const r = seeded(7);
  const colors = ['#ff5d8f', '#ff8a3d', '#ffd23f', '#f25cff', '#ffffff', '#ff4d4d'];
  const list = [];
  let tries = 0;
  while (list.length < 46 && tries < 600) {
    tries++;
    const x = (r() - 0.5) * 2 * ISLAND.rx * 0.85;
    const z = (r() - 0.5) * 2 * ISLAND.rz * 0.85;
    if (islandE(x, z) > 0.68) continue;
    if (!clearOfPaths(x, z, 0.2)) continue;
    list.push({ x, z, color: colors[Math.floor(r() * colors.length)], s: 0.7 + r() * 0.6 });
  }
  return list;
})();

export const ROCKS = (() => {
  const r = seeded(99);
  const list = [];
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2;
    const e = 0.93 + r() * 0.16;
    const s = Math.sqrt(e);
    let x = ISLAND.rx * s * Math.cos(a);
    let z = ISLAND.rz * s * Math.sin(a);
    const w = islandWobble(x, z);
    x *= w;
    z *= w;
    if (Math.hypot(x - 12.9, z - 1) < 4 || Math.hypot(x + 13.4, z - 4.4) < 3.5) continue;
    list.push({ x, z, s: 0.25 + r() * 0.45, rot: r() * Math.PI });
  }
  return list;
})();
