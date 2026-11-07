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
  lighthouse: { x: 12.7, z: -9.5, r: 1.7, height: 6.4 }, // north-east point, on rocks
  watchtower: { x: 7.6, z: 12.4, r: 1.3 }, // lifeguard-style tower on the south beach
  runway: { x: -0.6, z: -12.7, hx: 6.4, hz: 1.05, rotY: 0 }, // airstrip along the north shore, runs east-west
  visitor: { x: -13.4, z: 9.2, r: 2.1, rotY: -0.9 }, // Visitor Center near the head of Launch's Pier
  // Island life
  tikibar: { x: 12.4, z: 9.8, r: 2.4 },
  foodtruck: { x: -4.6, z: 12.0, r: 2.4 }, // the line forms toward the east (+x)
  dj: { x: 0.4, z: 12.7, r: 2.2 }, // booth faces north onto a small dance floor
  volleyball: { x: 13.4, z: -5.6, hx: 2.3, hz: 1.4, rotY: 0 },
  napHammock: { x: -14.6, z: -3.6, r: 1.5 },
  // Bot antics (set pieces)
  sandcastle: { x: -8.8, z: 12.6, r: 1.3 },
  armWrestle: { x: 2.6, z: -9.0, r: 1.2 },
  pushups: { x: 9.4, z: -6.6, r: 1.1 },
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
// Every island deck stays inside rx 26 / rz 21.
export const SEA_LANES = {
  sharkInner: { rx: 29, rz: 24 },
  sharkOuter: { rx: 36, rz: 30 },
  tour: { rx: 32.5, rz: 27 }, // glass-bottom tour boat loop
  sail: { rx: 46, rz: 39 }, // sailboats, out near the horizon
  jetski: { minR: 30 }, // jet ski runs stay at least this far out
  whale: { minR: 48 },
  nearShore: { e0: 1.25, e1: 2.2 }, // islandE() range for turtles, fish, dolphins
};
