import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { routeBetween } from '../utils/paths.js';

// Handoffs: the sending bot walks a glowing package along the sand path to
// the receiving bot, hands it over, and walks home. Handoffs from the last
// 24 hours replay on a loop, spaced so only one or two bots walk at a time.

// Shared live state read by <Bot/> every frame.
export const couriers = new Map(); // botId -> { x, y, z, heading }
export const receivedPulses = new Map(); // botId -> clock time the package arrived

const MAX_ORBS = 3;
const TRAIL = 14;
const WALK_SPEED = 1.5; // units per second
const MAX_LEG_SECONDS = 13;
const PAUSE = 1.8; // handoff moment at the receiver
const MIN_GAP = 5; // seconds between walk starts
const DAY_MS = 24 * 3600 * 1000;

const easeWalk = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);

export function buildSchedule(handoffs, botsById, layout) {
  const valid = (handoffs || [])
    .filter((h) => botsById[h.from] && botsById[h.to] && layout[h.from] && layout[h.to] && h.from !== h.to)
    .map((h) => ({ ...h, t: Date.parse(h.at) }))
    .filter((h) => !Number.isNaN(h.t));
  if (!valid.length) return { items: [], period: 1 };
  const newest = Math.max(...valid.map((h) => h.t));
  const recent = valid.filter((h) => h.t >= newest - DAY_MS).sort((a, b) => a.t - b.t);

  const items = [];
  const ends = [];
  const busy = {};
  let prevStart = -MIN_GAP;
  recent.forEach((h, i) => {
    const from = layout[h.from];
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
      key: `${i}-${h.from}-${h.to}`,
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
      target: new THREE.Vector3(to.x, to.y + 0.62, to.z),
      lastPulseCycle: -1,
    });
    ends.push(end);
    busy[h.from] = end;
    prevStart = start;
  });
  return { items, period: Math.max(...ends) + 4 };
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
          <meshBasicMaterial color="#fff6c2" />
        </mesh>
        <mesh ref={halo}>
          <sphereGeometry args={[0.26, 14, 10]} />
          <meshBasicMaterial color="#ffd36b" transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
      <instancedMesh ref={trail} args={[trailGeo, undefined, TRAIL]} visible={false} frustumCulled={false}>
        <meshBasicMaterial color="#ffd36b" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>
    </>
  );
}

const tmp = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const dummy = new THREE.Object3D();

export default function Handoffs({ bots, handoffs, layout, onActiveChange }) {
  const botsById = useMemo(() => Object.fromEntries(bots.map((b) => [b.id, b])), [bots]);
  const schedule = useMemo(() => buildSchedule(handoffs, botsById, layout), [handoffs, botsById, layout]);
  const t0 = useRef(null);
  const lastKey = useRef('');
  const slots = [useRef(null), useRef(null), useRef(null)];

  useEffect(() => {
    t0.current = null;
    return () => {
      couriers.clear();
    };
  }, [schedule]);

  useFrame((state) => {
    const clock = state.clock.elapsedTime;
    const { items, period } = schedule;
    if (!items.length) {
      if (couriers.size) couriers.clear();
      return;
    }
    if (t0.current === null) t0.current = clock - 1.5;
    const elapsed = clock - t0.current;
    const cycle = Math.floor(elapsed / period);
    const t = elapsed % period;

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
        const hands = new THREE.Vector3(p.x + fx * 0.28, p.y + 0.6, p.z + fz * 0.28);
        let pos = hands;
        let scale = 1;
        if (phase === 'pause') {
          const s = (lt - item.T) / PAUSE;
          pos = tmpA.copy(hands).lerp(item.target, s).clone();
          pos.y += Math.sin(Math.PI * s) * 0.9;
          scale = s > 0.82 ? Math.max(0.05, (1 - s) / 0.18) : 1;
          if (s > 0.8 && item.lastPulseCycle !== cycle) {
            item.lastPulseCycle = cycle;
            receivedPulses.set(item.to, clock);
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
        slot.halo.material.color.set(job.color).lerp(new THREE.Color('#ffe9a0'), 0.45);
        slot.trail.material.color.set(job.color).lerp(new THREE.Color('#ffe9a0'), 0.3);
      }
      const pulse = 1 + Math.sin(clock * 6) * 0.08;
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
