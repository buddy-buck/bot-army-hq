import { SITES, groundY } from '../../utils/paths.js';
import { BOT_SCALE } from '../../components/Bot.jsx';
import { toWorld } from './common.jsx';

// Shared layout for the DJ booth and the night concert (DJBooth.jsx,
// Concert.jsx). Everything lives inside the SITES.dj circle (r 2.9) on the
// south-east beach, next to the tiki bar.
//
// Local frame: +z points north. From south to north (toward the default
// camera's horizon): the DJ booth on its stage, facing north onto a big
// light-up dance floor, then a small band stage on the far side facing back
// south, so the camera sees the DJ's back, the dancers' faces by day and the
// band's faces at night.
export const F = { x: SITES.dj.x - 0.2, z: SITES.dj.z - 0.1, rotY: Math.PI };
export const S = BOT_SCALE;

function groundRange(x0, x1, z0, z1) {
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const [x, z] = toWorld(F, x0 + ((x1 - x0) * i) / 8, z0 + ((z1 - z0) * j) / 8);
      const y = groundY(x, z);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
  }
  return [lo, hi];
}

// Footprints in local units.
export const STAGE = { x0: -1.5, x1: 1.5, z0: -2.0, z1: -0.85 }; // DJ booth
export const FLOOR = { x0: -1.5, x1: 1.5, z0: -0.6, z1: 1.5 }; // 3.0 x 2.1 (2x the old floor)
export const BAND = { x0: -1.0, x1: 1.0, z0: 1.72, z1: 2.5 }; // concert stage

const [sLo, sHi] = groundRange(STAGE.x0, STAGE.x1, STAGE.z0, STAGE.z1);
export const STAGE_Y = sHi + 0.1;
export const STAGE_LOW = sLo - 0.08;
const [fLo, fHi] = groundRange(FLOOR.x0, FLOOR.x1, FLOOR.z0, FLOOR.z1);
export const TILE_T = 0.04;
export const FLOOR_Y = fHi + 0.06;
export const FLOOR_LOW = fLo - 0.08;
export const FLOOR_TOP = FLOOR_Y + TILE_T / 2;
const [bLo, bHi] = groundRange(BAND.x0, BAND.x1, BAND.z0, BAND.z1);
export const BAND_Y = bHi + 0.8; // a proper raised stage, so the band shows over the crowd
export const BAND_LOW = bLo - 0.08;

export const TABLE_Z = -1.1;
export const TABLE_Y = STAGE_Y + 0.5; // deck height: the DJ's hands rest on it
export const DJ_Z = -1.65;

// Ground height under a local point.
export function localGround(lx, lz) {
  const [x, z] = toWorld(F, lx, lz);
  return groundY(x, z);
}

// Written by DJBooth every frame, read by the concert pieces.
//   b: beats (on the music when it plays, else an idle groove)
//   pulse: 0..1 kick envelope, music: true while the lo-fi loop plays
export const groove = { t: 0, b: 0, pulse: 0, music: false };
