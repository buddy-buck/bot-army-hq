import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ZONES } from '../utils/paths.js';

// Weather events: short, 5 seconds, then clear. Only one plays at a time;
// extra requests wait their turn (at most 3 waiting, no repeats in a row).
//   storm  : a thundercloud over Launch's Pier (feed item with type "shipped")
//   rainbow: a rainbow over the island (feed item with type "fantasy_win")
//   double : a double rainbow (minutes saved crossing a round thousand)
// ?weather=test cycles through all three. Nothing plays by default.

export const WEATHER_SECONDS = 5;
const GAP_MS = 1200;
const KINDS = ['storm', 'rainbow', 'double'];

export function useWeather({ enabled = true, test = false } = {}) {
  const [weather, setWeather] = useState(null);
  const queue = useRef([]);
  const busy = useRef(false);
  const timers = useRef([]);

  const pump = useCallback(() => {
    if (busy.current || !queue.current.length) return;
    busy.current = true;
    const kind = queue.current.shift();
    setWeather({ kind, id: Date.now() + Math.random() });
    timers.current.push(
      setTimeout(() => {
        setWeather(null);
        timers.current.push(
          setTimeout(() => {
            busy.current = false;
            pump();
          }, GAP_MS)
        );
      }, WEATHER_SECONDS * 1000)
    );
  }, []);

  const request = useCallback(
    (kind) => {
      if (!enabled || !KINDS.includes(kind)) return;
      const q = queue.current;
      if (q.length >= 3 || q[q.length - 1] === kind) return;
      q.push(kind);
      pump();
    },
    [enabled, pump]
  );

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Test mode: cycle storm, rainbow, double rainbow.
  useEffect(() => {
    if (!test || !enabled) return undefined;
    let i = 0;
    const next = () => {
      if (!busy.current && !queue.current.length) request(KINDS[i++ % KINDS.length]);
    };
    const first = setTimeout(next, 2500);
    const id = setInterval(next, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [test, enabled, request]);

  return [weather, request];
}

// 0 -> 1 -> 0 over the event, with soft edges.
function envelope(t) {
  const fadeIn = 0.6;
  const fadeOut = 0.9;
  if (t < 0 || t > WEATHER_SECONDS) return 0;
  if (t < fadeIn) return t / fadeIn;
  if (t > WEATHER_SECONDS - fadeOut) return (WEATHER_SECONDS - t) / fadeOut;
  return 1;
}

// --- Thunderstorm over the pier ----------------------------------------------

const DROPS = 140;
const PUFF = new THREE.IcosahedronGeometry(1, 0);

function Storm() {
  const dock = ZONES.dock;
  const cx = dock.x - 0.5;
  const cz = dock.z;
  const top = 6.2;
  const start = useRef(null);
  const cloud = useRef();
  const rain = useRef();
  const bolt = useRef();
  const flash = useRef();
  const cloudMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#4a5263', flatShading: true, transparent: true, opacity: 0 }), []);
  const rainMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#cfe3ff', transparent: true, opacity: 0 }), []);
  const boltMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fffbe0', transparent: true, opacity: 0, depthWrite: false, fog: false }), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#dfe8ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), []);

  const drops = useMemo(() => {
    const seeds = [];
    for (let i = 0; i < DROPS; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 2.8;
      seeds.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r * 0.7, phase: Math.random(), speed: 7 + Math.random() * 3 });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(DROPS * 6), 3));
    return { seeds, g };
  }, [cx, cz]);

  // Jagged bolt from the cloud to the water, as a flat ribbon.
  const boltGeo = useMemo(() => {
    const pts = [];
    let x = cx + 0.4;
    let z = cz + 0.2;
    for (let y = top - 0.6; y > 0.1; y -= 0.7) {
      pts.push(new THREE.Vector3(x, y, z));
      x += (Math.random() - 0.5) * 0.8;
      z += (Math.random() - 0.5) * 0.3;
    }
    pts.push(new THREE.Vector3(x, 0.05, z));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), 24, 0.07, 3, false);
  }, [cx, cz]);

  useEffect(() => () => [cloudMat, rainMat, boltMat, flashMat, drops.g, boltGeo].forEach((x) => x.dispose()), [cloudMat, rainMat, boltMat, flashMat, drops, boltGeo]);

  useFrame((state) => {
    const now = performance.now() / 1000;
    if (start.current === null) start.current = now;
    const t = now - start.current;
    const e = envelope(t);
    cloudMat.opacity = 0.92 * e;
    rainMat.opacity = 0.55 * e;
    if (cloud.current) cloud.current.position.x = Math.sin(t * 0.6) * 0.15;

    const pos = drops.g.attributes.position;
    for (let i = 0; i < DROPS; i++) {
      const d = drops.seeds[i];
      const y = top - 0.6 - (((t * d.speed) / 6 + d.phase) % 1) * (top - 0.6);
      pos.setXYZ(i * 2, d.x, y, d.z);
      pos.setXYZ(i * 2 + 1, d.x + 0.04, y - 0.38, d.z);
    }
    pos.needsUpdate = true;

    // Two lightning strikes.
    const strike = (at) => (t > at && t < at + 0.16 ? 1 : t > at + 0.22 && t < at + 0.3 ? 0.6 : 0);
    const s = Math.max(strike(1.3), strike(3.1)) * e;
    boltMat.opacity = s;
    flashMat.opacity = s * 0.35;
  });

  const puffs = [
    [0, 0, 0, 1.6], [1.4, -0.2, 0.3, 1.25], [-1.4, -0.15, -0.2, 1.3], [0.6, 0.5, -0.4, 1.1], [-0.7, 0.45, 0.5, 1.0], [2.3, -0.35, -0.3, 0.9], [-2.2, -0.3, 0.4, 0.9],
  ];
  return (
    <group>
      <group ref={cloud} position={[cx, top, cz]}>
        {puffs.map(([x, y, z, s], i) => (
          <mesh key={i} geometry={PUFF} material={cloudMat} position={[x, y, z]} scale={[s * 1.2, s * 0.75, s]} />
        ))}
      </group>
      <lineSegments geometry={drops.g} material={rainMat} frustumCulled={false} />
      <mesh ref={bolt} geometry={boltGeo} material={boltMat} />
      <mesh ref={flash} position={[cx, top - 1.5, cz]} material={flashMat}>
        <sphereGeometry args={[5, 12, 8]} />
      </mesh>
    </group>
  );
}

// --- Rainbows ------------------------------------------------------------------

const BANDS = ['#ff4b4b', '#ff9b3d', '#ffe14d', '#5fd16b', '#4aa8ff', '#8a63ff'];

function Rainbow({ double }) {
  const { camera } = useThree();
  const start = useRef(null);
  const mats = useMemo(
    () => BANDS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false })),
    []
  );
  const outerMats = useMemo(
    () => (double ? [...BANDS].reverse().map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false })) : []),
    [double]
  );
  useEffect(() => () => [...mats, ...outerMats].forEach((m) => m.dispose()), [mats, outerMats]);

  // Face the camera as it was when the rainbow appeared, set just behind the island.
  const placement = useMemo(() => {
    const dir = new THREE.Vector3(camera.position.x, 0, camera.position.z).normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    return { position: dir.clone().multiplyScalar(-8.5).toArray(), yaw };
  }, [camera]);

  useFrame((state) => {
    const now = performance.now() / 1000;
    if (start.current === null) start.current = now;
    const t = now - start.current;
    // Fade in, hold, fade out (the outer bow trails a little).
    const e = envelope(t);
    mats.forEach((m) => (m.opacity = 0.55 * e));
    outerMats.forEach((m) => (m.opacity = 0.32 * envelope(t - 0.5)));
  });

  const R = 18;
  const W = 0.42;
  return (
    <group position={placement.position} rotation={[0, placement.yaw, 0]}>
      {BANDS.map((_, i) => (
        <mesh key={i} material={mats[i]} position={[0, -1.5, 0]}>
          <ringGeometry args={[R - (i + 1) * W, R - i * W, 64, 1, 0, Math.PI]} />
        </mesh>
      ))}
      {double &&
        BANDS.map((_, i) => (
          <mesh key={`o${i}`} material={outerMats[i]} position={[0, -1.5, -0.5]}>
            <ringGeometry args={[R + 2.6 + i * W * 0.8, R + 2.6 + (i + 1) * W * 0.8, 64, 1, 0, Math.PI]} />
          </mesh>
        ))}
    </group>
  );
}

export default function Weather({ weather }) {
  if (!weather) return null;
  if (weather.kind === 'storm') return <Storm key={weather.id} />;
  return <Rainbow key={weather.id} double={weather.kind === 'double'} />;
}
