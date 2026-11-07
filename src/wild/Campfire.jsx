import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { BOT_SCALE } from '../components/Bot.jsx';
import { labelState } from '../components/labels.js';
import { CAMPFIRE, campfireSpots, groundY } from '../utils/paths.js';
import StaticMerge from '../utils/StaticMerge.jsx';

// Campfire mode (9 PM to 6 AM Duvall time): working bots gather around a
// campfire on the south-west side of the island, with little thought bubbles
// showing what they're working on (lastAction.text, already made public-safe).
// Bots that aren't working are asleep in their hammocks. The workers sit on
// stumps (Bot.jsx 'seat' mode: tablet in hand while working) and every other
// one has a laptop open on a little crate beside them, so the work goes on.
// The fire is a few flickering low-poly flames, a glow and a handful of
// embers: no real lights, so it's cheap to draw.

// One bubble at the normal view, a few when zoomed in, none when zoomed out.
const BUBBLES_BY_TIER = { far: 0, default: 1, close: 3 };
const BUBBLE_SECONDS = 6;

// Move working bots (except Claude, who commutes by boat) to the fire and
// sit them down on the stumps.
export function campfireLayout(layout, bots) {
  const spots = campfireSpots();
  const out = { ...layout };
  let i = 0;
  for (const b of bots) {
    if (b.status !== 'working' || b.id === 'claude' || !out[b.id]) continue;
    const s = spots[i++];
    if (!s) break;
    const y = groundY(s.x, s.z);
    const home = { x: s.x, y, z: s.z, rotY: s.rotY, raised: false };
    out[b.id] = { ...out[b.id], x: s.x, y, z: s.z, rotY: s.rotY, raised: false, lounge: false, doorstep: null, hammock: null, mode: 'seat', home, campfire: true, seatIndex: i - 1 };
  }
  return out;
}

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });
const MAT = {
  log: std('#6b4a2a'),
  stone: std('#8d949a'),
  flameA: new THREE.MeshBasicMaterial({ color: '#ffb23d', fog: false }),
  flameB: new THREE.MeshBasicMaterial({ color: '#ff6a1f', fog: false }),
  flameC: new THREE.MeshBasicMaterial({ color: '#fff0a8', fog: false }),
  glow: new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  ground: new THREE.MeshBasicMaterial({ color: '#ffae5c', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
  ember: new THREE.MeshBasicMaterial({ color: '#ffcf6b', transparent: true, opacity: 0.9, depthWrite: false, fog: false }),
};
const EMBERS = 14;
const EMBER_GEO = new THREE.TetrahedronGeometry(0.035, 0);
const STONE_GEO = new THREE.DodecahedronGeometry(0.16, 0);

// Stumps to sit on and laptops for the night shift.
const STUMP_H = 0.41; // a seated bot's body rests at about this height
const STUMP_GEO = new THREE.CylinderGeometry(0.2, 0.24, STUMP_H, 7).translate(0, STUMP_H / 2, 0);
const STUMP_TOP_GEO = new THREE.CylinderGeometry(0.19, 0.19, 0.012, 7).translate(0, STUMP_H + 0.004, 0);
const CRATE_GEO = new THREE.BoxGeometry(0.3, 0.22, 0.26).translate(0, 0.11, 0);
const LAPTOP_BASE_GEO = new THREE.BoxGeometry(0.26, 0.015, 0.18).translate(0, 0.0075, 0);
const LAPTOP_LID_GEO = new THREE.BoxGeometry(0.26, 0.17, 0.012).translate(0, 0.085, 0);
const LAPTOP_SCREEN_GEO = new THREE.PlaneGeometry(0.22, 0.13).translate(0, 0.085, 0.007);
const SEAT_MAT = {
  bark: std('#7a5232'),
  rings: std('#e2c08d'),
  crate: std('#b88a57'),
  laptop: std('#c9d2da', { roughness: 0.4, metalness: 0.4 }),
  screen: new THREE.MeshBasicMaterial({ color: '#9fe3ff', fog: false }),
};

function Seats({ seats }) {
  return seats.map((s) => {
    const fx = Math.sin(s.rotY);
    const fz = Math.cos(s.rotY);
    // the stump sits a hair behind the bot; the crate is to its right
    const sx = s.x - fx * 0.06;
    const sz = s.z - fz * 0.06;
    const cx = s.x - fz * 0.62;
    const cz = s.z + fx * 0.62;
    return (
      <group key={s.id}>
        <group position={[sx, groundY(sx, sz) - 0.02, sz]} rotation={[0, s.rotY, 0]}>
          <mesh geometry={STUMP_GEO} material={SEAT_MAT.bark} />
          <mesh geometry={STUMP_TOP_GEO} material={SEAT_MAT.rings} />
        </group>
        {s.laptop && (
          <group position={[cx, groundY(cx, cz), cz]} rotation={[0, s.rotY - 0.5, 0]}>
            <mesh geometry={CRATE_GEO} material={SEAT_MAT.crate} />
            <group position={[0, 0.22, 0]}>
              <mesh geometry={LAPTOP_BASE_GEO} material={SEAT_MAT.laptop} position={[0, 0, 0.02]} />
              <group position={[0, 0.012, -0.07]} rotation={[-0.25, 0, 0]}>
                <mesh geometry={LAPTOP_LID_GEO} material={SEAT_MAT.laptop} />
                <mesh geometry={LAPTOP_SCREEN_GEO} material={SEAT_MAT.screen} />
              </group>
            </group>
          </group>
        )}
      </group>
    );
  });
}

function Fire({ animate }) {
  const flames = [useRef(), useRef(), useRef()];
  const glow = useRef();
  const embers = useRef();
  const seeds = useMemo(() => Array.from({ length: EMBERS }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * 0.25, s: 0.5 + Math.random() * 0.6, p: Math.random() })), []);
  const d = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (!embers.current) return;
    seeds.forEach((_, i) => {
      d.position.set(0, -10, 0);
      d.updateMatrix();
      embers.current.setMatrixAt(i, d.matrix);
    });
    embers.current.instanceMatrix.needsUpdate = true;
  }, [seeds, d]);

  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    flames.forEach((f, i) => {
      if (!f.current) return;
      const k = 1 + Math.sin(t * (9 + i * 2.3) + i) * 0.14 + Math.sin(t * 14.7 + i * 3) * 0.07;
      f.current.scale.set(1 - (k - 1) * 0.5, k, 1 - (k - 1) * 0.5);
      f.current.rotation.y = t * (0.6 + i * 0.4);
    });
    if (glow.current) glow.current.scale.setScalar(1 + Math.sin(t * 7.3) * 0.05);
    if (embers.current && animate) {
      seeds.forEach((e, i) => {
        const u = (t * e.s * 0.5 + e.p) % 1;
        d.position.set(Math.cos(e.a + u * 3) * (e.r + u * 0.3), 0.3 + u * 2.0, Math.sin(e.a + u * 3) * (e.r + u * 0.3));
        d.scale.setScalar(1 - u);
        d.updateMatrix();
        embers.current.setMatrixAt(i, d.matrix);
      });
      embers.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* stone ring and crossed logs (static: baked into a couple of draws) */}
      <StaticMerge>
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        return <mesh key={i} geometry={STONE_GEO} material={MAT.stone} position={[Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55]} rotation={[a, a * 2, 0]} />;
      })}
      {[0, Math.PI / 3, -Math.PI / 3].map((r, i) => (
        <mesh key={i} material={MAT.log} position={[0, 0.1, 0]} rotation={[0, r, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.07, 0.8, 5]} />
        </mesh>
      ))}
      </StaticMerge>
      <mesh ref={flames[0]} material={MAT.flameB} position={[0, 0.38, 0]}>
        <coneGeometry args={[0.28, 0.7, 5]} />
      </mesh>
      <mesh ref={flames[1]} material={MAT.flameA} position={[0.04, 0.36, 0.02]}>
        <coneGeometry args={[0.19, 0.6, 5]} />
      </mesh>
      <mesh ref={flames[2]} material={MAT.flameC} position={[-0.02, 0.3, -0.02]}>
        <coneGeometry args={[0.1, 0.36, 4]} />
      </mesh>
      <mesh ref={glow} material={MAT.glow} position={[0, 0.5, 0]}>
        <sphereGeometry args={[1.0, 12, 8]} />
      </mesh>
      <mesh material={MAT.ground} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.6, 24]} />
      </mesh>
      <instancedMesh ref={embers} args={[EMBER_GEO, MAT.ember, EMBERS]} frustumCulled={false} />
    </group>
  );
}

const clip = (s, n = 64) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}...` : s);

// Thought bubbles: a few at a time, taking turns, so the circle never
// turns into a wall of text.
function Bubbles({ items, animate }) {
  const [tick, setTick] = useState(0);
  const [tier, setTier] = useState(labelState.tier);
  useFrame(() => {
    if (labelState.tier !== tier) setTier(labelState.tier);
  });
  const count = Math.min(BUBBLES_BY_TIER[tier] ?? 1, items.length);
  useEffect(() => {
    if (!animate || items.length <= count) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), BUBBLE_SECONDS * 1000);
    return () => clearInterval(id);
  }, [animate, items.length, count]);
  const shown = [];
  for (let k = 0; k < count; k++) shown.push(items[(tick * count + k) % items.length]);
  return shown.map((it) => (
    <Html key={`${it.id}-${tick}`} position={[it.x, it.y + 1.55 * BOT_SCALE + 0.85, it.z]} center zIndexRange={[8, 0]} pointerEvents="none">
      <div className="thought photo-hide" style={{ borderColor: it.color }}>
        {clip(it.text)}
      </div>
    </Html>
  ));
}

export default function Campfire({ layout, bots, animate = true }) {
  const g = groundY(CAMPFIRE.x, CAMPFIRE.z);
  const items = useMemo(
    () =>
      bots
        .filter((b) => layout[b.id]?.campfire && b.lastAction?.text)
        .map((b) => ({ id: b.id, color: b.color, text: b.lastAction.text, x: layout[b.id].x, y: layout[b.id].y, z: layout[b.id].z })),
    [bots, layout]
  );
  const seats = useMemo(
    () =>
      bots
        .filter((b) => layout[b.id]?.campfire)
        .map((b) => {
          const l = layout[b.id];
          return { id: b.id, x: l.x, z: l.z, rotY: l.rotY, laptop: (l.seatIndex ?? 0) % 2 === 0 };
        }),
    [bots, layout]
  );
  const seatKey = seats.map((s) => `${s.id}:${s.x.toFixed(2)},${s.z.toFixed(2)}:${s.laptop ? 1 : 0}`).join('|');
  return (
    <group>
      <StaticMerge version={seatKey}>
        <Seats seats={seats} />
      </StaticMerge>
      <group position={[CAMPFIRE.x, g, CAMPFIRE.z]} scale={1.7}>
        <Fire animate={animate} />
      </group>
      <Bubbles items={items} animate={animate} />
    </group>
  );
}
