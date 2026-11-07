import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { brandTexture } from '../components/Island.jsx';
import { DOCK, groundY } from '../utils/paths.js';
import { dayKeyPT } from '../utils/time.js';
import { readStore, writeStore } from './director.js';
import { BOT_PITCH, BYOB_STORE, byobBotUrl } from '../utils/byob.js';

// Small things to find and tap. Easter eggs, not clutter.
//   Message in a bottle: Chief's welcome on a first visit, bobbing in the
//     surf on the south beach. Later, a bottle drifts in now and then with
//     a short note from one of the bots (DriftBottle, mounted by the antics).
//   Treasure chest: glows gold, moves to a new spot every day; tap it for
//     a useful bot tip.
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
const BOTTLE_NEXT = 'bah-bottle-n'; // which drift-in note comes next

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

// After the first visit, a bottle drifts in now and then with a short note.
export const BOTTLE_NOTES = [
  { from: 'Chief', body: ['Hello again!', 'Thanks for checking in on the island. The whole team is glad you stopped by.'] },
  { from: 'Nasty', body: ['Psst. There is a chest on the island today and it glows gold.', 'It moves every day. You did not hear it from me.'] },
  { from: 'Benji', body: ['Every minute a bot saves is a minute back for the people.', "That's my favorite kind of math."] },
  { from: 'Flo', body: ['Greetings from the bungalow.', 'The sunsets are best from my porch. Swing by around golden hour.'] },
  { from: 'Launch', body: ['If you see a fish jump by the pier, that one is my lucky fish.', 'We always toss it back.'] },
  { from: 'Recon', body: ['From up at the lookout you can see the whole island.', 'It looks good from here. So do you.'] },
  { from: 'Echo', body: ['Catch me surfing off the south beach when the waves line up.', 'Hang loose!'] },
  { from: 'Claude', body: ['Mai tai in one hand, to-do list in the other.', 'Thanks for visiting the tower.'] },
  { from: 'Dottie', body: ['Little trick: double-tap the ground near any zone to fly right to it.', 'Double-tap open water to zoom back out.'] },
  { from: 'Scout', body: ['Small, steady wins beat one big rush.', 'See you on the beach.'] },
];

export function shouldShowBottle() {
  // Only when storage works and the flag isn't set, so it truly shows once.
  return readStore('localStorage', BOTTLE_FLAG) === null;
}

// In the surf on the south beach (the island grew, so this is the new shore).
const BOTTLE_AT = { x: -2.5, z: 15.42, rotY: 0.5 };
// Where later bottles wash up: south beach, near the photo booth, south-west.
const DRIFT_SPOTS = [
  { x: -2.5, z: 15.42 },
  { x: 3.0, z: 15.16 },
  { x: -12.0, z: 13.54 },
];

const BOTTLE_GEO = {
  body: new THREE.CylinderGeometry(0.11, 0.11, 0.36, 8),
  neck: new THREE.CylinderGeometry(0.04, 0.1, 0.12, 8).translate(0, 0.24, 0),
  cork: new THREE.CylinderGeometry(0.042, 0.04, 0.08, 6).translate(0, 0.33, 0),
  paper: new THREE.CylinderGeometry(0.05, 0.05, 0.26, 6).translate(0, -0.02, 0),
  glint: new THREE.OctahedronGeometry(0.08, 0),
  hit: new THREE.SphereGeometry(0.7, 8, 6),
};

function useBottleMats() {
  const mats = useMemo(
    () => ({
      glass: new THREE.MeshStandardMaterial({ color: '#7fd1b0', transparent: true, opacity: 0.6, roughness: 0.15, flatShading: true }),
      paper: std('#fbf3dc'),
      cork: std('#a8774a'),
      glint: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }),
      hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    }),
    []
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return mats;
}

function BottleModel({ mats, bodyRef, glintRef }) {
  return (
    <group ref={bodyRef} rotation={[0, 0, Math.PI / 2]} scale={1.3}>
      <mesh geometry={BOTTLE_GEO.body} material={mats.glass} />
      <mesh geometry={BOTTLE_GEO.neck} material={mats.glass} />
      <mesh geometry={BOTTLE_GEO.cork} material={mats.cork} />
      <mesh geometry={BOTTLE_GEO.paper} material={mats.paper} />
      <mesh ref={glintRef} geometry={BOTTLE_GEO.glint} material={mats.glint} position={[0.05, 0.05, 0.12]} />
    </group>
  );
}

// Bobbing in the surf: rocks on the swell, slides up and back with the foam.
function surf(body, glint, t, k = 1) {
  body.position.y = 0.04 + Math.sin(t * 1.6) * 0.05 * k;
  body.position.z = Math.sin(t * 0.55) * 0.18 * k;
  body.rotation.z = Math.PI / 2 + Math.sin(t * 1.1) * 0.14;
  body.rotation.x = Math.sin(t * 0.8 + 1) * 0.1;
  if (glint) {
    const g = (t * 0.5) % 1;
    glint.visible = g < 0.12;
    glint.scale.setScalar(Math.sin((g / 0.12) * Math.PI) * 1.4 + 0.01);
  }
}

export function Bottle({ onOpen, animate = true }) {
  const [here, setHere] = useState(shouldShowBottle);
  const ref = useRef();
  const glint = useRef();
  const mats = useBottleMats();

  useFrame((state) => {
    if (ref.current) surf(ref.current, glint.current, animate ? state.clock.elapsedTime : 0, animate ? 1 : 0);
  });

  if (!here) return null;
  const open = () => {
    writeStore('localStorage', BOTTLE_FLAG, '1');
    setHere(false);
    document.body.style.cursor = '';
    onOpen?.();
  };
  return (
    <group position={[BOTTLE_AT.x, 0, BOTTLE_AT.z]} rotation={[0, BOTTLE_AT.rotY, 0]}>
      <BottleModel mats={mats} bodyRef={ref} glintRef={glint} />
      {/* generous invisible tap target */}
      <mesh geometry={BOTTLE_GEO.hit} material={mats.hit} position={[0, 0.25, 0]} onClick={tap(open)} {...pointer} />
    </group>
  );
}

// Later visits: every few minutes a bottle drifts in from the sea, bobs in
// the surf for a while, and drifts off again if nobody taps it. Each one
// carries the next note in BOTTLE_NOTES. Mounted by the antics (motion
// only), so onNote gets { title, body, from }.
export function DriftBottle({ onNote, test = false }) {
  const root = useRef();
  const ref = useRef();
  const glint = useRef();
  const mats = useBottleMats();
  const st = useRef({ t: 0, next: test ? 3 : 100 + Math.random() * 80, start: -1, spot: 0, opened: -1, n: 0 });
  const IN = 14; // seconds to drift in
  const STAY = test ? 20 : 95;

  useFrame((_, delta) => {
    const g = root.current;
    if (!g || !ref.current) return;
    const s = st.current;
    s.t += Math.min(delta, 0.1);
    const t = s.t;
    if (s.start < 0) {
      g.visible = false;
      // only once the first-visit bottle has been found
      if (t > s.next && (test || readStore('localStorage', BOTTLE_FLAG) !== null)) {
        s.start = t;
        s.spot = (s.spot + 1 + Math.floor(Math.random() * 2)) % DRIFT_SPOTS.length;
        s.opened = -1;
      } else if (t > s.next) s.next = t + 20;
      return;
    }
    const k = t - s.start;
    const spot = DRIFT_SPOTS[s.spot];
    // drifting in along the line from the island center out to sea
    const len = Math.hypot(spot.x, spot.z) || 1;
    let out = 0;
    if (k < IN) out = 1 - easeOut(k / IN);
    else if (k > IN + STAY) out = easeOut((k - IN - STAY) / IN);
    let scale = 1;
    if (s.opened >= 0) {
      const u = (t - s.opened) / 0.45;
      scale = Math.max(0.01, 1 - u);
      if (u >= 1) out = 2; // done
    }
    if (out >= 1 || k > IN * 2 + STAY) {
      s.start = -1;
      s.next = t + (test ? 22 : 240 + Math.random() * 180);
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(spot.x + (spot.x / len) * out * 7, 0, spot.z + (spot.z / len) * out * 7);
    g.rotation.y = Math.atan2(spot.x, spot.z) + 0.6;
    g.scale.setScalar(scale);
    surf(ref.current, glint.current, t, 1);
    ref.current.position.y -= out * 0.05; // rides low out at sea
  });

  const open = () => {
    const s = st.current;
    if (s.start < 0 || s.opened >= 0) return;
    s.opened = s.t;
    document.body.style.cursor = '';
    const stored = Number(readStore('localStorage', BOTTLE_NEXT));
    const i = (Number.isFinite(stored) ? stored : s.n) % BOTTLE_NOTES.length;
    s.n = i + 1;
    writeStore('localStorage', BOTTLE_NEXT, String(i + 1));
    const note = BOTTLE_NOTES[i];
    onNote?.({ title: 'Another message in a bottle', body: note.body, from: note.from });
  };
  return (
    <group ref={root} visible={false}>
      <BottleModel mats={mats} bodyRef={ref} glintRef={glint} />
      <mesh geometry={BOTTLE_GEO.hit} material={mats.hit} position={[0, 0.25, 0]} onClick={tap(open)} {...pointer} />
    </group>
  );
}

const easeOut = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 2;

// --- Treasure chest -------------------------------------------------------------

// Warm, dumb fun. No coupon codes, no snark. (Kept for anyone who wants a
// line from Nasty; the chest itself now hands out bot tips.)
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

// The real treasure: tips that promote BYOB (Boss Your Own Bots). Every
// other tip spotlights one bot from the team: what it does, how much time it
// gives back, and a link to that bot in the BYOB store. Signed "BYOB".
// General tips: [the tip, one line of why or how]
const GENERAL_TIPS = [
  ['Give every bot one clear job and one clear output.', 'Every BYOB bot ships with exactly that: one job, done well, every time.'],
  ['Start with the task you dread most.', 'The first BYOB bot you hire should take the chore you keep pushing to tomorrow.'],
  ['Log minutes saved right when a task finishes.', 'BYOB bots count their own minutes, so you can watch the score climb.'],
  ['Bots draft, people approve.', 'BYOB bots hand you finished drafts. You keep the final say on anything public.'],
  ['Schedule the routine stuff.', 'Daily and weekly BYOB runs show up in "Next up", so nothing sneaks up on you.'],
  ['Hire a team, not a gadget.', 'BYOB bots hand work to each other, like the glowing packages you see crossing the island.'],
  ['Small, steady wins beat one big rush.', 'Ten minutes a day per bot is 60 hours a year. Times a whole crew.'],
  ['Name bots after what they do.', 'A good name is a job description you never have to look up. BYOB already named them for you.'],
  ['Idle is fine.', "A BYOB bot chillin' with a mai tai is ready for the next job, not wasted."],
  ['Boss your own bots.', 'You set the goals, the crew does the busywork. That is the whole idea behind BYOB.'],
];

// Bots to spotlight, in order. Copy comes from BOT_PITCH (utils/byob.js).
const SPOTLIGHT = ['nudge', 'caption', 'board', 'download', 'scoop', 'echo', 'recon', 'tracy', 'poster', 'chief', 'desk', 'brobot', 'spin', 'flo'];
const titleCase = (id) => id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('-');

// Built tips: { tip, why, bot?, href? }. General and bot tips alternate.
export const BOT_TIPS = (() => {
  const out = [];
  const n = Math.max(GENERAL_TIPS.length, SPOTLIGHT.length);
  for (let i = 0; i < n; i++) {
    const g = GENERAL_TIPS[i % GENERAL_TIPS.length];
    out.push({ tip: g[0], why: g[1] });
    const id = SPOTLIGHT[i % SPOTLIGHT.length];
    const p = BOT_PITCH[id];
    if (p) {
      const name = titleCase(id);
      out.push({ tip: `Meet ${name}: it ${p.does}.`, why: `That saves ${p.saves}. ${name} is ready to work for you too.`, bot: name, href: byobBotUrl(id) });
    }
  }
  return out;
})();

export function dayOfYear(key = dayKeyPT()) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
}

// One spot a day, all on open land or sand around the bigger island: clear
// of the landmarks in SITES, the work zones, the sand paths, palms and the
// campfire circle (checked with siteDistance and the zone list).
export const CHEST_SPOTS = [
  { x: 5.5, z: 7.5, rotY: 0.4 },
  { x: -14.2, z: -0.4, rotY: -0.6 },
  { x: 16.0, z: 6.0, rotY: -0.9 },
  { x: -3.5, z: 4.5, rotY: 0.2 },
  { x: 1.0, z: -6.0, rotY: 2.8 },
  { x: 13.0, z: -6.2, rotY: -0.3 },
  { x: 4.8, z: -8.2, rotY: 2.6 },
  { x: -12.5, z: 6.0, rotY: -1.2 },
];

// Soft round glow for sprites (gold aura, ground glow), made once.
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,236,160,1)');
  grd.addColorStop(0.35, 'rgba(255,196,60,0.55)');
  grd.addColorStop(1, 'rgba(255,170,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(cv);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

// Fades from gold at the bottom to nothing at the top (additive, so black
// is invisible): the light pillar and the shafts when the lid opens.
function fadeUp(geo, color) {
  const pos = geo.attributes.position;
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const c = new THREE.Color(color);
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 1 - (pos.getY(i) - min.y) / (max.y - min.y || 1);
    col[i * 3] = c.r * k * k;
    col[i * 3 + 1] = c.g * k * k;
    col[i * 3 + 2] = c.b * k * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const CHEST_GEO = {
  box: new THREE.BoxGeometry(0.62, 0.34, 0.4),
  band: new THREE.BoxGeometry(0.06, 0.35, 0.41),
  rim: new THREE.BoxGeometry(0.64, 0.04, 0.42),
  coins: new THREE.BoxGeometry(0.5, 0.04, 0.3),
  coin: new THREE.CylinderGeometry(0.035, 0.035, 0.012, 8),
  lid: new THREE.CylinderGeometry(0.2, 0.2, 0.62, 8, 1, false, 0, Math.PI),
  lidBand: new THREE.CylinderGeometry(0.205, 0.205, 0.06, 8, 1, false, 0, Math.PI),
  lock: new THREE.BoxGeometry(0.1, 0.1, 0.03),
  spark: new THREE.OctahedronGeometry(0.035, 0),
  pillar: fadeUp(new THREE.CylinderGeometry(0.16, 0.34, 3.4, 10, 6, true).translate(0, 1.7, 0), '#ffc23a'),
  shaft: fadeUp(new THREE.PlaneGeometry(0.16, 1.5, 1, 4).translate(0, 0.75, 0), '#fff0a0'),
  hit: new THREE.SphereGeometry(0.6, 8, 6),
};
const SPARKS = 9;
const SHAFTS = 6;
const COINS = [
  [-0.14, 0.05, 0.4],
  [0.05, -0.06, 1.2],
  [0.17, 0.08, 2.1],
  [-0.02, 0.1, 0.7],
];

export function TreasureChest({ onOpen, animate = true }) {
  const day = dayOfYear();
  const spot = CHEST_SPOTS[day % CHEST_SPOTS.length];
  const taps = useRef(0);
  const lid = useRef();
  const aura = useRef();
  const floor = useRef();
  const pillar = useRef();
  const sparks = useRef([]);
  const shafts = useRef();
  const coins = useRef([]);
  const openAt = useRef(-10);
  const mats = useMemo(() => {
    const glow = glowTexture();
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };
    return {
      wood: std('#8a5a32'),
      dark: std('#5e3c22'),
      gold: std('#f2c14e', { roughness: 0.3, metalness: 0.35, emissive: '#ffb800', emissiveIntensity: 0.55 }),
      coins: std('#ffd75a', { emissive: '#ffb800', emissiveIntensity: 0.6 }),
      spark: new THREE.MeshBasicMaterial({ color: '#ffe680', toneMapped: false }),
      aura: new THREE.SpriteMaterial({ map: glow, color: '#ffd166', opacity: 0.55, ...add }),
      floor: new THREE.MeshBasicMaterial({ map: glow, color: '#ffc23a', opacity: 0.6, ...add }),
      beam: new THREE.MeshBasicMaterial({ vertexColors: true, opacity: 0.22, side: THREE.DoubleSide, ...add }),
      shaft: new THREE.MeshBasicMaterial({ vertexColors: true, opacity: 0, side: THREE.DoubleSide, ...add }),
      hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    };
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useFrame((state) => {
    if (!lid.current) return;
    const t = animate ? state.clock.elapsedTime : 0;
    const k = (performance.now() / 1000 - openAt.current) / 3.6; // lid pops open for a few seconds after a tap
    const open = k >= 0 && k < 1 ? Math.sin(Math.min(1, k * 4) * (Math.PI / 2)) * (k > 0.8 ? (1 - k) / 0.2 : 1) : 0;
    lid.current.rotation.x = -open * 1.7 + (animate ? Math.sin(t * 0.9) * 0.02 : 0);
    // a slow golden breath, brighter while open
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
    mats.gold.emissiveIntensity = 0.45 + pulse * 0.35 + open * 0.6;
    mats.coins.emissiveIntensity = 0.5 + pulse * 0.3 + open * 0.9;
    mats.aura.opacity = 0.38 + pulse * 0.2 + open * 0.35;
    if (aura.current) aura.current.scale.setScalar(2.1 + pulse * 0.25 + open * 0.9);
    mats.floor.opacity = 0.42 + pulse * 0.15 + open * 0.3;
    mats.beam.opacity = 0.16 + pulse * 0.06;
    if (pillar.current) pillar.current.rotation.y = t * 0.2;
    // light shafts fan out of the open chest
    mats.shaft.opacity = open * 0.85;
    if (shafts.current) {
      shafts.current.visible = open > 0.01;
      shafts.current.scale.set(1, Math.max(0.01, open) * (1 + Math.sin(t * 3) * 0.06), 1);
      shafts.current.rotation.y = t * 0.4;
    }
    // sparkles drift up around the chest, and fountain out when it opens
    sparks.current.forEach((m, i) => {
      if (!m) return;
      const u = (t * (0.28 + open * 0.5) + i / SPARKS) % 1;
      const a = i * 2.4 + t * 0.6;
      const r = 0.32 + u * (0.25 + open * 0.5);
      m.position.set(Math.cos(a) * r, 0.25 + u * (1.5 + open * 0.8), Math.sin(a) * r);
      m.scale.setScalar(Math.sin(u * Math.PI) * (1 + open * 0.8) + 0.01);
      m.rotation.y = t * 3 + i;
    });
    // coins hop and glint when the lid opens
    coins.current.forEach((m, i) => {
      if (!m) return;
      const c = COINS[i];
      const hop = open > 0 ? Math.abs(Math.sin(k * 14 + i * 1.3)) * 0.18 * open : 0;
      m.position.set(c[0], 0.37 + hop, c[1]);
      m.rotation.set(c[2] + t * 4 * open, 0, 0.3);
    });
  });

  const g = groundY(spot.x, spot.z);
  return (
    <group position={[spot.x, g - 0.04, spot.z]} rotation={[0, spot.rotY, 0]} scale={1.3}>
      {/* glow: soft aura, a gold pool on the sand, a faint light pillar to spot it from afar */}
      <sprite ref={aura} material={mats.aura} position={[0, 0.4, 0]} scale={2.1} />
      <mesh ref={floor} material={mats.floor} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.4, 2.4]} />
      </mesh>
      <mesh ref={pillar} geometry={CHEST_GEO.pillar} material={mats.beam} position={[0, 0.2, 0]} />
      <group ref={shafts} position={[0, 0.36, 0]} visible={false}>
        {Array.from({ length: SHAFTS }, (_, i) => (
          <mesh key={i} geometry={CHEST_GEO.shaft} material={mats.shaft} rotation={[0.42 * Math.cos((i / SHAFTS) * Math.PI * 2), (i / SHAFTS) * Math.PI, 0.42 * Math.sin((i / SHAFTS) * Math.PI * 2)]} />
        ))}
      </group>
      {Array.from({ length: SPARKS }, (_, i) => (
        <mesh key={i} ref={(el) => (sparks.current[i] = el)} geometry={CHEST_GEO.spark} material={mats.spark} />
      ))}

      <mesh geometry={CHEST_GEO.box} material={mats.wood} position={[0, 0.17, 0]} />
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} geometry={CHEST_GEO.band} material={mats.gold} position={[x, 0.17, 0]} />
      ))}
      <mesh geometry={CHEST_GEO.rim} material={mats.gold} position={[0, 0.33, 0]} />
      <mesh geometry={CHEST_GEO.coins} material={mats.coins} position={[0, 0.34, 0]} />
      {COINS.map((_, i) => (
        <mesh key={i} ref={(el) => (coins.current[i] = el)} geometry={CHEST_GEO.coin} material={mats.coins} />
      ))}
      <group ref={lid} position={[0, 0.34, -0.2]}>
        <mesh geometry={CHEST_GEO.lid} material={mats.dark} position={[0, 0.07, 0.2]} rotation={[0, 0, Math.PI / 2]} />
        {[-0.22, 0.22].map((x) => (
          <mesh key={x} geometry={CHEST_GEO.lidBand} material={mats.gold} position={[x, 0.07, 0.2]} rotation={[0, 0, Math.PI / 2]} />
        ))}
        <mesh geometry={CHEST_GEO.lock} material={mats.gold} position={[0, 0.02, 0.41]} />
      </group>
      <mesh
        geometry={CHEST_GEO.hit}
        material={mats.hit}
        position={[0, 0.25, 0]}
        onClick={tap(() => {
          openAt.current = performance.now() / 1000;
          taps.current += 1;
          const i = (day * 5 + taps.current - 1) % BOT_TIPS.length;
          const t = BOT_TIPS[i];
          onOpen?.({
            title: t.bot ? `Treasure: meet ${t.bot}` : 'Treasure: BYOB tip',
            body: [t.tip, t.why, `Tip ${i + 1} of ${BOT_TIPS.length}. Tap again for another. The chest moves every day.`],
            from: 'BYOB',
            links: [t.href ? { href: t.href, text: `Get ${t.bot} in the BYOB store` } : { href: BYOB_STORE, text: 'Visit the BYOB store' }],
          });
        })}
        {...pointer}
      />
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

// Out on the south beach sand (the island grew), between the DJ and the
// watchtower, aimed back up the island at the tower.
export const BOOTH_AT = { x: 4.6, z: 13.4 };

export function PhotoBooth({ onShoot }) {
  const mats = useMemo(() => ({ leg: std('#3b3430'), body: std('#2b2a33'), lens: std('#5aa9e6', { roughness: 0.2 }), flash: std('#fdf8ee', { emissive: '#fff4c4', emissiveIntensity: 0.4 }), sign: std('#FFDE69') }), []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const g = groundY(BOOTH_AT.x, BOOTH_AT.z);
  return (
    <group position={[BOOTH_AT.x, g, BOOTH_AT.z]} rotation={[0, Math.atan2(-BOOTH_AT.x, -BOOTH_AT.z), 0]} scale={1.2}>
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
