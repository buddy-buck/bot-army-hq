import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot from '../MiniBot.jsx';
import { BOT_GEO, BOT_MAT, BOT_SCALE, Drink } from '../../components/Bot.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import { aliveClock } from '../../wild/director.js';
import { Cyl, LM, glyphTexture, resetBot, std, toWorld, usePoseOnce } from './common.jsx';

// The nap hammock on the west shore: two leaning palms, a hammock that
// sways in the breeze and a crew bot fast asleep in it, straw hat over its
// face, Z's drifting up. Its drink waits on the sand. It's a nap hammock,
// so the napper naps day and night.

const S = SITES.napHammock;
// Hammock runs north-south (local +x points north); the napper's head is at
// the south end, toward the default camera.
const F = { x: S.x + 0.15, z: S.z, rotY: Math.PI / 2 };
const PALM_X = 1.3; // trunks along local x, in world units
const ROPE_Y = 0.84; // hammock ends, world units above the center's sand
const Z_COUNT = 3;
const Z_PERIOD = 3.6;

const STRAW = std('#e8c87a');
const STRAW_BAND = std('#d9534f');
const FROND = std('#4fb35a', { side: THREE.DoubleSide });
const FROND_DARK = std('#3e9a4c', { side: THREE.DoubleSide });

// One frond: a long thin leaf that droops, origin at the crown.
const FROND_GEO = (() => {
  const pts = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = t * 1.05;
    const y = 0.18 * t - 0.7 * t * t;
    const w = 0.17 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.02;
    pts.push([x, y, w], [x, y - 0.03, 0], [x, y, -w]);
  }
  const pos = [];
  const idx = [];
  pts.forEach((p) => pos.push(...p));
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    idx.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
})();

// A simple leaning palm: stacked trunk pieces that curve away, a crown of
// fronds and a few coconuts. lean > 0 tips it toward local -x.
function Palm({ p, h = 2.5, lean = 0.22, yaw = 0, fronds }) {
  const pieces = 6;
  const segs = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < pieces; i++) {
    const a = lean * (0.4 + (i / pieces) * 0.9);
    const len = h / pieces;
    const dx = Math.sin(a) * len;
    const dy = Math.cos(a) * len;
    segs.push({ x: x + dx / 2, y: y + dy / 2, a, len, r: 0.11 - i * 0.008 });
    x += dx;
    y += dy;
  }
  return (
    <group position={p} rotation={[0, yaw, 0]}>
      {segs.map((s, i) => (
        <Cyl key={i} p={[-s.x, s.y, 0]} r={[0, 0, s.a]} rt={s.r * 0.9} rb={s.r} h={s.len + 0.03} m={i % 2 ? LM.palm : LM.coconut} seg={6} />
      ))}
      <group position={[-x, y, 0]} ref={fronds}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} geometry={FROND_GEO} material={i % 2 ? FROND : FROND_DARK} rotation={[0, (i / 7) * Math.PI * 2 + 0.3, (i % 3) * 0.08]} />
        ))}
        {[0, 2.1, 4.2].map((a) => (
          <mesh key={a} position={[Math.cos(a) * 0.1, -0.1, Math.sin(a) * 0.1]} material={LM.coconut}>
            <icosahedronGeometry args={[0.075, 0]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export default function NapHammock({ animate, bedtime }) {
  const g0 = groundY(F.x, F.z);
  const sway = useRef();
  const bot = useRef({});
  const zs = useRef([]);
  const frondsA = useRef();
  const frondsB = useRef();
  const clock = useMemo(() => aliveClock(), []);
  const zMats = useMemo(() => {
    const map = glyphTexture('Z', '#e6ebff', 'rgba(52,60,130,0.9)');
    return Array.from({ length: Z_COUNT }, () => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false }));
  }, []);
  useEffect(() => () => zMats.forEach((m) => m.dispose()), [zMats]);
  usePoseOnce(animate, bedtime);

  // Palm bases sit on their own patch of sand.
  const palmA = toWorld(F, -PALM_X, 0);
  const palmB = toWorld(F, PALM_X, 0);
  const yA = groundY(palmA[0], palmA[1]) - g0 - 0.05;
  const yB = groundY(palmB[0], palmB[1]) - g0 - 0.05;
  // The drink on the sand beside the napper's head.
  const drinkW = toWorld(F, -0.45, 0.62);
  const yDrink = groundY(drinkW[0], drinkW[1]) - g0;
  // Hammock ends (in the BOT_SCALE frame, see Bot.jsx's GEO.hammock).
  const endX = 0.68 * BOT_SCALE;
  const endY = 0.62 * BOT_SCALE;
  const trunkY = ROPE_Y + 0.28;

  useFrame((_, delta) => {
    const t = animate ? clock.tick(delta) : 1.3;
    if (sway.current) sway.current.rotation.x = Math.sin(t * 0.9) * 0.07 + Math.sin(t * 0.37) * 0.025;
    if (frondsA.current) frondsA.current.rotation.z = Math.sin(t * 0.7) * 0.04;
    if (frondsB.current) frondsB.current.rotation.z = Math.sin(t * 0.7 + 1.3) * 0.04;
    const p = bot.current;
    if (resetBot(p)) {
      // lying on its back, face up under the hat
      p.pose.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      p.pose.position.set(0.4, 0.53, 0);
      const breathe = 1 + Math.sin(t * 1.2) * 0.03;
      p.pose.scale.set(1, 1, breathe);
      p.armL.rotation.x = -0.5;
      p.armR.rotation.x = -0.5;
      p.armL.rotation.z = 0.35;
      p.armR.rotation.z = -0.35;
      p.footR.position.z = 0.04 + Math.max(0, Math.sin(t * 0.5)) * 0.03; // a sleepy toe twitch
    }
    // Z's float up from under the hat and fade
    for (let i = 0; i < Z_COUNT; i++) {
      const s = zs.current[i];
      if (!s) continue;
      const k = ((t / Z_PERIOD + i / Z_COUNT) % 1 + 1) % 1;
      s.position.set(-0.55 + Math.sin(k * 5 + i) * 0.12 - k * 0.2, 0.95 + k * 1.0, k * 0.25);
      const sc = 0.16 + k * 0.2;
      s.scale.set(sc, sc, 1);
      zMats[i].opacity = Math.min(1, k * 4) * (1 - k) * 0.95;
    }
  });

  return (
    <group position={[F.x, g0, F.z]} rotation={[0, F.rotY, 0]}>
      <Palm p={[-PALM_X, yA, 0]} h={2.6} lean={0.2} fronds={frondsA} />
      <Palm p={[PALM_X, yB, 0]} h={2.4} lean={-0.18} yaw={0.4} fronds={frondsB} />
      {/* ropes from the hammock ends to the trunks */}
      <mesh position={[-(endX + PALM_X) / 2, (endY + trunkY) / 2, 0]} rotation={[0, 0, Math.atan2(trunkY - endY, -(PALM_X - endX))]} material={LM.rope}>
        <cylinderGeometry args={[0.012, 0.012, Math.hypot(PALM_X - endX, trunkY - endY), 3]} />
      </mesh>
      <mesh position={[(endX + PALM_X) / 2, (endY + trunkY) / 2, 0]} rotation={[0, 0, Math.atan2(trunkY - endY, PALM_X - endX)]} material={LM.rope}>
        <cylinderGeometry args={[0.012, 0.012, Math.hypot(PALM_X - endX, trunkY - endY), 3]} />
      </mesh>
      {/* swings around the line between the two ends */}
      <group position={[0, endY, 0]}>
        <group ref={sway}>
          <group position={[0, -endY, 0]} scale={BOT_SCALE}>
            <mesh geometry={BOT_GEO.hammock} material={BOT_MAT.hammock} />
            <MiniBot color="#9b7bff" parts={bot} sleepy shadow={false} scale={1}>
              {/* straw hat over the face */}
              <group position={[0, 0.79, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
                <mesh material={STRAW}>
                  <cylinderGeometry args={[0.27, 0.28, 0.025, 12]} />
                </mesh>
                <mesh position={[0, 0.07, 0]} material={STRAW}>
                  <cylinderGeometry args={[0.12, 0.14, 0.13, 10]} />
                </mesh>
                <mesh position={[0, 0.04, 0]} material={STRAW_BAND}>
                  <cylinderGeometry args={[0.145, 0.145, 0.035, 10]} />
                </mesh>
              </group>
            </MiniBot>
          </group>
        </group>
      </group>
      {/* shade under the hammock and a drink on the sand */}
      <mesh geometry={BOT_GEO.shadow} material={LM.shadow} position={[0, 0.03, 0]} scale={[2.6, 1, 1.2]} />
      <group position={[-0.45, yDrink, 0.62]} scale={1.6}>
        <Drink type="coconut" />
      </group>
      {/* flip-flops left by the palm */}
      {[-0.08, 0.08].map((dz, i) => (
        <mesh key={i} position={[0.15, yDrink + 0.012, 0.6 + dz]} rotation={[0, 0.3 + i * 0.2, 0]} material={i ? LM.pink : LM.teal}>
          <boxGeometry args={[0.2, 0.02, 0.08]} />
        </mesh>
      ))}
      {Array.from({ length: Z_COUNT }, (_, i) => (
        <sprite key={i} ref={(el) => (zs.current[i] = el)} material={zMats[i]} />
      ))}
    </group>
  );
}
