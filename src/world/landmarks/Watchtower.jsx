import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SITES, groundY } from '../../utils/paths.js';
import MiniBot from '../MiniBot.jsx';
import { Beam, Box, Cyl, Lantern, M, Roof, std } from './kit.jsx';

// Lifeguard watchtower on the south beach: white stilts, red rails and roof,
// a ladder at the back, a rescue buoy and an American flag that ripples in
// the breeze.
// By day a red lifeguard bot sits up top and slowly scans the water through
// binoculars. At night the tower is empty and a small lamp glows.

const RED = std('#e0393e');
const YELLOW = std('#ffd23f');
const WHITE = std('#ffffff');
const DARK = std('#2b2a33');
const LENS = std('#5b8fd6', { roughness: 0.2 });

// The American flag: a canvas texture (13 stripes, blue canton with 50 white
// star dots) on a strip of a plane that ripples in the breeze. The ripple
// moves the plane's vertices in place (no allocations per frame).
const FLAG_W = 0.62;
const FLAG_H = 0.33;
const FLAG_SEG = 10;
function usFlagTexture() {
  const c = document.createElement('canvas');
  c.width = 380;
  c.height = 200;
  const x = c.getContext('2d');
  const w = c.width;
  const h = c.height;
  const sh = h / 13;
  for (let i = 0; i < 13; i++) {
    x.fillStyle = i % 2 ? '#ffffff' : '#c8202f';
    x.fillRect(0, Math.round(i * sh), w, Math.ceil(sh) + 1);
  }
  const cw = w * 0.4;
  const ch = sh * 7;
  x.fillStyle = '#1f2f6b';
  x.fillRect(0, 0, cw, ch);
  // 50 stars: 9 rows alternating 6 and 5
  x.fillStyle = '#ffffff';
  for (let r = 0; r < 9; r++) {
    const n = r % 2 ? 5 : 6;
    for (let k = 0; k < n; k++) {
      const sx = ((k * 2 + (r % 2 ? 2 : 1)) / 12) * cw;
      const sy = ((r + 1) / 10) * ch;
      x.beginPath();
      x.arc(sx, sy, 3.6, 0, Math.PI * 2);
      x.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
let flagMat = null;
const getFlagMat = () => (flagMat ??= std('#ffffff', { map: usFlagTexture(), side: THREE.DoubleSide, flatShading: false, roughness: 0.9 }));
const BUOY_GEO = new THREE.TorusGeometry(0.17, 0.06, 6, 12);
const BAND_GEO = new THREE.TorusGeometry(0.17, 0.064, 6, 12, 0.35);

const DECK_Y = 1.75; // platform top above the sand
const HALF = 0.72; // platform half-size
const LIFEGUARD = '#e63946';

export default function Watchtower({ ctx }) {
  const { sky, animate, bedtime } = ctx;
  const night = sky.stars;
  const empty = night > 0.5 || bedtime;
  const site = SITES.watchtower;
  const g = useMemo(() => groundY(site.x, site.z), [site.x, site.z]);
  const parts = useRef({});
  const bino = useRef();
  const flag = useRef();
  const flagGeo = useMemo(() => new THREE.PlaneGeometry(FLAG_W, FLAG_H, FLAG_SEG, 1).translate(FLAG_W / 2, 0, 0), []);
  useEffect(() => () => flagGeo.dispose(), [flagGeo]);

  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    if (flag.current) {
      flag.current.rotation.y = Math.sin(t * 2.1) * 0.16 + Math.sin(t * 3.3) * 0.05;
      // ripple: a wave travels from the pole to the fly end, bigger toward the end
      const pos = flagGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) / FLAG_W;
        pos.setZ(i, u * (Math.sin(u * 7 - t * 6.5) * 0.045 + Math.sin(u * 3.5 - t * 3.1) * 0.025));
      }
      pos.needsUpdate = true;
      if (animate) flagGeo.computeVertexNormals();
    }
    const p = parts.current;
    if (empty || !p.pose) return;
    // Seated, leaning forward a touch, elbows up with the binoculars.
    p.pose.position.set(0, 0.2, 0.04);
    p.pose.rotation.x = -0.05;
    p.footL.position.z = 0.12;
    p.footR.position.z = 0.12;
    // Slow sweep across the water with little holds at each end.
    const s = Math.sin(t * 0.22);
    const yaw = Math.sign(s) * Math.pow(Math.abs(s), 0.6) * 0.75;
    const peek = Math.max(0, Math.sin(t * 0.09 + 1.3)) > 0.93; // now and then: lower them for a look
    p.head.rotation.y = yaw;
    p.head.rotation.x = peek ? 0.05 : -0.08;
    p.pose.rotation.y = yaw * 0.35;
    const armX = peek ? -0.6 : -2.15;
    p.armL.rotation.set(armX, 0, 0.42);
    p.armR.rotation.set(armX, 0, -0.42);
    if (bino.current) {
      bino.current.rotation.set(p.head.rotation.x, yaw, 0);
      bino.current.position.set(0, peek ? 0.48 : 0.74, peek ? 0.05 : 0);
    }
  });

  const legs = [[-HALF + 0.08, -HALF + 0.08], [HALF - 0.08, -HALF + 0.08], [-HALF + 0.08, HALF - 0.08], [HALF - 0.08, HALF - 0.08]];
  const ladderLen = Math.hypot(DECK_Y, 0.7);
  const ladderTilt = Math.atan2(0.7, DECK_Y);
  const rail = DECK_Y + 0.5;

  return (
    <group position={[site.x, g, site.z]} rotation={[0, 0.15, 0]}>
      {/* stilts, splayed a little, with cross braces */}
      {legs.map(([x, z], i) => (
        <Beam key={i} a={[x * 1.25, -0.15, z * 1.25]} b={[x, DECK_Y, z]} r={0.065} m={WHITE} seg={6} />
      ))}
      {[
        [[-0.75, 0.3, HALF - 0.04], [0.65, DECK_Y - 0.2, HALF - 0.08]],
        [[0.75, 0.3, HALF - 0.04], [-0.65, DECK_Y - 0.2, HALF - 0.08]],
        [[-HALF - 0.04, 0.3, -0.75], [-HALF + 0.08, DECK_Y - 0.2, 0.65]],
        [[HALF + 0.04, 0.3, -0.75], [HALF - 0.08, DECK_Y - 0.2, 0.65]],
      ].map(([a, b], i) => (
        <Beam key={`br${i}`} a={a} b={b} r={0.03} m={WHITE} />
      ))}
      {/* platform */}
      <Box p={[0, DECK_Y - 0.06, 0]} s={[HALF * 2 + 0.1, 0.12, HALF * 2 + 0.1]} m={M.plank} />
      {/* red rails on three sides, open at the back for the ladder */}
      {[[-HALF, HALF], [HALF, HALF], [-HALF, -HALF], [HALF, -HALF]].map(([x, z], i) => (
        <Cyl key={`rp${i}`} p={[x, DECK_Y + 0.25, z]} rt={0.035} h={0.5} m={RED} />
      ))}
      <Beam a={[-HALF, rail, HALF]} b={[HALF, rail, HALF]} r={0.04} m={RED} />
      <Beam a={[-HALF, rail, -HALF]} b={[-HALF, rail, HALF]} r={0.04} m={RED} />
      <Beam a={[HALF, rail, -HALF]} b={[HALF, rail, HALF]} r={0.04} m={RED} />
      <Beam a={[-HALF, rail - 0.25, HALF]} b={[HALF, rail - 0.25, HALF]} r={0.025} m={RED} />
      {/* red front panel with a white cross */}
      <Box p={[0, DECK_Y + 0.18, HALF + 0.03]} s={[0.9, 0.34, 0.04]} m={RED} />
      <Box p={[0, DECK_Y + 0.18, HALF + 0.055]} s={[0.22, 0.07, 0.02]} m={WHITE} />
      <Box p={[0, DECK_Y + 0.18, HALF + 0.055]} s={[0.07, 0.22, 0.02]} m={WHITE} />
      {/* roof on four white posts */}
      {[[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]].map(([x, z], i) => (
        <Cyl key={`pp${i}`} p={[x * 0.97, DECK_Y + 0.75, z * 0.97]} rt={0.03} h={1.5} m={WHITE} />
      ))}
      <Box p={[0, DECK_Y + 1.5, 0]} s={[HALF * 2 + 0.36, 0.08, HALF * 2 + 0.36]} m={WHITE} />
      <Roof p={[0, DECK_Y + 1.5 + 0.28, 0]} halfX={HALF + 0.2} halfZ={HALF + 0.2} h={0.56} m={RED} />
      <Cyl p={[0, DECK_Y + 2.12, 0]} rt={0.03} h={0.16} m={WHITE} />
      {/* lifeguard chair (white, red cushion) */}
      <group position={[0, DECK_Y, -0.1]}>
        {[[-0.22, -0.18], [0.22, -0.18], [-0.22, 0.18], [0.22, 0.18]].map(([x, z], i) => (
          <Cyl key={i} p={[x, 0.15, z]} rt={0.025} h={0.3} m={WHITE} />
        ))}
        <Box p={[0, 0.33, 0]} s={[0.54, 0.05, 0.46]} m={WHITE} />
        <Box p={[0, 0.37, 0.02]} s={[0.46, 0.04, 0.38]} m={RED} />
        <Box p={[0, 0.66, -0.24]} s={[0.54, 0.56, 0.04]} r={[-0.18, 0, 0]} m={WHITE} />
      </group>
      {/* ladder at the back */}
      <group position={[0.15, DECK_Y / 2 - 0.05, -HALF - 0.38]} rotation={[ladderTilt, 0, 0]}>
        <Box p={[-0.2, 0, 0]} s={[0.05, ladderLen, 0.05]} m={WHITE} />
        <Box p={[0.2, 0, 0]} s={[0.05, ladderLen, 0.05]} m={WHITE} />
        {Array.from({ length: 5 }, (_, i) => (
          <Box key={i} p={[0, -ladderLen / 2 + 0.25 + i * 0.36, 0]} s={[0.4, 0.035, 0.05]} m={M.wood} />
        ))}
      </group>
      {/* rescue buoy on the side rail */}
      <group position={[HALF + 0.08, DECK_Y + 0.22, 0.15]} rotation={[0, Math.PI / 2, 0]}>
        <mesh geometry={BUOY_GEO} material={RED} />
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k} geometry={BAND_GEO} material={WHITE} rotation={[0, 0, k * (Math.PI / 2) + 0.6]} />
        ))}
      </group>
      {/* rescue tube leaning on a stilt */}
      <Box p={[-HALF - 0.12, 0.5, HALF + 0.05]} s={[0.12, 0.85, 0.1]} r={[0, 0, 0.12]} m={RED} />
      {/* the American flag, flying from a pole on the back corner */}
      <group position={[-HALF, DECK_Y + 1.58, -HALF]}>
        <Cyl p={[0, 0.5, 0]} rt={0.02} h={1.0} m={WHITE} />
        <mesh position={[0, 1.02, 0]} material={YELLOW}>
          <sphereGeometry args={[0.035, 8, 6]} />
        </mesh>
        <group ref={flag} position={[0.02, 0.8, 0]}>
          <mesh geometry={flagGeo} material={getFlagMat()} />
        </group>
      </group>
      {empty ? (
        <>
          {/* off duty: binoculars on the rail, a small lamp under the roof */}
          <Binoculars p={[0.4, rail + 0.06, HALF]} />
          <Cyl p={[HALF * 0.97 - 0.02, DECK_Y + 1.38, HALF * 0.97 - 0.02]} rt={0.012} h={0.1} m={DARK} />
          <Lantern p={[HALF * 0.97 - 0.02, DECK_Y + 1.26, HALF * 0.97 - 0.02]} night={Math.max(night, 0.6)} />
        </>
      ) : (
        <MiniBot color={LIFEGUARD} parts={parts} position={[0, DECK_Y, -0.08]} shadow={false}>
          <group ref={bino} position={[0, 0.74, 0]}>
            <Binoculars p={[0, 0.06, 0.24]} />
          </group>
        </MiniBot>
      )}
    </group>
  );
}

function Binoculars({ p }) {
  return (
    <group position={p}>
      {[-0.055, 0.055].map((x) => (
        <group key={x}>
          <Cyl p={[x, 0, 0]} rt={0.038} rb={0.042} h={0.13} m={DARK} r={[Math.PI / 2, 0, 0]} seg={8} />
          <Cyl p={[x, 0, 0.066]} rt={0.03} h={0.01} m={LENS} r={[Math.PI / 2, 0, 0]} seg={8} />
        </group>
      ))}
      <Box p={[0, 0, 0]} s={[0.06, 0.03, 0.05]} m={YELLOW} />
    </group>
  );
}
