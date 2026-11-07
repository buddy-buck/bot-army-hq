import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DOCK, terrainY } from '../../utils/paths.js';
import { Beam, Box, Cyl, Fringe, Roof, M, StringLights, Torch, canvasTexture, std } from './kit.jsx';

// The big welcome gate at the land end of Launch's Pier: four tall carved
// tiki posts under a thatched roof, the way onto the island. Hanging signs
// at both ends greet whoever walks through (from the pier and from the
// island), and a long carved frieze on each side reads BOT ISLAND HQ, so the
// gate is readable from the default camera to the south too. Flower garlands
// swag under the friezes, leis hang on the posts, and at night string lights,
// the glowing signs and four tiki torches light it up.
// The walkway between the posts stays clear: bots walk through it.

const AX = DOCK.x1 + 1.05; // just past the ramp, on the sand
const AZ = (DOCK.z0 + DOCK.z1) / 2;
const HALF = (DOCK.z1 - DOCK.z0) / 2 + 0.45; // posts stand outside the walkway
const DX = 0.95; // half the gate's depth along the walkway
const POST_H = 3.7;
const SIGN_W = 2.3; // fits between the posts
const SIGN_H = 0.72;
const FRIEZE_W = DX * 2 + 0.75;
const FRIEZE_H = FRIEZE_W / 4;
const BEAM_Y = POST_H - 0.2;
const FRIEZE_Y = BEAM_Y - 0.2 - FRIEZE_H / 2;
const FRIEZE_Z = HALF + 0.27; // just outside the posts

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

// The long side frieze: BOT ISLAND HQ with LAUNCH'S PIER under it.
function friezeTexture() {
  return canvasTexture(1024, 256, (x, w, h) => {
    x.fillStyle = '#7f512c';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(50,25,10,0.2)';
    x.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      const y = (i * 29) % h;
      x.beginPath();
      x.moveTo(0, y);
      for (let k = 0; k <= 8; k++) x.lineTo((k * w) / 8, y + Math.sin(i * 2.3 + k) * 4);
      x.stroke();
    }
    x.strokeStyle = '#4a2c15';
    x.lineWidth = 14;
    x.strokeRect(8, 8, w - 16, h - 16);
    // tiki zig-zag along the top and bottom
    x.fillStyle = '#2ec4c8';
    for (let i = 0; i < 26; i++) {
      const x0 = 20 + i * 38;
      x.beginPath();
      x.moveTo(x0, 22);
      x.lineTo(x0 + 19, 40);
      x.lineTo(x0 + 38, 22);
      x.fill();
    }
    x.fillStyle = '#ff8a5c';
    for (let i = 0; i < 26; i++) {
      const x0 = 20 + i * 38;
      x.beginPath();
      x.moveTo(x0, h - 22);
      x.lineTo(x0 + 19, h - 40);
      x.lineTo(x0 + 38, h - 22);
      x.fill();
    }
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = '900 104px "Arial Black", "Arial Rounded MT Bold", Arial, sans-serif';
    x.fillStyle = 'rgba(30,14,4,0.75)';
    x.fillText('BOT ISLAND HQ', w / 2 + 5, 112 + 6);
    x.fillStyle = '#ffde69';
    x.fillText('BOT ISLAND HQ', w / 2, 112);
    x.font = '900 40px "Arial Black", Arial, sans-serif';
    x.fillStyle = '#fbf3dc';
    x.fillText("~ LAUNCH'S PIER ~", w / 2, 190);
  });
}

const AM = {
  post: std('#6e4527'),
  carve: std('#4a2c15'),
  eye: std('#fbf3dc'),
  red: std('#c8402f'),
  teal: std('#2ec4c8'),
};

// A tall carved tiki post: two stacked faces, painted bands, a carved cap.
function TikiPost({ x, z, face }) {
  return (
    <group position={[x, 0, z]}>
      <Cyl p={[0, POST_H / 2, 0]} rt={0.17} rb={0.22} h={POST_H} seg={8} m={AM.post} />
      {[0.55, 1.0, 2.55].map((y, i) => (
        <Cyl key={y} p={[0, y, 0]} rt={0.215 - y * 0.012} h={0.08} seg={8} m={i === 1 ? AM.teal : AM.red} />
      ))}
      {/* faces looking along the walkway (toward the pier and the island) */}
      {[1, -1].map((s) =>
        [1.75, 3.05].map((fy, k) => (
          <group key={`${s}${fy}`} position={[s * (0.2 - fy * 0.01), fy, 0]} rotation={[0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0]} scale={k ? 0.9 : 1.1}>
            <Box p={[0, 0.2, 0.02]} s={[0.3, 0.07, 0.06]} m={AM.carve} />
            <Box p={[-0.08, 0.1, 0.03]} s={[0.09, 0.07, 0.04]} m={AM.eye} />
            <Box p={[0.08, 0.1, 0.03]} s={[0.09, 0.07, 0.04]} m={AM.eye} />
            <Box p={[0, 0.0, 0.04]} s={[0.07, 0.13, 0.05]} m={AM.post} />
            <Box p={[0, -0.15, 0.03]} s={[0.22, 0.07, 0.04]} m={face} />
          </group>
        ))
      )}
      <mesh position={[0, POST_H + 0.08, 0]} material={AM.carve}>
        <coneGeometry args={[0.24, 0.26, 8]} />
      </mesh>
    </group>
  );
}

// Flowers: leis on the four posts and garlands swagged under both friezes,
// all in one instanced mesh.
const FLOWER_GEO = new THREE.IcosahedronGeometry(0.06, 0);
const FLOWER_MAT = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 });
const FLOWER_COLORS = ['#ff5d8f', '#ffd23f', '#ffffff', '#f25cff', '#ff8a3d'].map((c) => new THREE.Color(c));
const FLOWERS = (() => {
  const out = [];
  for (const px of [-DX, DX]) {
    for (const pz of [-HALF, HALF]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        out.push([px + Math.cos(a) * 0.25, 1.38 - Math.abs(Math.sin(a + 0.5)) * 0.14, pz + Math.sin(a) * 0.25]);
      }
    }
  }
  // two swags per side, hanging under each frieze
  const y0 = FRIEZE_Y - FRIEZE_H / 2 - 0.03;
  for (const pz of [-FRIEZE_Z - 0.06, FRIEZE_Z + 0.06]) {
    for (let k = 0; k < 2; k++) {
      const xa = -DX - 0.15 + k * (DX + 0.15);
      const xb = xa + DX + 0.15;
      for (let i = 0; i <= 11; i++) {
        const t = i / 11;
        out.push([xa + (xb - xa) * t, y0 - Math.sin(t * Math.PI) * 0.32, pz]);
      }
    }
  }
  return out;
})();

function Flowers() {
  const ref = useRef();
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    FLOWERS.forEach((p, i) => {
      d.position.set(...p);
      d.rotation.set(i * 0.7, i * 1.3, 0);
      d.scale.setScalar(0.85 + ((i * 37) % 7) / 20);
      d.updateMatrix();
      ref.current.setMatrixAt(i, d.matrix);
      ref.current.setColorAt(i, FLOWER_COLORS[i % FLOWER_COLORS.length]);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, []);
  return <instancedMesh ref={ref} args={[FLOWER_GEO, FLOWER_MAT, FLOWERS.length]} />;
}

export default function WelcomeArch({ ctx }) {
  const { sky, animate } = ctx;
  const night = sky.stars;
  const signs = [useRef(), useRef()];
  const mats = useMemo(() => {
    const map = signTexture();
    const fmap = friezeTexture();
    return {
      sign: new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffb066', emissiveIntensity: 0.06, roughness: 0.8 }),
      frieze: new THREE.MeshStandardMaterial({ map: fmap, emissiveMap: fmap, emissive: '#ffb066', emissiveIntensity: 0.06, roughness: 0.8 }),
    };
  }, []);
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) {
        m.map.dispose();
        m.dispose();
      }
    },
    [mats]
  );
  useEffect(() => {
    mats.sign.emissiveIntensity = 0.06 + night * 0.5;
    mats.frieze.emissiveIntensity = 0.06 + night * 0.5;
  }, [mats, night]);
  // the end signs sway a touch in the breeze
  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;
    signs.forEach((r, i) => {
      if (r.current) r.current.rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.025;
    });
  });
  const g = terrainY(AX, AZ);
  const topY = POST_H + 0.02;
  const beamY = BEAM_Y;
  const torches = [
    [AX + DX + 0.45, AZ - HALF - 0.25],
    [AX + DX + 0.45, AZ + HALF + 0.25],
    [AX - DX - 0.1, AZ - HALF - 0.45],
    [AX - DX - 0.1, AZ + HALF + 0.45],
  ];
  const lightPts = useMemo(
    () => [
      [
        [-DX - 0.2, beamY - 0.1, -FRIEZE_Z - 0.12],
        [DX + 0.2, beamY - 0.1, -FRIEZE_Z - 0.12],
      ],
      [
        [-DX - 0.2, beamY - 0.1, FRIEZE_Z + 0.12],
        [DX + 0.2, beamY - 0.1, FRIEZE_Z + 0.12],
      ],
    ],
    [beamY]
  );
  return (
    <group>
      <group position={[AX, g - 0.05, AZ]}>
        {[-DX, DX].map((x) => [-HALF, HALF].map((z) => <TikiPost key={`${x}${z}`} x={x} z={z} face={z < 0 ? AM.red : AM.teal} />))}
        {/* end beams across the walkway and side beams along it */}
        {[-DX, DX].map((x) => (
          <Box key={`eb${x}`} p={[x, beamY, 0]} s={[0.28, 0.24, HALF * 2 + 0.6]} m={M.darkWood} />
        ))}
        {[-HALF, HALF].map((z) => (
          <Box key={`sb${z}`} p={[0, beamY, z * 1.06]} s={[DX * 2 + 0.6, 0.24, 0.42]} m={M.darkWood} />
        ))}
        {[-DX, DX].map((x) => (
          <Beam key={`bm${x}`} a={[x + 0.16, beamY - 0.13, -HALF - 0.3]} b={[x + 0.16, beamY - 0.13, HALF + 0.3]} r={0.04} m={M.bamboo} />
        ))}
        {/* thatched roof over the whole gate */}
        <Roof p={[0, topY + 0.38, 0]} halfX={DX + 0.5} halfZ={HALF + 0.55} h={0.85} m={M.thatch} />
        <Fringe p={[0, topY - 0.04, 0]} halfX={DX + 0.48} halfZ={HALF + 0.53} drop={0.2} />
        <Cyl p={[0, topY + 0.92, 0]} rt={0.015} h={0.5} m={M.darkWood} />
        <mesh position={[0, topY + 1.2, 0]} material={AM.red}>
          <icosahedronGeometry args={[0.09, 0]} />
        </mesh>
        {/* the side friezes: BOT ISLAND HQ, facing south and north */}
        {[1, -1].map((s) => (
          <group key={`fr${s}`} position={[0, FRIEZE_Y, s * FRIEZE_Z]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
            <Box p={[0, 0, -0.03]} s={[FRIEZE_W + 0.08, FRIEZE_H + 0.08, 0.05]} m={AM.carve} />
            <mesh position={[0, 0, 0.0]} material={mats.frieze}>
              <planeGeometry args={[FRIEZE_W, FRIEZE_H]} />
            </mesh>
          </group>
        ))}
        {/* hanging welcome signs at both ends, on two ropes each */}
        {[DX, -DX].map((x, i) => (
          <group key={`hs${x}`} position={[x + Math.sign(x) * 0.02, 0, 0]}>
            {[-0.95, 0.95].map((z) => (
              <Beam key={z} a={[0, beamY - 0.12, z]} b={[0, beamY - 0.42, z]} r={0.016} m={M.rope} seg={3} />
            ))}
            <group ref={signs[i]} position={[0, beamY - 0.42, 0]}>
              <Box p={[0, -SIGN_H / 2, 0]} s={[0.07, SIGN_H + 0.06, SIGN_W + 0.06]} m={AM.carve} />
              <mesh position={[0.037, -SIGN_H / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={mats.sign}>
                <planeGeometry args={[SIGN_W, SIGN_H]} />
              </mesh>
              <mesh position={[-0.037, -SIGN_H / 2, 0]} rotation={[0, -Math.PI / 2, 0]} material={mats.sign}>
                <planeGeometry args={[SIGN_W, SIGN_H]} />
              </mesh>
            </group>
          </group>
        ))}
        <Flowers />
        <StringLights points={lightPts[0]} sag={0.12} per={5} night={night} />
        <StringLights points={lightPts[1]} sag={0.12} per={5} night={night} />
      </group>
      {torches.map(([x, z]) => (
        <Torch key={`${x}${z}`} p={[x, terrainY(x, z), z]} night={night} animate={animate} />
      ))}
    </group>
  );
}
