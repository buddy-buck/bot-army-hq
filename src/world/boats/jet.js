import * as THREE from 'three';
import { DOCK } from '../../utils/paths.js';
import { angDiff, clamp } from './kit.js';

// Geometry for Launch's jet boat and the boat races: the slip at the pier,
// the race lane round the island, and the routes between them.
//
// Paths are dense polylines measured by distance, so a boat just keeps a
// distance `d` along one and asks for its pose there.

// --- The slip -------------------------------------------------------------------------
// South side of Launch's Pier, between the dock office houseboat (west, out
// near the end) and the shore. Nose points west, out to sea. The fishing bot
// is further west still, past the office. A bollard on the pier holds each line.
export const SLIP = { x: DOCK.x0 + 7.6, z: DOCK.z1 + 0.85, h: -Math.PI / 2 };
// Pushed off from the pier, ready to turn out (and the same spot on the way back).
const OFF_Z = SLIP.z + 1.4;
// The turn out of (and back into) the slip: a small circle south of it.
const TURN = { x: SLIP.x, z: OFF_Z + 1.6, r: 1.6 };
export const PUSH_OFF = { x: SLIP.x, z: OFF_Z };

// --- The race lane -------------------------------------------------------------------
// Between the tour lane (32.5 / 27, nudged out up to 4 when it dodges) and
// the sail lane (46 / 39, the smaller sloop at 0.97). Boats run it east
// along the south shore, up the east side, west across the north and back
// down the west side. d = 0 is the start / finish line off the south beach.
export const RACE_LANE = { rx: 39.5, rz: 33.5 };
export const OFFSET = 0.9; // racers run this far inside (+) or outside (-) the lane line

export class Path {
  constructor(pts, closed = false) {
    const p = closed ? [...pts, pts[0]] : pts;
    const n = p.length;
    this.n = n;
    this.closed = closed;
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.cum = new Float32Array(n);
    this.hv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = p[i][0];
      this.z[i] = p[i][1];
      if (i) this.cum[i] = this.cum[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    }
    const hs = [];
    for (let i = 0; i < n - 1; i++) hs.push(Math.atan2(this.x[i + 1] - this.x[i], this.z[i + 1] - this.z[i]));
    for (let i = 0; i < n; i++) {
      if (i === 0) this.hv[i] = closed ? hs[0] + angDiff(hs[n - 2], hs[0]) / 2 : hs[0];
      else if (i === n - 1) this.hv[i] = closed ? this.hv[0] : hs[n - 2];
      else this.hv[i] = hs[i - 1] + angDiff(hs[i], hs[i - 1]) / 2;
    }
    this.len = this.cum[n - 1];
  }

  // Pose at distance d: out.x, out.z, out.h (heading) and out.k (turn rate
  // per unit of distance, + = turning left).
  at(d, out, off = 0) {
    const L = this.len;
    if (this.closed) d = ((d % L) + L) % L;
    else d = clamp(d, 0, L);
    let lo = 0;
    let hi = this.n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.cum[m] <= d) lo = m;
      else hi = m;
    }
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const f = (d - this.cum[lo]) / seg;
    const dh = angDiff(this.hv[hi], this.hv[lo]);
    out.h = this.hv[lo] + dh * f;
    out.k = dh / seg;
    out.x = this.x[lo] + (this.x[hi] - this.x[lo]) * f + Math.cos(out.h) * off;
    out.z = this.z[lo] + (this.z[hi] - this.z[lo]) * f - Math.sin(out.h) * off;
    return out;
  }
}

export const LANE = (() => {
  const N = 720;
  const pts = [];
  for (let j = 0; j < N; j++) {
    const a = Math.PI / 2 - (Math.PI * 2 * j) / N;
    pts.push([RACE_LANE.rx * Math.cos(a), RACE_LANE.rz * Math.sin(a)]);
  }
  return new Path(pts, true);
})();

const _o = { x: 0, z: 0, h: 0, k: 0 };
// A point on the lane, `off` to the inside (+) or outside (-).
export const lanePt = (d, off = 0) => {
  LANE.at(d, _o, off);
  return [_o.x, _o.z];
};

// A smooth route through control points, resampled every ~0.3 units.
export function smoothPath(ctrl) {
  const curve = new THREE.CatmullRomCurve3(
    ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal'
  );
  curve.arcLengthDivisions = Math.max(200, ctrl.length * 40);
  const n = Math.max(8, Math.ceil(curve.getLength() / 0.3));
  return new Path(curve.getSpacedPoints(n).map((v) => [v.x, v.z]));
}

const arc = (a0, a1, n = 6) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([TURN.x + Math.cos(a) * TURN.r, TURN.z + Math.sin(a) * TURN.r]);
  }
  return out;
};
// Out of the slip: heading west, turning left to head south.
const DEPART_ARC = arc(-Math.PI / 2, -Math.PI);
// Back in: heading north up the shore, turning left to head west.
const ARRIVE_ARC = arc(0, -Math.PI / 2);

// From the push-off spot out to the lane, joining it at lane distance `dJoin`.
function departPts(dJoin, off) {
  return [...DEPART_ARC, [TURN.x - 1.3, TURN.z + 5.5], [TURN.x + 0.6, TURN.z + 12.3], [TURN.x + 3.7, TURN.z + 18.1], lanePt(dJoin - 8, off), lanePt(dJoin, off)];
}
// From the lane (heading east past the line at `dFrom`) home to the push-off
// spot: a U-turn off the south-east, back west along the south shore.
function homePts(dFrom, off) {
  return [lanePt(dFrom, off), lanePt(dFrom + 5, off), [12.5, 31.1], [14.0, 27.6], [12.5, 24.1], [8.5, 22.6], [-1.5, 21.0], [-9.5, 19.8], [-15.0, 16.6], [TURN.x + TURN.r, 12.6], ...ARRIVE_ARC];
}

// The lane points between two lane distances, every ~6 units.
function lanePts(d0, d1, off) {
  const out = [];
  const n = Math.max(2, Math.round((d1 - d0) / 6));
  for (let i = 0; i <= n; i++) out.push(lanePt(d0 + ((d1 - d0) * i) / n, off));
  return out;
}

// The tap lap: out of the slip, one lap of the race lane, home.
export const LAP_PATH = smoothPath([...departPts(-4, 0).slice(0, -1), ...lanePts(-4, LANE.len + 1, 0), ...homePts(LANE.len + 1, 0).slice(1)]);

// Racing: the grid sits just before the line.
export const GRID_D = -4;
export const JET_TO_GRID = smoothPath(departPts(GRID_D, OFFSET));
export const JET_HOME = smoothPath(homePts(LANE.len, OFFSET));
// The rival comes in over the south-west horizon and leaves to the south-east.
export const RIVAL_IN = smoothPath([[-78, 74], [-50, 53], [-27, 40], lanePt(GRID_D - 12, -OFFSET), lanePt(GRID_D, -OFFSET)]);
export const RIVAL_OUT = smoothPath([lanePt(LANE.len, -OFFSET), lanePt(LANE.len + 6, -OFFSET), [17, 36], [36, 45], [62, 61], [92, 78]]);

// Race timing: from the grid to the line is LANE.len + 4. Both boats follow
// the same launch curve (top speed V, spool-up K seconds), the loser a touch
// slower, plus a slow sway that makes them trade the lead a few times.
export const RACE_V = 8.5;
const K = 1.6;
export const RACE_DIST = LANE.len - GRID_D;
const base = (t) => RACE_V * (t - K * (1 - Math.exp(-t / K)));
export const RACE_T = (() => {
  let lo = 0;
  let hi = 200;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (base(m) < RACE_DIST) lo = m;
    else hi = m;
  }
  return hi;
})();

// A fresh race plan: who wins, by how much, how they sway.
export function racePlan() {
  const winner = Math.random() < 0.5 ? 0 : 1;
  const gap = 0.007 + Math.random() * 0.012; // finishing margin, ~1.5 to 4.5 units
  const T = [RACE_T, RACE_T];
  T[1 - winner] = RACE_T * (1 + gap);
  const amp = 2.6 + Math.random() * 1.6;
  const sign = Math.random() < 0.5 ? 1 : -1;
  const waves = 3 + Math.floor(Math.random() * 2); // 3 or 4 lead changes-ish
  return { winner, T, A: [amp * sign, -amp * sign * (0.8 + Math.random() * 0.3)], waves, gap };
}

// Distance from the grid for racer i, t seconds after the start.
export function raceDist(plan, i, t) {
  const Ti = plan.T[i];
  const tt = Math.min(t, Ti);
  const ramp = Math.min(1, tt / 5);
  const sway = plan.A[i] * ramp * ramp * Math.sin((Math.PI * plan.waves * tt) / Ti);
  return base((tt * RACE_T) / Ti) + sway;
}
