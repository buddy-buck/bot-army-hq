import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { fxNow } from '../../components/labels.js';
import { groundY } from '../../utils/paths.js';
import MiniBot from '../MiniBot.jsx';
import { aimCrew, bump, ease, lerp, restArms, standCrew, toPose } from './rig.js';
import { HELP_LEN } from './botPose.js';

// A crew bot who jogs over to help when a team bot trips and no teammate is
// close by. The antics director fills in `helperJob`; times are fxNow().
//   from: where the helper pops in (and leaves again)
//   to:   where it stands to pull the bot up, facing `face`
//   go:   when it sets off; pull: when the pull starts
export const helperJob = { active: false, from: { x: 0, z: 0 }, to: { x: 0, z: 0 }, face: { x: 0, z: 0 }, go: 0, pull: 0 };

const SPEED = 1.3;
const v = { x: 0, y: 0, z: 0 };

export default function Helper() {
  const parts = useRef({});
  useFrame((state) => {
    const P = parts.current;
    const root = P.root;
    if (!root) return;
    const j = helperJob;
    const now = fxNow();
    const dist = Math.hypot(j.to.x - j.from.x, j.to.z - j.from.z);
    const walk = dist / SPEED;
    const done = j.pull + HELP_LEN;
    const gone = done + walk + 0.4;
    if (!j.active || now < j.go || now > gone) {
      root.visible = false;
      if (j.active && now > gone) j.active = false;
      return;
    }
    root.visible = true;
    standCrew(P);
    const t = state.clock.elapsedTime;
    let x;
    let z;
    let heading;
    let walking = false;
    let k = 0;
    if (now < j.go + walk) {
      k = (now - j.go) / walk;
      x = lerp(j.from.x, j.to.x, k);
      z = lerp(j.from.z, j.to.z, k);
      heading = Math.atan2(j.to.x - j.from.x, j.to.z - j.from.z);
      walking = true;
    } else if (now < done) {
      x = j.to.x;
      z = j.to.z;
      heading = Math.atan2(j.face.x - x, j.face.z - z);
    } else {
      k = (now - done) / walk;
      x = lerp(j.to.x, j.from.x, k);
      z = lerp(j.to.z, j.from.z, k);
      heading = Math.atan2(j.from.x - j.to.x, j.from.z - j.to.z);
      walking = true;
    }
    // pop in and out at the far end
    const inK = Math.min(1, (now - j.go) / 0.35, (gone - now) / 0.35);
    root.scale.setScalar(1.35 * Math.max(0.01, ease(inK)));
    root.position.set(x, groundY(x, z), z);
    root.rotation.y = heading;

    if (walking) {
      const w = t * 10;
      P.pose.position.y = Math.abs(Math.sin(w)) * 0.07;
      P.pose.rotation.z = Math.sin(w) * 0.07;
      P.footL.position.z = Math.sin(w) * 0.09;
      P.footR.position.z = -Math.sin(w) * 0.09;
      restArms(P, Math.sin(w) * 0.14);
      return;
    }
    // same moves as a team helper (botPose.js `help`)
    const kk = now - j.pull;
    let tilt = 0;
    if (kk < 0) {
      tilt = 0.22;
      toPose(v, 0, 0.3, 0.34, tilt, 0);
      aimCrew(P, 'L', v.x, v.y, v.z, 0.52);
      aimCrew(P, 'R', 0.23, 0.2, 0.02);
      P.head.rotation.x = 0.35;
    } else if (kk < 0.8) {
      const u = ease(kk / 0.7);
      tilt = lerp(0.22, -0.16, u);
      toPose(v, 0, lerp(0.3, 0.72, u), lerp(0.34, 0.42, u), tilt, 0);
      aimCrew(P, 'L', v.x, v.y, v.z, 0.52);
      aimCrew(P, 'R', 0.26, 0.24, -0.06);
    } else if (kk < 2.2) {
      const pat = Math.sin(kk * 20 + 1);
      aimCrew(P, 'L', -0.1 + pat * 0.03, 0.3 + Math.abs(pat) * 0.06, 0.2);
      aimCrew(P, 'R', 0.23, 0.2, 0.02);
      P.pose.rotation.z = Math.sin(kk * 15) * 0.06;
    } else {
      // thumbs up and off we go
      const b = bump(kk, 2.1, HELP_LEN);
      aimCrew(P, 'R', 0.28, lerp(0.2, 0.62, b), lerp(0.02, 0.22, b));
      aimCrew(P, 'L', -0.23, 0.2, 0.02);
      P.head.rotation.x = -0.2 * b;
    }
    P.pose.rotation.x = tilt;
  });
  return <MiniBot color="#5fd16b" parts={parts} />;
}
