import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DOCK, terrainY } from '../../utils/paths.js';
import { Beam, Box, Cyl, Fringe, Roof, M, Torch, canvasTexture, std } from './kit.jsx';

// A carved wooden welcome arch at the land end of Launch's Pier, with a
// hanging tiki-style sign and two tiki torches that light it at night.
// The sign is painted on both faces: from the island it says welcome, and
// from the pier it greets whoever just stepped off a boat.

const AX = DOCK.x1 + 1.05; // just past the ramp, on the sand
const AZ = (DOCK.z0 + DOCK.z1) / 2;
const HALF = (DOCK.z1 - DOCK.z0) / 2 + 0.35; // posts stand outside the walkway
const POST_H = 2.45;
const SIGN_W = 2.3;
const SIGN_H = 0.72;

function drawBot(x, cx, cy, s, body) {
  x.save();
  x.translate(cx, cy);
  x.scale(s, s);
  // antenna
  x.strokeStyle = '#3b2412';
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(0, -46);
  x.lineTo(0, -62);
  x.stroke();
  x.fillStyle = '#ffde69';
  x.beginPath();
  x.arc(0, -66, 7, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  // head
  x.fillStyle = '#fbf3dc';
  x.beginPath();
  x.roundRect(-30, -48, 60, 42, 14);
  x.fill();
  x.stroke();
  x.fillStyle = '#2b2a33';
  x.beginPath();
  x.arc(-11, -28, 5.5, 0, Math.PI * 2);
  x.arc(11, -28, 5.5, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#2b2a33';
  x.lineWidth = 3;
  x.beginPath();
  x.arc(0, -22, 8, 0.2, Math.PI - 0.2);
  x.stroke();
  // body
  x.strokeStyle = '#3b2412';
  x.lineWidth = 4;
  x.fillStyle = body;
  x.beginPath();
  x.roundRect(-24, -4, 48, 42, 12);
  x.fill();
  x.stroke();
  x.restore();
}

function signTexture() {
  return canvasTexture(1024, 320, (x, w, h) => {
    // planks
    x.fillStyle = '#8a5a33';
    x.fillRect(0, 0, w, h);
    const planks = ['#94623a', '#86562f', '#8f5d36', '#7f512c'];
    for (let i = 0; i < 4; i++) {
      x.fillStyle = planks[i];
      x.fillRect(0, (i * h) / 4, w, h / 4 - 4);
      x.fillStyle = 'rgba(40,20,8,0.45)';
      x.fillRect(0, ((i + 1) * h) / 4 - 4, w, 4);
    }
    // wood grain
    x.strokeStyle = 'rgba(50,25,10,0.18)';
    x.lineWidth = 2;
    for (let i = 0; i < 36; i++) {
      const y = (i * 37) % h;
      x.beginPath();
      x.moveTo(0, y);
      for (let k = 0; k <= 8; k++) x.lineTo((k * w) / 8, y + Math.sin(i * 1.7 + k) * 5);
      x.stroke();
    }
    // carved border with a rope edge
    x.strokeStyle = '#4a2c15';
    x.lineWidth = 14;
    x.strokeRect(10, 10, w - 20, h - 20);
    x.strokeStyle = '#d9c79a';
    x.lineWidth = 5;
    x.setLineDash([14, 8]);
    x.strokeRect(22, 22, w - 44, h - 44);
    x.setLineDash([]);
    // text: carved (dark offset) and painted
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const text = (str, y, size, fill) => {
      x.font = `900 ${size}px "Arial Black", "Arial Rounded MT Bold", Arial, sans-serif`;
      x.fillStyle = 'rgba(30,14,4,0.75)';
      x.fillText(str, w / 2 + 4, y + 5);
      x.fillStyle = fill;
      x.fillText(str, w / 2, y);
    };
    text('~ WELCOME TO ~', 98, 50, '#fbf3dc');
    text('BOT ISLAND HQ', 205, 80, '#ffde69');
    // little bots either side
    drawBot(x, 84, 200, 1.05, '#2ec4c8');
    drawBot(x, w - 84, 200, 1.05, '#ff8a5c');
    // tiny hibiscus flowers in the corners
    const flower = (cx, cy) => {
      x.fillStyle = '#ff5d8f';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        x.beginPath();
        x.ellipse(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, 10, 7, a, 0, Math.PI * 2);
        x.fill();
      }
      x.fillStyle = '#ffde69';
      x.beginPath();
      x.arc(cx, cy, 5, 0, Math.PI * 2);
      x.fill();
    };
    flower(46, 46);
    flower(w - 46, 46);
  });
}

const AM = {
  post: std('#6e4527'),
  carve: std('#4a2c15'),
  eye: std('#fbf3dc'),
  red: std('#c8402f'),
  teal: std('#2ec4c8'),
};

// A carved tiki post: a pole with a face near the top and painted bands.
function TikiPost({ z, face }) {
  return (
    <group position={[0, 0, z]}>
      <Cyl p={[0, POST_H / 2, 0]} rt={0.15} rb={0.18} h={POST_H} seg={8} m={AM.post} />
      {[0.5, 0.9].map((y) => (
        <Cyl key={y} p={[0, y, 0]} rt={0.185} h={0.07} seg={8} m={y === 0.5 ? AM.red : AM.teal} />
      ))}
      {/* faces on both sides of the post */}
      {[1, -1].map((s) => (
        <group key={s} position={[s * 0.15, 1.55, 0]} rotation={[0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <Box p={[0, 0.2, 0.02]} s={[0.26, 0.06, 0.06]} m={AM.carve} />
          <Box p={[-0.07, 0.1, 0.03]} s={[0.08, 0.06, 0.04]} m={AM.eye} />
          <Box p={[0.07, 0.1, 0.03]} s={[0.08, 0.06, 0.04]} m={AM.eye} />
          <Box p={[0, 0.0, 0.04]} s={[0.06, 0.12, 0.05]} m={AM.post} />
          <Box p={[0, -0.14, 0.03]} s={[0.2, 0.06, 0.04]} m={face} />
        </group>
      ))}
      <mesh position={[0, POST_H + 0.05, 0]} material={AM.carve}>
        <coneGeometry args={[0.2, 0.22, 8]} />
      </mesh>
    </group>
  );
}

export default function WelcomeArch({ ctx }) {
  const { sky, animate } = ctx;
  const night = sky.stars;
  const sign = useRef();
  const mat = useMemo(() => {
    const map = signTexture();
    return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffb066', emissiveIntensity: 0.06, roughness: 0.8 });
  }, []);
  useEffect(() => () => (mat.map.dispose(), mat.dispose()), [mat]);
  useEffect(() => {
    mat.emissiveIntensity = 0.06 + night * 0.42;
  }, [mat, night]);
  // the sign sways a touch in the breeze
  useFrame((state) => {
    if (!animate || !sign.current) return;
    sign.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.9) * 0.025;
  });
  const g = terrainY(AX, AZ);
  const topY = POST_H + 0.05;
  const t1 = [AX + 0.35, AZ - HALF - 0.55];
  const t2 = [AX + 0.35, AZ + HALF + 0.55];
  return (
    <group>
      <group position={[AX, g - 0.05, AZ]}>
        <TikiPost z={-HALF} face={AM.red} />
        <TikiPost z={HALF} face={AM.teal} />
        {/* crossbeam with a little thatch cap and bamboo trim */}
        <Box p={[0, topY - 0.22, 0]} s={[0.26, 0.2, HALF * 2 + 0.7]} m={M.darkWood} />
        <Beam a={[0.15, topY - 0.32, -HALF - 0.3]} b={[0.15, topY - 0.32, HALF + 0.3]} r={0.04} m={M.bamboo} />
        <Beam a={[-0.15, topY - 0.32, -HALF - 0.3]} b={[-0.15, topY - 0.32, HALF + 0.3]} r={0.04} m={M.bamboo} />
        <Roof p={[0, topY + 0.12, 0]} halfX={0.38} halfZ={HALF + 0.5} h={0.4} m={M.thatch} />
        <Fringe p={[0, topY - 0.08, 0]} halfX={0.36} halfZ={HALF + 0.48} drop={0.14} />
        {/* the sign, hung on two ropes */}
        {[-0.85, 0.85].map((z) => (
          <Beam key={z} a={[0, topY - 0.32, z]} b={[0, topY - 0.6, z]} r={0.014} m={M.rope} seg={3} />
        ))}
        <group ref={sign} position={[0, topY - 0.6, 0]}>
          <Box p={[0, -SIGN_H / 2, 0]} s={[0.07, SIGN_H + 0.06, SIGN_W + 0.06]} m={AM.carve} />
          <mesh position={[0.037, -SIGN_H / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={mat}>
            <planeGeometry args={[SIGN_W, SIGN_H]} />
          </mesh>
          <mesh position={[-0.037, -SIGN_H / 2, 0]} rotation={[0, -Math.PI / 2, 0]} material={mat}>
            <planeGeometry args={[SIGN_W, SIGN_H]} />
          </mesh>
        </group>
        {/* a lei of flowers hung on each post */}
        {[-HALF, HALF].map((z) =>
          Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return (
              <mesh key={`${z}${i}`} position={[Math.cos(a) * 0.2, 1.22 - Math.abs(Math.sin(a)) * 0.1, z + Math.sin(a) * 0.2]}>
                <icosahedronGeometry args={[0.05, 0]} />
                <meshStandardMaterial color={['#ff5d8f', '#ffd23f', '#ffffff', '#f25cff'][i % 4]} flatShading />
              </mesh>
            );
          })
        )}
      </group>
      <Torch p={[t1[0], terrainY(...t1), t1[1]]} night={night} animate={animate} />
      <Torch p={[t2[0], terrainY(...t2), t2[1]]} night={night} animate={animate} />
    </group>
  );
}
