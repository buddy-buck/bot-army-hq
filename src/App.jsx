import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import Island from './components/Island.jsx';
import Bot from './components/Bot.jsx';
import Handoffs from './components/Handoff.jsx';
import Sky from './components/Sky.jsx';
import Ticker from './components/Ticker.jsx';
import Radar from './components/Radar.jsx';
import BotCard from './components/BotCard.jsx';
import Feed from './components/Feed.jsx';
import Roster from './components/Roster.jsx';
import UI, { LoadingNotice, RecentHandoffs, Toast } from './components/UI.jsx';
import { LabelDirector, labelState } from './components/labels.js';
import useData from './hooks/useData.js';
import useSunPosition from './hooks/useSunPosition.js';
import { DECKS, ISLAND, ZONES, groundY, islandWobble, layoutBots, nearestZone } from './utils/paths.js';
import { applySafeMode, isSafeMode } from './utils/safe.js';

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
  pts.push(new THREE.Vector3(15.6, 3.0, 2.4)); // lanai umbrella
  pts.push(new THREE.Vector3(-16.5, 1.4, 6.4)); // boat
  pts.push(new THREE.Vector3(0, 7.5, 0)); // tower flag
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

function CameraRig({ fly, reduced, holdRotate, insets, controlsRef, layout }) {
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
    const endPos = target.clone().add(new THREE.Vector3().setFromSphericalCoords(dist, pol, reduced ? theta0 : current.theta));
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

export default function App() {
  const { data: rawData, error, version, pulseKeys } = useData();
  const safe = useMemo(() => isSafeMode(), []);
  const data = useMemo(() => (safe && rawData ? applySafeMode(rawData) : rawData), [rawData, safe]);
  const sky = useSunPosition();
  const reduced = usePrefersReducedMotion();
  const hidden = useTabHidden();
  const [selectedId, setSelectedId] = useState(null);
  const [spotlightId, setSpotlightId] = useState(null);
  const [fly, setFly] = useState(null);
  const [walks, setWalks] = useState([]);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const lastTap = useRef({ t: 0, x: 0, z: 0 });
  const controlsRef = useRef();
  const hudTopRef = useRef();
  const hudBottomRef = useRef();
  const insets = useHudInsets(hudTopRef, hudBottomRef);

  const bots = data?.bots ?? [];
  const layout = useMemo(() => layoutBots(bots), [bots]);
  const selected = bots.find((b) => b.id === selectedId) || null;

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

  const flyTo = useCallback((zone) => setFly({ zone, n: Date.now() + Math.random() }), []);
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

  return (
    <div className={`app phase-${sky.phase}${reduced ? ' is-reduced' : ''}`}>
      <div className="scene">
        <Canvas
          flat
          dpr={[1, 2]}
          frameloop={hidden ? 'never' : reduced ? 'demand' : 'always'}
          camera={{ fov: FOV, near: 0.5, far: 500, position: [0, 30, 50] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <Suspense fallback={null}>
            <Sky sky={sky} animate={!reduced} useFog={!reduced} onBuck={onBuck} />
            <Island sky={sky} animate={!reduced} onGroundTap={onGroundTap} onZoneTap={flyTo} showLabels />
            {bots.map((b) =>
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
                />
              ) : null
            )}
            {!reduced && data && <Handoffs bots={bots} handoffs={data.handoffs} layout={layout} onActiveChange={setWalks} />}
            <CameraRig fly={fly} reduced={reduced} holdRotate={!!selected || rosterOpen} insets={insets} controlsRef={controlsRef} layout={layout} />
            <LabelDirector controls={controlsRef} />
          </Suspense>
        </Canvas>
      </div>

      <div className="hud-top" ref={hudTopRef}>
        <Ticker minutesSaved={data?.minutesSaved} version={version} isExample={!!data?.isExample} />
        <UI
          isExample={!!data?.isExample}
          safe={safe}
          sky={sky}
          error={data ? error : null}
          onRecenter={recenter}
          onRoster={() => setRosterOpen((o) => !o)}
          rosterOpen={rosterOpen}
        />
      </div>

      <div className="hud-bottom-left" ref={hudBottomRef}>
        {reduced && <RecentHandoffs handoffs={data?.handoffs} bots={bots} />}
        {data && <Feed bots={bots} walks={walks} />}
      </div>

      {bots.length > 0 && <Radar bots={bots} onFly={flyTo} animate={!reduced} paused={hidden} />}

      {!data && <LoadingNotice error={error} />}

      <Toast message={toast} />
      <Roster open={rosterOpen} bots={bots} onPick={pickBot} onClose={closeRoster} />
      <BotCard bot={selected} onClose={closeCard} />
    </div>
  );
}
