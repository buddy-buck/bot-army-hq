import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { routeBetween } from '../utils/paths.js';

// Handoffs: the sending bot walks a glowing package along the sand path to
// the receiving bot, hands it over, and walks home.
//
// Only real handoffs from data.json play, and each one plays once:
//   - on page load, handoffs from the last 24 hours replay as a short recap
//   - after that, only new handoffs (from a data refresh) play
// Nothing loops. When there is nothing new, nobody walks.

// Shared live state read by <Bot/> every frame.
export const couriers = new Map(); // botId -> { x, y, z, heading }
export const receivedPulses = new Map(); // botId -> clock time the package arrived

const MAX_ORBS = 3;
const TRAIL = 14;
const WALK_SPEED = 1.5; // units per second
const MAX_LEG_SECONDS = 13;
const PAUSE = 1.8; // handoff moment at the receiver
const MIN_GAP = 5; // seconds between walk starts
const RECENT_MS = 24 * 3600 * 1000;

const easeWalk = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);
export const handoffKey = (h) => `${h.from}|${h.to}|${h.at}|${h.what}`;

// Handoffs that should play now: real ones, from the last 24 hours, not
// already played, oldest first.
export function pendingHandoffs(handoffs, botsById, layout, played, now = Date.now()) {
  return (handoffs || [])
    .filter((h) => botsById[h.from] && botsById[h.to] && layout[h.from] && layout[h.to] && h.from !== h.to)
    .map((h) => ({ ...h, t: Date.parse(h.at), key: handoffKey(h) }))
    .filter((h) => !Number.isNaN(h.t) && now - h.t <= RECENT_MS && now - h.t >= -RECENT_MS && !played.has(h.key))
    .sort((a, b) => a.t - b.t);
}

// Give each new handoff a start time after what's already queued, so only one
// or two bots walk at once and no bot carries two packages at the same time.
export function scheduleHandoffs(list, queue, botsById, layout, clockNow) {
  const items = [];
  let prevStart = Math.max(clockNow + 1.5 - MIN_GAP, ...queue.map((q) => q.start));
  const ends = queue.map((q) => q.end);
  const busy = {};
  for (const q of queue) busy[q.from] = Math.max(busy[q.from] ?? -Infinity, q.end);
  for (const h of list) {
    const fromSlot = layout[h.from];
    const from = fromSlot.raised ? fromSlot : { ...fromSlot, ...fromSlot.home, raised: fromSlot.home.raised };
    const to = layout[h.to];
    const route = routeBetween(from, to);
    const speed = Math.max(WALK_SPEED, route.length / MAX_LEG_SECONDS);
    const T = Math.max(1.5, route.length / speed);
    const total = T * 2 + PAUSE;
    let start = Math.max(prevStart + MIN_GAP, (busy[h.from] ?? -Infinity) + 0.8);
    const later = ends.filter((e) => e > start).sort((a, b) => b - a);
    if (later.length >= 2) start = Math.max(start, later[1] + 0.3);
    const end = start + total;
    items.push({
      key: h.key,
      from: h.from,
      to: h.to,
      what: h.what,
      fromName: botsById[h.from].name,
      toName: botsById[h.to].name,
      color: botsById[h.from].color,
      route,
      T,
      start,
      end,
      target: new THREE.Vector3(to.x, to.y + 0.62 * 1.35, to.z),
      pulsed: false,
    });
    ends.push(end);
    busy[h.from] = end;
    prevStart = start;
  }
  return items;
}

function OrbSlot({ slotRef }) {
  const group = useRef();
  const core = useRef();
  const halo = useRef();
  const trail = useRef();
  const trailGeo = useMemo(() => new THREE.SphereGeometry(0.07, 8, 6), []);
  useEffect(() => {
    slotRef.current = { group: group.current, core: core.current, halo: halo.current, trail: trail.current, hist: [], key: null };
  }, [slotRef]);
  return (
    <>
      <group ref={group} visible={false}>
        <mesh ref={core}>
          <icosahedronGeometry args={[0.12, 1]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh ref={halo}>
          <sphereGeometry args={[0.26, 14, 10]} />
          <meshBasicMaterial color="#9fe3ff" transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
      <instancedMesh ref={trail} args={[trailGeo, undefined, TRAIL]} visible={false} frustumCulled={false}>
        <meshBasicMaterial color="#9fe3ff" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>
    </>
  );
}

const tmp = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const dummy = new THREE.Object3D();
const WHITE = new THREE.Color('#ffffff');

export default function Handoffs({ bots, handoffs, layout, onActiveChange }) {
  const botsById = useMemo(() => Object.fromEntries(bots.map((b) => [b.id, b])), [bots]);
  const clock = useThree((st) => st.clock);
  const queue = useRef([]);
  const played = useRef(new Set());
  const lastKey = useRef('');
  const slots = [useRef(null), useRef(null), useRef(null)];

  // Queue any handoffs we haven't played yet.
  useEffect(() => {
    const fresh = pendingHandoffs(handoffs, botsById, layout, played.current);
    if (!fresh.length) return;
    fresh.forEach((h) => played.current.add(h.key));
    queue.current = [...queue.current, ...scheduleHandoffs(fresh, queue.current, botsById, layout, clock.elapsedTime)];
  }, [handoffs, botsById, layout, clock]);

  useEffect(() => () => couriers.clear(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (queue.current.length && queue.current.every((q) => t >= q.end)) queue.current = [];
    const items = queue.current;

    const activeIds = new Set();
    const active = [];
    const orbJobs = [];

    for (const item of items) {
      if (t < item.start || t >= item.end) continue;
      const lt = t - item.start;
      let u;
      let phase;
      if (lt < item.T) {
        u = easeWalk(lt / item.T);
        phase = 'out';
      } else if (lt < item.T + PAUSE) {
        u = 1;
        phase = 'pause';
      } else {
        u = easeWalk(1 - (lt - item.T - PAUSE) / item.T);
        phase = 'back';
      }
      const p = item.route.pointAt(u);
      const tan = item.route.tangentAt(Math.min(0.999, Math.max(0.001, u)));
      let heading = Math.atan2(tan.x, tan.z);
      if (phase === 'back') heading += Math.PI;
      if (phase === 'pause') {
        const dx = item.target.x - p.x;
        const dz = item.target.z - p.z;
        if (Math.hypot(dx, dz) > 0.2) heading = Math.atan2(dx, dz);
      }
      couriers.set(item.from, { x: p.x, y: p.y, z: p.z, heading });
      activeIds.add(item.from);
      if (phase !== 'back') active.push(item);

      if (phase !== 'back' && orbJobs.length < MAX_ORBS) {
        const fx = Math.sin(heading);
        const fz = Math.cos(heading);
        const hands = new THREE.Vector3(p.x + fx * 0.36, p.y + 0.8, p.z + fz * 0.36);
        let pos = hands;
        let scale = 1;
        if (phase === 'pause') {
          const s = (lt - item.T) / PAUSE;
          pos = tmpA.copy(hands).lerp(item.target, s).clone();
          pos.y += Math.sin(Math.PI * s) * 0.9;
          scale = s > 0.82 ? Math.max(0.05, (1 - s) / 0.18) : 1;
          if (s > 0.8 && !item.pulsed) {
            item.pulsed = true;
            receivedPulses.set(item.to, t);
          }
        }
        orbJobs.push({ key: item.key, pos, scale, color: item.color });
      }
    }

    for (const id of [...couriers.keys()]) if (!activeIds.has(id)) couriers.delete(id);

    slots.forEach((ref, i) => {
      const slot = ref.current;
      if (!slot) return;
      const job = orbJobs[i];
      if (!job) {
        slot.group.visible = false;
        slot.trail.visible = false;
        slot.hist.length = 0;
        slot.key = null;
        return;
      }
      if (slot.key !== job.key) {
        slot.key = job.key;
        slot.hist.length = 0;
        slot.halo.material.color.set(job.color).lerp(WHITE, 0.35);
        slot.trail.material.color.set(job.color).lerp(WHITE, 0.25);
      }
      const pulse = 1 + Math.sin(t * 6) * 0.08;
      slot.group.visible = true;
      slot.group.position.copy(job.pos);
      slot.group.scale.setScalar(job.scale * pulse);

      const last = slot.hist[0];
      if (!last || last.distanceToSquared(job.pos) > 0.0016) {
        slot.hist.unshift(job.pos.clone());
        if (slot.hist.length > TRAIL) slot.hist.pop();
      }
      slot.trail.visible = slot.hist.length > 1;
      for (let k = 0; k < TRAIL; k++) {
        const hp = slot.hist[k];
        if (hp) {
          const f = 1 - k / TRAIL;
          dummy.position.copy(hp);
          dummy.scale.setScalar(Math.max(0.001, f * f * job.scale * 1.1));
        } else {
          dummy.position.copy(tmp.set(0, -50, 0));
          dummy.scale.setScalar(0.001);
        }
        dummy.updateMatrix();
        slot.trail.setMatrixAt(k, dummy.matrix);
      }
      slot.trail.instanceMatrix.needsUpdate = true;
    });

    const key = active.map((a) => a.key).join('|');
    if (key !== lastKey.current) {
      lastKey.current = key;
      onActiveChange?.(
        active.map((a) => ({ key: a.key, from: a.from, to: a.to, fromName: a.fromName, toName: a.toName, what: a.what, color: a.color }))
      );
    }
  }, -1);

  return (
    <group>
      {slots.map((ref, i) => (
        <OrbSlot key={i} slotRef={ref} />
      ))}
    </group>
  );
}
