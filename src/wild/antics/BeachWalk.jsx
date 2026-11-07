import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import MiniBot, { extraColor } from '../MiniBot.jsx';
import { BOT_SCALE } from '../../components/Bot.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import { rareGap } from '../director.js';
import { puff } from './fx.jsx';
import { ease, lerpAngle, raiseArm, ramp, walkPose } from './common.jsx';

// Two extras strolling the south beach in opposite directions. When they
// cross they stop for a high five. Every so often one trips, falls flat (a
// little dust puff), and the other rushes over, gives a hand up, they brush
// off, high five, and carry on.

const W = SITES.beachwalk;
const SPEED = 0.8;
const RUN = 2.2;
const LANES = [W.z - 0.3, W.z + 0.25];
const HAND_Y = 0.78 * BOT_SCALE;
const LIE = Math.PI / 2 - 0.08;
const FIVE_LEN = 1.3;

// Trips only happen away from the ends, so the fall and the rescue fit on the walk.
const inTripZone = (x) => x > W.x + 1.3 && x < W.x1 - 1.3;
const headingOf = (dir) => (dir > 0 ? Math.PI / 2 : -Math.PI / 2);

export default function BeachWalk({ animate = true }) {
  const bots = [useRef(), useRef()];
  const st = useRef(null);
  if (!st.current) {
    st.current = {
      t: 0,
      w: [
        { x: W.x + 1, z: LANES[0], lane: LANES[0], dir: 1, rot: headingOf(1), phase: 0 },
        { x: W.x1 - 1, z: LANES[1], lane: LANES[1], dir: -1, rot: headingOf(-1), phase: 1.7 },
      ],
      mode: 'walk',
      modeT: 0,
      nextTrip: rareGap(70, 150),
      crossCool: 0,
      trip: { who: 0, px: 0, pz: 0, sx: 0, sz: 0, arrived: -1, burst: false, dust: false },
      fiveBurst: false,
    };
  }

  useFrame((_, delta) => {
    const s = st.current;
    const A = bots[0].current;
    const B = bots[1].current;
    if (!A?.root || !B?.root) return;
    const dt = animate ? Math.min(delta, 0.1) : 0;
    s.t += dt;
    s.modeT += dt;
    const m = [A, B];
    A.reset();
    B.reset();

    if (!animate) {
      for (let i = 0; i < 2; i++) {
        const w = s.w[i];
        m[i].root.position.set(w.x, groundY(w.x, w.z), w.z);
        m[i].root.rotation.y = w.rot;
      }
      return;
    }

    const stepWalk = (i, speedK = 1) => {
      const w = s.w[i];
      w.x += w.dir * SPEED * speedK * dt;
      if (w.x > W.x1) w.dir = -1;
      if (w.x < W.x) w.dir = 1;
      w.z += Math.sign(w.lane - w.z) * Math.min(Math.abs(w.lane - w.z), 0.8 * dt);
      w.rot = lerpAngle(w.rot, headingOf(w.dir), Math.min(1, dt * 5));
      w.phase += dt * 8 * speedK;
      walkPose(m[i], w.phase);
    };
    const face = (i, x, z, off = 0, rate = 8) => {
      const w = s.w[i];
      w.rot = lerpAngle(w.rot, Math.atan2(x - w.x, z - w.z) + off, Math.min(1, dt * rate));
    };
    // both raise armR and slap; k 0..1 over FIVE_LEN
    const highFive = (k) => {
      const up = Math.min(1, k / 0.3, (1 - k) / 0.25);
      const slap = Math.max(0, 1 - Math.abs(k - 0.45) / 0.08);
      for (let i = 0; i < 2; i++) {
        raiseArm(m[i].armR, Math.max(0, up), 1, 0.3);
        m[i].pose.position.y = slap * 0.04;
        m[i].head.rotation.x = -0.15 * up;
      }
      face(0, s.w[1].x, s.w[1].z, -0.35, 10);
      face(1, s.w[0].x, s.w[0].z, -0.35, 10);
      if (k >= 0.45 && !s.fiveBurst) {
        s.fiveBurst = true;
        const a = s.w[0];
        const b = s.w[1];
        puff('star', (a.x + b.x) / 2, (groundY(a.x, a.z) + groundY(b.x, b.z)) / 2 + HAND_Y, (a.z + b.z) / 2, 10);
      }
    };

    const a = s.w[0];
    const b = s.w[1];
    s.crossCool -= dt;

    if (s.mode === 'walk') {
      stepWalk(0);
      stepWalk(1);
      const gap = b.x - a.x;
      if (s.crossCool <= 0 && a.dir !== b.dir && Math.abs(gap) < 0.3 && gap * a.dir > 0) {
        s.mode = 'cross';
        s.modeT = 0;
        s.fiveBurst = false;
      } else if (s.t > s.nextTrip && Math.abs(gap) > 2.2 && inTripZone(a.x) && inTripZone(b.x)) {
        const who = Math.random() < 0.5 ? 0 : 1;
        const tw = s.w[who];
        const hw = s.w[1 - who];
        Object.assign(s.trip, { who, arrived: -1, burst: false, dust: false });
        s.trip.px = tw.x;
        s.trip.pz = tw.z;
        // the helper kneels beside the middle of the fallen bot, on its own lane side
        s.trip.sx = tw.x + tw.dir * 0.8; // it stumbles forward ~0.25 first, then lies ~0.6 long
        s.trip.sz = tw.z + Math.sign(hw.lane - tw.lane) * 0.5;
        s.mode = 'trip';
        s.modeT = 0;
        s.fiveBurst = false;
      }
    } else if (s.mode === 'cross') {
      const k = s.modeT / FIVE_LEN;
      // step in toward each other a little
      a.z += (LANES[0] + 0.1 - a.z) * Math.min(1, dt * 6);
      b.z += (LANES[1] - 0.1 - b.z) * Math.min(1, dt * 6);
      highFive(Math.min(k, 0.999));
      if (k >= 1) {
        s.mode = 'walk';
        s.crossCool = 6;
      }
    } else if (s.mode === 'trip') {
      const tr = s.trip;
      const ti = tr.who;
      const hi = 1 - ti;
      const T = m[ti];
      const H = m[hi];
      const tw = s.w[ti];
      const hw = s.w[hi];
      const tau = s.modeT;
      const fwd = tw.dir;

      // --- the one who trips
      if (tau < 0.45) {
        const k = tau / 0.45;
        tw.x += fwd * SPEED * (1 - k * 0.6) * dt;
        T.pose.rotation.x = 0.5 * ease(k);
        T.armL.rotation.x = -1.8 * k + Math.sin(tau * 30) * 0.4;
        T.armR.rotation.x = -1.8 * k - Math.sin(tau * 30) * 0.4;
        T.footL.position.z = -0.1 * k;
      } else if (tr.arrived < 0 || s.t - tr.arrived < 0.6) {
        // down flat, arms out front, a dazed little head shake
        const k = ramp(tau, 0.45, 0.8);
        T.pose.rotation.x = 0.5 + (LIE - 0.5) * k * k;
        T.pose.position.y = 0.16 * k;
        T.armL.rotation.x = -1.8 - 1.2 * k;
        T.armR.rotation.x = -1.8 - 1.2 * k;
        T.head.rotation.y = k >= 1 ? Math.sin(tau * 5) * 0.3 * Math.max(0, 1 - (tau - 0.8) / 1.5) : 0;
        if (k >= 1 && !tr.dust) {
          tr.dust = true;
          const y = groundY(tw.x, tw.z);
          puff('dust', tw.x + fwd * 0.55, y + 0.12, tw.z, 9);
          puff('dust', tw.x + fwd * 1.0, y + 0.1, tw.z, 5);
        }
      }

      // --- the helper
      if (tr.arrived < 0) {
        if (tau < 0.55) {
          stepWalk(hi, 1 - tau / 0.55); // slows, notices
        } else {
          const dx = tr.sx - hw.x;
          const dz = tr.sz - hw.z;
          const d = Math.hypot(dx, dz);
          const step = Math.min(d, RUN * dt);
          if (d > 0.02) {
            hw.x += (dx / d) * step;
            hw.z += (dz / d) * step;
            hw.rot = lerpAngle(hw.rot, Math.atan2(dx, dz), Math.min(1, dt * 10));
            hw.phase += dt * 15;
            walkPose(H, hw.phase, 1.4);
          } else if (tau > 0.9) {
            tr.arrived = s.t;
          }
        }
      } else {
        const h = s.t - tr.arrived;
        // face the fallen bot's middle
        const midX = tw.x + fwd * 0.42 * BOT_SCALE;
        if (h < 2.9) face(hi, midX, tw.z, 0, 8);
        if (h < 0.6) {
          const k = ease(h / 0.6);
          H.pose.rotation.x = 0.35 * k;
          H.armR.rotation.x = -1.1 * k;
          H.armR.rotation.z = 0.12;
          T.head.rotation.y = 0;
          T.armR.rotation.x = -3.0 + k * 0.8; // reaches for the hand
          T.armL.rotation.x = -3.0;
          T.pose.rotation.x = LIE;
          T.pose.position.y = 0.16;
        } else if (h < 1.7) {
          const k = ease((h - 0.6) / 1.1);
          H.pose.rotation.x = 0.35 - 0.55 * k;
          H.armR.rotation.x = -1.1 - 0.3 * k;
          T.pose.rotation.x = LIE * (1 - k);
          T.pose.position.y = 0.16 * (1 - k);
          T.armR.rotation.x = -2.2 + k * 1.0;
          T.armL.rotation.x = -3.0 * (1 - k);
          face(ti, hw.x, hw.z, 0, 3 * k);
        } else if (h < 2.9) {
          // brush off the sand
          const k = h - 1.7;
          face(ti, hw.x, hw.z, 0, 6);
          for (const bot of [T, H]) {
            bot.armL.rotation.x = -0.7 + Math.sin(k * 18) * 0.35;
            bot.armR.rotation.x = -0.7 - Math.sin(k * 18) * 0.35;
            bot.armL.rotation.z = -0.25;
            bot.armR.rotation.z = 0.25;
            bot.head.rotation.x = 0.35;
          }
          T.pose.rotation.z = Math.sin(k * 24) * 0.05;
          if (!tr.burst && k > 0.2) {
            tr.burst = true;
            puff('dust', tw.x, groundY(tw.x, tw.z) + 0.3, tw.z, 6);
          }
        } else if (h < 2.9 + FIVE_LEN) {
          highFive((h - 2.9) / FIVE_LEN);
        } else {
          s.mode = 'walk';
          s.crossCool = 4;
          s.nextTrip = s.t + rareGap(70, 150);
        }
      }
    }

    for (let i = 0; i < 2; i++) {
      const w = s.w[i];
      m[i].root.position.set(w.x, groundY(w.x, w.z), w.z);
      m[i].root.rotation.y = w.rot;
    }
  });

  return (
    <group>
      <MiniBot ref={bots[0]} color={extraColor(4)} />
      <MiniBot ref={bots[1]} color={extraColor(7)} />
    </group>
  );
}
