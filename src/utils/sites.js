// Where every landmark on the bigger island lives.
//
// Coordinates: x = east (+) / west (-), z = south (+) / north (-), y = up.
// The default camera sits to the south looking north, so the south beach
// (z > 10) is the "front" of the island.
//
// This file has no imports so paths.js (and everything else) can read it.
// Each feature reads its own spot from here; nothing else hard-codes it.
// paths.js keeps palms, flowers, rocks and hammocks out of every site below.

// Footprints: { x, z, r } is a circle; { x, z, hx, hz, rotY } is a rectangle
// (half-sizes along its own x and z before rotation).
export const SITES = {
  // Buildings
  lighthouse: { x: 12.7, z: -9.5, r: 1.7, height: 6.4 }, // north-east point, on rocks; nothing else within ~3 units
  watchtower: { x: 2.6, z: 14.0, r: 1.3 }, // lifeguard tower on the middle of the south beach (American flag)
  // Bot Air moved inland (round 3): a shorter strip across the east-middle of
  // the island, between the tower and the Real Estate Lanai. Runs east-west;
  // planes take off and land over the east shore. That freed the north beach
  // for the lounge loungers and the volleyball court.
  runway: { x: 10.3, z: -3.3, hx: 4.7, hz: 1.35, rotY: 0 },
  runwayApproach: { x: 17.0, z: -3.6, hx: 1.6, hz: 1.4, rotY: 0 }, // no palms on the climb-out / final approach line
  // Visitor Center (round 4): moved well north of the welcome arch, so the
  // arch stands alone as the first thing you see from the default camera. It
  // faces south-south-east, toward the gate.
  visitor: { x: -15.1, z: -0.9, r: 2.1, rotY: 0.45 },
  // Island life
  tikibar: { x: 12.8, z: 9.6, r: 2.4 },
  foodtruck: { x: -3.6, z: 11.6, r: 3.6 }, // bigger truck; the line forms toward the east (+x)
  dj: { x: 7.0, z: 12.0, r: 3.2 }, // next to the tiki bar (drink, then dance); booth faces north onto a big dance floor (bigger in round 4)
  volleyball: { x: 4.2, z: -12.8, hx: 2.3, hz: 1.4, rotY: 0 }, // north lounge beach, all sand
  napHammock: { x: -13.2, z: -5.4, r: 1.5 }, // moved a little east in round 4 to make room for the Visitor Center
  yoga: { x: -10.0, z: -10.85, r: 1.8 }, // sunrise yoga mats, west end of the north lounge beach
  // Bot antics (set pieces)
  sandcastle: { x: -8.8, z: 12.6, r: 1.3 },
  armWrestle: { x: 2.6, z: -9.0, r: 1.2 },
  pushups: { x: -6.2, z: -9.6, r: 1.1 },
  // Round 4 extras
  welcomeLawn: { x: -13.4, z: 5.6, r: 0.9 }, // where the lei greeter stands, just inside the arch (kept clear of palms)
  visitorLawn: { x: -14.4, z: 2.3, r: 1.0 }, // open lawn in front of the Visitor Center
  archView: { x: -14.9, z: 8.4, r: 1.6 }, // open sand in front of the arch so nothing blocks it from the default camera
  traceNook: { x: -2.75, z: 6.75, r: 0.5 }, // Trace's quiet writing desk, west of the tiki hut, far from the band
  mailbox: { x: -16.45, z: 4.45, r: 0.3 }, // on Launch's Pier, north edge near the head
  fameWall: { x: 10.6, z: 11.85, r: 0.85, rotY: -0.3 }, // wall of fame, on the beach between the DJ booth and the tiki bar
};

// Per-bot stations that override the zone's automatic slots (same team and
// zone, own spot). Trace works at a quiet desk instead of the tiki hut arc,
// which sits right next to the night band stage.
export const BOT_STATIONS = {
  trace: { x: -2.1, z: 6.8, rotY: 0 },
};

// Extra beach: areas painted as sand even though they sit inland of the
// normal beach band. The north lounge beach (loungers, volleyball, yoga)
// is one big patch. Ellipses: { x, z, rx, rz }.
export const SAND_PATCHES = [
  { x: -1.8, z: -13.2, rx: 10.6, rz: 2.9 },
  { x: 4.2, z: -12.8, rx: 3.4, rz: 2.4 }, // volleyball court, 100% sand
  { x: -10.2, z: -11.6, rx: 2.6, rz: 2.0 }, // yoga corner
];

// Per-bot hammock spots that override the automatic ones. Nudge naps alone
// under a palm in a quiet corner of the north-west woods, far from Byte Bites.
export const BOT_HAMMOCKS = {
  nudge: { x: -13.0, z: -8.0, rotY: 0.75, palm: { x: -13.7, z: -8.75 } },
  trace: { x: -1.2, z: 8.4, rotY: 0.3 }, // beside her nook, well away from the DJ booth
};

// Flo's overwater bungalow (Maldives style) off the north shore: a boardwalk
// from the beach out to a platform on stilts. The bungalow itself, its glass
// floor and Flo's porch seat sit on the platform. groundY() treats both decks
// as walkable, so Flo walks out along the boardwalk.
export const FLO = {
  platform: { x0: 7.2, x1: 12.2, z0: -20.4, z1: -16.0, y: 0.62 },
  boardwalk: { x0: 8.6, x1: 10.2, z0: -16.0, z1: -12.9, y: 0.62, rampLen: 0.9 },
  // the house sits on the east half of the platform, its porch looks west (sunset)
  house: { x: 10.75, z: -18.2, rotY: -Math.PI / 2 },
  seat: { x: 8.25, z: -17.4, rotY: -Math.PI / 2 }, // Flo's porch chair
  glass: { x: 9.0, z: -19.3, hx: 1.1, hz: 0.75 }, // glass-floor panel, looking down into the lagoon
  entry: [9.4, -11.8], // where Flo's sand path starts on the beach
};

// Lanes on the water so sea life and boats don't run into the decks,
// moorings or each other. Ellipses are centered on the island center.
// Every island deck stays inside rx 27 / rz 21 (Launch's Pier reaches x -26.8).
export const SEA_LANES = {
  sharkInner: { rx: 29, rz: 24 },
  sharkOuter: { rx: 36, rz: 30 },
  tour: { rx: 32.5, rz: 27 }, // glass-bottom tour boat loop
  sail: { rx: 46, rz: 39 }, // sailboats, out near the horizon
  jetski: { minR: 30 }, // jet ski runs stay at least this far out
  whale: { minR: 48 },
  nearShore: { e0: 1.25, e1: 2.2 }, // islandE() range for turtles, fish, dolphins
};
