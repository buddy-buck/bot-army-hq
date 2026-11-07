import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import Island from './components/Island.jsx';
import Bot, { WAVE_SECONDS } from './components/Bot.jsx';
import Handoffs from './components/Handoff.jsx';
import SkyClock from './components/SkyClock.jsx';
import Sky from './components/Sky.jsx';
import Scoreboard from './components/Scoreboard.jsx';
import Radar from './components/Radar.jsx';
import BotCard from './components/BotCard.jsx';
import Feed from './components/Feed.jsx';
import Roster from './components/Roster.jsx';
import UI, { IslandNote, LoadingNotice, RecentHandoffs, Toast } from './components/UI.jsx';
import { botFx, fxNow, LabelDirector, labelState } from './components/labels.js';
import useData, { HAS_LIVE, headlineMinutes, initialMode, saveMode } from './hooks/useData.js';
import useSunPosition from './hooks/useSunPosition.js';
import { DECKS, DOCK, ISLAND, LANAI, ZONES, botHash, groundY, islandWobble, layoutBots, nearestZone } from './utils/paths.js';
import { formatNumber } from './utils/ticker.js';
import { applySafeMode, isSafeMode } from './utils/safe.js';
import ClaudeCommute, { claudeZoneFor, visitSlot } from './wild/ClaudeCommute.jsx';
import Weather, { useWeather } from './wild/Weather.jsx';
import Flyover from './wild/Flyover.jsx';
import Surfer from './wild/Surfer.jsx';
import Campfire, { campfireLayout } from './wild/Campfire.jsx';
import { Bottle, CHIEF_WELCOME, DockOffice, PhotoBooth, TreasureChest } from './wild/Easter.jsx';
import { TEST, isIslandNight } from './wild/director.js';

// ---------------------------------------------------------------------------
// Small hooks
// ---------------------------------------------------------------------------

function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const forced = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('reduced') === '1';
  const [reduced, setReduced] = useState(() => forced || (typeof window !== 'undefined' && window.matchMedia?.(query).matches));
  useEffect(() => {
    if (forced || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [forced]);
  return reduced;
}

function useTabHidden() {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return hidden;
}

// Sea life is decoration, so it loads after the island in its own small chunk.
const SeaLife = lazy(() => import('./components/SeaLife.jsx'));
// The bigger island's extras, each in its own chunk.
const Wakes = lazy(() => import('./wild/Wakes.jsx'));
const Boats = lazy(() => import('./wild/Boats.jsx'));
const SkyShow = lazy(() => import('./wild/SkyShow.jsx'));
const Landmarks = lazy(() => import('./wild/Landmarks.jsx'));
const IslandLife = lazy(() => import('./wild/IslandLife.jsx'));
const BotAntics = lazy(() => import('./wild/BotAntics.jsx'));

// Device hints for battery and GPU budget.
const IS_TOUCH = typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 1 || /iPad|iPhone|Android/.test(navigator.userAgent));
const LOW_POWER =
  typeof navigator !== 'undefined' &&
  (new URLSearchParams(window.location.search).get('lite') === '1' || (navigator.deviceMemory && navigator.deviceMemory < 4) || (navigator.hardwareConcurrency || 8) <= 4);
const MAX_DPR = IS_TOUCH ? 1.5 : 2;
const IDLE_MS = 60 * 1000;

// No touch, click, key or wheel for 60 seconds: idle (the 3D view drops to
// about 30fps). Any input wakes it straight back to 60.
function useIdle() {
  const [idle, setIdle] = useState(false);
  const last = useRef(Date.now());
  const idleRef = useRef(false);
  useEffect(() => {
    const wake = () => {
      last.current = Date.now();
      if (idleRef.current) {
        idleRef.current = false;
        setIdle(false);
      }
    };
    const events = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    const id = setInterval(() => {
      if (!idleRef.current && Date.now() - last.current > IDLE_MS) {
        idleRef.current = true;
        setIdle(true);
      }
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, wake));
      clearInterval(id);
    };
  }, []);
  return idle;
}

// Kiosk mode: ?kiosk=1 / ?kiosk=0, remembered in localStorage.
const KIOSK_KEY = 'bah-kiosk';
function initialKiosk() {
  try {
    const q = new URLSearchParams(window.location.search).get('kiosk');
    if (q === '1' || q === 'true') {
      localStorage.setItem(KIOSK_KEY, '1');
      return true;
    }
    if (q === '0' || q === 'false') {
      localStorage.removeItem(KIOSK_KEY);
      return false;
    }
    return localStorage.getItem(KIOSK_KEY) === '1';
  } catch {
    return false;
  }
}

// Keep the screen awake while kiosk mode is on (Screen Wake Lock API). If the
// browser doesn't support it, nothing breaks; the screen just sleeps as usual.
function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        lock = null;
      }
      if (cancelled && lock) lock.release().catch(() => {});
    };
    const onVis = () => document.visibilityState === 'visible' && acquire();
    acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

// While idle, render on demand at a capped rate instead of every frame.
function FrameThrottle({ fps }) {
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => {
    if (!fps) return undefined;
    let raf;
    let last = 0;
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      if (t - last >= 1000 / fps - 2) {
        last = t;
        invalidate();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps, invalidate]);
  return null;
}

// "+18 min" chips that float up from the bot that earned the minutes.
function MinuteFloats({ floats }) {
  return floats.map((f) => (
    <Html key={f.id} position={[f.x, f.y, f.z]} center zIndexRange={[20, 0]} pointerEvents="none">
      <div className="gain-float" style={{ borderColor: f.color }}>
        +{formatNumber(f.minutes)} min
      </div>
    </Html>
  ));
}

// Confetti burst from Chief's Tower (DOM, cheap, gone in 2.4 seconds).
const CONFETTI_COLORS = ['#D63AF9', '#F09024', '#19469D', '#2BA84A', '#FF04A0', '#FFDE69', '#2ec4c8'];
function Confetti({ burst }) {
  const pieces = useMemo(
    () =>
      burst
        ? Array.from({ length: 42 }, (_, i) => ({
            dx: (Math.random() - 0.5) * 520,
            dy: -(160 + Math.random() * 260),
            rot: (Math.random() - 0.5) * 900,
            delay: Math.random() * 0.15,
            color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            w: 8 + Math.random() * 8,
          }))
        : [],
    [burst]
  );
  if (!burst) return null;
  return (
    <div className="confetti" style={{ left: burst.x, top: burst.y }} aria-hidden="true" key={burst.id}>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}s`, background: p.color, width: p.w, height: p.w * 0.55 }}
        />
      ))}
    </div>
  );
}

// Space the HUD covers at the top and bottom of the screen, so the camera can
// frame the island in the open area between them.
function useHudInsets(topRef, bottomRef) {
  const [insets, setInsets] = useState({ top: 150, bottom: 150 });
  useLayoutEffect(() => {
    const measure = () => {
      const H = window.innerHeight;
      const top = topRef.current ? topRef.current.getBoundingClientRect().bottom + 8 : 150;
      const radar = document.querySelector('.radar');
      const radarH = radar ? H - radar.getBoundingClientRect().top : 140;
      const feedH = bottomRef.current ? Math.min(130, H - bottomRef.current.getBoundingClientRect().top) : 0;
      const bottom = Math.max(radarH, feedH) + 8;
      setInsets((p) => (Math.abs(p.top - top) > 4 || Math.abs(p.bottom - bottom) > 4 ? { top, bottom } : p));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (topRef.current) ro.observe(topRef.current);
    window.addEventListener('resize', measure);
    const id = setTimeout(measure, 600);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      clearTimeout(id);
    };
  }, [topRef, bottomRef]);
  return insets;
}

// ---------------------------------------------------------------------------
// Camera framing: for every direction the camera can turn to, find the
// distance that fits the whole island (beaches, decks, the boat, the tower
// top) inside the open area between the HUD panels. Auto-rotate follows this
// table, so the island stays fully in frame as it turns, on any screen.
// ---------------------------------------------------------------------------

const HOME_TARGET = new THREE.Vector3(0, 1.2, 0);
const FOV = 45;
const ROTATE_SPEED = (Math.PI * 2) / 180; // one turn every 3 minutes
const IDLE_RESUME_MS = 10000;
const FLY_MS = 1500;

const FIT_POINTS = (() => {
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const x = Math.cos(a) * ISLAND.rx;
    const z = Math.sin(a) * ISLAND.rz;
    const w = islandWobble(x, z);
    pts.push(new THREE.Vector3(x * w * 1.04, 0.05, z * w * 1.04)); // beach and surf
    pts.push(new THREE.Vector3(x * w * 0.88, 3.3, z * w * 0.88)); // palm tops
  }
  for (const d of DECKS) {
    pts.push(new THREE.Vector3(d.x0, d.y + 0.6, d.z0), new THREE.Vector3(d.x1, d.y + 0.6, d.z0), new THREE.Vector3(d.x0, d.y + 0.6, d.z1), new THREE.Vector3(d.x1, d.y + 0.6, d.z1));
  }
  pts.push(new THREE.Vector3(LANAI.x1, 3.0, LANAI.z1 - 0.8)); // lanai umbrella
  pts.push(new THREE.Vector3(DOCK.x0, 1.4, DOCK.z1)); // end of the pier
  pts.push(new THREE.Vector3(0, 8.6, 0)); // tower flag
  return pts;
})();

function homePolar(aspect, reduced) {
  if (reduced) return 0.02;
  return aspect < 0.8 ? 0.9 : Math.PI / 3;
}

// Phones start looking along the island's long side, so it fills the tall screen.
function startTheta(aspect) {
  return aspect < 0.8 ? Math.PI / 2 : 0;
}

function buildFitTable({ width, height, top, bottom, polar, reduced, theta0 }) {
  const cam = new THREE.PerspectiveCamera(FOV, width / Math.max(1, height), 0.5, 500);
  const v = new THREE.Vector3();
  const avail = Math.max(0.25, (height - top - bottom) / height) * 2; // in NDC units
  const MX = 0.95;
  const MY = 0.95;
  const bounds = (theta, d) => {
    cam.position.copy(HOME_TARGET).add(v.setFromSphericalCoords(d, polar, theta));
    cam.lookAt(HOME_TARGET);
    cam.updateMatrixWorld();
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let behind = false;
    for (const p of FIT_POINTS) {
      v.copy(p).project(cam);
      if (v.z > 1) behind = true;
      x0 = Math.min(x0, v.x);
      x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y);
      y1 = Math.max(y1, v.y);
    }
    return { x0, x1, y0, y1, behind };
  };
  const n = reduced ? 1 : 24;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const theta = reduced ? theta0 : (i / n) * Math.PI * 2;
    let lo = 6;
    let hi = 300;
    for (let k = 0; k < 28; k++) {
      const mid = (lo + hi) / 2;
      const b = bounds(theta, mid);
      const fits = !b.behind && Math.max(-b.x0, b.x1) <= MX && b.y1 - b.y0 <= avail * MY;
      if (fits) hi = mid;
      else lo = mid;
    }
    const b = bounds(theta, hi);
    rows.push({ theta, dist: hi, center: (b.y0 + b.y1) / 2 });
  }
  // NDC y of the middle of the open area
  const want = 1 - (2 * (top + (height - top - bottom) / 2)) / height;
  return { rows, want, maxDist: Math.max(...rows.map((r) => r.dist)) };
}

function sampleFit(table, theta) {
  const { rows } = table;
  if (rows.length === 1) return rows[0];
  const t = ((((theta / (Math.PI * 2)) % 1) + 1) % 1) * rows.length;
  const i = Math.floor(t) % rows.length;
  const j = (i + 1) % rows.length;
  const f = t - Math.floor(t);
  return { dist: rows[i].dist + (rows[j].dist - rows[i].dist) * f, center: rows[i].center + (rows[j].center - rows[i].center) * f };
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function CameraRig({ fly, reduced, holdRotate, insets, controlsRef, layout, kiosk }) {
  const { camera, size, invalidate } = useThree();
  const st = useRef({ userActive: false, resumeAt: 0, anim: null, autoFit: true, placed: false, offsetY: 0, offsetTarget: 0, distAtStart: 0 });
  const aspect = size.width / Math.max(1, size.height);
  const polar = homePolar(aspect, reduced);
  const theta0 = startTheta(aspect);
  const table = useMemo(
    () => buildFitTable({ width: size.width, height: size.height, top: insets.top, bottom: insets.bottom, polar, reduced, theta0 }),
    [size.width, size.height, insets.top, insets.bottom, polar, reduced, theta0]
  );

  const applyOffset = useCallback(
    (y) => {
      st.current.offsetY = y;
      camera.setViewOffset(size.width, size.height, 0, y, size.width, size.height);
      camera.updateProjectionMatrix();
    },
    [camera, size.width, size.height]
  );
  const offsetFor = (center) => ((table.want - center) * size.height) / 2;

  useEffect(() => () => {
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }, [camera]);

  // First placement, and again when the motion mode changes.
  useEffect(() => {
    st.current.placed = false;
    st.current.autoFit = true;
    st.current.anim = null;
  }, [reduced]);

  // Screen size or HUD changed: refit (snap if we haven't placed yet).
  useEffect(() => {
    invalidate();
  }, [table, invalidate]);

  // iPad rotated (landscape <-> portrait): glide to the new framing instead of
  // snapping, as long as the camera is in its normal fitted view.
  const prevPolar = useRef(polar);
  useEffect(() => {
    const s = st.current;
    const c = controlsRef.current;
    if (prevPolar.current === polar) return;
    prevPolar.current = polar;
    if (!s.placed || !s.autoFit || reduced || !c) return;
    const current = new THREE.Spherical().setFromVector3(camera.position.clone().sub(c.target));
    const fit = sampleFit(table, current.theta);
    const endPos = HOME_TARGET.clone().add(new THREE.Vector3().setFromSphericalCoords(fit.dist, polar, current.theta));
    s.offsetTarget = offsetFor(fit.center);
    s.anim = { start: performance.now(), fromPos: camera.position.clone(), fromTarget: c.target.clone(), toPos: endPos, toTarget: HOME_TARGET.clone(), fromOffset: s.offsetY };
    invalidate();
  }, [polar]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to a zone, a bot, or home.
  useEffect(() => {
    if (!fly) return;
    const c = controlsRef.current;
    if (!c) return;
    const s = st.current;
    let target;
    let dist;
    let pol;
    const current = new THREE.Spherical().setFromVector3(camera.position.clone().sub(c.target));
    if (fly.photo) {
      // Photo booth: a clean, slightly lower three-quarter view of the whole island.
      const theta = reduced ? theta0 : theta0 + 0.35;
      const fit = sampleFit(table, theta);
      const endPos = HOME_TARGET.clone().add(new THREE.Vector3().setFromSphericalCoords(fit.dist * 0.97, reduced ? polar : polar + 0.06, theta));
      s.autoFit = true;
      s.offsetTarget = offsetFor(fit.center);
      s.anim = { start: performance.now(), fromPos: camera.position.clone(), fromTarget: c.target.clone(), toPos: endPos, toTarget: HOME_TARGET.clone(), fromOffset: s.offsetY };
      s.resumeAt = performance.now() + FLY_MS + 4500;
      invalidate();
      return;
    }
    if (fly.zone === '__home') {
      const fit = sampleFit(table, current.theta);
      target = HOME_TARGET.clone();
      dist = fit.dist;
      pol = polar;
      s.autoFit = true;
      s.offsetTarget = offsetFor(fit.center);
    } else {
      if (fly.bot) {
        const p = labelState.positions.get(fly.bot) || layout[fly.bot]?.home;
        if (!p) return;
        target = new THREE.Vector3(p.x, p.y + 0.9, p.z);
        dist = reduced ? 11 : 8.5;
      } else {
        const z = ZONES[fly.zone];
        if (!z) return;
        target = new THREE.Vector3(z.x, z.focusY ?? groundY(z.x, z.z) + 0.6, z.z);
        dist = reduced ? 14 : 13;
      }
      pol = reduced ? polar : 0.95;
      s.autoFit = false;
      s.offsetTarget = (table.want * size.height) / 2;
    }
    // Zones: look in from the seaward side, so the tower never blocks the view.
    const zone = !fly.bot && ZONES[fly.zone];
    const outward = zone && Math.hypot(zone.x, zone.z) > 3 ? Math.atan2(zone.x, zone.z) : current.theta;
    const endPos = target.clone().add(new THREE.Vector3().setFromSphericalCoords(dist, pol, reduced ? theta0 : outward));
    s.anim = { start: performance.now(), fromPos: camera.position.clone(), fromTarget: c.target.clone(), toPos: endPos, toTarget: target, fromOffset: s.offsetY };
    s.resumeAt = performance.now() + (fly.zone === '__home' ? 1500 : IDLE_RESUME_MS);
    invalidate();
  }, [fly]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    const c = controlsRef.current;
    if (!c) return;
    const s = st.current;
    const now = performance.now();
    const dt = Math.min(delta, 0.1);

    if (!s.placed) {
      const fit = sampleFit(table, theta0);
      c.target.copy(HOME_TARGET);
      camera.position.copy(HOME_TARGET).add(new THREE.Vector3().setFromSphericalCoords(fit.dist, polar, theta0));
      camera.lookAt(HOME_TARGET);
      applyOffset(offsetFor(fit.center));
      s.offsetTarget = s.offsetY;
      c.update();
      s.placed = true;
      labelState.baseDist = fit.dist;
      return;
    }

    const offset = camera.position.clone().sub(c.target);
    const theta = Math.atan2(offset.x, offset.z);
    const fit = sampleFit(table, theta);
    labelState.baseDist = fit.dist;

    if (s.anim) {
      const k = Math.min(1, (now - s.anim.start) / FLY_MS);
      const e = easeInOut(k);
      camera.position.lerpVectors(s.anim.fromPos, s.anim.toPos, e);
      c.target.lerpVectors(s.anim.fromTarget, s.anim.toTarget, e);
      applyOffset(s.anim.fromOffset + (s.offsetTarget - s.anim.fromOffset) * e);
      if (k >= 1) s.anim = null;
      invalidate();
      return;
    }

    if (!reduced && !s.userActive && !holdRotate && now >= s.resumeAt) {
      offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, ROTATE_SPEED * dt);
      // Kiosk: also breathe the tilt a little so nothing sits still for hours.
      if (kiosk && s.autoFit) {
        const sph = new THREE.Spherical().setFromVector3(offset);
        sph.phi = polar + Math.sin(now / 1000 / 47) * 0.05;
        offset.setFromSpherical(sph);
      }
      camera.position.copy(c.target).add(offset);
    }

    // Keep the whole island in frame while it turns (unless the user zoomed).
    if (s.autoFit && !s.userActive) {
      const k = reduced ? 1 : Math.min(1, dt * 2);
      const len = offset.length();
      const next = len + (fit.dist - len) * k;
      if (Math.abs(next - len) > 1e-4) camera.position.copy(c.target).add(offset.setLength(next));
      const oy = offsetFor(fit.center);
      if (Math.abs(oy - s.offsetY) > 0.5) applyOffset(s.offsetY + (oy - s.offsetY) * k);
    }
  }, -2);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      enableRotate={!reduced}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      zoomSpeed={0.7}
      minDistance={7}
      maxDistance={table.maxDist * 1.2}
      minPolarAngle={reduced ? polar : 0.55}
      maxPolarAngle={reduced ? polar : 1.5}
      onStart={() => {
        const s = st.current;
        s.userActive = true;
        s.anim = null;
        s.distAtStart = camera.position.distanceTo(controlsRef.current.target);
      }}
      onEnd={() => {
        const s = st.current;
        s.userActive = false;
        s.resumeAt = performance.now() + IDLE_RESUME_MS;
        const d = camera.position.distanceTo(controlsRef.current.target);
        if (Math.abs(d - s.distAtStart) > 0.3) s.autoFit = false; // the user zoomed: leave their zoom alone
      }}
    />
  );
}

// ---------------------------------------------------------------------------

const BUCK_LINES = ['Buck yeah!', 'The Buck stops here.', 'Oh deer, you found it.'];

// Pair up chillin' bots standing near each other so they can clink drinks.
function clinkPairs(layout) {
  const chill = Object.values(layout).filter((l) => l.mode === 'chill');
  const used = new Set();
  const out = {};
  for (const a of chill) {
    if (used.has(a.id)) continue;
    let best = null;
    let bestD = 2.4;
    for (const b of chill) {
      if (b.id === a.id || used.has(b.id) || !!b.home.raised !== !!a.home.raised) continue;
      const d = Math.hypot(a.home.x - b.home.x, a.home.z - b.home.z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) continue;
    used.add(a.id);
    used.add(best.id);
    const seed = (botHash(a.id + best.id) % 1000) / 1000;
    out[a.id] = { x: best.home.x, z: best.home.z, seed };
    out[best.id] = { x: a.home.x, z: a.home.z, seed };
  }
  return out;
}

const DEMO_TASKS = ['Wrote a caption batch', 'Scanned local events', 'Drafted an email', 'Tidied the content calendar', 'Pulled market stats', 'Posted to social'];

export default function App() {
  const [mode, setModeState] = useState(initialMode);
  const setMode = useCallback((m) => {
    saveMode(m);
    setModeState(m);
  }, []);
  const { data: rawData, error, version, pulseKeys, fellBack, gains } = useData(mode);
  const safe = useMemo(() => isSafeMode(), []);
  const data = useMemo(() => (safe && rawData ? applySafeMode(rawData) : rawData), [rawData, safe]);
  const sky = useSunPosition();
  const hourOverride = useMemo(() => new URLSearchParams(window.location.search).has('hour'), []);
  const reduced = usePrefersReducedMotion();
  const hidden = useTabHidden();
  const idle = useIdle();
  const [kiosk, setKiosk] = useState(initialKiosk);
  useWakeLock(kiosk && !hidden);
  const [selectedId, setSelectedId] = useState(null);
  const [spotlightId, setSpotlightId] = useState(null);
  const [fly, setFly] = useState(null);
  const [walks, setWalks] = useState([]);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [floats, setFloats] = useState([]);
  const [burst, setBurst] = useState(null);
  const [demoAdded, setDemoAdded] = useState(0);
  const [note, setNote] = useState(null);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [photo, setPhoto] = useState(null); // null | 'flying' | 'shoot' | 'flash'
  const lastTap = useRef({ t: 0, x: 0, z: 0 });
  const controlsRef = useRef();
  const hudTopRef = useRef();
  const hudBottomRef = useRef();
  const insets = useHudInsets(hudTopRef, hudBottomRef);

  const bots = data?.bots ?? [];
  // The island follows the clock. From 9 PM to 6 AM Duvall time, every bot
  // that isn't working sleeps in a hammock with ZZZs and the working bots
  // gather at the campfire; during the day they're chillin'. Working bots
  // always work. This only changes the 3D scene; the scoreboard, feed and
  // bot cards keep the real status.
  const bedtime = isIslandNight(sky.hour);
  const sceneBots = useMemo(() => {
    const restStatus = bedtime ? 'sleeping' : 'idle';
    return bots.map((b) => (b.status === 'working' || b.status === restStatus ? b : { ...b, status: restStatus }));
  }, [bots, bedtime]);
  const baseLayout = useMemo(() => layoutBots(sceneBots), [sceneBots]);
  // Claude lives in the tower with Chief; while working, Claude walks down to the zone the work is about.
  const claudeBot = bots.find((b) => b.id === 'claude');
  const claudeWants = claudeBot?.status === 'working' ? claudeZoneFor(claudeBot.lastAction?.text) : null;
  // undefined until the shuttle takes over: start Claude wherever the status says, no boat.
  const [claudeVisitState, setClaudeVisit] = useState(undefined);
  const claudeVisit = claudeVisitState === undefined ? claudeWants : claudeVisitState;
  const layout = useMemo(() => {
    let out = bedtime ? campfireLayout(baseLayout, sceneBots) : baseLayout;
    if (claudeVisit && out.claude) out = { ...out, claude: visitSlot(out.claude, claudeVisit) };
    return out;
  }, [baseLayout, sceneBots, bedtime, claudeVisit]);
  const claudeHome = baseLayout.claude || null;
  const clinks = useMemo(() => clinkPairs(layout), [layout]);
  const selected = bots.find((b) => b.id === selectedId) || null;
  const isExample = !!data?.isExample;

  useEffect(() => {
    labelState.selected = selectedId;
  }, [selectedId]);
  useEffect(() => {
    labelState.spotlight = spotlightId;
    if (!spotlightId) return undefined;
    const id = setTimeout(() => setSpotlightId(null), 7000);
    return () => clearTimeout(id);
  }, [spotlightId]);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!burst) return undefined;
    const id = setTimeout(() => setBurst(null), 2600);
    return () => clearTimeout(id);
  }, [burst]);

  const toggleKiosk = useCallback(() => {
    setKiosk((k) => {
      try {
        if (k) localStorage.removeItem(KIOSK_KEY);
        else localStorage.setItem(KIOSK_KEY, '1');
      } catch {
        // storage blocked: kiosk still works for this visit
      }
      return !k;
    });
  }, []);

  // Minutes gained: float a chip from the bot and give it a little cheer.
  const celebrateGain = useCallback((g) => {
    const p = g.bot ? labelState.positions.get(g.bot) : null;
    const bot = g.bot ? (data?.bots || []).find((b) => b.id === g.bot) : null;
    const pos = p ? [p.x, p.y + p.labelY + 0.35, p.z] : [0, 6.2, 0];
    const id = `g${g.id}`;
    if (g.bot) botFx.cheer.set(g.bot, fxNow());
    setFloats((f) => [...f.slice(-6), { id, x: pos[0], y: pos[1], z: pos[2], minutes: g.minutes, color: bot?.color || '#19469d' }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 2700);
  }, [data]);

  // Real gains: new minutesSaved.recent entries since the last refresh.
  useEffect(() => {
    if (!gains?.length) return;
    gains.slice(0, 5).forEach((g, i) => setTimeout(() => celebrateGain(g), i * 700));
  }, [gains]); // eslint-disable-line react-hooks/exhaustive-deps

  // Demo only: a working bot earns a few minutes every minute or so, so the
  // odometer, chips and cheers can be seen. Never runs in Live mode.
  useEffect(() => {
    setDemoAdded(0);
  }, [mode, fellBack]);
  useEffect(() => {
    if (!isExample || hidden) return undefined;
    let t;
    const tick = () => {
      t = setTimeout(() => {
        const working = (data?.bots || []).filter((b) => b.status === 'working');
        if (working.length) {
          const b = working[Math.floor(Math.random() * working.length)];
          const minutes = 3 + Math.floor(Math.random() * 13);
          setDemoAdded((d) => d + minutes);
          celebrateGain({ id: `d${Date.now()}`, bot: b.id, minutes, what: DEMO_TASKS[Math.floor(Math.random() * DEMO_TASKS.length)] });
        }
        tick();
      }, 40000 + Math.random() * 35000);
    };
    tick();
    return () => clearTimeout(t);
  }, [isExample, hidden, data, celebrateGain]);

  const displayTotal = headlineMinutes(data?.minutesSaved) + (isExample ? demoAdded : 0);

  // Weather: one short effect at a time. Feed items can ask for one with
  // type "shipped" (storm over the pier) or "fantasy_win" (rainbow); only new
  // items after the page loads count. ?weather=test cycles all of them.
  const [weather, requestWeather] = useWeather({ enabled: !reduced, test: TEST.weather });
  const seenFeed = useRef(null);
  useEffect(() => {
    seenFeed.current = null; // a different dataset: start fresh, don't replay its items
  }, [mode, fellBack]);
  useEffect(() => {
    if (!data) return;
    const keyOf = (f) => `${f.at}|${f.bot}|${f.type}|${f.text}`;
    const typed = data.feed.filter((f) => f.type === 'shipped' || f.type === 'fantasy_win');
    if (seenFeed.current === null) {
      seenFeed.current = new Set(typed.map(keyOf));
      return;
    }
    for (const f of typed) {
      const k = keyOf(f);
      if (seenFeed.current.has(k)) continue;
      seenFeed.current.add(k);
      requestWeather(f.type === 'shipped' ? 'storm' : 'rainbow');
    }
  }, [data, requestWeather]);

  // Celebrate every round thousand: confetti from Chief's Tower and a toast.
  const prevTotal = useRef(null);
  useEffect(() => {
    prevTotal.current = null;
  }, [mode, fellBack]);
  useEffect(() => {
    if (!data) return;
    const prev = prevTotal.current;
    prevTotal.current = displayTotal;
    if (prev === null || Math.floor(displayTotal / 1000) <= Math.floor(prev / 1000)) return;
    const k = Math.floor(displayTotal / 1000) * 1000;
    setToast({ id: Date.now(), text: `Buck yeah! ${formatNumber(k)} minutes saved` });
    requestWeather('double');
    if (!reduced) {
      const p = labelState.towerScreen || { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
      setBurst({ id: Date.now(), x: p.x, y: p.y });
    }
  }, [displayTotal, data, reduced, requestWeather]);

  // Next up: at T-0, spotlight the bot whose run is starting.
  useEffect(() => {
    const now = Date.now();
    const soon = (data?.nextUp || []).find((n) => Date.parse(n.at) > now);
    if (!soon) return undefined;
    const wait = Math.min(Date.parse(soon.at) - now + 50, 2 ** 31 - 1);
    const id = setTimeout(() => {
      const b = (data?.bots || []).find((x) => x.id === soon.bot);
      if (!b) return;
      setSpotlightId(b.id);
      setToast({ id: Date.now(), text: `${b.name} is up: ${soon.job || 'scheduled run'}` });
      if (!reduced) botFx.sipHop.set(b.id, fxNow());
    }, wait);
    return () => clearTimeout(id);
  }, [data, reduced, spotlightId]);

  const flyTo = useCallback((zone) => setFly({ zone, n: Date.now() + Math.random() }), []);

  // Easter eggs.
  const openBottle = useCallback(() => setNote({ id: Date.now(), title: CHIEF_WELCOME.title, body: CHIEF_WELCOME.body, from: CHIEF_WELCOME.from }), []);
  const openChest = useCallback((line) => setNote({ id: Date.now(), title: "Nasty's treasure", body: [line], from: 'Nasty' }), []);
  const closeNote = useCallback(() => setNote(null), []);
  const openOffice = useCallback(() => setScoreOpen(true), []);

  // Photo booth: fly to a clean angle, hide the UI and have everyone wave
  // for a couple of seconds (time to screenshot), flash, and bring it back.
  const photoTimers = useRef([]);
  const shootPhoto = useCallback(() => {
    if (photo) return;
    setSelectedId(null);
    setRosterOpen(false);
    setScoreOpen(false);
    setNote(null);
    setFly({ photo: true, n: Date.now() + Math.random() });
    setPhoto('flying');
    const later = (ms, fn) => photoTimers.current.push(setTimeout(fn, ms));
    later(reduced ? 200 : FLY_MS + 100, () => {
      setPhoto('shoot');
      const t = fxNow();
      (data?.bots || []).forEach((b) => botFx.wave.set(b.id, t));
    });
    later((reduced ? 200 : FLY_MS + 100) + Math.max(2000, WAVE_SECONDS * 1000 - 300), () => setPhoto('flash'));
    later((reduced ? 200 : FLY_MS + 100) + Math.max(2000, WAVE_SECONDS * 1000 - 300) + 500, () => setPhoto(null));
  }, [photo, reduced, data]);
  useEffect(() => () => photoTimers.current.forEach(clearTimeout), []);
  const recenter = useCallback(() => setFly({ zone: '__home', n: Date.now() + Math.random() }), []);
  const select = useCallback((id) => setSelectedId(id), []);
  const closeCard = useCallback(() => setSelectedId(null), []);
  const closeRoster = useCallback(() => setRosterOpen(false), []);
  const pickBot = useCallback((id) => {
    setRosterOpen(false);
    setSpotlightId(id);
    setFly({ bot: id, n: Date.now() + Math.random() });
  }, []);
  const onBuck = useCallback(() => {
    setToast((t) => {
      const i = t ? (BUCK_LINES.indexOf(t.text) + 1) % BUCK_LINES.length : Math.floor(Math.random() * BUCK_LINES.length);
      return { id: Date.now(), text: BUCK_LINES[i] };
    });
  }, []);

  // Double-tap on the ground or water: fly to the nearest zone.
  const onGroundTap = useCallback(
    (e) => {
      if (e.delta > 8) return;
      const now = performance.now();
      const { x, z } = e.point;
      const prev = lastTap.current;
      if (now - prev.t < 380 && Math.hypot(prev.x - x, prev.z - z) < 3) {
        const near = nearestZone(x, z);
        if (near.distance < 7) flyTo(near.zone);
        else recenter();
        lastTap.current = { t: 0, x, z };
      } else {
        lastTap.current = { t: now, x, z };
      }
    },
    [flyTo, recenter]
  );

  const throttled = idle && !reduced && !hidden;

  return (
    <div className={`app phase-${sky.phase}${reduced ? ' is-reduced' : ''}${kiosk ? ' is-kiosk' : ''}${photo === 'shoot' ? ' is-photo' : ''}`} style={{ '--hud-top': `${Math.round(insets.top)}px` }}>
      <div className="scene">
        <Canvas
          flat
          dpr={[1, MAX_DPR]}
          frameloop={hidden ? 'never' : reduced || throttled ? 'demand' : 'always'}
          camera={{ fov: FOV, near: 0.5, far: 500, position: [0, 30, 50] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <Suspense fallback={null}>
            <FrameThrottle fps={throttled ? 30 : 0} />
            <Sky sky={sky} animate={!reduced} useFog={!reduced} onBuck={onBuck} />
            <SkyClock sky={sky} animate={!reduced} timeOverride={hourOverride} />
            <Island sky={sky} animate={!reduced} onGroundTap={onGroundTap} onZoneTap={flyTo} showLabels lowPower={LOW_POWER} />
            {!reduced && (
              <Suspense fallback={null}>
                <SeaLife sky={sky} lowPower={LOW_POWER} />
              </Suspense>
            )}
            <Suspense fallback={null}>
              <Landmarks sky={sky} animate={!reduced} lowPower={LOW_POWER} bots={sceneBots} layout={layout} />
              <IslandLife sky={sky} animate={!reduced} lowPower={LOW_POWER} bots={sceneBots} layout={layout} />
              <BotAntics sky={sky} animate={!reduced} lowPower={LOW_POWER} bots={sceneBots} layout={layout} />
              {!reduced && <Boats sky={sky} animate lowPower={LOW_POWER} bots={sceneBots} layout={layout} />}
              {!reduced && <Wakes sky={sky} animate lowPower={LOW_POWER} bots={sceneBots} layout={layout} />}
              {!reduced && <SkyShow sky={sky} animate lowPower={LOW_POWER} bots={sceneBots} layout={layout} />}
            </Suspense>
            {sceneBots.map((b) =>
              layout[b.id] ? (
                <Bot
                  key={b.id}
                  bot={b}
                  slot={layout[b.id]}
                  isNight={sky.isNight}
                  selected={b.id === selectedId}
                  spotlight={b.id === spotlightId}
                  onSelect={select}
                  pulseKey={pulseKeys[b.id] || 0}
                  animate={!reduced}
                  clink={clinks[b.id] || null}
                />
              ) : null
            )}
            {!reduced && data && <Handoffs bots={sceneBots} handoffs={data.handoffs} layout={layout} onActiveChange={setWalks} />}
            {claudeBot && <ClaudeCommute desired={claudeWants} visit={claudeVisit} homeSlot={claudeHome} onVisit={setClaudeVisit} animate={!reduced} />}
            {bedtime && <Campfire layout={layout} bots={sceneBots} animate={!reduced} />}
            <Weather weather={weather} />
            {!reduced && <Flyover />}
            {!reduced && <Surfer color={bots.find((b) => b.id === 'echo')?.color} />}
            <Bottle onOpen={openBottle} animate={!reduced} />
            <TreasureChest onOpen={openChest} animate={!reduced} />
            <DockOffice onOpen={openOffice} night={sky.stars} animate={!reduced} />
            <PhotoBooth onShoot={shootPhoto} />
            <MinuteFloats floats={floats} />
            <CameraRig fly={fly} reduced={reduced} holdRotate={!!selected || rosterOpen} insets={insets} controlsRef={controlsRef} layout={layout} kiosk={kiosk} />
            <LabelDirector controls={controlsRef} />
          </Suspense>
        </Canvas>
      </div>

      <div className="hud-top" ref={hudTopRef}>
        <UI
          isExample={isExample}
          mode={mode}
          hasLive={HAS_LIVE}
          fellBack={!!fellBack}
          onMode={setMode}
          error={data ? error : null}
          onRecenter={recenter}
          onRoster={() => setRosterOpen((o) => !o)}
          rosterOpen={rosterOpen}
          kiosk={kiosk}
          onKiosk={toggleKiosk}
        />
      </div>

      <div className="hud-bottom-left" ref={hudBottomRef}>
        {data && <Scoreboard value={displayTotal} minutesSaved={data.minutesSaved} isExample={isExample} version={version} bots={bots} reduced={reduced} open={scoreOpen} onOpenChange={setScoreOpen} />}
        {reduced && <RecentHandoffs handoffs={data?.handoffs} bots={bots} />}
        {data && <Feed feed={data.feed} bots={bots} walks={walks} nextUp={data.nextUp} minutesSaved={data.minutesSaved} onFlyBot={pickBot} forceClosed={kiosk} />}
      </div>

      {bots.length > 0 && <Radar bots={bots} onFly={flyTo} animate={!reduced} paused={hidden} />}

      {!data && <LoadingNotice error={error} />}

      <Confetti burst={burst} />
      <Toast message={toast} />
      <IslandNote note={note} onClose={closeNote} />
      {photo === 'flash' && <div className="photo-flash" aria-hidden="true" />}
      <Roster open={rosterOpen} bots={bots} onPick={pickBot} onClose={closeRoster} />
      <BotCard bot={selected} onClose={closeCard} nextUp={data?.nextUp} minutesSaved={data?.minutesSaved} />
    </div>
  );
}
