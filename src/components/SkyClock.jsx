import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { formatDayPT, formatTimePT } from '../utils/time.js';

// The sun (by day) or moon (by night) is the clock. It rides an arc across
// the top of the view on Duvall time: left at 6 AM, highest at noon, right
// at 6 PM; the moon does the same from 6 PM to 6 AM. It's pinned to the
// camera, so it stays in view as the island turns. Hover or tap it for the
// time, with the date in a little cloud underneath.

const DIST = 50; // how far in front of the camera it hangs (drawn on top of everything)
const PEAK_Y = 84; // px from the top at noon / midnight (clear of the top chips)
const EDGE_Y = 150; // px from the top at sunrise / sunset
const EDGE_X = 0.12; // fraction of the width at each end of the arc
const SUN_PX = 17; // core radius in screen px
const MOON_PX = 14;

// Where along tonight's or today's arc we are, 0..1.
export function arcProgress(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 6 && h < 18) return { body: 'sun', p: (h - 6) / 12 };
  return { body: 'moon', p: ((h - 18 + 24) % 24) / 12 };
}

function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id;
    const schedule = () => {
      id = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, 60000 - (Date.now() % 60000) + 50);
    };
    schedule();
    const onVis = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return now;
}

const disc = (r, seg = 28) => new THREE.CircleGeometry(r, seg);
const GEO = {
  core: disc(1),
  glow: disc(1.9),
  halo: disc(2.8),
  bite: disc(0.86),
  ray: (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.22, 1.25, 0, 0.22, 1.25, 0, 0, 1.75, 0], 3));
    return g;
  })(),
};

const overlay = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, fog: false, toneMapped: false });

export default function SkyClock({ sky, animate = true, timeOverride = false }) {
  const { camera, size } = useThree();
  const group = useRef();
  const rays = useRef();
  const now = useMinute();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);

  const { body, p } = arcProgress(sky.hour);
  const isSun = body === 'sun';
  const coreColor = isSun ? (sky.phase === 'day' ? '#fff3c2' : '#ffc46b') : '#f4f1ff';
  const glowColor = isSun ? (sky.phase === 'day' ? '#ffe27a' : '#ff9f4a') : '#b9c6ff';

  const mats = useMemo(
    () => ({ core: overlay('#ffffff'), glow: overlay('#ffffff', 0.35), halo: overlay('#ffffff', 0.14), ray: overlay('#ffffff', 0.8), bite: overlay('#ffffff') }),
    []
  );
  useEffect(() => {
    mats.core.color.set(coreColor);
    mats.glow.color.set(glowColor);
    mats.halo.color.set(glowColor);
    mats.ray.color.set(glowColor);
    // The moon's "bite" is painted in the haze color behind it, making a crescent.
    mats.bite.color.set(sky.fog);
  }, [mats, coreColor, glowColor, sky.fog]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // Tap shows the time for a few seconds.
  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(() => setOpen(false), 4000);
    return () => clearTimeout(id);
  }, [open]);

  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const W = size.width;
    const H = size.height;
    const px = W * (EDGE_X + (1 - 2 * EDGE_X) * p);
    const py = EDGE_Y - (EDGE_Y - PEAK_Y) * Math.sin(Math.PI * p);
    v.set((px / W) * 2 - 1, 1 - (py / H) * 2, 0.5).unproject(camera).sub(camera.position).normalize();
    g.position.copy(camera.position).addScaledVector(v, DIST);
    g.quaternion.copy(camera.quaternion);
    // Keep a constant on-screen size, whatever the zoom.
    const worldPerPx = (2 * DIST * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / (H * camera.zoom);
    const t = animate ? state.clock.elapsedTime : 0;
    const breathe = 1 + Math.sin(t * 1.3) * 0.03;
    g.scale.setScalar((isSun ? SUN_PX : MOON_PX) * worldPerPx * breathe);
    if (rays.current) rays.current.rotation.z = t * 0.12;
  });

  const time = timeOverride ? sky.clock : formatTimePT(now.getTime());
  const day = formatDayPT(now);
  const show = open || hover;
  const label = `${day}, ${time} Pacific time`;

  return (
    <group ref={group} renderOrder={1000} frustumCulled={false}>
      <mesh geometry={GEO.halo} material={mats.halo} renderOrder={1000} />
      <mesh geometry={GEO.glow} material={mats.glow} renderOrder={1001} />
      {isSun && (
        <group ref={rays}>
          {Array.from({ length: 10 }, (_, i) => (
            <mesh key={i} geometry={GEO.ray} material={mats.ray} rotation={[0, 0, (i / 10) * Math.PI * 2]} renderOrder={1002} />
          ))}
        </group>
      )}
      <mesh geometry={GEO.core} material={mats.core} renderOrder={1003} />
      {!isSun && <mesh geometry={GEO.bite} material={mats.bite} position={[0.42, 0.28, 0]} renderOrder={1004} />}
      <Html center zIndexRange={[20, 0]}>
        <div className="sky-clock">
          <button
            type="button"
            className="sky-clock-hit"
            aria-label={label}
            title={label}
            aria-expanded={show}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
            onPointerLeave={() => setHover(false)}
            onFocus={() => setHover(true)}
            onBlur={() => setHover(false)}
          />
          {show && (
            <div className="sky-clock-pop" aria-hidden="true">
              <span className="sky-clock-time">{time}</span>
              <span className="sky-clock-date">{day}</span>
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}
