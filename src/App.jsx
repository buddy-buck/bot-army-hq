import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import UI, { HandoffNote, LoadingNotice, RecentHandoffs } from './components/UI.jsx';
import useData from './hooks/useData.js';
import useSunPosition from './hooks/useSunPosition.js';
import { ZONES, groundY, layoutBots, nearestZone } from './utils/paths.js';

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

// ---------------------------------------------------------------------------
// Camera: slow auto-rotate (1 turn / 3 min), pause while touching, resume
// after 10s idle, fly-to for zones, tight zoom limits.
// ---------------------------------------------------------------------------

const ROTATE_SPEED = (Math.PI * 2) / 180; // radians per second
const IDLE_RESUME_MS = 10000;
const FLY_MS = 1500;
const HOME_TARGET = new THREE.Vector3(0, 1.2, 0);
const HOME_POLAR = Math.PI / 3; // 30 degrees above the horizon

function cameraDefaults(aspect, reduced) {
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(45 / 2));
  if (reduced) {
    const dist = Math.max(12 / tanHalf, 17.5 / (tanHalf * aspect));
    return { dist, polar: 0.02, minPolar: 0.02, maxPolar: 0.02, minDist: 10, maxDist: dist * 1.15 };
  }
  const dist = THREE.MathUtils.clamp(15 / (tanHalf * aspect), 24, 60);
  return { dist, polar: HOME_POLAR, minPolar: 0.55, maxPolar: 1.22, minDist: 9, maxDist: Math.min(72, dist * 1.25) };
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function CameraRig({ fly, reduced, holdRotate }) {
  const controls = useRef();
  const { camera, size } = useThree();
  const st = useRef({ userActive: false, resumeAt: 0, anim: null });
  const aspect = size.width / Math.max(1, size.height);
  const defaults = useMemo(() => cameraDefaults(aspect, reduced), [aspect, reduced]);

  // Nudge the picture down so the island sits in the open space under the
  // ticker banner instead of hiding behind it.
  useEffect(() => {
    const shift = Math.round(size.height * (aspect < 1 ? 0.09 : 0.05));
    camera.setViewOffset(size.width, size.height, 0, -shift, size.width, size.height);
    camera.updateProjectionMatrix();
    return () => {
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
  }, [camera, size.width, size.height, aspect]);

  // Initial placement (and when switching motion modes).
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.target.copy(HOME_TARGET);
    const offset = new THREE.Vector3().setFromSphericalCoords(defaults.dist, defaults.polar, 0);
    camera.position.copy(HOME_TARGET).add(offset);
    camera.lookAt(HOME_TARGET);
    c.update();
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to a zone, or home.
  useEffect(() => {
    if (!fly) return;
    const c = controls.current;
    if (!c) return;
    let target;
    let dist;
    let polar;
    if (fly.zone === '__home' || !ZONES[fly.zone]) {
      target = HOME_TARGET.clone();
      dist = defaults.dist;
      polar = defaults.polar;
    } else {
      const z = ZONES[fly.zone];
      target = new THREE.Vector3(z.x, z.focusY ?? groundY(z.x, z.z) + 0.6, z.z);
      dist = Math.max(defaults.minDist + 1, reduced ? defaults.dist * 0.45 : 13);
      polar = reduced ? defaults.polar : 0.95;
    }
    const current = new THREE.Spherical().setFromVector3(camera.position.clone().sub(c.target));
    const endPos = target.clone().add(new THREE.Vector3().setFromSphericalCoords(dist, polar, reduced ? 0 : current.theta));
    st.current.anim = {
      start: performance.now(),
      fromPos: camera.position.clone(),
      fromTarget: c.target.clone(),
      toPos: endPos,
      toTarget: target,
    };
    st.current.resumeAt = performance.now() + (fly.zone === '__home' ? 1500 : IDLE_RESUME_MS);
  }, [fly]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    const s = st.current;
    const now = performance.now();
    const dt = Math.min(delta, 0.1);
    if (s.anim) {
      const k = Math.min(1, (now - s.anim.start) / FLY_MS);
      const e = easeInOut(k);
      camera.position.lerpVectors(s.anim.fromPos, s.anim.toPos, e);
      c.target.lerpVectors(s.anim.fromTarget, s.anim.toTarget, e);
      if (k >= 1) s.anim = null;
    } else if (!reduced && !s.userActive && !holdRotate && now >= s.resumeAt) {
      const offset = camera.position.clone().sub(c.target);
      offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, ROTATE_SPEED * dt);
      camera.position.copy(c.target).add(offset);
    }
  }, -2);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableRotate={!reduced}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      zoomSpeed={0.7}
      minDistance={defaults.minDist}
      maxDistance={defaults.maxDist}
      minPolarAngle={defaults.minPolar}
      maxPolarAngle={defaults.maxPolar}
      onStart={() => {
        st.current.userActive = true;
        st.current.anim = null;
      }}
      onEnd={() => {
        st.current.userActive = false;
        st.current.resumeAt = performance.now() + IDLE_RESUME_MS;
      }}
    />
  );
}

// ---------------------------------------------------------------------------

export default function App() {
  const { data, error, version, pulseKeys } = useData();
  const sky = useSunPosition();
  const reduced = usePrefersReducedMotion();
  const hidden = useTabHidden();
  const [selectedId, setSelectedId] = useState(null);
  const [fly, setFly] = useState(null);
  const [walks, setWalks] = useState([]);
  const lastTap = useRef({ t: 0, x: 0, z: 0 });

  const bots = data?.bots ?? [];
  const layout = useMemo(() => layoutBots(bots), [bots]);
  const selected = bots.find((b) => b.id === selectedId) || null;

  const flyTo = useCallback((zone) => setFly({ zone, n: Date.now() + Math.random() }), []);
  const recenter = useCallback(() => setFly({ zone: '__home', n: Date.now() + Math.random() }), []);
  const select = useCallback((id) => setSelectedId(id), []);
  const closeCard = useCallback(() => setSelectedId(null), []);

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
          camera={{ fov: 45, near: 0.5, far: 500, position: [0, 14, 24] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <Suspense fallback={null}>
            <Sky sky={sky} animate={!reduced} useFog={!reduced} />
            <Island sky={sky} animate={!reduced} onGroundTap={onGroundTap} onZoneTap={flyTo} showLabels />
            {bots.map((b) =>
              layout[b.id] ? (
                <Bot
                  key={b.id}
                  bot={b}
                  slot={layout[b.id]}
                  isNight={sky.isNight}
                  selected={b.id === selectedId}
                  onSelect={select}
                  pulseKey={pulseKeys[b.id] || 0}
                  animate={!reduced}
                  labelDistance={reduced ? 24 : 15.5}
                />
              ) : null
            )}
            {!reduced && data && <Handoffs bots={bots} handoffs={data.handoffs} layout={layout} onActiveChange={setWalks} />}
            <CameraRig fly={fly} reduced={reduced} holdRotate={!!selected} />
          </Suspense>
        </Canvas>
      </div>

      <div className="hud-top">
        <Ticker minutesSaved={data?.minutesSaved} version={version} />
        <UI isExample={!!data?.isExample} sky={sky} error={data ? error : null} onRecenter={recenter} />
      </div>

      <div className="hud-bottom-left">
        {reduced ? <RecentHandoffs handoffs={data?.handoffs} bots={bots} /> : <HandoffNote walks={walks} />}
      </div>

      {bots.length > 0 && <Radar bots={bots} onFly={flyTo} animate={!reduced} paused={hidden} />}

      {!data && <LoadingNotice error={error} />}

      <BotCard bot={selected} onClose={closeCard} />
    </div>
  );
}
