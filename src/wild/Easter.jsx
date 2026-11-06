import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { brandTexture } from '../components/Island.jsx';
import { CHEST_SPOTS, DOCK, groundY, terrainY } from '../utils/paths.js';
import { dayKeyPT } from '../utils/time.js';
import { readStore, writeStore } from './director.js';

// Small things to find and tap. Easter eggs, not clutter.
//   Message in a bottle: first visit only, washes up on the south beach.
//   Treasure chest: moves to a new spot every day; tap for a Nasty line.
//   Buddy's dock office: a little houseboat at Launch's Pier; tap for stats.
//   Photo booth: a camera on a tripod on the beach; tap for a group photo.

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, ...extra });

const pointer = {
  onPointerOver: (e) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
  },
  onPointerOut: () => {
    document.body.style.cursor = '';
  },
};

// A tap that isn't the end of a drag.
const tap = (fn) => (e) => {
  if (e.delta > 8) return;
  e.stopPropagation();
  fn();
};

// --- Message in a bottle --------------------------------------------------------

export const BOTTLE_FLAG = 'bah-bottle-seen';

// Chief's welcome.
export const CHIEF_WELCOME = {
  title: 'A message in a bottle',
  from: 'Chief',
  body: [
    "Welcome to Buck's Island.",
    "You've found home base for Buddy Buck's bot team. We work, we nap, and we sip mai tais. Tap anyone to see what they're up to.",
    'A few surprises wash ashore if you hang around. Glad you washed up here.',
  ],
};

export function shouldShowBottle() {
  // Only when storage works and the flag isn't set, so it truly shows once.
  return readStore('localStorage', BOTTLE_FLAG) === null;
}

const BOTTLE_AT = { x: -6.5, z: 10.7 };

export function Bottle({ onOpen, animate = true }) {
  const [here, setHere] = useState(shouldShowBottle);
  const ref = useRef();
  const glint = useRef();
  const mats = useMemo(
    () => ({
      glass: new THREE.MeshStandardMaterial({ color: '#7fd1b0', transparent: true, opacity: 0.6, roughness: 0.15, flatShading: true }),
      paper: std('#fbf3dc'),
      cork: std('#a8774a'),
      glint: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }),
    }),
    []
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = animate ? state.clock.elapsedTime : 0;
    ref.current.position.y = 0.06 + Math.sin(t * 1.6) * 0.04;
    ref.current.rotation.z = Math.PI / 2 + Math.sin(t * 1.1) * 0.12;
    if (glint.current) {
      const k = (t * 0.5) % 1;
      glint.current.visible = k < 0.12;
      glint.current.scale.setScalar(Math.sin((k / 0.12) * Math.PI) * 1.4 + 0.01);
    }
  });

  if (!here) return null;
  const open = () => {
    writeStore('localStorage', BOTTLE_FLAG, '1');
    setHere(false);
    document.body.style.cursor = '';
    onOpen?.();
  };
  return (
    <group position={[BOTTLE_AT.x, Math.max(0, terrainY(BOTTLE_AT.x, BOTTLE_AT.z)), BOTTLE_AT.z]} rotation={[0, 0.5, 0]}>
      <group ref={ref} rotation={[0, 0, Math.PI / 2]} scale={1.3}>
        <mesh material={mats.glass}>
          <cylinderGeometry args={[0.11, 0.11, 0.36, 8]} />
        </mesh>
        <mesh material={mats.glass} position={[0, 0.24, 0]}>
          <cylinderGeometry args={[0.04, 0.1, 0.12, 8]} />
        </mesh>
        <mesh material={mats.cork} position={[0, 0.33, 0]}>
          <cylinderGeometry args={[0.042, 0.04, 0.08, 6]} />
        </mesh>
        <mesh material={mats.paper} position={[0, -0.02, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.26, 6]} />
        </mesh>
        <mesh ref={glint} material={mats.glint} position={[0.05, 0.05, 0.12]}>
          <octahedronGeometry args={[0.08, 0]} />
        </mesh>
      </group>
      {/* generous invisible tap target */}
      <mesh position={[0, 0.25, 0]} onClick={tap(open)} {...pointer}>
        <sphereGeometry args={[0.7, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

// --- Treasure chest -------------------------------------------------------------

// Warm, dumb fun. No coupon codes, no snark.
export const NASTY_LINES = [
  'I buried this chest so well I forgot where. Then I found it. Twice.',
  'Treasure tip: the real gold was the naps we took along the way.',
  'X marks the spot. I also marked my cooler. Priorities.',
  'This chest is full of high fives. Help yourself to one. Or six.',
  'The shark guards this chest. I gave him a tiny badge. He loves it.',
  'Ahoy! I named my coconut Steve. Steve is the treasure now.',
  'Pirate rule number one: always share the snacks. There is no rule number two.',
  'Found it! Inside: one sock, two seashells and a whole lot of good vibes.',
];

export function dayOfYear(key = dayKeyPT()) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
}

export function TreasureChest({ onOpen, animate = true }) {
  const day = dayOfYear();
  const spot = CHEST_SPOTS[day % CHEST_SPOTS.length];
  const taps = useRef(0);
  const lid = useRef();
  const openAt = useRef(-10);
  const mats = useMemo(() => ({ wood: std('#8a5a32'), dark: std('#5e3c22'), gold: std('#f2c14e', { roughness: 0.35, metalness: 0.3 }), coins: std('#ffd75a', { emissive: '#ffb800', emissiveIntensity: 0.25 }) }), []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useFrame((state) => {
    if (!lid.current) return;
    const k = (performance.now() / 1000 - openAt.current) / 3.2; // lid pops open for a few seconds after a tap
    const open = k >= 0 && k < 1 ? Math.sin(Math.min(1, k * 4) * (Math.PI / 2)) * (k > 0.8 ? (1 - k) / 0.2 : 1) : 0;
    lid.current.rotation.x = -open * 1.6 + (animate ? Math.sin(state.clock.elapsedTime * 0.9) * 0.02 : 0);
  });

  const g = groundY(spot.x, spot.z);
  return (
    <group position={[spot.x, g - 0.04, spot.z]} rotation={[0, spot.rotY, 0]} scale={1.1}>
      <mesh material={mats.wood} position={[0, 0.17, 0]}>
        <boxGeometry args={[0.62, 0.34, 0.4]} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} material={mats.gold} position={[x, 0.17, 0]}>
          <boxGeometry args={[0.06, 0.35, 0.41]} />
        </mesh>
      ))}
      <mesh material={mats.coins} position={[0, 0.33, 0]}>
        <boxGeometry args={[0.5, 0.04, 0.3]} />
      </mesh>
      <group ref={lid} position={[0, 0.34, -0.2]}>
        <mesh material={mats.dark} position={[0, 0.07, 0.2]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.2, 0.62, 8, 1, false, 0, Math.PI]} />
        </mesh>
        <mesh material={mats.gold} position={[0, 0.02, 0.41]}>
          <boxGeometry args={[0.1, 0.1, 0.03]} />
        </mesh>
      </group>
      <mesh
        position={[0, 0.25, 0]}
        onClick={tap(() => {
          openAt.current = performance.now() / 1000;
          taps.current += 1;
          onOpen?.(NASTY_LINES[(day + taps.current - 1) % NASTY_LINES.length]);
        })}
        {...pointer}
      >
        <sphereGeometry args={[0.6, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

// --- Buddy's dock office ----------------------------------------------------------

// South side of Launch's Pier, out near the end (Buddy's cruiser is on the north side).
export const OFFICE_AT = { x: DOCK.x0 + 4.2, z: DOCK.z1 + 1.3 };

export function DockOffice({ onOpen, night = 0, animate = true }) {
  const ref = useRef();
  const mats = useMemo(() => {
    const sign = brandTexture('bb');
    return {
      pontoon: std('#3b3430'),
      deck: std('#c08a57'),
      wall: std('#19469D'),
      trim: std('#FFDE69'),
      roof: std('#fdf8ee'),
      desk: std('#a8774a'),
      dark: std('#2b2a33'),
      screen: new THREE.MeshStandardMaterial({ color: '#bfe8ff', emissive: '#7cc8ff', emissiveIntensity: 0.6, flatShading: true }),
      sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.6 }),
      window: new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffd27a', emissiveIntensity: 0.1, flatShading: true }),
    };
  }, []);
  useEffect(() => {
    mats.window.emissiveIntensity = 0.1 + night * 1.4;
    mats.sign.emissiveIntensity = 0.35 + night * 0.5;
  }, [mats, night]);
  useEffect(() => () => [mats.sign.map, ...Object.values(mats)].forEach((m) => m.dispose()), [mats]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = animate ? state.clock.elapsedTime : 0;
    ref.current.position.y = 0.02 + Math.sin(t * 1.2 + 1) * 0.05;
    ref.current.rotation.z = Math.sin(t * 0.9) * 0.025;
    ref.current.rotation.x = Math.sin(t * 0.7 + 2) * 0.02;
  });

  return (
    <group position={[OFFICE_AT.x, 0, OFFICE_AT.z]} rotation={[0, 0.12, 0]}>
      <group ref={ref}>
        {[-0.55, 0.55].map((z) => (
          <mesh key={z} material={mats.pontoon} position={[0, 0.05, z]} rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[0.16, 2.0, 3, 6]} />
          </mesh>
        ))}
        <mesh material={mats.deck} position={[0, 0.26, 0]}>
          <boxGeometry args={[2.5, 0.08, 1.5]} />
        </mesh>
        {/* cabin */}
        <mesh material={mats.wall} position={[-0.4, 0.75, -0.1]}>
          <boxGeometry args={[1.4, 0.9, 1.1]} />
        </mesh>
        <mesh material={mats.trim} position={[-0.4, 1.22, -0.1]}>
          <boxGeometry args={[1.5, 0.06, 1.2]} />
        </mesh>
        <mesh material={mats.roof} position={[-0.4, 1.42, -0.1]} rotation={[0, Math.PI / 4, 0]} scale={[0.82, 1, 0.68]}>
          <coneGeometry args={[1.25, 0.36, 4]} />
        </mesh>
        <mesh material={mats.window} position={[-0.88, 0.62, 0.46]}>
          <boxGeometry args={[0.26, 0.24, 0.03]} />
        </mesh>
        <mesh material={mats.dark} position={[0.06, 0.56, 0.46]}>
          <boxGeometry args={[0.3, 0.52, 0.03]} />
        </mesh>
        {/* BB sign on the front */}
        <mesh material={mats.sign} position={[-0.4, 1.0, 0.465]}>
          <planeGeometry args={[0.56, 0.36]} />
        </mesh>
        {/* tiny desk out front with a laptop */}
        <mesh material={mats.desk} position={[0.75, 0.55, 0.15]}>
          <boxGeometry args={[0.6, 0.05, 0.4]} />
        </mesh>
        {[[-0.25, -0.15], [0.25, -0.15], [-0.25, 0.15], [0.25, 0.15]].map(([x, z], i) => (
          <mesh key={i} material={mats.desk} position={[0.75 + x, 0.42, 0.15 + z]}>
            <boxGeometry args={[0.04, 0.26, 0.04]} />
          </mesh>
        ))}
        <mesh material={mats.dark} position={[0.75, 0.59, 0.2]}>
          <boxGeometry args={[0.28, 0.02, 0.18]} />
        </mesh>
        <mesh material={mats.screen} position={[0.75, 0.68, 0.1]} rotation={[-0.25, 0, 0]}>
          <boxGeometry args={[0.28, 0.18, 0.015]} />
        </mesh>
        {/* gold pennant on the roof */}
        <mesh material={mats.dark} position={[-0.4, 1.85, -0.1]}>
          <cylinderGeometry args={[0.015, 0.015, 0.5, 3]} />
        </mesh>
        <mesh material={mats.trim} position={[-0.26, 2.0, -0.1]}>
          <boxGeometry args={[0.26, 0.14, 0.01]} />
        </mesh>
        {/* tap target */}
        <mesh position={[0, 0.8, 0]} onClick={tap(() => onOpen?.())} {...pointer}>
          <boxGeometry args={[2.6, 1.8, 1.7]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

// --- Photo booth ------------------------------------------------------------------

export const BOOTH_AT = { x: 5.5, z: 10.0 };

export function PhotoBooth({ onShoot }) {
  const mats = useMemo(() => ({ leg: std('#3b3430'), body: std('#2b2a33'), lens: std('#5aa9e6', { roughness: 0.2 }), flash: std('#fdf8ee', { emissive: '#fff4c4', emissiveIntensity: 0.4 }), sign: std('#FFDE69') }), []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const g = groundY(BOOTH_AT.x, BOOTH_AT.z);
  return (
    <group position={[BOOTH_AT.x, g, BOOTH_AT.z]} rotation={[0, Math.PI - 0.5, 0]} scale={1.2}>
      {[0, 2.1, 4.2].map((a, i) => (
        <mesh key={i} material={mats.leg} position={[Math.sin(a) * 0.14, 0.32, Math.cos(a) * 0.14]} rotation={[Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25]}>
          <cylinderGeometry args={[0.018, 0.018, 0.66, 4]} />
        </mesh>
      ))}
      <mesh material={mats.body} position={[0, 0.74, 0]}>
        <boxGeometry args={[0.34, 0.22, 0.2]} />
      </mesh>
      <mesh material={mats.lens} position={[0, 0.74, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.08, 0.1, 8]} />
      </mesh>
      <mesh material={mats.flash} position={[0.11, 0.89, 0]}>
        <boxGeometry args={[0.1, 0.06, 0.08]} />
      </mesh>
      <mesh position={[0, 0.6, 0]} onClick={tap(() => onShoot?.())} {...pointer}>
        <sphereGeometry args={[0.6, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
