// Where things stand in the water, so the sea can lap foam and ripples
// around them: deck and pier stilts, rocks in the surf, moored boats.
import { DOCK, FLO, LANAI, ROCKS, terrainY } from '../../utils/paths.js';

const wet = (x, z) => terrainY(x, z) < -0.04;

// Stilts under Flo's platform and boardwalk, matching the layout in
// world/landmarks/FloVilla.jsx (keep the two in step).
const FLO_STILTS = (() => {
  const p = FLO.platform;
  const b = FLO.boardwalk;
  const out = [];
  for (const x of [p.x0 + 0.15, 8.55, 10.2, 11.2, p.x1 - 0.15]) for (const z of [p.z0 + 0.15, p.z1 - 0.15]) out.push([x, z]);
  out.push([p.x0 + 0.15, -18.2], [11.2, -18.2], [p.x1 - 0.15, -18.2]);
  for (const z of [b.z0 + 0.7, (b.z0 + b.z1) / 2 + 0.3, b.z1 - 0.4]) for (const x of [b.x0 + 0.08, b.x1 - 0.08]) out.push([x, z]);
  return out;
})();

// Stilt spots matching the lanai and Launch's Pier built in Island.jsx.
function deckStilts() {
  const out = [];
  const cx = (LANAI.x0 + LANAI.x1) / 2;
  const cz = (LANAI.z0 + LANAI.z1) / 2;
  for (const x of [LANAI.x0 + 0.2, cx - 0.9, cx + 0.9, LANAI.x1 - 0.2]) for (const z of [LANAI.z0 + 0.2, cz, LANAI.z1 - 0.2]) out.push([x, z]);
  for (let x = DOCK.x0 + 0.15; x < DOCK.x1; x += 1.6) for (const z of [DOCK.z0 + 0.05, DOCK.z1 - 0.05]) out.push([x, z]);
  return out.concat(FLO_STILTS);
}

// Buddy's cruiser (north side of the pier) and the dock office houseboat
// (south side), as placed in Island.jsx and wild/Easter.jsx.
export const CRUISER_AT = { x: DOCK.x0 + 3.4, z: DOCK.z0 - 1.25 };
export const OFFICE_AT = { x: DOCK.x0 + 4.2, z: DOCK.z1 + 1.3 };

// Every foam collar: [x, z, size, phase, aspect, rotation, contact].
// size is the half-width of the foam patch; contact is where the object's
// edge sits inside it (0..1), the ripples spread from there.
export const COLLARS = (() => {
  const out = [];
  let k = 0;
  const ph = () => ((k++ * 0.618) % 1);
  for (const [x, z] of deckStilts()) if (wet(x, z)) out.push([x, z, 0.55, ph(), 1, 0, 0.3]);
  for (const r of ROCKS) if (terrainY(r.x, r.z) < 0.05) out.push([r.x, r.z, 0.5 + r.s * 1.4, ph(), 1.15, r.rot, 0.48]);
  out.push([CRUISER_AT.x - 0.3, CRUISER_AT.z, 1.0, ph(), 2.4, 0, 0.74]);
  out.push([OFFICE_AT.x, OFFICE_AT.z, 1.0, ph(), 1.65, -0.12, 0.74]);
  return out;
})();
