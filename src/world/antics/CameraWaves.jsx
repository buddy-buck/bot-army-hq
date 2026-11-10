import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SALUTE_SECONDS, WAVE_SECONDS } from '../../components/Bot.jsx';
import { couriers } from '../../components/Handoff.jsx';
import { antics, botFx, fxNow, labelState } from '../../components/labels.js';
import { conga } from '../life/conga.js';
import { aliveClock, testOn } from '../../wild/director.js';

// Breaking the fourth wall. A few seconds after the page opens, one bot
// (Chief if he's awake) gives the viewer a crisp little salute. After that,
// every minute or two by day, a bot that's on screen turns to the camera and
// waves. Bot.jsx does the moves (botFx.salute / botFx.wave) and the turn to
// the camera (botFx.look). ?test=wave: a wave every few seconds.

const TEST = testOn('wave');
const v = new THREE.Vector3();

// On screen, not too far, and roughly facing-able.
function visible(camera, p, maxDist = 34, margin = 0.78) {
  v.set(p.x, p.y + 0.8, p.z);
  if (camera.position.distanceTo(v) > maxDist) return false;
  v.project(camera);
  return v.z < 1 && Math.abs(v.x) < margin && Math.abs(v.y) < margin;
}

export default function CameraWaves({ ctx }) {
  const camera = useThree((s) => s.camera);
  const st = useRef({ clock: aliveClock(), saluted: false, next: TEST ? 6 : 60 + Math.random() * 50, last: null });

  useFrame((_, delta) => {
    const s = st.current;
    const t = s.clock.tick(delta);
    if (conga.on) return;
    const layout = ctx.layout || {};
    const awake = new Map((ctx.sceneBots || []).filter((b) => b.status !== 'sleeping' && b.status !== 'offline').map((b) => [b.id, b]));
    const free = (id) => awake.has(id) && !couriers.has(id) && !antics.has(id) && labelState.positions.has(id);

    // The salute, once, after the camera has settled.
    if (!s.saluted && t > 3.2) {
      s.saluted = true;
      const pool = Object.values(layout).filter((l) => free(l.id) && l.mode !== 'hammock' && l.mode !== 'lounge' && visible(camera, labelState.positions.get(l.id), 60, 0.9));
      const chief = pool.find((l) => l.id === 'chief');
      const pick =
        chief ||
        pool.sort((a, b) => camera.position.distanceTo(v.copy(labelState.positions.get(a.id))) - camera.position.distanceTo(v.copy(labelState.positions.get(b.id))))[0];
      if (pick) {
        const now = fxNow();
        botFx.salute.set(pick.id, now + 0.6);
        botFx.look.set(pick.id, now + 0.6 + SALUTE_SECONDS + 0.4);
      }
      return;
    }

    if (t < s.next) return;
    s.next = t + (TEST ? 7 : 55 + Math.random() * 65);
    if (ctx.bedtime || (ctx.sky?.stars ?? 0) > 0.5) return;
    const pool = Object.values(layout).filter((l) => (l.mode === 'chill' || l.mode === 'station') && l.id !== s.last && free(l.id) && visible(camera, labelState.positions.get(l.id)));
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    s.last = pick.id;
    const now = fxNow();
    botFx.look.set(pick.id, now + WAVE_SECONDS + 0.9);
    botFx.wave.set(pick.id, now + 0.5); // half a second to turn around first
  });
  return null;
}
