import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { extraColor } from '../MiniBot.jsx';
import StaticMerge from '../../utils/StaticMerge.jsx';
import { BOT_SCALE, GEO, MAT } from '../../components/Bot.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import { AMAT, aimArm, ease, ramp } from './common.jsx';

// Two extras arm wrestling across a picnic table. Hands locked, a shaky
// back-and-forth struggle, then every ~15 seconds one slams the other's hand
// down and cheers with both arms up. A third extra watches from the end of
// the table. Everything here is in bot units (the group is BOT_SCALE).

const SITE = SITES.picnic;
const ROUND = 15;
const SEAT_X = 0.4; // bots sit this far either side of the table's middle
const SIT_Y = 0.16; // pose lift onto the bench
const LEAN = 0.3;
const TABLE_Y = 0.44;
const GRIP_Y = 0.6;
const SHOULDER = { x: 0.19, y: SIT_Y + 0.5 * Math.cos(LEAN), z: 0.5 * Math.sin(LEAN) };

const clasp = new THREE.SphereGeometry(0.08, 6, 5);

// Group-frame point -> a seated bot's root frame. side -1: bot at -SEAT_X
// facing +x; side +1: bot at +SEAT_X facing -x.
function toBot(side, gx, gz, out) {
  if (side < 0) {
    out.x = -gz;
    out.z = gx + SEAT_X;
  } else {
    out.x = gz;
    out.z = SEAT_X - gx;
  }
  return out;
}

function sit(b) {
  b.pose.position.y = SIT_Y;
  b.pose.rotation.x = LEAN;
  b.footL.position.set(-0.08, -0.08, 0.1);
  b.footR.position.set(0.08, -0.08, 0.1);
}

export default function ArmWrestle({ animate = true, lowPower = false }) {
  const A = useRef();
  const B = useRef();
  const fan = useRef();
  const grip = useRef();
  const st = useRef({ t: 2.5, winner: 1, round: -1 });
  const p = useRef({ x: 0, z: 0 });

  useFrame((_, delta) => {
    const a = A.current;
    const b = B.current;
    if (!a?.root || !b?.root || !grip.current) return;
    const s = st.current;
    if (animate) s.t += Math.min(delta, 0.1);
    const t = animate ? s.t : 3;
    const round = Math.floor(t / ROUND);
    if (round !== s.round) {
      s.round = round;
      s.winner = Math.random() < 0.5 ? -1 : 1;
    }
    const k = t % ROUND;
    a.reset();
    b.reset();
    sit(a);
    sit(b);

    // where the locked hands are (group frame): dz sideways, y height
    let dz = 0;
    let gy = GRIP_Y;
    let locked = true;
    let cheer = 0;
    if (k < 0.8) {
      locked = k > 0.5;
    } else if (k < 11) {
      const u = k - 0.8;
      dz = 0.05 * Math.sin(u * 0.9) * Math.sin(u * 0.37 + 1) + (animate ? 0.012 * Math.sin(u * 23) : 0);
    } else if (k < 11.5) {
      const e = ease((k - 11) / 0.5);
      dz = s.winner * 0.17 * e;
      gy = GRIP_Y - (GRIP_Y - TABLE_Y - 0.06) * e;
    } else if (k < 14.2) {
      locked = false;
      cheer = Math.min(1, (k - 11.5) / 0.3, (14.2 - k) / 0.4);
    } else {
      locked = false;
    }

    grip.current.visible = locked;
    grip.current.position.set(0, gy, dz);

    const v = p.current;
    const bots = [a, b];
    for (let i = 0; i < 2; i++) {
      const bot = bots[i];
      const side = i === 0 ? -1 : 1;
      // armR grips (bot's +x shoulder), armL rests on the table
      toBot(side, 0, dz, v);
      if (locked || k < 0.8) {
        const reach = locked ? 1 : ease(ramp(k, 0, 0.5));
        aimArm(bot.armR, SHOULDER.x, SHOULDER.y, SHOULDER.z, SHOULDER.x + (v.x - SHOULDER.x) * reach, SHOULDER.y - 0.32 + (gy - SHOULDER.y + 0.32) * reach, SHOULDER.z + (v.z - SHOULDER.z) * reach, LEAN);
      }
      aimArm(bot.armL, -SHOULDER.x, SHOULDER.y, SHOULDER.z, -0.12, TABLE_Y + 0.04, 0.24, LEAN);
      if (locked && k >= 0.8 && k < 11) {
        bot.pose.rotation.z = animate ? Math.sin(t * 27 + i * 2) * 0.025 : 0;
        bot.head.rotation.x = 0.2;
        bot.eyeL.scale.y = 0.45; // straining
        bot.eyeR.scale.y = 0.45;
      } else {
        bot.eyeL.scale.y = 1;
        bot.eyeR.scale.y = 1;
      }
    }

    // winner cheers, loser slumps
    if (cheer > 0) {
      const W = s.winner > 0 ? a : b; // hand pushed toward +z: the bot on the -x side wins
      const L = W === a ? b : a;
      W.pose.rotation.x = LEAN * (1 - cheer);
      W.pose.position.y = SIT_Y + (animate ? Math.abs(Math.sin(t * 9)) * 0.06 * cheer : 0);
      W.armL.rotation.set(-2.9 * cheer, 0, -0.5 * cheer);
      W.armR.rotation.set(-2.9 * cheer, 0, 0.5 * cheer);
      W.head.rotation.x = -0.3 * cheer;
      L.head.rotation.x = 0.5 * cheer;
      L.head.rotation.y = animate ? Math.sin(t * 6) * 0.25 * cheer : 0;
      L.pose.rotation.x = LEAN + 0.15 * cheer;
    }

    // the spectator
    const f = fan.current;
    if (f?.root) {
      f.reset();
      f.head.rotation.y = -dz * 3;
      f.head.rotation.x = 0.15;
      if (cheer > 0) {
        f.armL.rotation.set(-2.6 * cheer, 0, -0.4 * cheer);
        f.armR.rotation.set(-2.6 * cheer, 0, 0.4 * cheer);
        f.pose.position.y = animate ? Math.abs(Math.sin(t * 8)) * 0.07 * cheer : 0;
      } else if (locked && k > 8) {
        // getting tense: fists up
        f.armL.rotation.set(-1.2, 0, 0.2);
        f.armR.rotation.set(-1.2, 0, -0.2);
      }
    }
  });

  const gy = groundY(SITE.x, SITE.z);
  return (
    <group position={[SITE.x, gy, SITE.z]} rotation={[0, SITE.rotY, 0]} scale={BOT_SCALE}>
      {/* table and benches never move: baked into a few draws */}
      <StaticMerge>
      <mesh geometry={GEO.shadow} material={MAT.shadow} position={[0, 0.02, 0]} scale={[1.8, 1, 2.2]} />
      {/* table: runs along z, bots sit on the x sides */}
      <mesh material={AMAT.wood} position={[0, TABLE_Y - 0.02, 0]}>
        <boxGeometry args={[0.32, 0.04, 0.95]} />
      </mesh>
      <mesh material={AMAT.red} position={[0, TABLE_Y + 0.003, 0]}>
        <boxGeometry args={[0.2, 0.01, 0.95]} />
      </mesh>
      {[-0.36, 0.36].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh material={AMAT.woodDark} position={[-0.1, TABLE_Y / 2, 0]} rotation={[0, 0, 0.35]}>
            <boxGeometry args={[0.03, TABLE_Y + 0.05, 0.04]} />
          </mesh>
          <mesh material={AMAT.woodDark} position={[0.1, TABLE_Y / 2, 0]} rotation={[0, 0, -0.35]}>
            <boxGeometry args={[0.03, TABLE_Y + 0.05, 0.04]} />
          </mesh>
          <mesh material={AMAT.woodDark} position={[0, 0.2, 0]}>
            <boxGeometry args={[0.95, 0.03, 0.04]} />
          </mesh>
        </group>
      ))}
      {[-SEAT_X, SEAT_X].map((x) => (
        <mesh key={x} material={AMAT.wood} position={[x, 0.24, 0]}>
          <boxGeometry args={[0.16, 0.035, 0.95]} />
        </mesh>
      ))}
      </StaticMerge>
      <mesh ref={grip} geometry={clasp} material={MAT.face} position={[0, GRIP_Y, 0]} />
      <MiniBot ref={A} color={extraColor(2)} scale={1} shadow={false} position={[-SEAT_X, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
      <MiniBot ref={B} color={extraColor(6)} scale={1} shadow={false} position={[SEAT_X, 0, 0]} rotation={[0, -Math.PI / 2, 0]} />
      {!lowPower && <MiniBot ref={fan} color={extraColor(9)} scale={1} position={[0.05, 0, -0.85]} rotation={[0, 0.1, 0]} />}
    </group>
  );
}
