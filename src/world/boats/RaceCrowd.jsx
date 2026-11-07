import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BOT_SCALE } from '../../components/Bot.jsx';
import { groundY } from '../../utils/paths.js';
import MiniBot, { CREW_COLORS } from '../MiniBot.jsx';
import { angDiff, clamp, lerp, smooth } from './kit.js';

// Race fans: a few crew bots stroll down to the south beach when a boat race
// starts, bounce and wave while the boats line up, jump and cheer through
// the race (heads following the leader), party at the finish, then wander
// back up the beach and off. Driven by raceShow, which BoatRace.jsx writes.
//
// Spots: free sand between the food-truck line (west) and the lifeguard
// tower (east), islandE 0.82..0.95, clear of every site footprint.

export const raceShow = {
  crowd: 'off', // 'off' | 'in' (walk down, then cheer) | 'party' | 'out'
  t0: 0, // when the crowd phase started (race clock)
  now: 0, // race clock, seconds
  racing: false,
  leader: -1, // 0 = Launch's #1, 1 = the gold #2
  boats: [
    { x: 0, z: 0, on: false },
    { x: 0, z: 0, on: false },
  ],
};

const SPOTS = [
  [-0.9, 14.3],
  [-0.25, 13.85],
  [0.4, 14.25],
  [0.85, 13.75],
  [-0.3, 14.62],
];
// Where each fan walks in from (and back to): up the slope east of the food-truck line.
const ENTRIES = [
  [0.2, 11.0],
  [0.5, 10.8],
  [0.8, 11.0],
  [1.1, 11.25],
  [0.35, 11.35],
];
export const CROWD_WALK = 4.4; // seconds to walk down (or back)
export const CROWD_STAGGER = 0.55; // seconds between fans setting off
const COLORS = [CREW_COLORS[1], CREW_COLORS[6], CREW_COLORS[3], CREW_COLORS[5], CREW_COLORS[4]];

export default function RaceCrowd({ count = 5 }) {
  const parts = [useRef({}), useRef({}), useRef({}), useRef({}), useRef({})];
  const yaw = useRef([0, 0, 0, 0, 0]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;
    const S = raceShow;
    const since = S.now - S.t0;
    for (let i = 0; i < count; i++) {
      const p = parts[i].current;
      if (!p.root) continue;
      if (S.crowd === 'off') {
        p.root.visible = false;
        continue;
      }
      const [sx, sz] = SPOTS[i];
      const [ex, ez] = ENTRIES[i];
      const local = since - i * CROWD_STAGGER;
      let u; // 0 at the entry, 1 at the spot
      let walking = false;
      let sc = 1;
      if (S.crowd === 'in') {
        u = clamp(local / CROWD_WALK, 0, 1);
        walking = u > 0 && u < 1;
        sc = clamp(local / 0.4, 0, 1);
      } else if (S.crowd === 'out') {
        u = 1 - clamp(local / CROWD_WALK, 0, 1);
        walking = u > 0 && u < 1;
        sc = clamp((CROWD_WALK - local) / 0.4, 0, 1);
      } else u = 1;
      p.root.visible = sc > 0.001;
      if (!p.root.visible) continue;
      const k = smooth(u);
      const x = lerp(ex, sx, k);
      const z = lerp(ez, sz, k);
      p.root.scale.setScalar(Math.max(0.001, sc) * BOT_SCALE);

      // Which way to face: along the walk, else toward the leading boat (or out to sea).
      let want = 0;
      if (walking) want = S.crowd === 'out' ? Math.atan2(ex - sx, ez - sz) : Math.atan2(sx - ex, sz - ez);
      else {
        const b = S.leader >= 0 ? S.boats[S.leader] : null;
        if (b && b.on) want = clamp(angDiff(Math.atan2(b.x - x, b.z - z), 0), -1.3, 1.3);
      }
      yaw.current[i] += angDiff(want, yaw.current[i]) * Math.min(1, dt * 4);
      p.root.rotation.y = yaw.current[i];

      let hop = 0;
      if (walking) {
        const w = (u * CROWD_WALK * 7 + i) % (Math.PI * 2);
        p.pose.position.y = Math.abs(Math.sin(w)) * 0.05;
        p.pose.rotation.z = Math.sin(w) * 0.06;
        p.footL.position.z = Math.sin(w) * 0.09;
        p.footR.position.z = -Math.sin(w) * 0.09;
        p.armL.rotation.set(-Math.sin(w) * 0.45, 0, 0);
        p.armR.rotation.set(Math.sin(w) * 0.45, 0, 0);
        p.head.rotation.y = 0;
      } else {
        // Cheering: the party is the loudest, the race itself next, waiting for the start calmest.
        const party = S.crowd === 'party';
        const level = party ? 1 : S.racing ? 0.75 : 0.35;
        const rate = party ? 7.5 : 5.5;
        const ph = t * rate + i * 1.7;
        hop = Math.max(0, Math.sin(ph)) * (party ? 0.2 : 0.13) * (level > 0.5 || (i + Math.floor(t * 0.5)) % 2 ? 1 : 0);
        p.pose.position.y = hop;
        p.pose.rotation.z = Math.sin(ph * 0.5) * 0.05 * level;
        p.footL.position.z = 0;
        p.footR.position.z = 0;
        const wave = Math.sin(t * 9 + i * 2.1) * 0.35;
        const both = level > 0.5 || i % 2 === 0;
        p.armR.rotation.set(-0.15, 0, 2.5 + wave);
        p.armL.rotation.set(-0.15, 0, both ? -2.5 + wave : -0.15);
        p.head.rotation.y = Math.sin(t * 0.7 + i) * 0.15;
      }
      p.root.position.set(x, groundY(x, z), z);
    }
  });

  return (
    <>
      {SPOTS.slice(0, count).map(([x, z], i) => (
        <MiniBot key={i} color={COLORS[i]} parts={parts[i]} position={[x, 0, z]} />
      ))}
    </>
  );
}
