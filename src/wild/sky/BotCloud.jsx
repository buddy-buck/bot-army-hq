import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rareGap } from '../director.js';
import { farSide, rand, smooth } from './common.js';

// A low cloud that drifts with the others (same breeze as Sky.jsx's clouds)
// and every few minutes gathers its puffs into a bot: round head, antenna and
// bulb, body, little arms and feet. It holds the shape for about 20 seconds,
// waves, then drifts apart into a plain cloud again. It only does it where
// you can see it: if it has drifted out of view it slips back in, forming
// out of thin air on the far side of the island.

const PUFF = new THREE.IcosahedronGeometry(1, 0);
const DRIFT = 0.006; // same turn rate as the cloud ring in Sky.jsx
const R = 64;
const Y = 14;
const TO_BOT = 4.5;
const HOLD = 20;
const APART = 6.5;

// [x, y, z, sx, sy, sz] for each puff: as a plain cloud, and as a bot.
const CLOUD = [
  [0, 0.4, 0, 2.2, 1.2, 1.6], [1.9, 0.2, 0.3, 1.6, 1.0, 1.3], [-1.8, 0.1, -0.2, 1.5, 0.9, 1.2], [0.4, 1.1, 0, 1.3, 1.0, 1.1],
  [3.3, -0.1, -0.2, 1.0, 0.7, 0.9], [-3.1, -0.15, 0.2, 1.0, 0.65, 0.9], [-0.9, 0.9, 0.3, 1.0, 0.8, 1.0], [1.3, 0.9, -0.3, 0.9, 0.7, 0.9],
  [2.5, 0.6, 0.2, 0.7, 0.6, 0.7], [-2.4, 0.5, -0.2, 0.7, 0.55, 0.7], [0, -0.2, 0.6, 1.4, 0.7, 1.0], [-0.2, -0.3, -0.6, 1.3, 0.7, 1.0],
];
const BOT = [
  [0, 2.3, 0, 1.7, 1.5, 1.25], // head
  [-0.95, 2.2, 0, 1.05, 1.15, 0.95], // head, left side
  [0.95, 2.2, 0, 1.05, 1.15, 0.95], // head, right side
  [0, 4.0, 0, 0.22, 0.6, 0.22], // antenna
  [0, 4.75, 0, 0.5, 0.5, 0.5], // bulb
  [0, 0.25, 0, 1.3, 1.15, 1.0], // body
  [0, -0.6, 0, 1.1, 0.8, 0.9], // lower body
  [-1.65, 0.45, 0, 0.42, 0.95, 0.5], // left arm
  [1.65, 0.45, 0, 0.42, 0.95, 0.5], // right arm (waves)
  [-0.55, -1.55, 0, 0.5, 0.35, 0.5], // left foot
  [0.55, -1.55, 0, 0.5, 0.35, 0.5], // right foot
  [0, 2.5, 0.35, 1.2, 1.0, 1.0], // face front, keeps the head round
];
const N = CLOUD.length;

export default function BotCloud({ sky }) {
  const { camera } = useThree();
  const root = useRef();
  const puffs = useRef([]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: sky.cloud, flatShading: true, emissive: sky.cloud, emissiveIntensity: 0.35 }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    mat.color.set(sky.cloud);
    mat.emissive.set(sky.cloud);
  }, [sky.cloud, mat]);
  useEffect(() => () => mat.dispose(), [mat]);

  const st = useMemo(
    () => ({ ang: 5.9, wait: rareGap(90, 200), phase: 'cloud', t: 0, form: 1, side: { x: 0, z: -1 } }),
    []
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const g = root.current;
    if (!g) return;
    st.ang -= dt * DRIFT;
    if (st.phase === 'cloud') {
      st.wait -= dt;
      if (st.wait <= 0) {
        const f = farSide(camera, st.side);
        const off = Math.abs(angleDiff(st.ang, Math.atan2(f.z, f.x)));
        if (off < 0.45) {
          st.phase = 'bot';
          st.t = 0;
        } else if (off > 1.1) {
          // Out of view: slip back in on the far side and form there.
          st.ang = Math.atan2(f.z, f.x) + rand(-0.3, 0.3);
          st.form = 0;
          st.phase = 'bot';
          st.t = -4;
        } else {
          st.wait = 5;
        }
      }
    } else {
      st.t += dt;
      if (st.t > TO_BOT + HOLD + APART) {
        st.phase = 'cloud';
        st.wait = rareGap(150, 300);
      }
    }
    st.form = Math.min(1, st.form + dt / 4);

    const x = Math.cos(st.ang) * R;
    const z = Math.sin(st.ang) * R;
    g.position.set(x, Y, z);
    g.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z);

    // 0 = cloud, 1 = bot
    let k = 0;
    if (st.phase === 'bot') {
      if (st.t < TO_BOT) k = smooth(st.t / TO_BOT);
      else if (st.t < TO_BOT + HOLD) k = 1;
      else k = 1 - smooth((st.t - TO_BOT - HOLD) / APART);
    }
    const hold = st.phase === 'bot' && st.t > TO_BOT && st.t < TO_BOT + HOLD;
    const wave = hold ? Math.max(0, Math.sin(((st.t - TO_BOT) / HOLD) * Math.PI * 3)) : 0;
    const apart = st.phase === 'bot' && st.t > TO_BOT + HOLD ? Math.sin(((st.t - TO_BOT - HOLD) / APART) * Math.PI) : 0;
    const formS = 0.15 + 0.85 * smooth(st.form);
    for (let i = 0; i < N; i++) {
      const m = puffs.current[i];
      if (!m) continue;
      const a = CLOUD[i];
      const b = BOT[i];
      let px = a[0] + (b[0] - a[0]) * k;
      let py = a[1] + (b[1] - a[1]) * k;
      const pz = a[2] + (b[2] - a[2]) * k;
      // Drifting apart: puffs spread out a little on the way back.
      px *= 1 + apart * 0.35;
      py += apart * (i % 3 - 1) * 0.4;
      if (i === 8 && wave > 0) {
        px += wave * 0.35;
        py += wave * 1.1;
      }
      if (i === 4 && hold) py += Math.sin(st.t * 2.2) * 0.12;
      m.position.set(px, py, pz);
      m.scale.set((a[3] + (b[3] - a[3]) * k) * formS, (a[4] + (b[4] - a[4]) * k) * formS, (a[5] + (b[5] - a[5]) * k) * formS);
    }
  });

  return (
    <group ref={root} scale={2.3}>
      {CLOUD.map((c, i) => (
        <mesh key={i} ref={(m) => (puffs.current[i] = m)} geometry={PUFF} material={mat} position={[c[0], c[1], c[2]]} scale={[c[3], c[4], c[5]]} />
      ))}
    </group>
  );
}

function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
