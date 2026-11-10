import { HUB_RADIUS, ZONES, arcCubics, hubPoint, zonePathCurve } from '../../utils/paths.js';

// Walking routes for the arrivals (tourist, recruits, greeter) over the
// island's sand paths, which are kept clear of palms and buildings: from a
// spot near one zone's path, along it to the ring around Chief's Tower,
// round the ring, and out along another zone's path. `via` lists extra hand-
// checked points between a zone's path end (its entry) and the spot.

const sample = (curve, n) => Array.from({ length: n + 1 }, (_, i) => {
  const p = curve.getPoint(i / n);
  return [p.x, p.z];
});

// Points from a zone's entry to its hub point on the ring.
function zoneLeg(key) {
  const c = zonePathCurve(key);
  if (c) return sample(c, 14);
  const h = hubPoint(key);
  return [[h.x, h.z]];
}

function ringLeg(fromKey, toKey) {
  const a = hubPoint(fromKey);
  const b = hubPoint(toKey);
  const out = [];
  for (const c of arcCubics(Math.atan2(a.z, a.x), Math.atan2(b.z, b.x), HUB_RADIUS)) out.push(...sample(c, 6).slice(1));
  return out;
}

const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
function nearest(list, q) {
  let best = 0;
  for (let i = 1; i < list.length; i++) if (d2(list[i], q) < d2(list[best], q)) best = i;
  return best;
}

// A stop: { zone, at: [x, z], via?: [[x, z], ...] } (via runs entry -> at).
export function tripPoints(a, b) {
  const out = [a.at, ...[...(a.via || [])].reverse()];
  if (a.zone === b.zone) {
    out.push(...(b.via || []), b.at);
    return out;
  }
  let la = zoneLeg(a.zone);
  la = la.slice(nearest(la, out[out.length - 1]));
  out.push(...la, ...ringLeg(a.zone, b.zone));
  const tail = [...(b.via || []), b.at];
  let lb = zoneLeg(b.zone).reverse();
  lb = lb.slice(0, nearest(lb, tail[0]) + 1);
  out.push(...lb, ...tail);
  return dedupe(out);
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) if (!out.length || d2(out[out.length - 1], p) > 0.0004) out.push(p);
  return out;
}

export { dedupe };
