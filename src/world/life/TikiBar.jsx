import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { CREW_COLORS } from '../MiniBot.jsx';
import { BOT_SCALE } from '../../components/Bot.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import { aliveClock } from '../../wild/director.js';
import {
  BambooPost, Box, Cyl, Fringe, LM, Roof, SIT_DROP, StringLights, canvasTexture, glowMat, glyphTexture, resetBot, sitPose, std, toWorld, useNightGlow, usePoseOnce,
} from './common.jsx';

// The tiki bar on the south-east beach (SITES.tikibar): a thatched hut on a
// little bamboo deck at the water's edge, a bamboo counter, a shelf of
// bottles, tiki masks and string lights. Crew regulars sit on stools with
// their drinks (swiveling, sipping, feet dangling) while the bartender shakes
// a cocktail and slides it down the counter. A "TIKI BAR" sign glows at night.
// Bedtime: the stools empty out and one sleepy bartender keeps the lanterns lit.
//
// Everything below is in the bar's own frame: x along the counter, +z toward
// the customers (south-west, toward the default camera), y up from the deck.

export const BAR = { x: SITES.tikibar.x - 0.3, z: SITES.tikibar.z - 0.5, rotY: -0.85 };
const DECK = { x0: -1.65, x1: 1.65, z0: -0.95, z1: 1.3 };
// Deck top (world y): just above the highest sand under it.
export const DECK_TOP = (() => {
  let m = 0;
  for (let lx = DECK.x0; lx <= DECK.x1 + 1e-6; lx += 0.25) {
    for (let lz = DECK.z0; lz <= DECK.z1 + 1e-6; lz += 0.25) {
      const [x, z] = toWorld(BAR, lx, lz);
      m = Math.max(m, groundY(x, z));
    }
  }
  return m + 0.1;
})();
const COUNTER_H = 0.8;
const COUNTER_Z = 0.38; // middle of the counter top
const STOOL_H = 0.5;
const STOOLS = [-1.28, -0.64, 0, 0.64, 1.28];
const STOOL_Z = 0.98;
const S = BOT_SCALE;
const SIT_Y = STOOL_H + 0.04 - SIT_DROP * S;
// Waiters pick up trays at the counter's west end and at the back door.
export const BAR_PICKUPS = {
  front: (() => {
    const [x, z] = toWorld(BAR, -1.95, 0.9);
    return { x, z, face: Math.atan2(BAR.x - x, BAR.z - z) };
  })(),
  back: (() => {
    const [x, z] = toWorld(BAR, 0.2, -1.5);
    return { x, z, face: Math.atan2(BAR.x - x, BAR.z - z) };
  })(),
};

// Regulars: stool index, color, drink. The middle stool stays free.
const REGULARS = [
  { stool: 0, color: CREW_COLORS[3], drink: 'margarita', phase: 0.0 },
  { stool: 1, color: CREW_COLORS[2], drink: 'maitai', phase: 1.7 },
  { stool: 3, color: CREW_COLORS[0], drink: 'coconut', phase: 3.1 },
  { stool: 4, color: CREW_COLORS[5], drink: 'maitai', phase: 4.4 },
];
const CYCLE = 14; // seconds per cocktail: shake, pour, slide, wipe
const BARTENDER = CREW_COLORS[4];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const GEO = {
  bottle: new THREE.CylinderGeometry(0.04, 0.045, 0.2, 6).translate(0, 0.1, 0),
  neck: new THREE.CylinderGeometry(0.014, 0.02, 0.08, 5).translate(0, 0.24, 0),
  glass: new THREE.CylinderGeometry(0.05, 0.038, 0.14, 8).translate(0, 0.07, 0),
  foam: new THREE.CylinderGeometry(0.051, 0.051, 0.022, 8).translate(0, 0.13, 0),
  umbrella: new THREE.ConeGeometry(0.075, 0.04, 8),
  shaker: new THREE.CylinderGeometry(0.045, 0.035, 0.2, 8),
  shakerCap: new THREE.ConeGeometry(0.045, 0.07, 8),
  lantern: new THREE.IcosahedronGeometry(0.07, 0),
  halo: new THREE.SphereGeometry(0.32, 10, 8),
  rag: new THREE.BoxGeometry(0.1, 0.02, 0.07),
};
const BOTTLE_MATS = ['#3fa36b', '#c9772f', '#7b4bb3', '#d8b34a', '#3b83c4', '#c4415a'].map((c) => std(c, { roughness: 0.3, emissive: c, emissiveIntensity: 0.15 }));
const M = {
  maitai: std('#ff6b3d', { emissive: '#ff6b3d', emissiveIntensity: 0.15 }),
  foam: std('#ffb07a'),
  umbrella: std('#ff4fa3'),
  cushion: [std('#ff7a59'), std('#2fbfb0'), std('#ffd23f'), std('#9b7bff'), std('#ff6fae')],
  maskA: std('#8a5a33'),
  maskB: std('#b5793f'),
  maskC: std('#5e7d4a'),
  teeth: std('#fff8ec'),
  eyes: std('#2a2220'),
  // see-through thatch (like the cabana) so the bar shows from above
  thatch: std('#e2bd72', { transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
  fringe: std('#c99a52', { transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
};

// A carved tiki mask: tall face, heavy brow, big eyes and a toothy grin.
function TikiMask({ p, r = [0, 0, 0], m = M.maskA, s = 1 }) {
  return (
    <group position={p} rotation={r} scale={s}>
      <Box p={[0, 0, 0]} s={[0.2, 0.34, 0.07]} m={m} />
      <Box p={[0, 0.12, 0.04]} s={[0.22, 0.05, 0.04]} m={m} />
      <Box p={[-0.05, 0.06, 0.04]} s={[0.06, 0.05, 0.02]} m={M.eyes} />
      <Box p={[0.05, 0.06, 0.04]} s={[0.06, 0.05, 0.02]} m={M.eyes} />
      <Box p={[0, -0.01, 0.05]} s={[0.04, 0.08, 0.04]} m={m} />
      <Box p={[0, -0.09, 0.04]} s={[0.14, 0.05, 0.02]} m={M.eyes} />
      <Box p={[0, -0.085, 0.05]} s={[0.12, 0.018, 0.012]} m={M.teeth} />
      <Box p={[0, 0.19, 0]} s={[0.26, 0.05, 0.06]} m={LM.green} />
    </group>
  );
}

function Mug({ p }) {
  return (
    <group position={p}>
      <mesh geometry={GEO.glass} material={M.maitai} />
      <mesh geometry={GEO.foam} material={M.foam} />
      <mesh geometry={GEO.umbrella} material={M.umbrella} position={[0.03, 0.19, 0]} rotation={[0, 0, -0.35]} />
    </group>
  );
}

// "TIKI BAR" sign: neon-ish letters on a dark wood board.
function signTexture() {
  return canvasTexture('tiki-bar-sign', 256, 96, (g, w, h) => {
    g.fillStyle = '#4a3020';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2a1a10';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.font = 'bold 54px "Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowBlur = 14;
    g.shadowColor = '#ff4fa3';
    g.fillStyle = '#ff8fcb';
    g.fillText('TIKI', w * 0.3, h / 2 + 3);
    g.shadowColor = '#2fe0d0';
    g.fillStyle = '#8ff5ea';
    g.fillText('BAR', w * 0.72, h / 2 + 3);
  });
}

// Bamboo posts from the deck down into the sand (or the shallow water's edge).
function DeckPosts() {
  const posts = [];
  for (const lx of [DECK.x0 + 0.08, 0, DECK.x1 - 0.08]) {
    for (const lz of [DECK.z0 + 0.08, 0.2, DECK.z1 - 0.08]) {
      const [x, z] = toWorld(BAR, lx, lz);
      const drop = DECK_TOP - groundY(x, z) + 0.12;
      posts.push({ lx, lz, drop });
    }
  }
  return posts.map((p, i) => <Cyl key={i} p={[p.lx, -p.drop / 2, p.lz]} rt={0.06} h={p.drop} m={LM.darkWood} />);
}

// A step up from the sand at the front.
function Step() {
  const [x, z] = toWorld(BAR, 0, DECK.z1 + 0.22);
  const g = groundY(x, z);
  const h = Math.max(0.05, (DECK_TOP - g) * 0.55);
  return <Box p={[0, g - DECK_TOP + h / 2, DECK.z1 + 0.2]} s={[0.9, h, 0.3]} m={LM.plank} />;
}

function Stool({ x, z, cushion }) {
  return (
    <group position={[x, 0, z]}>
      {[0, 2.09, 4.19].map((a) => (
        <Cyl key={a} p={[Math.cos(a) * 0.1, STOOL_H / 2, Math.sin(a) * 0.1]} rt={0.022} h={STOOL_H} m={LM.bamboo} r={[Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]} />
      ))}
      <Cyl p={[0, STOOL_H * 0.42, 0]} rt={0.12} h={0.025} m={LM.bambooNode} seg={8} />
      <Cyl p={[0, STOOL_H, 0]} rt={0.17} h={0.05} m={LM.bamboo} seg={10} />
      <Cyl p={[0, STOOL_H + 0.035, 0]} rt={0.155} h={0.03} m={cushion} seg={10} />
    </group>
  );
}

function Bottles({ y, n = 9, seed = 0, x0 = -1.15, x1 = 1.15 }) {
  return Array.from({ length: n }, (_, i) => {
    const x = x0 + (i / (n - 1)) * (x1 - x0);
    const m = BOTTLE_MATS[(i * 5 + seed) % BOTTLE_MATS.length];
    const s = 0.85 + (((i * 7 + seed * 3) % 5) / 5) * 0.4;
    return (
      <group key={i} position={[x, y, -0.8]} scale={[1, s, 1]}>
        <mesh geometry={GEO.bottle} material={m} />
        <mesh geometry={GEO.neck} material={m} />
      </group>
    );
  });
}

// ---------------------------------------------------------------------------

export default function TikiBar({ animate, night, bedtime }) {
  const bt = useRef({});
  const regs = [useRef({}), useRef({}), useRef({}), useRef({})];
  const slide = useRef();
  const lanterns = useRef();
  const zs = [useRef(), useRef(), useRef()];
  const clock = useMemo(() => aliveClock(), []);
  usePoseOnce(animate, bedtime);

  const lanternMat = useNightGlow('#ffcf6b', bedtime ? 1 : night, 0.15, 1.6);
  const haloMat = useMemo(() => glowMat('#ffb35c', 0.2), []);
  const signMat = useMemo(() => new THREE.MeshBasicMaterial({ map: signTexture(), toneMapped: false }), []);
  const signGlow = useMemo(
    () => new THREE.MeshBasicMaterial({ map: signTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
    []
  );
  const zMats = useMemo(() => zs.map(() => new THREE.SpriteMaterial({ map: glyphTexture('Z', '#ffffff', 'rgba(60,70,120,0.7)'), transparent: true, depthWrite: false, fog: false })), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => [haloMat, signMat, signGlow, ...zMats].forEach((m) => m.dispose()), [haloMat, signMat, signGlow, zMats]);
  useEffect(() => {
    // the sign is softly lit by day and glows at night
    signMat.color.setScalar(0.72 + night * 0.28);
    haloMat.opacity = 0.05 + (bedtime ? 0.3 : night * 0.25);
  }, [night, bedtime, signMat, haloMat]);

  // The bartender's cocktail shaker and rag, held in the hands.
  const shaker = useMemo(() => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(GEO.shaker, LM.chrome);
    const cap = new THREE.Mesh(GEO.shakerCap, LM.chrome);
    cap.position.y = 0.13;
    g.add(body, cap);
    g.position.set(0, -0.06, 0.03);
    return g;
  }, []);
  const rag = useMemo(() => {
    const m = new THREE.Mesh(GEO.rag, LM.white);
    m.position.set(0, -0.05, 0);
    return m;
  }, []);
  useEffect(() => {
    const p = bt.current;
    if (!p.handR) return undefined;
    p.handR.add(shaker);
    p.handL.add(rag);
    return () => {
      shaker.parent?.remove(shaker);
      rag.parent?.remove(rag);
    };
  }, [shaker, rag, bedtime]);

  useFrame((state, delta) => {
    const t = animate ? clock.tick(delta) : 2.1;
    const k = t % CYCLE;
    const cycleN = Math.floor(t / CYCLE);
    const target = REGULARS[cycleN % REGULARS.length];
    const targetX = STOOLS[target.stool];
    const p = bt.current;

    // --- Bartender ---
    if (resetBot(p)) {
      p.root.rotation.y = 0;
      shaker.visible = false;
      rag.visible = false;
      if (bedtime) {
        // dozing, arms folded on the counter, head nodding
        p.pose.rotation.x = 0.32;
        p.pose.position.z = 0.04;
        p.armL.rotation.set(-1.25, 0, 0.5);
        p.armR.rotation.set(-1.25, 0, -0.5);
        p.head.rotation.x = 0.35 + Math.sin(t * 0.8) * 0.06;
        p.head.rotation.z = 0.18;
        p.pose.scale?.setScalar(1 + Math.sin(t * 1.2) * 0.01);
      } else if (k < 0.6) {
        // reach for the shaker
        const u = k / 0.6;
        shaker.visible = u > 0.5;
        p.armR.rotation.x = -1.2 * u;
        p.head.rotation.x = 0.25 * u;
      } else if (k < 3.4) {
        // shake it: both hands up by the head
        shaker.visible = true;
        const sh = Math.sin(t * 26);
        p.armR.rotation.set(-2.5 + sh * 0.18, 0, -0.45);
        p.armL.rotation.set(-2.5 - sh * 0.18, 0, 0.45);
        p.pose.position.y = Math.abs(sh) * 0.02;
        p.pose.rotation.z = Math.sin(t * 13) * 0.05;
        p.head.rotation.z = Math.sin(t * 6.5) * 0.1;
        p.head.rotation.x = -0.1;
      } else if (k < 4.4) {
        // pour into a glass on the counter
        shaker.visible = true;
        const u = (k - 3.4) / 1.0;
        p.armR.rotation.set(-1.35, 0, -0.25);
        p.armR.rotation.y = 0;
        shaker.rotation.x = 1.6 * Math.min(1, u * 3);
        p.head.rotation.x = 0.35;
      } else if (k < 6.0) {
        // slide it down the counter
        const u = (k - 4.4) / 1.6;
        const push = Math.sin(Math.min(1, u * 2.2) * Math.PI);
        p.root.rotation.y = Math.atan2(targetX, 0.9) * Math.min(1, u * 3) * 0.6;
        p.armR.rotation.set(-1.0 - push * 0.35, 0, 0);
        p.head.rotation.y = Math.atan2(targetX, 0.9) * 0.6 * u;
      } else {
        // wipe the counter and watch the room
        rag.visible = true;
        const w = t * 3.2;
        p.armL.rotation.set(-1.05 + Math.sin(w) * 0.12, Math.cos(w) * 0.3, 0.1);
        p.head.rotation.y = Math.sin(t * 0.5) * 0.6;
        p.head.rotation.x = 0.1;
        p.pose.rotation.z = Math.sin(t * 1.3) * 0.03;
      }
      if (!(k >= 3.4 && k < 4.4)) shaker.rotation.x = 0;
    }

    // --- Sliding drink ---
    if (slide.current) {
      const on = !bedtime && k >= 3.6 && k < 6.0;
      slide.current.visible = on;
      if (on) {
        const u = THREE.MathUtils.clamp((k - 4.5) / 1.3, 0, 1);
        const e = 1 - (1 - u) * (1 - u);
        slide.current.position.set(0.12 + (targetX - 0.12) * e, COUNTER_H + 0.03, 0.3 + 0.12 * e);
      }
    }

    // --- Regulars ---
    REGULARS.forEach((r, i) => {
      const q = regs[i].current;
      if (!resetBot(q)) return;
      q.root.visible = !bedtime;
      if (bedtime) return;
      const tt = t + r.phase * 3;
      const waiting = r === target && k < 6.0;
      const justGot = r === target && k >= 6.0 && k < 7.4;
      sitPose(q, tt * 1.7 + r.phase);
      // swivel a little on the stool, now and then turn to chat with a neighbor
      const chat = Math.sin(tt * 0.21 + r.phase) > 0.75 ? (i % 2 ? -1 : 1) * 0.6 : 0;
      q.root.rotation.y = Math.PI + Math.sin(tt * 0.45) * 0.22 + chat * 0.6;
      q.head.rotation.y = chat * 0.4 + Math.sin(tt * 0.33) * 0.15;
      if (q.handR.children[1]) q.handR.children[1].visible = !waiting;
      q.armL.rotation.set(-0.95, 0, 0.12); // elbow on the counter
      if (waiting) {
        // drum the counter, then reach for the drink as it slides in
        const reach = k > 5.3 ? Math.min(1, (k - 5.3) / 0.5) : 0;
        q.armR.rotation.set(-0.95 - reach * 0.25 + Math.abs(Math.sin(tt * 9)) * 0.12 * (1 - reach), 0, -0.1);
        q.head.rotation.y = Math.sin(tt * 0.6) * 0.2;
        q.head.rotation.x = 0.15;
      } else if (justGot) {
        // cheers!
        const u = (k - 6.0) / 1.4;
        const up = Math.sin(u * Math.PI);
        q.armR.rotation.set(-0.95 - up * 1.7, 0, -0.15);
        q.pose.position.y = up * 0.04;
        q.head.rotation.x = -0.25 * up;
      } else {
        // sip now and then
        const cyc = (tt * 0.13) % 1;
        const sip = cyc > 0.8 ? Math.sin(((cyc - 0.8) / 0.2) * Math.PI) : 0;
        q.armR.rotation.set(-0.95 - sip * 1.15, 0, -0.1 - sip * 0.45);
        q.head.rotation.x = -sip * 0.3;
        q.pose.rotation.z = Math.sin(tt * 0.9) * 0.03;
      }
    });

    // --- Lantern flicker and the sleepy Z's ---
    if (lanterns.current && animate) lanterns.current.children.forEach((l, i) => l.scale.setScalar(1 + Math.sin(t * 7 + i * 2) * 0.05));
    if (animate) signGlow.opacity = night * (0.55 + Math.sin(t * 2.1) * 0.05 + (Math.sin(t * 17) > 0.97 ? -0.3 : 0));
    else signGlow.opacity = night * 0.55;
    zs.forEach((z, i) => {
      const s = z.current;
      if (!s) return;
      s.visible = bedtime;
      if (!bedtime) return;
      const u = (t * 0.28 + i / 3) % 1;
      s.position.set(0.15 + u * 0.25 + Math.sin(u * 6 + i) * 0.05, 1.45 + u * 0.75, -0.2);
      s.scale.setScalar(0.14 + u * 0.14);
      zMats[i].opacity = Math.sin(u * Math.PI);
    });
  });

  return (
    <group position={[BAR.x, DECK_TOP, BAR.z]} rotation={[0, BAR.rotY, 0]}>
      {/* deck on bamboo stilts, with a step up from the sand */}
      <Box p={[0, -0.04, (DECK.z0 + DECK.z1) / 2]} s={[DECK.x1 - DECK.x0, 0.08, DECK.z1 - DECK.z0]} m={LM.plank} />
      {Array.from({ length: 7 }, (_, i) => (
        <Box key={i} p={[0, 0.002, DECK.z0 + 0.16 + i * 0.32]} s={[DECK.x1 - DECK.x0 - 0.02, 0.004, 0.02]} m={LM.wood} />
      ))}
      <DeckPosts />
      <Step />

      {/* hut: bamboo posts, thatch roof and fringe */}
      {[[-1.58, -0.88], [1.58, -0.88], [-1.58, 0.62], [1.58, 0.62]].map(([x, z], i) => (
        <BambooPost key={i} p={[x, 0, z]} h={2.0} r={0.065} />
      ))}
      <Roof p={[0, 2.0 + 0.36, -0.13]} halfX={1.9} halfZ={1.02} h={0.72} m={M.thatch} />
      <Fringe p={[0, 2.0, -0.13]} halfX={1.9} halfZ={1.02} drop={0.2} m={M.fringe} />
      <Box p={[0, 1.97, 0.66]} s={[3.3, 0.07, 0.07]} m={LM.darkWood} />

      {/* counter: bamboo canes in front, a plank top */}
      {Array.from({ length: 19 }, (_, i) => (
        <Cyl key={i} p={[-1.44 + i * 0.16, COUNTER_H / 2 - 0.02, 0.55]} rt={0.045} h={COUNTER_H - 0.04} m={i % 2 ? LM.bamboo : LM.bambooNode} seg={6} />
      ))}
      <Box p={[0, COUNTER_H / 2, 0.36]} s={[2.95, COUNTER_H - 0.06, 0.34]} m={LM.wood} />
      <Box p={[0, COUNTER_H, COUNTER_Z]} s={[3.05, 0.06, 0.5]} m={LM.darkWood} />
      <Box p={[0, COUNTER_H + 0.035, COUNTER_Z + 0.05]} s={[3.0, 0.012, 0.3]} m={LM.plank} />
      <TikiMask p={[-1.0, 0.42, 0.6]} m={M.maskA} />
      <TikiMask p={[1.0, 0.42, 0.6]} m={M.maskC} />
      {/* fruit bowl and a couple of glasses on the counter */}
      <group position={[-0.55, COUNTER_H + 0.04, 0.3]}>
        <Cyl p={[0, 0.04, 0]} rt={0.11} rb={0.07} h={0.08} m={LM.coconut} seg={8} />
        <mesh position={[0.03, 0.1, 0]} material={LM.yellow}>
          <icosahedronGeometry args={[0.045, 0]} />
        </mesh>
        <mesh position={[-0.04, 0.1, 0.02]} material={LM.green}>
          <icosahedronGeometry args={[0.04, 0]} />
        </mesh>
        <mesh position={[0, 0.11, -0.04]} material={LM.coral}>
          <icosahedronGeometry args={[0.04, 0]} />
        </mesh>
      </group>
      <Mug p={[0.95, COUNTER_H + 0.03, 0.28]} />

      {/* back bar: a low cabinet and an open bottle shelf (open so the
          bartender shows from the beach side), a big mask in the middle */}
      <Box p={[0, 0.38, -0.82]} s={[2.9, 0.76, 0.24]} m={LM.darkWood} />
      <Box p={[0, 0.78, -0.82]} s={[2.95, 0.04, 0.3]} m={LM.plank} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Box p={[sx * 1.0, 1.18, -0.82]} s={[0.9, 0.035, 0.2]} m={LM.plank} />
          {[0.6, 1.4].map((x) => (
            <Cyl key={x} p={[sx * x, 1.0, -0.9]} rt={0.025} h={0.44} m={LM.bamboo} />
          ))}
        </group>
      ))}
      <Bottles y={0.8} n={10} seed={0} />
      <Bottles y={1.2} n={4} seed={2} x0={-1.35} x1={-0.65} />
      <Bottles y={1.2} n={4} seed={5} x0={0.65} x1={1.35} />
      <TikiMask p={[0, 1.74, -0.9]} m={M.maskB} s={1.1} />

      {/* the sign over the front, with a neon glow at night */}
      <group position={[0, 1.78, 0.72]}>
        <mesh material={signMat}>
          <planeGeometry args={[1.2, 0.45]} />
        </mesh>
        <mesh material={signGlow} position={[0, 0, 0.01]} scale={1.08}>
          <planeGeometry args={[1.2, 0.45]} />
        </mesh>
        <Box p={[0, 0, -0.03]} s={[1.28, 0.52, 0.04]} m={LM.bamboo} />
      </group>

      <StringLights points={[[-1.6, 1.95, 0.68], [0, 1.98, 0.7], [1.6, 1.95, 0.68]]} sag={0.2} per={7} night={night} />
      <StringLights points={[[1.6, 1.95, 0.68], [1.62, 1.93, -0.9]]} sag={0.16} per={5} night={night} />
      <StringLights points={[[-1.6, 1.95, 0.68], [-1.62, 1.93, -0.9]]} sag={0.16} per={5} night={night} />

      {/* lanterns at the front posts, lit at night (and all night at bedtime) */}
      <group ref={lanterns}>
        {[-1.58, 1.58].map((x) => (
          <group key={x} position={[x, 1.55, 0.74]}>
            <mesh geometry={GEO.lantern} material={lanternMat} />
            <mesh geometry={GEO.halo} material={haloMat} />
          </group>
        ))}
        <group position={[0.55, COUNTER_H + 0.1, 0.3]}>
          <mesh geometry={GEO.lantern} material={lanternMat} />
          <mesh geometry={GEO.halo} material={haloMat} scale={0.8} />
        </group>
      </group>

      {/* stools and regulars */}
      {STOOLS.map((x, i) => (
        <Stool key={i} x={x} z={STOOL_Z} cushion={M.cushion[i]} />
      ))}
      {REGULARS.map((r, i) => (
        <MiniBot key={r.stool} parts={regs[i]} color={r.color} drink={r.drink} position={[STOOLS[r.stool], SIT_Y, STOOL_Z]} rotationY={Math.PI} shadow={false} />
      ))}

      {/* bartender behind the counter */}
      <MiniBot key={bedtime ? 'sleepy' : 'awake'} parts={bt} color={BARTENDER} position={[0, 0, -0.28]} sleepy={bedtime} />
      <group ref={slide} visible={false}>
        <Mug p={[0, 0, 0]} />
      </group>
      {zs.map((z, i) => (
        <sprite key={i} ref={z} material={zMats[i]} visible={false} />
      ))}
    </group>
  );
}
