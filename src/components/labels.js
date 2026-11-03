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
};

const v = new THREE.Vector3();

export function LabelDirector({ controls }) {
  useFrame(({ camera, size, invalidate }) => {
    const target = controls?.current?.target;
    const camDist = target ? camera.position.distanceTo(target) : labelState.baseDist;
    const base = labelState.baseDist || 24;
    const tier = camDist < base * 0.62 ? 'close' : camDist > base * 1.12 ? 'far' : 'default';
    labelState.tier = tier;

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
    for (const c of cands.filter((x) => x.rank <= 1)) {
      kept.push(c);
      next.add(c.id);
    }
    for (const z of zoneCands) {
      if (overlaps(z)) continue;
      kept.push(z);
      nextZones.add(z.key);
    }
    for (const c of cands.filter((x) => x.rank > 1)) {
      if (overlaps(c)) continue;
      kept.push(c);
      next.add(c.id);
    }
    const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
    const changed = !same(next, labelState.visible) || !same(nextZones, labelState.visibleZones);
    labelState.visible = next;
    labelState.visibleZones = nextZones;
    // On-demand rendering (reduced motion): draw again so the tags catch up.
    if (changed || labelState.zones.size === 0 || labelState.positions.size === 0) invalidate();
  }, -0.5);
  return null;
}
