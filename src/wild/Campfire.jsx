import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { BOT_SCALE } from '../components/Bot.jsx';
import { labelState } from '../components/labels.js';
import { CAMPFIRE, campfireSpots, groundY } from '../utils/paths.js';

// Campfire mode (9 PM to 6 AM Duvall time): working bots gather around a
// campfire on the south-west side of the island, with little thought bubbles
// showing what they're working on (lastAction.text, already made public-safe).
// Bots that aren't working are asleep in their hammocks.
// The fire is a few flickering low-poly flames, a glow and a handful of
// embers: no real lights, so it's cheap to draw.

// One bubble at the normal view, a few when zoomed in, none when zoomed out.
const BUBBLES_BY_TIER = { far: 0, default: 1, close: 3 };
const BUBBLE_SECONDS = 6;

// Move working bots (except Claude, who commutes by boat) to the fire.
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
    out[b.id] = { ...out[b.id], x: s.x, y, z: s.z, rotY: s.rotY, raised: false, lounge: false, doorstep: null, hammock: null, mode: 'station', home, campfire: true };
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
      {/* stone ring and crossed logs */}
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        return <mesh key={i} geometry={STONE_GEO} material={MAT.stone} position={[Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55]} rotation={[a, a * 2, 0]} />;
      })}
      {[0, Math.PI / 3, -Math.PI / 3].map((r, i) => (
        <mesh key={i} material={MAT.log} position={[0, 0.1, 0]} rotation={[0, r, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.07, 0.8, 5]} />
        </mesh>
      ))}
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
    <Html key={`${it.id}-${tick}`} position={[it.x, it.y + 1.42 * BOT_SCALE + 0.85, it.z]} center zIndexRange={[8, 0]} pointerEvents="none">
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
  return (
    <group>
      <group position={[CAMPFIRE.x, g, CAMPFIRE.z]} scale={1.7}>
        <Fire animate={animate} />
      </group>
      <Bubbles items={items} animate={animate} />
    </group>
  );
}
