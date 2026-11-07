import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { extraColor } from '../MiniBot.jsx';
import { BOT_SCALE } from '../../components/Bot.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import { puff } from './fx.jsx';
import { Bubble, ease, showBubble } from './common.jsx';

// An extra doing push-ups on the sand, counting out loud ("12... 13...").
// After each set it hops up, flexes, and gets back down for another.

const SITE = SITES.pushups;
const REP = 1.3;
const HOP = 0.5;
const FLEX = 2.6;
const tmp = new THREE.Vector3();

// Plank: pivot at the feet. Shoulder height must match the (splayed) arms.
function plank(b, splay, standK = 0) {
  const reach = 0.375 * Math.cos(splay);
  const beta = Math.asin(Math.min(0.99, (reach - 0.05) / 0.5));
  const tilt = (Math.PI / 2 - beta) * (1 - standK);
  b.pose.position.y = 0.05 * (1 - standK);
  b.pose.rotation.x = tilt;
  b.armL.rotation.set(-tilt, 0, -splay);
  b.armR.rotation.set(-tilt, 0, splay);
  b.head.rotation.x = -tilt + 0.35 * (1 - standK);
}

export default function PushUps({ animate = true }) {
  const bot = useRef();
  const bubble = useRef();
  const st = useRef({ t: 0, setLen: 12, setStart: 0, last: -1, sweat: 0 });

  useFrame((_, delta) => {
    const b = bot.current;
    if (!b?.root) return;
    const s = st.current;
    b.reset();
    if (!animate) {
      plank(b, 0.1);
      showBubble(bubble.current, false);
      return;
    }
    s.t += Math.min(delta, 0.1);
    let u = s.t - s.setStart;
    const pushEnd = s.setLen * REP;
    if (u >= pushEnd + HOP * 2 + FLEX) {
      s.setStart = s.t;
      s.setLen = 10 + Math.floor(Math.random() * 8);
      s.last = -1;
      u = 0;
    }
    if (u < pushEnd) {
      const rep = Math.floor(u / REP);
      const k = (u % REP) / REP;
      const depth = Math.sin(k * Math.PI) ** 2;
      plank(b, 0.1 + 0.75 * depth);
      if (rep !== s.last) {
        s.last = rep;
        if (rep > 0 && rep % 4 === 0) {
          // a drop of sweat
          const p = b.head.getWorldPosition(tmp);
          puff('splash', p.x, p.y + 0.1, p.z, 2);
        }
      }
      showBubble(bubble.current, true, rep === 0 ? 'Push-ups!' : `${rep}…`);
    } else if (u < pushEnd + HOP) {
      const k = ease((u - pushEnd) / HOP);
      plank(b, 0.1, k);
      b.pose.position.y += Math.sin(k * Math.PI) * 0.12;
      showBubble(bubble.current, true, `${s.setLen}!`);
    } else if (u < pushEnd + HOP + FLEX) {
      const k = u - pushEnd - HOP;
      const pump = Math.sin(k * 7) * 0.5 + 0.5;
      // double biceps flex: upper arms out, a pump every half second
      b.armL.rotation.set(0, 0, -1.55 - pump * 0.35);
      b.armR.rotation.set(0, 0, 1.55 + pump * 0.35);
      b.head.rotation.y = Math.sin(k * 2) * 0.35;
      b.head.rotation.x = -0.15;
      b.pose.position.y = pump * 0.025;
      showBubble(bubble.current, true, '💪');
    } else {
      const k = ease((u - pushEnd - HOP - FLEX) / HOP);
      plank(b, 0.1, 1 - k);
      showBubble(bubble.current, false);
    }
  });

  return (
    <group position={[SITE.x, groundY(SITE.x, SITE.z), SITE.z]} rotation={[0, SITE.rotY + Math.PI / 2, 0]}>
      <MiniBot ref={bot} color={extraColor(3)} position={[0, 0, -0.35]} />
      <Bubble bubbleRef={bubble} position={[0, 1.55 * BOT_SCALE, 0]} />
    </group>
  );
}
