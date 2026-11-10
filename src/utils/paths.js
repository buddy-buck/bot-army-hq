// Island geography: terrain height, zones, bot slots, palms and the
// bezier walking routes bots use to carry handoffs between zones.
//
// Coordinates: x = east (+) / west (-), z = south (+) / north (-), y = up.
// The default camera sits to the south looking north.
import * as THREE from 'three';
import { BOT_HAMMOCKS, BOT_STATIONS, FLO, SAND_PATCHES, SITES } from './sites.js';

export { BOT_HAMMOCKS, BOT_STATIONS, FLO, SAND_PATCHES, SEA_LANES, SITES } from './sites.js';

// Zones are laid out 20% wider than the original island so they have
// breathing room. Building and bot sizes don't change, only spacing.
// The island grew again for the Bot Island HQ upgrade (rx 15.6 -> 18.5,
// rz 11.4 -> 16): the new outer ring holds the lighthouse, the airstrip, the
// beach bar and friends (see sites.js). The decks moved out to the new shore.
export const SPREAD = 1.2;
export const ISLAND = { rx: 18.5, rz: 16 };
export const HUB_RADIUS = 3.0; // sand ring around the tower hill
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
// Launch's Pier is long and wide enough for Buddy's cruiser and dock office.
// Flo's overwater bungalow has two: the boardwalk out from the beach and the
// platform the bungalow stands on.
const LANAI_DX = 2.8;
const DOCK_DX = -3.6;
export const DECKS = [
  { id: 'lanai', x0: 12.8 + LANAI_DX, x1: 18.2 + LANAI_DX, z0: -1.0, z1: 3.4, y: 0.62, ramp: { side: 'x0', len: 0.9, z0: 0.6, z1: 1.8 } },
  { id: 'dock', x0: -23.2 + DOCK_DX, x1: -12.4 + DOCK_DX, z0: 4.35, z1: 6.35, y: 0.45, ramp: { side: 'x1', len: 0.8, z0: 4.35, z1: 6.35 } },
  { id: 'floPlatform', ...FLO.platform },
  { id: 'floBoardwalk', ...FLO.boardwalk, ramp: { side: 'z1', len: FLO.boardwalk.rampLen, x0: FLO.boardwalk.x0, x1: FLO.boardwalk.x1 } },
];
export const DOCK = DECKS[1];
export const LANAI = DECKS[0];

// Height a bot stands at: decks, ramps, then sand/grass, never under water.
export function groundY(x, z) {
  for (const d of DECKS) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d.y;
    const r = d.ramp;
    if (r && r.side === 'z1') {
      if (x >= r.x0 && x <= r.x1 && z > d.z1 && z <= d.z1 + r.len) {
        const t = (d.z1 + r.len - z) / r.len;
        return lerp(Math.max(terrainY(x, z), 0), d.y, t);
      }
      continue;
    }
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
export const lookoutTopY = () => terrainY(ZONES.lookout.x, ZONES.lookout.z) + LOOKOUT_H + 0.07;

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------
// entry: where the zone's sand path starts. labelY: tag height above ground.
// bend: how much the sand path curves on its way to the tower ring.
// Chief and Claude share the top of Chief's Tower. The Content Cabana has
// an inside crew and a beach patio next door (same team, same tag).
export const ZONES = {
  tower: { label: "Chief's Tower", x: 0, z: 0, entry: [0, 3.0], labelY: 6.6, bend: 0, focusY: 3.0 },
  cabana: { label: 'Content Cabana', x: -7.8, z: -5.4, entry: [-6.4, -1.9], labelY: 3.4, bend: 0.7 },
  patio: { label: 'Lounge Beach', x: -4.4, z: -13.4, entry: [-2.9, -10.4], labelY: 2.0, bend: 0.4, noLabel: true }, // north lounge beach
  lanai: { label: 'Real Estate Lanai', x: 15.6 + LANAI_DX, z: 1.2, entry: [11.4 + LANAI_DX, 1.2], labelY: 2.6, bend: -0.6 },
  tikihut: { label: 'Networking Tiki Hut', x: 2.0, z: 7.2, entry: [2.6, 5.0], labelY: 3.3, bend: 0.3 },
  moneydesk: { label: 'Money Desk', x: -11.4, z: 0.6, entry: [-10.0, 1.8], labelY: 2.3, bend: -0.5 },
  dock: { label: "Launch's Pier", x: -16.2 + DOCK_DX, z: 5.35, entry: [-12.0 + DOCK_DX, 5.35], labelY: 2.2, bend: 0.6 },
  bungalow: { label: "Flo's Bungalow", x: FLO.house.x - 0.8, z: FLO.house.z, entry: FLO.entry, labelY: 3.2, bend: -0.3, focusY: 1.2 },
  lookout: { label: 'Research Lookout', x: 8.8, z: -7.9, entry: [7.4, -5.9], labelY: 3.6, bend: 0.3 }, // beside the lighthouse
  beachchair: { label: "Nasty's Chair", x: 10.3, z: 7.2, entry: [9.1, 5.9], labelY: 2.0, bend: -0.6 },
};

// Older data may still say "guestdesk" for Claude: that's the tower now.
export const ZONE_REDIRECTS = { guestdesk: 'tower' };

// Content crew members who work out on the beach patio instead of inside.
export const PATIO_BOTS = new Set(['echo', 'slide', 'stamp', 'scout-local', 'vibe']);

// Flo's overwater bungalow: the porch looks west, toward the sunset.
export const BUNGALOW_ROT = FLO.house.rotY;

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
  guest: 'tower',
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

// The two chairs on top of the tower (Chief on the left, Claude on the right).
export const TOWER_SEATS = [
  { x: -0.62, z: 0.25, rotY: 0.18 },
  { x: 0.62, z: 0.25, rotY: -0.18 },
];
// Inside the cabana: a double-sided work table, three workstations a side.
export const CABANA_DESK_Z = 0;
export const CABANA_STATIONS = [-1.35, 0, 1.35].flatMap((x) => [
  { x, z: -0.85, rotY: 0 }, // north side, facing the camera
  { x, z: 0.85, rotY: Math.PI }, // south side
]);
// Patio loungers on the sand next to the cabana, facing the sea.
export const PATIO_LOUNGERS = [-2.6, -1.3, 0, 1.3, 2.6].map((dx, i) => ({ x: dx, z: Math.abs(dx) * 0.18, rotY: Math.PI + dx * 0.06, i }));

const SLOT_RULES = {
  tower: (n) => [
    ...TOWER_SEATS.slice(0, n).map((s) => ({ ...s, y: towerTopY(), raised: true, seat: true })),
    ...arc(0, 0, 3.9, 40, 140, Math.max(0, n - 2)),
  ],
  cabana: (n) => {
    const z = ZONES.cabana;
    const out = CABANA_STATIONS.slice(0, n).map((s) => {
      const x = z.x + s.x;
      const zz = z.z + s.z;
      return { x, z: zz, y: groundY(x, zz) + 0.2, rotY: s.rotY, fixedRot: true };
    });
    // more than six: overflow around the front
    return out.concat(arc(z.x, z.z, 3.6, 30, 150, Math.max(0, n - out.length)).map((p) => ({ ...p, faceOut: true })));
  },
  patio: (n) => {
    const z = ZONES.patio;
    const out = PATIO_LOUNGERS.slice(0, n).map((s) => ({ x: z.x + s.x, z: z.z + s.z, rotY: s.rotY, fixedRot: true, lounge: true }));
    return out.concat(arc(z.x, z.z, 2.2, 20, 160, Math.max(0, n - out.length)));
  },
  lanai: (n) => grid(15.5 + LANAI_DX, 1.1, 4, 1.1, 1.1, n),
  tikihut: (n) => arc(ZONES.tikihut.x, ZONES.tikihut.z, 1.75, 25, 155, n).map((p) => ({ ...p, faceOut: true })),
  moneydesk: (n) => arc(ZONES.moneydesk.x, ZONES.moneydesk.z, 0.85, 250, 290, n),
  dock: (n) => grid(-14.6 + DOCK_DX, 5.35, 3, 0.8, 0.7, n),
  bungalow: (n) => {
    // Flo's porch chair on the overwater platform, facing the sunset; anyone
    // else in the zone stands along the platform's west edge. Like the tower
    // chairs, the seat pose puts the root on the deck (the pose itself lifts
    // the hips onto the cushion); nudged a hair back into the backrest.
    const s = FLO.seat;
    const back = 0.05;
    const porch = n ? [{ x: s.x - Math.sin(s.rotY) * back, z: s.z - Math.cos(s.rotY) * back, y: FLO.platform.y, rotY: s.rotY, fixedRot: true, seat: true }] : [];
    const extra = Array.from({ length: Math.max(0, n - 1) }, (_, i) => ({ x: FLO.platform.x0 + 0.6, z: FLO.platform.z1 - 0.6 - (i % 4) * 0.8, rotY: -Math.PI / 2, fixedRot: true }));
    return porch.concat(extra);
  },
  lookout: (n) => grid(ZONES.lookout.x, ZONES.lookout.z, 2, 0.75, 0.6, n).map((p) => ({ ...p, y: lookoutTopY(), raised: true })),
  beachchair: (n) => [{ x: ZONES.beachchair.x, z: ZONES.beachchair.z, lounge: true }, ...arc(ZONES.beachchair.x, ZONES.beachchair.z, 1.5, 200, 340, Math.max(0, n - 1))],
};

// Night campfire on open ground on the south-west side of the island.
export const CAMPFIRE = { x: -7.8, z: 6.2 };
export const CAMPFIRE_SEAT_H = 0.4; // log and stump tops, above the sand

// Seats around the campfire (a log or a stump each), inner ring first.
// Rings are roomy (about a meter between seats) and staggered so the back
// rows look between the front ones. Each spot is on land, clear of palms,
// decks, zone stations and landmarks (SITES), and faces the fire.
// seat: 'stump' | 'log' (Campfire.jsx draws it; bots sit with mode 'seat').
let campfireSpotCache = null;
export function campfireSpots() {
  if (campfireSpotCache) return campfireSpotCache;
  const out = [];
  [2.15, 3.2, 4.25].forEach((r, ring) => {
    const n = Math.floor((2 * Math.PI * r) / 1.08);
    const step = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const a = i * step + ring * step * 0.5 + 0.3;
      const rr = r + ((i * 7 + ring * 3) % 5 - 2) * 0.025; // a little uneven, like real seats
      const x = CAMPFIRE.x + Math.cos(a) * rr;
      const z = CAMPFIRE.z + Math.sin(a) * rr;
      if (islandE(x, z) > 0.84) continue;
      if (PALMS.some((p) => Math.hypot(p.x - x, p.z - z) < 0.85)) continue;
      if (Object.values(ZONES).some((zz) => Math.hypot(zz.x - x, zz.z - z) < 2.2)) continue;
      if (DECKS.some((d) => x > d.x0 - 0.6 && x < d.x1 + 0.6 && z > d.z0 - 0.6 && z < d.z1 + 0.6)) continue;
      if (siteDistance(x, z) < 0.6) continue;
      const rotY = Math.atan2(CAMPFIRE.x - x, CAMPFIRE.z - z);
      // Front of the circle (toward the default camera) first, so a small group sits where it's easy to see.
      out.push({ x, z, r, ring, rotY, seat: (i + ring) % 3 === 1 ? 'stump' : 'log', front: z - CAMPFIRE.z });
    }
  });
  campfireSpotCache = out.sort((p, q) => p.ring - q.ring || q.front - p.front);
  return campfireSpotCache;
}

// Where Claude stands while visiting a zone for work (outside the normal slots).
export const CLAUDE_VISIT = {
  dock: { x: -17.6 + DOCK_DX, z: 5.35, rotY: Math.PI / 2 },
  cabana: { x: ZONES.cabana.x + 2.45, z: ZONES.cabana.z, rotY: -Math.PI / 2, lift: 0.2 },
  lanai: { x: 13.35 + LANAI_DX, z: 0.45, rotY: 2.4 },
};

// Treasure chest spots: one is picked per day.
export const CHEST_SPOTS = [
  { x: 5.6, z: 4.2, rotY: 0.4 },
  { x: -11.5, z: -3.5, rotY: -0.6 },
  { x: 8.8, z: 2.9, rotY: 0.9 },
  { x: -1.2, z: -5.2, rotY: 0.2 },
  { x: 12.4, z: -6.2, rotY: -0.3 },
  { x: -9.1, z: -1.1, rotY: -0.8 },
];

// Hand-placed hammocks where the "step outward" rule would land in the water
// or on top of the desk (the Real Estate Lanai is a crowded deck).
const HAMMOCK_SPOTS = {
  lanai: [
    { x: 13.95 + LANAI_DX, z: 2.92, rotY: 0 },
    { x: 16.1 + LANAI_DX, z: 2.92, rotY: 0 },
    { x: 10.1 + LANAI_DX, z: -2.3, rotY: 0.35 },
    { x: 10.0 + LANAI_DX, z: 4.4, rotY: -0.35 },
  ],
};

export function botHash(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

// Idle bots relax. About a third of them (picked by name, so it's stable)
// stretch out in a hammock; the rest hang out near their station with a drink.
export function prefersHammock(bot) {
  return botHash(bot.id) % 3 === 0;
}

const onLand = (x, z) => islandE(x, z) < 0.86 || DECKS.some((d) => x >= d.x0 + 0.3 && x <= d.x1 - 0.3 && z >= d.z0 + 0.3 && z <= d.z1 - 0.3);

// Look outward from a station for a clear spot to hang a hammock: on land,
// off the sand paths, away from other zones, palms, stations and hammocks.
function findHammockSpot(bx, bz, ox, oz, zoneKey, placed, stations, raised) {
  const dists = raised ? [1.8, 2.6, 3.4, 4.2] : [1.4, 2.0, 2.6, 3.2, 3.8, 4.6];
  const turns = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.25, -1.25, 1.6, -1.6, 2.2, -2.2];
  let best = null;
  let bestScore = -Infinity;
  for (const d of dists) {
    for (const t of turns) {
      const c = Math.cos(t);
      const sn = Math.sin(t);
      const dx = ox * c - oz * sn;
      const dz = ox * sn + oz * c;
      const x = bx + dx * d;
      const z = bz + dz * d;
      if (!onLand(x, z) || islandE(x, z) > 0.8) continue;
      // Clearance, scaled so 1.0 means "comfortably clear" for each rule.
      let score = Math.min(1, (0.8 - islandE(x, z)) / 0.15);
      score = Math.min(score, Math.abs(Math.hypot(x, z) - HUB_RADIUS) / 1.0);
      for (const [k, zz] of Object.entries(ZONES)) {
        score = Math.min(score, Math.hypot(x - zz.x, z - zz.z) / (k === zoneKey ? 1.2 : 2.6));
        const h = hubPoint(k);
        score = Math.min(score, distToSegment(x, z, zz.entry[0], zz.entry[1], h.x, h.z) / 0.9);
      }
      for (const h of placed) score = Math.min(score, Math.hypot(x - h.x, z - h.z) / 2.4);
      score = Math.min(score, Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z) / 3.6); // keep the campfire circle clear
      for (const st of stations) score = Math.min(score, Math.hypot(x - st.x, z - st.z) / 1.0);
      for (const p of PALMS) score = Math.min(score, Math.hypot(x - p.x, z - p.z) / 1.25);
      score = Math.min(score, (siteDistance(x, z) + 0.3) / 1.3); // keep landmarks clear
      score = Math.min(1, score) - d * 0.01 - Math.abs(t) * 0.01; // prefer close and straight out
      if (score > bestScore) {
        bestScore = score;
        best = { x, y: groundY(x, z), z, rotY: Math.atan2(dx, dz) };
      }
    }
  }
  return best || { x: bx, y: groundY(bx, bz), z: bz, rotY: Math.atan2(ox, oz) };
}

// Returns { [botId]: { id, zone, x, y, z, rotY, raised, lounge, doorstep,
//   hammock, mode, home } }
// mode: 'station' (working), 'chill' (idle, standing with a drink),
//       'hammock' (sleeping, or idle and lying down), 'lounge' (a beach chair),
//       'seat' (a chair on top of the tower, mai tai in hand).
// home: where the bot should be right now for its status.
export function layoutBots(bots) {
  const byZone = {};
  for (const b of bots) {
    let zone = ZONE_REDIRECTS[b.zone] || b.zone;
    if (zone === 'cabana' && PATIO_BOTS.has(b.id)) zone = 'patio';
    const key = ZONES[zone] ? zone : 'tower';
    const extra = !ZONES[zone];
    (byZone[key] ||= []).push({ bot: b, extra });
  }
  // Chief and Claude get the two chairs on top of the tower.
  const seatOrder = (id) => (id === 'chief' ? 0 : id === 'claude' ? 1 : 2);
  if (byZone.tower) byZone.tower.sort((a, b) => a.extra - b.extra || seatOrder(a.bot.id) - seatOrder(b.bot.id));
  const out = {};
  const placedHammocks = [];
  for (const [key, list] of Object.entries(byZone)) {
    const zone = ZONES[key];
    const own = list.filter((l) => !l.extra && BOT_STATIONS[l.bot.id]);
    const normal = list.filter((l) => !l.extra && !BOT_STATIONS[l.bot.id]);
    const extras = list.filter((l) => l.extra);
    const slots = SLOT_RULES[key](normal.length);
    const extraSlots = arc(0, 0, 4.3, 200, 340, extras.length);
    const all = [
      ...normal.map((l, i) => ({ l, s: slots[i] })),
      ...own.map((l) => ({ l, s: { ...BOT_STATIONS[l.bot.id], fixedRot: true } })),
      ...extras.map((l, i) => ({ l, s: extraSlots[i] })),
    ];
    const spots = [...(HAMMOCK_SPOTS[key] || [])];
    let hk = 0;
    const stations = all.map(({ s: st }) => st);
    all.forEach(({ l, s }) => {
      const bot = l.bot;
      const y = s.y ?? groundY(s.x, s.z);
      const dx = s.x - zone.x;
      const dz = s.z - zone.z;
      const rotY = s.fixedRot ? s.rotY : s.faceOut ? Math.atan2(dx, dz) : 0;
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

      const lounge = !!s.lounge;
      const seat = !!s.seat;
      const raised = !!s.raised;
      const wantsHammock = !lounge && !seat && (bot.status === 'sleeping' || (bot.status === 'idle' && !raised && prefersHammock(bot)));

      // Hammock: a hand-placed spot, or a step outward from the station.
      // Neighbors alternate near/far so two hammocks never overlap.
      let hammock = null;
      if (wantsHammock) {
        const own = BOT_HAMMOCKS[bot.id];
        const spot = own || (!raised && spots.length ? spots.shift() : null);
        if (spot) {
          hammock = { x: spot.x, y: groundY(spot.x, spot.z), z: spot.z, rotY: spot.rotY };
        } else {
          const bx = raised ? zone.entry[0] : s.x;
          const bz = raised ? zone.entry[1] : s.z;
          hammock = findHammockSpot(bx, bz, ox, oz, key, placedHammocks, stations, raised);
        }
        placedHammocks.push(hammock);
        hk++;
      }

      // Chill spot: a short step outward from the station, facing out.
      let chill = { x: s.x, y, z: s.z, rotY: rotY + 0.5 };
      if (!raised && !lounge && !s.fixedRot) {
        const cx = s.x + ox * 0.7;
        const cz = s.z + oz * 0.7;
        const cy = groundY(cx, cz);
        if (onLand(cx, cz) && Math.abs(cy - y) < 0.2) chill = { x: cx, y: cy, z: cz, rotY: Math.atan2(ox, oz) + (botHash(bot.id) % 7 - 3) * 0.15 };
      }

      let mode = 'station';
      if (lounge) mode = 'lounge';
      else if (seat) mode = 'seat';
      else if (hammock) mode = 'hammock';
      else if (bot.status === 'idle') mode = 'chill';

      const station = { x: s.x, y, z: s.z, rotY };
      const home = mode === 'hammock' ? hammock : mode === 'chill' ? chill : station;

      out[bot.id] = {
        id: bot.id,
        zone: key,
        x: s.x,
        y,
        z: s.z,
        rotY,
        raised,
        lounge,
        doorstep: raised ? { x: zone.entry[0], z: zone.entry[1] } : null,
        hammock,
        mode,
        home: { ...home, raised: raised && mode !== 'hammock' },
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

// Distance from a point to the edge of the nearest landmark footprint in
// SITES (negative inside). Rectangles use their own rotation.
export function siteDistance(x, z, sites = SITES) {
  let best = Infinity;
  for (const s of Object.values(sites)) {
    let d;
    if (s.r !== undefined) {
      d = Math.hypot(x - s.x, z - s.z) - s.r;
    } else {
      const c = Math.cos(-(s.rotY || 0));
      const sn = Math.sin(-(s.rotY || 0));
      const lx = (x - s.x) * c - (z - s.z) * sn;
      const lz = (x - s.x) * sn + (z - s.z) * c;
      const qx = Math.abs(lx) - s.hx;
      const qz = Math.abs(lz) - s.hz;
      d = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
    }
    if (d < best) best = d;
  }
  return best;
}

// Painted beach (SAND_PATCHES in sites.js): true inside any extra-sand patch.
export function inSandPatch(x, z) {
  return SAND_PATCHES.some((p) => ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2 < 1);
}

// Open water: off the island (islandE above e0) and at least `margin` away
// from every deck. Handy for placing boats and sea life.
export function seaClear(x, z, margin = 1.2, e0 = 1.12) {
  if (islandE(x, z) < e0) return false;
  return !DECKS.some((d) => x > d.x0 - margin && x < d.x1 + margin && z > d.z0 - margin && z < d.z1 + margin);
}

const AVOID = [
  { k: 'tower', r: 4.2 },
  { k: 'cabana', r: 4.6 },
  { k: 'patio', r: 3.8 },
  { k: 'lanai', r: 3.6 },
  { k: 'tikihut', r: 2.9 },
  { k: 'moneydesk', r: 2.0 },
  { k: 'dock', r: 2.6 },
  { k: 'bungalow', r: 1.0 },
  { k: 'lookout', r: 2.3 },
  { k: 'beachchair', r: 2.1 },
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
  if (Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z) < 4.6) return false; // keep the campfire circle open
  if (siteDistance(x, z) < margin + 0.35) return false; // landmarks (sites.js)
  if (DECKS.some((d) => x > d.x0 - 0.7 && x < d.x1 + 0.7 && z > d.z0 - 0.7 && z < d.z1 + 0.7)) return false;
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
  const count = 170;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (r() - 0.5) * 0.14;
    const e = 0.5 + r() * 0.36;
    const s = Math.sqrt(e);
    let x = ISLAND.rx * s * Math.cos(a);
    let z = ISLAND.rz * s * Math.sin(a);
    const w = islandWobble(x, z);
    x *= w;
    z *= w;
    if (!clearOfPaths(x, z, 0.5) || inSandPatch(x, z)) continue;
    list.push({ x, z, h: 2.3 + r() * 1.2, tilt: 0.08 + r() * 0.2, tiltDir: r() * Math.PI * 2, yaw: r() * Math.PI * 2 });
  }
  // Hand-placed groves: palms around the tiki hut, some shade behind Flo's
  // bungalow (its porch keeps a clear view of the water), and a few near the
  // cabana and lookout.
  const groves = [
    [-1.4, 8.1], [3.3, 8.0], [3.7, 6.5],
    [-0.4, -5.0], [3.2, -5.2], [4.0, -6.2], [-1.3, -6.3],
    [-9.7, -5.6],
    [3.5, -4.4],
  ].map(([x, z]) => [x * SPREAD, z * SPREAD]);

  for (const [x, z] of groves) {
    if (!clearOfPaths(x, z, 0.1)) continue;
    list.push({ x, z, h: 2.4 + r() * 1.0, tilt: 0.08 + r() * 0.16, tiltDir: r() * Math.PI * 2, yaw: r() * Math.PI * 2 });
  }
  // Private hammock palms (BOT_HAMMOCKS): placed by hand, leaning over the
  // hammock, with no other palm crowding them.
  const own = Object.values(BOT_HAMMOCKS).filter((h) => h.palm);
  const kept = list.filter((p) => !own.some((h) => Math.hypot(p.x - h.x, p.z - h.z) < 1.8 && Math.hypot(p.x - h.palm.x, p.z - h.palm.z) > 0.01));
  for (const h of own) kept.push({ x: h.palm.x, z: h.palm.z, h: 3.2, tilt: 0.24, tiltDir: Math.atan2(h.x - h.palm.x, h.z - h.palm.z), yaw: 0.4 });
  return kept;
})();

export const FLOWERS = (() => {
  const r = seeded(7);
  const colors = ['#ff5d8f', '#ff8a3d', '#ffd23f', '#f25cff', '#ffffff', '#ff4d4d'];
  const list = [];
  let tries = 0;
  while (list.length < 95 && tries < 1600) {
    tries++;
    const x = (r() - 0.5) * 2 * ISLAND.rx * 0.85;
    const z = (r() - 0.5) * 2 * ISLAND.rz * 0.85;
    if (islandE(x, z) > 0.68 || inSandPatch(x, z)) continue;
    if (!clearOfPaths(x, z, 0.2)) continue;
    list.push({ x, z, color: colors[Math.floor(r() * colors.length)], s: 0.7 + r() * 0.6 });
  }
  return list;
})();

export const ROCKS = (() => {
  const r = seeded(99);
  const list = [];
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2;
    const e = 0.93 + r() * 0.16;
    const s = Math.sqrt(e);
    let x = ISLAND.rx * s * Math.cos(a);
    let z = ISLAND.rz * s * Math.sin(a);
    const w = islandWobble(x, z);
    x *= w;
    z *= w;
    if (Math.hypot(x - ZONES.lanai.x, z - ZONES.lanai.z) < 4.5 || (x < DOCK.x1 + 2 && z > DOCK.z0 - 2.5 && z < DOCK.z1 + 2.5)) continue;
    if (siteDistance(x, z) < 1.0 || DECKS.some((d) => x > d.x0 - 1.5 && x < d.x1 + 1.5 && z > d.z0 - 1.5 && z < d.z1 + 1.5)) continue;
    list.push({ x, z, s: 0.25 + r() * 0.45, rot: r() * Math.PI });
  }
  return list;
})();
