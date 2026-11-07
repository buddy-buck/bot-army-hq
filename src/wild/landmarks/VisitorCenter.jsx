import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import StaticMerge from '../../utils/StaticMerge.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import MiniBot from '../MiniBot.jsx';
import { Box, Cyl, LM, makeCanvasTexture, signTexture, std, useGlow, useSignMaterial } from './common.jsx';

// The Visitor Center: a cheerful glass-front building with a curved roof, a
// big "bots deployed worldwide" counter out front and a welcome committee
// waving signs on sticks.

const S = SITES.visitor;
const WALL_H = 1.35;
const HALF_W = 1.75;
const FRONT = 0.55;
const BACK = -1.3;

// The counter: a big believable number that's the same for everyone at the
// same moment and goes up by one every few seconds.
const EPOCH = Date.UTC(2026, 0, 1);
const TICK_MS = 5000;
const deployedNow = () => 1284000 + Math.floor((Date.now() - EPOCH) / TICK_MS);
const fmt = (n) => n.toLocaleString('en-US');

const M = {
  wall: std('#ffe9c7'),
  trim: std('#ff7a59'),
  frame: std('#fdf8ee'),
  door: std('#2ec4c8'),
  board: std('#1d2a4a'),
  post: std('#7a5232'),
  stick: std('#c08a57'),
  planter: std('#c96f4a'),
  bush: std('#4fa35a'),
};

function drawNumber(ctx, w, h, n) {
  ctx.fillStyle = '#1d2a4a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#FFDE69';
  let px = Math.round(h * 0.74);
  ctx.font = `900 ${px}px "Arial Black", Arial, sans-serif`;
  while (ctx.measureText(fmt(n)).width > w * 0.92 && px > 12) {
    px -= 3;
    ctx.font = `900 ${px}px "Arial Black", Arial, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fmt(n), w / 2, h / 2 + h * 0.04);
}

function CounterBoard({ night, animate }) {
  const invalidate = useThree((s) => s.invalidate);
  const numRef = useRef();
  const caption = useSignMaterial(
    () =>
      makeCanvasTexture(512, 96, (x) => {
        x.fillStyle = '#1d2a4a';
        x.fillRect(0, 0, 512, 96);
        x.fillStyle = '#ffffff';
        let px = 44;
        x.font = `900 ${px}px "Arial Black", Arial, sans-serif`;
        while (x.measureText('BOTS DEPLOYED WORLDWIDE').width > 480 && px > 10) {
          px -= 2;
          x.font = `900 ${px}px "Arial Black", Arial, sans-serif`;
        }
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText('BOTS DEPLOYED WORLDWIDE', 256, 50);
      }),
    night,
    0.5,
    0.5
  );
  const num = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: '#ffffff',
      emissiveIntensity: 0.6,
      roughness: 0.6,
    });
    return {
      c,
      ctx: c.getContext('2d'),
      map,
      mat,
      shown: -1,
      want: -1,
      flip: 1,
    };
  }, []);
  useEffect(() => () => (num.map.dispose(), num.mat.dispose()), [num]);
  useEffect(() => {
    num.mat.emissiveIntensity = 0.6 + night * 0.6;
  }, [num, night]);

  const redraw = (n) => {
    drawNumber(num.ctx, num.c.width, num.c.height, n);
    num.map.needsUpdate = true;
    num.shown = n;
  };

  useEffect(() => {
    num.want = deployedNow();
    redraw(num.want);
    invalidate();
    const id = setInterval(() => {
      const n = deployedNow();
      if (n === num.want) return;
      num.want = n;
      if (animate) {
        num.flip = 0; // the frame loop flips it over
      } else {
        redraw(n); // reduced motion: just show the new number
        invalidate();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [num, animate, invalidate]);

  useFrame((_, delta) => {
    const m = numRef.current;
    if (!m) return;
    if (num.flip >= 1) {
      m.scale.set(1, 1, 1);
      return;
    }
    num.flip = Math.min(1, num.flip + Math.min(delta, 0.1) / 0.45);
    const f = num.flip;
    // flap closes, the new number lands, a little bump
    if (f < 0.35) m.scale.set(1, Math.cos((f / 0.35) * (Math.PI / 2)), 1);
    else {
      if (num.shown !== num.want) redraw(num.want);
      const k = (f - 0.35) / 0.65;
      const bump = 1 + 0.12 * Math.sin(k * Math.PI);
      m.scale.set(bump, Math.sin(Math.min(1, k * 1.6) * (Math.PI / 2)) * bump, 1);
    }
  });

  return (
    <StaticMerge>
      <Cyl p={[-0.7, 0.75, -0.03]} rt={0.05} h={1.5} m={M.post} seg={5} />
      <Cyl p={[0.7, 0.75, -0.03]} rt={0.05} h={1.5} m={M.post} seg={5} />
      <Box p={[0, 1.3, -0.05]} s={[1.75, 0.8, 0.08]} m={M.board} />
      <Box p={[0, 1.72, -0.05]} s={[1.81, 0.06, 0.12]} m={M.trim} />
      <Box p={[0, 0.88, -0.05]} s={[1.81, 0.06, 0.12]} m={M.trim} />
      <mesh ref={numRef} position={[0, 1.43, 0.0]} material={num.mat} userData={{ noMerge: true }}>
        <planeGeometry args={[1.6, 0.4]} />
      </mesh>
      <mesh position={[0, 1.07, 0.0]} material={caption}>
        <planeGeometry args={[1.6, 0.3]} />
      </mesh>
    </StaticMerge>
  );
}

// A welcome sign on a stick, held up in the right hand.
const WELCOME = [
  { text: 'Welcome!', bg: '#FFDE69', fg: '#19469D', color: '#2E86DE' },
  { text: 'Aloha!', bg: '#ff8fb8', fg: '#ffffff', color: '#2BA84A' },
  { text: 'Hi there!', bg: '#7fe3d8', fg: '#1d2a4a', color: '#F09024' },
];
const ARM_UP = -2.55; // right arm raised forward and up

function SignOnStick({ mat }) {
  // compensate the raised arm so the stick stands up straight
  return (
    <group rotation={[-ARM_UP, 0, 0]}>
      <Cyl p={[0, 0.4, 0]} rt={0.018} h={0.85} m={M.stick} seg={4} />
      <Box p={[0, 0.9, -0.012]} s={[0.6, 0.32, 0.02]} m={LM.white} />
      <mesh position={[0, 0.9, 0.0]} material={mat}>
        <planeGeometry args={[0.56, 0.28]} />
      </mesh>
    </group>
  );
}

function Greeter({ spec, i, night, animate, position }) {
  const mat = useSignMaterial(
    () =>
      signTexture({
        text: spec.text,
        w: 256,
        h: 128,
        bg: spec.bg,
        fg: spec.fg,
        border: '#ffffff',
        size: 0.42,
      }),
    night,
    0.3,
    0.4
  );
  const bot = useRef();
  useFrame((state) => {
    const b = bot.current;
    if (!b?.pose) return;
    const t = animate ? state.clock.elapsedTime + i * 1.7 : i;
    b.armR.rotation.set(ARM_UP + 0.08 * Math.sin(t * 2.1), 0, 0.12 * Math.sin(t * 1.6));
    b.armL.rotation.set(0, 0, -0.15 - 0.08 * Math.sin(t * 2.1 + 1));
    b.pose.position.y = animate ? Math.abs(Math.sin(t * 2.6)) * 0.05 : 0;
    b.pose.rotation.z = 0.07 * Math.sin(t * 1.3);
    b.head.rotation.z = -0.1 * Math.sin(t * 1.3);
  });
  return <MiniBot ref={bot} color={spec.color} right={<SignOnStick mat={mat} />} position={position} rotation={[0, (1 - i) * 0.12, 0]} />;
}

function Building({ night }) {
  const sign = useSignMaterial(
    () =>
      signTexture({
        text: 'VISITOR CENTER',
        w: 1024,
        h: 160,
        bg: '#19469D',
        fg: '#FFDE69',
        border: '#FFDE69',
        size: 0.56,
      }),
    night,
    0.45,
    0.5
  );
  const lit = useGlow('#ffd99a', night, 0.05, 0.8);
  const roofR = 1.7;
  const ang = 0.78;
  const depth = FRONT - BACK;
  const midZ = (FRONT + BACK) / 2;
  const mullions = [];
  for (let k = 0; k <= 6; k++) {
    const x = -HALF_W + (2 * HALF_W * k) / 6;
    if (Math.abs(x) < 0.4) continue; // the doorway
    mullions.push(<Box key={k} p={[x, WALL_H / 2, FRONT]} s={[0.06, WALL_H, 0.07]} m={M.frame} />);
  }
  return (
    <StaticMerge>
      <Box p={[0, -0.15, midZ + 0.15]} s={[HALF_W * 2 + 0.5, 0.36, depth + 0.9]} m={LM.concrete} />
      {/* back and side walls */}
      <Box p={[0, WALL_H / 2, BACK + 0.06]} s={[HALF_W * 2, WALL_H, 0.12]} m={M.wall} />
      <Box p={[-HALF_W + 0.06, WALL_H / 2, midZ]} s={[0.12, WALL_H, depth]} m={M.wall} />
      <Box p={[HALF_W - 0.06, WALL_H / 2, midZ]} s={[0.12, WALL_H, depth]} m={M.wall} />
      {/* warm lit interior seen through the glass */}
      <Box p={[0, WALL_H / 2, BACK + 0.14]} s={[HALF_W * 2 - 0.3, WALL_H - 0.2, 0.04]} m={lit} />
      {/* glass front with white mullions and a teal door */}
      <Box p={[0, WALL_H / 2, FRONT]} s={[HALF_W * 2, WALL_H, 0.04]} m={LM.glass} />
      {mullions}
      <Box p={[0, WALL_H - 0.04, FRONT]} s={[HALF_W * 2, 0.08, 0.08]} m={M.trim} />
      <Box p={[-0.36, 0.5, FRONT + 0.02]} s={[0.06, 1.0, 0.07]} m={M.door} />
      <Box p={[0.36, 0.5, FRONT + 0.02]} s={[0.06, 1.0, 0.07]} m={M.door} />
      <Box p={[0, 1.02, FRONT + 0.02]} s={[0.78, 0.06, 0.07]} m={M.door} />
      {/* inside: a little info desk */}
      <Box p={[0, 0.32, midZ - 0.1]} s={[1.2, 0.6, 0.4]} m={M.trim} />
      {/* curved roof */}
      <mesh position={[0, WALL_H - roofR * Math.cos(ang) + 0.02, midZ]} rotation={[0, 0, Math.PI / 2]} material={LM.tealRoof}>
        <cylinderGeometry args={[roofR, roofR, HALF_W * 2 + 0.5, 14, 1, true, Math.PI / 2 - ang, ang * 2]} />
      </mesh>
      {/* the name, standing on the front of the roof */}
      <Box p={[0, WALL_H + 0.38, FRONT + 0.1]} s={[2.9, 0.48, 0.06]} m={M.board} />
      <mesh position={[0, WALL_H + 0.38, FRONT + 0.135]} material={sign}>
        <planeGeometry args={[2.8, 0.42]} />
      </mesh>
      <Cyl p={[-1.1, WALL_H + 0.12, FRONT + 0.06]} rt={0.03} h={0.24} m={M.post} seg={4} />
      <Cyl p={[1.1, WALL_H + 0.12, FRONT + 0.06]} rt={0.03} h={0.24} m={M.post} seg={4} />
      {/* planters by the door */}
      {[-0.75, 0.75].map((x) => (
        <group key={x} position={[x, 0, FRONT + 0.3]}>
          <Box p={[0, 0.15, 0]} s={[0.3, 0.3, 0.3]} m={M.planter} />
          <mesh position={[0, 0.42, 0]} material={M.bush}>
            <icosahedronGeometry args={[0.22, 0]} />
          </mesh>
        </group>
      ))}
    </StaticMerge>
  );
}

export default function VisitorCenter({ sky, animate, lowPower }) {
  const night = sky.stars;
  const y = groundY(S.x, S.z);
  const greeters = lowPower ? WELCOME.slice(0, 2) : WELCOME;
  return (
    <group position={[S.x, y, S.z]} rotation={[0, S.rotY, 0]}>
      <Building night={night} />
      <group position={[1.3, 0, 1.55]} rotation={[0, -0.2, 0]}>
        <CounterBoard night={night} animate={animate} />
      </group>
      {greeters.map((g, i) => (
        <Greeter key={g.text} spec={g} i={i} night={night} animate={animate} position={[-1.9 + i * 0.85, 0, 1.45 + (i === 1 ? 0.3 : 0)]} />
      ))}
    </group>
  );
}
