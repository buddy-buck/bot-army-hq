import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BOT_SCALE, HIGH_FIVE_SECONDS, HIGH_FIVE_SLAP } from '../../components/Bot.jsx';
import { couriers } from '../../components/Handoff.jsx';
import { botFx, fxNow, labelState } from '../../components/labels.js';
import { puff } from './fx.jsx';

// High fives between real bots. Every few frames, look at where each bot is
// (labelState.positions). A bot that moved since the last look is walking
// (a handoff courier or a bot heading to a new spot). When a walker comes
// within reach of another standing bot, both get a botFx.highFive (Bot.jsx
// turns them and raises the hidden wave arm) and a little gold star burst
// pops where the hands meet. Once per pair every 30 seconds.

const REACH = 0.9;
const PAIR_COOLDOWN = 30;
const CHECK_EVERY = 0.12;
const STAND_LABEL = 1.42 * BOT_SCALE; // standing and walking bots put their tag here
const HAND_Y = 0.8 * BOT_SCALE; // about where the raised hands meet

export default function HighFives() {
  const st = useRef({ acc: 0, prev: new Map(), cool: new Map(), bursts: [], walkers: [], standers: [] });

  useEffect(() => () => botFx.highFive.clear(), []);

  useFrame((_, delta) => {
    const s = st.current;
    const now = fxNow();
    // scheduled star bursts (when the hands actually meet)
    for (let i = s.bursts.length - 1; i >= 0; i--) {
      const b = s.bursts[i];
      if (now >= b.at) {
        puff('star', b.x, b.y, b.z, 9);
        s.bursts.splice(i, 1);
      }
    }
    s.acc += Math.min(delta, 0.1);
    if (s.acc < CHECK_EVERY) return;
    const dt = s.acc;
    s.acc = 0;

    const walkers = s.walkers;
    const standers = s.standers;
    walkers.length = 0;
    standers.length = 0;
    for (const [id, p] of labelState.positions) {
      let prev = s.prev.get(id);
      if (!prev) {
        prev = { x: p.x, z: p.z };
        s.prev.set(id, prev);
      }
      const speed = Math.hypot(p.x - prev.x, p.z - prev.z) / dt;
      prev.x = p.x;
      prev.z = p.z;
      if (Math.abs(p.labelY - STAND_LABEL) > 0.02) continue; // lying, lounging or seated
      const c = couriers.get(id);
      if (c?.ride) continue; // riding a boat
      if (botFx.highFive.has(id)) continue;
      if (speed > 0.4 && speed < 6) walkers.push(id);
      else if (speed < 0.05) standers.push(id);
    }
    if (!walkers.length) return;

    const tryPair = (a, b) => {
      const pa = labelState.positions.get(a);
      const pb = labelState.positions.get(b);
      if (!pa || !pb || Math.abs(pa.y - pb.y) > 0.25) return false;
      if (Math.hypot(pa.x - pb.x, pa.z - pb.z) > REACH) return false;
      if (botFx.highFive.has(a) || botFx.highFive.has(b)) return false;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (now - (s.cool.get(key) ?? -1e9) < PAIR_COOLDOWN) return false;
      s.cool.set(key, now);
      botFx.highFive.set(a, { at: now, x: pb.x, z: pb.z });
      botFx.highFive.set(b, { at: now, x: pa.x, z: pa.z });
      s.bursts.push({ at: now + HIGH_FIVE_SECONDS * HIGH_FIVE_SLAP, x: (pa.x + pb.x) / 2, y: Math.max(pa.y, pb.y) + HAND_Y, z: (pa.z + pb.z) / 2 });
      return true;
    };

    for (let i = 0; i < walkers.length; i++) {
      for (let j = i + 1; j < walkers.length; j++) tryPair(walkers[i], walkers[j]);
      for (let j = 0; j < standers.length; j++) tryPair(walkers[i], standers[j]);
    }
  });

  return null;
}
