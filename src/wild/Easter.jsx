import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { brandTexture } from '../components/Island.jsx';
import StaticMerge from '../utils/StaticMerge.jsx';
import { CHEST_SPOTS, DOCK, groundY, terrainY } from '../utils/paths.js';
import { dayKeyPT } from '../utils/time.js';
import { rareGap, readStore, writeStore } from './director.js';

// Small things to find and tap. Easter eggs, not clutter.
//   Message in a bottle: Chief's welcome on the first visit, then every few
//     minutes a bottle drifts in and washes up on the south beach with a note.
//   Treasure chest: moves to a new spot every day; tap for a bot tip (it
//     glows gold when it opens).
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
const NOTE_KEY = 'bah-bottle-note';

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

// After the welcome, a bottle drifts in every so often with one of these.
// Short, warm and useful: island tips and team habits.
export const BOTTLE_NOTES = [
  { from: 'Chief', body: ['Tap any bot to see what it is working on right now and what it finished today.'] },
  { from: 'Launch', body: ['When one bot hands work to another, it walks the package over. Every courier you see on the island is a real handoff.'] },
  { from: 'Benji', body: ['Every task a bot finishes earns minutes back for the team. Watch for the little minute counts floating up.'] },
  { from: 'Nasty', body: ['The treasure chest moves to a new spot every day. Find it and tap it for a bot tip.'] },
  { from: 'Scout', body: ['A good handoff note says three things: what is done, what is next, and where the files are.'] },
  { from: 'Flo', body: ["The island runs on Duvall time. When the sun sets here, it's setting at home too."] },
  { from: 'Claude', body: ['Small, boring automations add up. Five minutes saved every day is about thirty hours a year.'] },
  { from: 'Echo', body: ["A bot in a hammock isn't slacking. Idle means caught up, and that's the goal."] },
  { from: 'Recon', body: ['Zoom in close and every bot shows its name tag. Zoom out to take in the whole island.'] },
  { from: 'Dottie', body: ['After 9 PM the crew heads to the campfire and the hammocks. Come back in the morning to watch them clock in.'] },
  { from: 'Tracy', body: ['Try the photo booth on the beach: tap the camera and everyone waves.'] },
  { from: 'Chief', body: ['If a bot looks stuck, check its last handoff first. Most snags are a missing input, not a broken bot.'] },
];

export function nextBottleNote() {
  const raw = Number(readStore('localStorage', NOTE_KEY));
  const i = Number.isFinite(raw) && raw >= 0 ? raw % BOTTLE_NOTES.length : Math.floor(Math.random() * BOTTLE_NOTES.length);
  writeStore('localStorage', NOTE_KEY, String(i + 1));
  const n = BOTTLE_NOTES[i];
  return { title: 'A message in a bottle', from: n.from, body: n.body };
}

export function shouldShowBottle() {
  // Only when storage works and the flag isn't set, so it truly shows once.
  return readStore('localStorage', BOTTLE_FLAG) === null;
}

const BOTTLE_AT = { x: -6.5, z: 10.7 };
const DRIFT_SECONDS = 16;

const BOTTLE_MAT = {
  glass: new THREE.MeshStandardMaterial({ color: '#7fd1b0', transparent: true, opacity: 0.6, roughness: 0.15, flatShading: true }),
  paper: std('#fbf3dc'),
  cork: std('#a8774a'),
  glint: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }),
};
const BOTTLE_GEO = {
  body: new THREE.CylinderGeometry(0.11, 0.11, 0.36, 8),
  neck: new THREE.CylinderGeometry(0.04, 0.1, 0.12, 8),
  cork: new THREE.CylinderGeometry(0.042, 0.04, 0.08, 6),
  paper: new THREE.CylinderGeometry(0.05, 0.05, 0.26, 6),
  glint: new THREE.OctahedronGeometry(0.08, 0),
  hit: new THREE.SphereGeometry(0.7, 8, 6),
};
const HIT_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

function BottleModel({ bodyRef, glintRef }) {
  return (
    <group ref={bodyRef} rotation={[0, 0, Math.PI / 2]} scale={1.3}>
      <mesh geometry={BOTTLE_GEO.body} material={BOTTLE_MAT.glass} />
      <mesh geometry={BOTTLE_GEO.neck} material={BOTTLE_MAT.glass} position={[0, 0.24, 0]} />
      <mesh geometry={BOTTLE_GEO.cork} material={BOTTLE_MAT.cork} position={[0, 0.33, 0]} />
      <mesh geometry={BOTTLE_GEO.paper} material={BOTTLE_MAT.paper} position={[0, -0.02, 0]} />
      <mesh ref={glintRef} geometry={BOTTLE_GEO.glint} material={BOTTLE_MAT.glint} position={[0.05, 0.05, 0.12]} />
    </group>
  );
}

// Where the sand meets the water at this x on the south beach.
function shoreZ(x) {
  for (let z = 10; z < 19; z += 0.05) if (terrainY(x, z) < 0.04) return z;
  return 16;
}

function glintAt(glint, t, phase = 0) {
  if (!glint) return;
  const k = (t * 0.5 + phase) % 1;
  glint.visible = k < 0.12;
  glint.scale.setScalar(Math.sin((k / 0.12) * Math.PI) * 1.4 + 0.01);
}

// The first-visit welcome bottle (Chief), then every 4-8 minutes of time on
// the island a new bottle drifts in from the sea and washes up somewhere on
// the south beach. Tap it for a note; it's gone until the next one.
export function Bottle({ onOpen, animate = true }) {
  const [welcome, setWelcome] = useState(shouldShowBottle);
  const [drifter, setDrifter] = useState(false);
  const wBody = useRef();
  const wGlint = useRef();
  const dGroup = useRef();
  const dBody = useRef();
  const dGlint = useRef();
  const st = useRef({ t: 0, next: rareGap(240, 480), x: 0, land: 0, start: 0, spawnT: 0 });

  useFrame((state, delta) => {
    const t = animate ? state.clock.elapsedTime : 0;
    if (wBody.current) {
      wBody.current.position.y = 0.06 + Math.sin(t * 1.6) * 0.04;
      wBody.current.rotation.z = Math.PI / 2 + Math.sin(t * 1.1) * 0.12;
      glintAt(wGlint.current, t);
    }
    if (!animate) return;
    const s = st.current;
    if (!welcome && !drifter) {
      s.t += Math.min(delta, 0.1);
      if (s.t > s.next) {
        s.x = -9 + Math.random() * 18;
        s.land = shoreZ(s.x) - 0.25;
        s.start = s.land + 6;
        s.spawnT = s.t;
        setDrifter(true);
      }
      return;
    }
    if (drifter && dGroup.current) {
      s.t += Math.min(delta, 0.1);
      const k = Math.min(1, (s.t - s.spawnT) / DRIFT_SECONDS);
      const e = 1 - Math.pow(1 - k, 2.2); // slows as it reaches the sand
      const z = s.start + (s.land - s.start) * e;
      const x = s.x + Math.sin(k * 5) * 0.3 * (1 - k);
      const ground = Math.max(terrainY(x, z), 0);
      const float = (1 - k) * (0.05 + Math.sin(t * 1.8) * 0.06);
      dGroup.current.position.set(x, ground + float, z);
      dGroup.current.rotation.y = 0.5 + Math.sin(t * 0.4) * 0.4 * (1 - k);
      if (dBody.current) {
        dBody.current.position.y = 0.06 + (k < 1 ? Math.sin(t * 2.2) * 0.03 : 0);
        dBody.current.rotation.z = Math.PI / 2 + Math.sin(t * 1.3) * 0.25 * (1 - k * 0.8);
      }
      glintAt(dGlint.current, t, 0.4);
    }
  });

  const openWelcome = () => {
    writeStore('localStorage', BOTTLE_FLAG, '1');
    setWelcome(false);
    document.body.style.cursor = '';
    onOpen?.(CHIEF_WELCOME);
  };
  const openDrifter = () => {
    const s = st.current;
    s.next = s.t + rareGap(240, 480);
    setDrifter(false);
    document.body.style.cursor = '';
    onOpen?.(nextBottleNote());
  };

  return (
    <>
      {welcome && (
        <group position={[BOTTLE_AT.x, Math.max(0, terrainY(BOTTLE_AT.x, BOTTLE_AT.z)), BOTTLE_AT.z]} rotation={[0, 0.5, 0]}>
          <BottleModel bodyRef={wBody} glintRef={wGlint} />
          {/* generous invisible tap target */}
          <mesh geometry={BOTTLE_GEO.hit} material={HIT_MAT} position={[0, 0.25, 0]} onClick={tap(openWelcome)} {...pointer} />
        </group>
      )}
      {drifter && (
        <group ref={dGroup} position={[st.current.x, -1, st.current.start]}>
          <BottleModel bodyRef={dBody} glintRef={dGlint} />
          <mesh geometry={BOTTLE_GEO.hit} material={HIT_MAT} position={[0, 0.25, 0]} onClick={tap(openDrifter)} {...pointer} />
        </group>
      )}
    </>
  );
}

// --- Treasure chest -------------------------------------------------------------

// Nasty's treasure: a useful bot tip or a Build Your Own Bot (BYOB) fact.
export const CHEST_TIPS = [
  'Give each bot one clear job. A bot that does one thing well beats a bot that does five things okay.',
  'BYOB: A great first bot is any task you copy and paste more than twice a week.',
  "Write down the steps you'd follow yourself. That checklist becomes your bot's instructions.",
  'BYOB: Every bot needs three things: a trigger (when it runs), instructions (what to do) and an output (where the result goes).',
  "Review a bot's first few runs closely. Give it more rope as it earns your trust.",
  'BYOB: Show your bot an example of a great result. Showing beats telling.',
  'Keep a log of what each bot did and when. When something looks off, the log tells you why.',
  'BYOB: Decide up front what your bot should never do on its own, like sending email or spending money, and have it ask first.',
  'Start with a small task that saves you five minutes every day. Those minutes add up fast.',
  'BYOB: Test on real but low-stakes work before you hand over anything important.',
  'Name your bots. "Ask Scout" is a lot easier to say than "the lead research workflow."',
  'BYOB: When a bot gets something wrong, fix the instructions, not just the output. Then it stays fixed.',
  'Schedule runs so the work is waiting for you when you sit down, not the other way around.',
  "BYOB: Keep your bot's instructions in one place you can edit. You'll tune them more than you think.",
  "When one bot hands off to another, leave a clear note: what's done, what's next and where it lives.",
  "Let bots draft and people decide. A bot's fast first pass plus your final call is a great team.",
];
export const NASTY_LINES = CHEST_TIPS; // older name

export function dayOfYear(key = dayKeyPT()) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
}

const OPEN_SECONDS = 4.2;
const SPARKS = 12;
let glowTex = null;
function goldGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,236,150,1)');
  grd.addColorStop(0.35, 'rgba(255,200,60,0.55)');
  grd.addColorStop(1, 'rgba(255,170,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
const SPARK_GEO = new THREE.OctahedronGeometry(0.035, 0);
const SPARK_MAT = new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
const SPARK_SEEDS = Array.from({ length: SPARKS }, (_, i) => ({ a: (i / SPARKS) * Math.PI * 2 + i * 0.7, r: 0.08 + (i % 4) * 0.05, d: (i % 5) * 0.12, s: 0.6 + (i % 3) * 0.2 }));

export function TreasureChest({ onOpen, animate = true }) {
  const day = dayOfYear();
  const spot = CHEST_SPOTS[day % CHEST_SPOTS.length];
  const taps = useRef(0);
  const lid = useRef();
  const glow = useRef();
  const coinsRef = useRef();
  const sparks = useRef([]);
  const openAt = useRef(-10);
  const mats = useMemo(
    () => ({
      wood: std('#8a5a32'),
      dark: std('#5e3c22'),
      gold: std('#f2c14e', { roughness: 0.35, metalness: 0.3, emissive: '#ffb800', emissiveIntensity: 0.05 }),
      coins: std('#ffd75a', { emissive: '#ffb800', emissiveIntensity: 0.25 }),
      glow: new THREE.SpriteMaterial({ map: goldGlowTexture(), color: '#ffd04a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    }),
    []
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useFrame((state) => {
    if (!lid.current) return;
    const k = (performance.now() / 1000 - openAt.current) / OPEN_SECONDS; // the lid pops open for a few seconds after a tap
    const active = k >= 0 && k < 1;
    const open = active ? Math.sin(Math.min(1, k * 4) * (Math.PI / 2)) * (k > 0.82 ? (1 - k) / 0.18 : 1) : 0;
    lid.current.rotation.x = -open * 2.05 + (animate ? Math.sin(state.clock.elapsedTime * 0.9) * 0.02 : 0);
    // gold glow
    const pulse = animate ? 0.85 + Math.sin(state.clock.elapsedTime * 7) * 0.15 : 1;
    mats.coins.emissiveIntensity = 0.25 + open * 2.2 * pulse;
    mats.gold.emissiveIntensity = 0.05 + open * 0.9;
    mats.glow.opacity = open * 0.9 * pulse;
    if (glow.current) {
      glow.current.visible = open > 0.01;
      glow.current.scale.setScalar(1.2 + open * 1.4);
    }
    if (coinsRef.current) coinsRef.current.position.y = 0.33 + open * 0.05;
    // sparkles rising out of the chest
    for (let i = 0; i < SPARKS; i++) {
      const m = sparks.current[i];
      if (!m) continue;
      const sd = SPARK_SEEDS[i];
      const u = animate && active ? ((k * OPEN_SECONDS * sd.s + sd.d) % 1.1) / 1.1 : 0;
      m.visible = active && animate && open > 0.3;
      if (!m.visible) continue;
      const a = sd.a + u * 2;
      m.position.set(Math.cos(a) * sd.r * (1 + u), 0.4 + u * 1.1, Math.sin(a) * sd.r * 0.7 * (1 + u));
      m.scale.setScalar(Math.max(0.01, Math.sin(u * Math.PI) * 1.3));
      m.rotation.y = u * 6;
    }
  });

  const g = groundY(spot.x, spot.z);
  return (
    <group position={[spot.x, g - 0.04, spot.z]} rotation={[0, spot.rotY, 0]} scale={1.1}>
      <StaticMerge>
      <mesh material={mats.wood} position={[0, 0.17, 0]}>
        <boxGeometry args={[0.62, 0.34, 0.4]} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} material={mats.gold} position={[x, 0.17, 0]}>
          <boxGeometry args={[0.06, 0.35, 0.41]} />
        </mesh>
      ))}
      <mesh ref={coinsRef} material={mats.coins} position={[0, 0.33, 0]} userData={{ noMerge: true }}>
        <boxGeometry args={[0.5, 0.04, 0.3]} />
      </mesh>
      {[[-0.12, 0.05], [0.06, -0.06], [0.15, 0.08], [-0.02, 0.0]].map(([x, z], i) => (
        <mesh key={i} material={mats.coins} position={[x, 0.37, z]} rotation={[0.2 * i, 0, 0.3]}>
          <cylinderGeometry args={[0.045, 0.045, 0.015, 8]} />
        </mesh>
      ))}
      </StaticMerge>
      <sprite ref={glow} material={mats.glow} position={[0, 0.55, 0]} visible={false} />
      {SPARK_SEEDS.map((_, i) => (
        <mesh key={i} ref={(el) => (sparks.current[i] = el)} geometry={SPARK_GEO} material={SPARK_MAT} visible={false} />
      ))}
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
          onOpen?.(CHEST_TIPS[(day + taps.current - 1) % CHEST_TIPS.length]);
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
        <StaticMerge>
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
        </StaticMerge>
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
      <StaticMerge>
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
      </StaticMerge>
      <mesh position={[0, 0.6, 0]} onClick={tap(() => onShoot?.())} {...pointer}>
        <sphereGeometry args={[0.6, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
