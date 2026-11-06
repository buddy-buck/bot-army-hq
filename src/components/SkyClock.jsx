import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { formatDayPT, formatTimePT } from '../utils/time.js';
import { labelState } from './labels.js';

// The sun (by day) or moon (by night) is the clock. It rides an arc across
// the top of the view on Duvall time: left at 6 AM, highest at noon, right
// at 6 PM; the moon does the same from 6 PM to 6 AM. It's pinned to the
// camera, so it stays in view as the island turns. Hover or tap it for the
// time, with the date in a little cloud underneath.

const DIST = 50; // how far in front of the camera it hangs (drawn on top of everything)
const PEAK_Y = 84; // px from the top at noon / midnight (clear of the top chips)
const EDGE_Y = 165; // px from the top at sunrise / sunset
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

// --- Look -------------------------------------------------------------------
// The sun is a faceted, glowing low-poly sphere (warm white center, golden
// edges) inside soft layered glows, with two rings of tapered rays turning
// slowly in opposite directions. Golden hour stretches the rays and turns
// them orange; near sunrise and sunset the sun dips and blooms pink-orange.
// The moon gets the same faceted treatment in cool silver, as a crescent.

// Soft round glow, drawn once to a small canvas and shared.
const GLOW_TEX = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

// Tapered rays as one mesh: bright at the base, fading to nothing at the tip.
function makeRays(count, inner, outer, width, offset = 0) {
  const pos = [];
  const col = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + offset;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const px = -s * width;
    const py = c * width;
    pos.push(c * inner + px, s * inner + py, 0, c * inner - px, s * inner - py, 0, c * outer, s * outer, 0);
    col.push(1, 1, 1, 0.5, 1, 1, 1, 0.5, 1, 1, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  return g;
}

const GEO = {
  sphere: new THREE.IcosahedronGeometry(1, 1),
  plane: new THREE.PlaneGeometry(2, 2),
  raysLong: makeRays(8, 0.95, 2.5, 0.3),
  raysShort: makeRays(8, 0.95, 1.7, 0.22, Math.PI / 8),
  bite: new THREE.CircleGeometry(0.9, 28),
};

const FACET_VERT = /* glsl */ `
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
// Flat facets from screen-space derivatives: bright where a facet faces you,
// warmer toward the rim.
const FACET_FRAG = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uRim;
  varying vec3 vView;
  void main() {
    vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
    float f = abs(n.z);
    vec3 col = mix(uRim, uCore, pow(f, 1.8));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const additive = (color, opacity) =>
  new THREE.MeshBasicMaterial({ map: GLOW_TEX, color, transparent: true, opacity, depthTest: false, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });

// Palette per phase: [core, rim, glow, rays, bloom]
const SUN_LOOK = {
  day: { core: '#fffbea', rim: '#ffc93c', glow: '#ffe7a0', rays: '#ffe28a', bloom: '#fff3c4', rayLen: 1.0, bloomAmt: 0.22 },
  sunrise: { core: '#fff2dc', rim: '#ff9a5a', glow: '#ffb38a', rays: '#ffb070', bloom: '#ff8fa8', rayLen: 1.3, bloomAmt: 0.5 },
  golden: { core: '#fff0c8', rim: '#ff8a2a', glow: '#ffae55', rays: '#ff8c3a', bloom: '#ff7a5c', rayLen: 1.65, bloomAmt: 0.75 },
};
const MOON_LOOK = { core: '#ffffff', rim: '#b9c3ea', glow: '#b9c6ff', bloomAmt: 0.18 };

export default function SkyClock({ sky, animate = true, timeOverride = false }) {
  const { camera, size } = useThree();
  const group = useRef();
  const raysA = useRef();
  const raysB = useRef();
  const bloomRef = useRef();
  const now = useMinute();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);

  const { body, p } = arcProgress(sky.hour);
  const isSun = body === 'sun';
  const look = isSun ? SUN_LOOK[sky.phase] || SUN_LOOK.day : MOON_LOOK;
  // 0 at midday, 1 right at the horizon (sunrise or sunset): the sun dips and blooms there.
  const horizon = Math.max(0, 1 - Math.min(p, 1 - p) / 0.18);

  const mats = useMemo(
    () => ({
      core: new THREE.ShaderMaterial({
        uniforms: { uCore: { value: new THREE.Color() }, uRim: { value: new THREE.Color() } },
        vertexShader: FACET_VERT,
        fragmentShader: FACET_FRAG,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
      glow: additive('#ffffff', 0.85),
      bloom: additive('#ffffff', 0.3),
      rays: new THREE.MeshBasicMaterial({ vertexColors: true, color: '#ffffff', transparent: true, depthTest: false, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      bite: new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false, fog: false, transparent: true }),
    }),
    []
  );
  useEffect(() => {
    mats.core.uniforms.uCore.value.set(look.core);
    mats.core.uniforms.uRim.value.set(look.rim);
    mats.glow.color.set(look.glow);
    mats.glow.opacity = isSun ? 0.9 : 0.55;
    mats.bloom.color.set(isSun ? look.bloom : look.glow);
    mats.bloom.opacity = Math.min(0.85, look.bloomAmt + (isSun ? horizon * 0.35 : 0));
    if (isSun) mats.rays.color.set(look.rays);
    // The moon's "bite" is painted in the haze color behind it, making a crescent.
    mats.bite.color.set(sky.fog);
  }, [mats, look, isSun, horizon, sky.fog]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // Tap shows the time for a few seconds.
  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(() => setOpen(false), 4000);
    return () => clearTimeout(id);
  }, [open]);

  const v = useMemo(() => new THREE.Vector3(), []);
  const fade = useRef(1);
  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    // Zoomed in on a zone the top of the view is island, not sky: fade the sun out.
    const want = labelState.tier === 'close' ? 0 : 1;
    fade.current += (want - fade.current) * Math.min(1, Math.min(delta, 0.1) * 5);
    g.visible = fade.current > 0.02;
    const W = size.width;
    const H = size.height;
    const px = W * (EDGE_X + (1 - 2 * EDGE_X) * p);
    const py = EDGE_Y - (EDGE_Y - PEAK_Y) * Math.sin(Math.PI * p) + horizon * horizon * 18; // dips at the horizon
    v.set((px / W) * 2 - 1, 1 - (py / H) * 2, 0.5).unproject(camera).sub(camera.position).normalize();
    g.position.copy(camera.position).addScaledVector(v, DIST);
    g.quaternion.copy(camera.quaternion);
    // Keep a constant on-screen size, whatever the zoom.
    const worldPerPx = (2 * DIST * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / (H * camera.zoom);
    const t = animate ? state.clock.elapsedTime : 0;
    const breathe = 1 + Math.sin(t * 1.3) * 0.03;
    g.scale.setScalar((isSun ? SUN_PX : MOON_PX) * worldPerPx * breathe * (1 + horizon * 0.15) * (0.6 + 0.4 * fade.current));
    const rayLen = isSun ? look.rayLen : 1;
    if (raysA.current) {
      raysA.current.rotation.z = t * 0.08;
      raysA.current.scale.setScalar(rayLen * (1 + Math.sin(t * 1.7) * 0.04));
    }
    if (raysB.current) {
      raysB.current.rotation.z = -t * 0.05;
      raysB.current.scale.setScalar(rayLen * (1 + Math.sin(t * 2.3 + 1) * 0.06));
    }
    if (bloomRef.current) bloomRef.current.scale.setScalar(isSun ? 4.6 + horizon * 3.2 : 3.4);
  });

  const time = timeOverride ? sky.clock : formatTimePT(now.getTime());
  const day = formatDayPT(now);
  const show = open || hover;
  const label = `${day}, ${time} Pacific time`;

  return (
    <group ref={group} renderOrder={1000} frustumCulled={false}>
      <mesh ref={bloomRef} geometry={GEO.plane} material={mats.bloom} renderOrder={1000} />
      <mesh geometry={GEO.plane} material={mats.glow} scale={isSun ? 2.7 : 2.0} renderOrder={1001} />
      {isSun && (
        <>
          <mesh ref={raysA} geometry={GEO.raysLong} material={mats.rays} renderOrder={1002} />
          <mesh ref={raysB} geometry={GEO.raysShort} material={mats.rays} renderOrder={1002} />
        </>
      )}
      <mesh geometry={GEO.sphere} material={mats.core} renderOrder={1003} />
      {!isSun && <mesh geometry={GEO.bite} material={mats.bite} position={[0.45, 0.3, 1.2]} renderOrder={1004} />}
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
