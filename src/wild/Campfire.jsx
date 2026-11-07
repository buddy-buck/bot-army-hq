import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { BOT_SCALE, TALK_SECONDS } from '../components/Bot.jsx';
import { addBubble, botFx, fxNow, labelState } from '../components/labels.js';
import { formatNumber } from '../utils/ticker.js';
import { CAMPFIRE, CAMPFIRE_SEAT_H, PALMS, ZONES, campfireSpots, groundY, islandE, siteDistance } from '../utils/paths.js';

// Campfire mode (9 PM to 6 AM Duvall time): working bots gather around a
// campfire on the south-west side of the island, each sitting on a log or a
// stump facing the fire, with little thought bubbles showing what they're
// working on (lastAction.text, already made public-safe).
// Bots that aren't working are asleep in their hammocks.
// The fire is a few flickering low-poly flames, a glow and a handful of
// embers: no real lights, so it's cheap to draw. Tiki torches ring the
// circle and somebody left a guitar leaning on a log.

// Campfire stories: two at the normal view, more when zoomed in, one when
// zoomed out. They take turns every few seconds.
const BUBBLES_BY_TIER = { far: 1, default: 2, close: 4 };
const BUBBLE_SECONDS = 5.5;
const STORY_HOURS = 36; // ledger entries newer than this make a story
const STORY_Y = 1.55 * BOT_SCALE + 0.3; // just above the name tag

// Move working bots (except Claude, who commutes by boat) to the fire and
// sit them down on the seats (Bot.jsx 'seat' pose: root on the sand, seat
// top about CAMPFIRE_SEAT_H up, facing the fire).
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
    out[b.id] = { ...out[b.id], x: s.x, y, z: s.z, rotY: s.rotY, raised: false, lounge: false, doorstep: null, hammock: null, mode: 'seat', home, campfire: true };
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

const clip = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}...` : s);

// What a bot has to tell at the fire: its latest logged minutes ("Saved 12
// min: Drafted the newsletter"), else its last action, else its latest feed line.
function storyFor(bot, minutesSaved, feed) {
  const now = Date.now();
  const r = (minutesSaved?.recent || []).find((e) => e.bot === bot.id && now - (Date.parse(e.at) || 0) < STORY_HOURS * 3600e3);
  if (r) return { kicker: `Saved ${formatNumber(r.minutes)} min`, text: r.what || bot.lastAction?.text || '' };
  const text = bot.lastAction?.text || (feed || []).find((f) => f.bot === bot.id && f.text)?.text;
  return text ? { kicker: null, text } : null;
}

function StoryBubble({ it, slot }) {
  const wrap = useRef();
  useLayoutEffect(
    () => addBubble({ ref: wrap, x: it.x, y: it.y + STORY_Y, z: it.z, prio: 10 - slot, hideable: true, tail: true, bottom: true }),
    [it.x, it.y, it.z, slot]
  );
  return (
    <Html position={[it.x, it.y + STORY_Y, it.z]} center zIndexRange={[11, 1]} pointerEvents="none">
      <div ref={wrap} className="story-wrap photo-hide">
        <div className="story" style={{ '--bot': it.color }}>
          <div className="story-name">{it.name}</div>
          {it.kicker && <div className="story-kicker">{it.kicker}</div>}
          <div className="story-text">{clip(it.text)}</div>
        </div>
      </div>
    </Html>
  );
}

// Story bubbles: a few at a time, taking turns, so the circle never turns
// into a wall of text. The bot telling the story talks with its hands.
function Bubbles({ items, animate }) {
  const [tick, setTick] = useState(0);
  const [tier, setTier] = useState(labelState.tier);
  useFrame(() => {
    if (labelState.tier !== tier) setTier(labelState.tier);
  });
  const count = Math.min(BUBBLES_BY_TIER[tier] ?? 2, items.length);
  useEffect(() => {
    if (!animate || items.length <= count) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), BUBBLE_SECONDS * 1000);
    return () => clearInterval(id);
  }, [animate, items.length, count]);
  const shown = [];
  for (let k = 0; k < count; k++) shown.push(items[(tick * count + k) % items.length]);
  const ids = shown.map((x) => x.id).join(',');
  useEffect(() => {
    if (!animate) return;
    const t = fxNow();
    ids.split(',').forEach((id, i) => id && botFx.talk.set(id, t + i * 0.4 - (TALK_SECONDS - BUBBLE_SECONDS)));
  }, [ids, tick, animate]);
  return shown.map((it, k) => <StoryBubble key={`${it.id}-${tick}`} it={it} slot={k} />);
}

// ---------------------------------------------------------------------------
// Seats, torches and a guitar
// ---------------------------------------------------------------------------

const SEAT = {
  stump: new THREE.CylinderGeometry(0.2, 0.23, CAMPFIRE_SEAT_H - 0.02, 8).translate(0, (CAMPFIRE_SEAT_H - 0.02) / 2, 0),
  stumpTop: new THREE.CylinderGeometry(0.19, 0.19, 0.03, 8).translate(0, CAMPFIRE_SEAT_H - 0.01, 0),
  log: new THREE.CylinderGeometry(0.2, 0.2, 0.74, 7).rotateZ(Math.PI / 2).translate(0, 0.2, 0),
  logEnd: new THREE.CylinderGeometry(0.18, 0.18, 0.02, 7).rotateZ(Math.PI / 2),
  // a flat top so the seat reads as a bench
  logTop: new THREE.BoxGeometry(0.66, 0.025, 0.2).translate(0, CAMPFIRE_SEAT_H - 0.01, 0),
};
const SEAT_MAT = {
  bark: std('#6b4a2a'),
  barkDark: std('#5a3d22'),
  cut: std('#d9b27a'),
};

// One seat per bot at the fire, plus the full inner ring so the circle
// always looks finished. The seat sits right under the bot's root.
function Seats({ count }) {
  const spots = campfireSpots();
  const inner = spots.filter((s) => s.ring === 0).length;
  const list = spots.slice(0, Math.max(inner, count));
  return list.map((s, i) => {
    const y = groundY(s.x, s.z);
    return (
      <group key={i} position={[s.x, y, s.z]} rotation={[0, s.rotY, 0]}>
        {s.seat === 'stump' ? (
          <>
            <mesh geometry={SEAT.stump} material={SEAT_MAT.bark} />
            <mesh geometry={SEAT.stumpTop} material={SEAT_MAT.cut} />
          </>
        ) : (
          <>
            <mesh geometry={SEAT.log} material={i % 2 ? SEAT_MAT.bark : SEAT_MAT.barkDark} />
            <mesh geometry={SEAT.logTop} material={SEAT_MAT.cut} />
            <mesh geometry={SEAT.logEnd} material={SEAT_MAT.cut} position={[-0.37, 0.2, 0]} />
            <mesh geometry={SEAT.logEnd} material={SEAT_MAT.cut} position={[0.37, 0.2, 0]} />
          </>
        )}
      </group>
    );
  });
}

// Tiki torches just outside the circle, on clear ground.
const TORCH_SPOTS = (() => {
  const spots = campfireSpots();
  const out = [];
  for (let k = 0; k < 16 && out.length < 5; k++) {
    const a = (k * 5 * Math.PI) / 8 + 0.6; // hop around the circle so picks spread out
    const r = 5.0;
    const x = CAMPFIRE.x + Math.cos(a) * r;
    const z = CAMPFIRE.z + Math.sin(a) * r;
    if (islandE(x, z) > 0.8 || siteDistance(x, z) < 0.8) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 0.9)) continue;
    if (PALMS.some((p) => Math.hypot(p.x - x, p.z - z) < 0.7)) continue;
    if (Object.values(ZONES).some((zz) => Math.hypot(zz.x - x, zz.z - z) < 2.6)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 2.5)) continue;
    out.push({ x, z, y: groundY(x, z) });
  }
  return out;
})();
const TORCH = {
  pole: new THREE.CylinderGeometry(0.035, 0.05, 1.3, 6).translate(0, 0.65, 0),
  cup: new THREE.CylinderGeometry(0.1, 0.07, 0.16, 6).translate(0, 1.33, 0),
  flame: new THREE.ConeGeometry(0.09, 0.28, 5).translate(0, 0.14, 0),
  glow: new THREE.SphereGeometry(0.34, 10, 8),
  wrap: new THREE.CylinderGeometry(0.055, 0.055, 0.05, 6),
};
const TORCH_MAT = {
  pole: std('#d4b872'),
  cup: std('#7a5232'),
  wrap: std('#9c8240'),
  flame: new THREE.MeshBasicMaterial({ color: '#ffb23d', fog: false }),
  glow: new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
};

function Torches({ animate }) {
  const flames = useRef([]);
  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;
    flames.current.forEach((f, i) => {
      if (f) f.scale.set(1, 1 + Math.sin(t * 9 + i * 1.7) * 0.15 + Math.sin(t * 13.3 + i) * 0.08, 1);
    });
  });
  return TORCH_SPOTS.map((p, i) => (
    <group key={i} position={[p.x, p.y, p.z]}>
      <mesh geometry={TORCH.pole} material={TORCH_MAT.pole} />
      {[0.4, 0.8].map((y) => (
        <mesh key={y} geometry={TORCH.wrap} material={TORCH_MAT.wrap} position={[0, y, 0]} />
      ))}
      <mesh geometry={TORCH.cup} material={TORCH_MAT.cup} />
      <mesh ref={(el) => (flames.current[i] = el)} geometry={TORCH.flame} material={TORCH_MAT.flame} position={[0, 1.4, 0]} />
      <mesh geometry={TORCH.glow} material={TORCH_MAT.glow} position={[0, 1.5, 0]} />
    </group>
  ));
}

// An acoustic guitar leaning on a short log, just inside the circle at the back.
const GUITAR_MAT = {
  body: std('#c7843f'),
  top: std('#e9b56a'),
  neck: std('#5a3d22'),
  hole: std('#2a1d12'),
  strings: std('#f2f2f2'),
};
function Guitar() {
  // at the back of the circle (away from the camera), between two inner seats
  const step = (Math.PI * 2) / Math.floor((2 * Math.PI * 2.15) / 1.08);
  const a = 0.3 - 2.5 * step;
  const r = 1.42;
  const x = CAMPFIRE.x + Math.cos(a) * r;
  const z = CAMPFIRE.z + Math.sin(a) * r;
  const y = groundY(x, z);
  // face the fire, lean back against the log behind it
  const rotY = Math.atan2(CAMPFIRE.x - x, CAMPFIRE.z - z);
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      <mesh material={SEAT_MAT.bark} position={[0, 0.12, -0.28]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.13, 0.46, 7]} />
      </mesh>
      <mesh material={SEAT_MAT.cut} position={[0.23, 0.12, -0.28]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.11, 0.11, 0.02, 7]} />
      </mesh>
      <group position={[0, 0.02, -0.08]} rotation={[-0.42, 0, 0]}>
        <mesh material={GUITAR_MAT.body} position={[0, 0.18, 0]} scale={[1, 1, 0.38]}>
          <sphereGeometry args={[0.17, 10, 6]} />
        </mesh>
        <mesh material={GUITAR_MAT.body} position={[0, 0.4, 0]} scale={[1, 1, 0.38]}>
          <sphereGeometry args={[0.13, 10, 6]} />
        </mesh>
        <mesh material={GUITAR_MAT.top} position={[0, 0.28, 0.055]} scale={[1, 1.6, 1]}>
          <circleGeometry args={[0.13, 12]} />
        </mesh>
        <mesh material={GUITAR_MAT.hole} position={[0, 0.33, 0.057]}>
          <circleGeometry args={[0.045, 10]} />
        </mesh>
        <mesh material={GUITAR_MAT.neck} position={[0, 0.72, 0.02]}>
          <boxGeometry args={[0.055, 0.5, 0.03]} />
        </mesh>
        <mesh material={GUITAR_MAT.neck} position={[0, 1.0, 0.02]} rotation={[-0.2, 0, 0]}>
          <boxGeometry args={[0.08, 0.12, 0.03]} />
        </mesh>
        <mesh material={GUITAR_MAT.hole} position={[0, 0.17, 0.06]}>
          <boxGeometry args={[0.12, 0.025, 0.012]} />
        </mesh>
        <mesh material={GUITAR_MAT.strings} position={[0, 0.58, 0.04]}>
          <boxGeometry args={[0.03, 0.82, 0.004]} />
        </mesh>
      </group>
    </group>
  );
}

export default function Campfire({ layout, bots, animate = true, minutesSaved = null, feed = null }) {
  const g = groundY(CAMPFIRE.x, CAMPFIRE.z);
  const items = useMemo(() => {
    const out = [];
    for (const b of bots) {
      const l = layout[b.id];
      if (!l?.campfire) continue;
      const st = storyFor(b, minutesSaved, feed);
      if (!st) continue;
      out.push({ id: b.id, name: b.name, color: b.color, kicker: st.kicker, text: st.text, x: l.x, y: l.y, z: l.z });
    }
    // Stories with minutes first, so the best ones come around soonest.
    return out.sort((a, b) => (b.kicker ? 1 : 0) - (a.kicker ? 1 : 0));
  }, [bots, layout, minutesSaved, feed]);
  const seated = useMemo(() => bots.filter((b) => layout[b.id]?.campfire).length, [bots, layout]);
  return (
    <group>
      <group position={[CAMPFIRE.x, g, CAMPFIRE.z]} scale={1.7}>
        <Fire animate={animate} />
      </group>
      <Seats count={seated} />
      <Torches animate={animate} />
      <Guitar />
      <Bubbles items={items} animate={animate} />
    </group>
  );
}
