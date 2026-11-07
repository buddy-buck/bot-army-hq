import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import StaticMerge from '../../utils/StaticMerge.jsx';
import { SITES } from '../../utils/paths.js';
import { Box, Cyl, LM, pointer, smooth, std, tap } from './common.jsx';
import { HORN_TOTAL, playFoghorn } from './foghorn.js';

// Classic red-and-white lighthouse on the rocky north-west point. At night a
// slow sweeping beam; tap it for the foghorn.

const S = SITES.lighthouse;
const BASE_Y = 0.62; // top of the stone plinth (the point is at the waterline)
const BANDS = 6;
const BAND_H = 0.5;
const TOWER_H = BANDS * BAND_H;
const R_BOT = 0.62;
const R_TOP = 0.4;
const GALLERY_Y = BASE_Y + TOWER_H;
const LAMP_Y = GALLERY_Y + 0.42;

const M = {
  roofRed: std('#c42a24'),
  lamp: new THREE.MeshStandardMaterial({
    color: '#fff3c4',
    emissive: '#ffd877',
    emissiveIntensity: 0.4,
    flatShading: true,
  }),
  halo: new THREE.MeshBasicMaterial({
    color: '#ffe7a0',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  }),
  door: std('#2c4a6e'),
  window: new THREE.MeshStandardMaterial({
    color: '#2c4a6e',
    emissive: '#ffcf6a',
    emissiveIntensity: 0,
    flatShading: true,
  }),
};

const RAIL_GEO = new THREE.TorusGeometry(0.66, 0.018, 4, 20).rotateX(Math.PI / 2);
const HALO_GEO = new THREE.SphereGeometry(0.55, 12, 8);
const ROCK_GEO = new THREE.DodecahedronGeometry(1, 0);

// The beam: a long open cone, apex at the lamp, fading out along its length.
const BEAM_LEN = 11;
const beamMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  fog: false,
  uniforms: {
    uOpacity: { value: 0 },
    uColor: { value: new THREE.Color('#fff1c0') },
    uLen: { value: BEAM_LEN },
  },
  vertexShader: /* glsl */ `
    varying float vT;
    uniform float uLen;
    void main() {
      vT = 0.5 - position.y / uLen; // 0 at the apex, 1 at the far end
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying float vT;
    uniform float uOpacity;
    uniform vec3 uColor;
    void main() {
      float a = uOpacity * pow(1.0 - vT, 1.6) * smoothstep(0.0, 0.04, vT);
      gl_FragColor = vec4(uColor * a, a);
    }`,
});
const noRay = () => null;

const ROCKS = [
  [0, -0.35, 0, 1.25, 0.8, 1.25],
  [0.9, -0.4, 0.6, 0.7, 0.55, 0.6],
  [-0.8, -0.45, 0.7, 0.75, 0.5, 0.65],
  [-0.7, -0.4, -0.8, 0.8, 0.6, 0.7],
  [0.8, -0.5, -0.7, 0.6, 0.45, 0.6],
  [1.45, -0.6, 0.1, 0.45, 0.35, 0.4],
  [-1.4, -0.6, -0.1, 0.5, 0.4, 0.45],
  [0.2, -0.55, 1.3, 0.5, 0.35, 0.45],
];

function Tower() {
  const bands = [];
  for (let i = 0; i < BANDS; i++) {
    const r0 = R_BOT + (R_TOP - R_BOT) * (i / BANDS);
    const r1 = R_BOT + (R_TOP - R_BOT) * ((i + 1) / BANDS);
    bands.push(<Cyl key={i} p={[0, BASE_Y + BAND_H * (i + 0.5), 0]} rb={r0} rt={r1} h={BAND_H} m={i % 2 ? LM.white : LM.red} seg={12} />);
  }
  return (
    <>
      {bands}
      {/* door and two little windows facing the island */}
      <Box p={[0, BASE_Y + 0.32, R_BOT - 0.03]} s={[0.3, 0.56, 0.08]} m={M.door} />
      <Box p={[0, BASE_Y + 1.35, R_BOT - 0.1]} s={[0.16, 0.24, 0.08]} m={M.window} />
      <Box p={[0, BASE_Y + 2.35, R_TOP + 0.03]} s={[0.14, 0.2, 0.08]} m={M.window} />
    </>
  );
}

function Gallery() {
  const posts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    posts.push(<Cyl key={i} p={[Math.cos(a) * 0.66, GALLERY_Y + 0.17, Math.sin(a) * 0.66]} rt={0.016} h={0.3} m={LM.iron} seg={4} />);
  }
  return (
    <>
      <Cyl p={[0, GALLERY_Y + 0.02, 0]} rt={0.72} rb={0.62} h={0.1} m={LM.iron} seg={14} />
      {posts}
      <mesh geometry={RAIL_GEO} material={LM.iron} position={[0, GALLERY_Y + 0.32, 0]} />
      {/* lantern room */}
      <Cyl p={[0, GALLERY_Y + 0.13, 0]} rt={0.36} h={0.14} m={M.roofRed} seg={10} />
      <Cyl p={[0, LAMP_Y, 0]} rt={0.33} h={0.5} m={LM.glass} seg={10} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2;
        return <Cyl key={i} p={[Math.cos(a) * 0.33, LAMP_Y, Math.sin(a) * 0.33]} rt={0.018} h={0.5} m={LM.iron} seg={4} />;
      })}
      <Cyl p={[0, LAMP_Y + 0.27, 0]} rt={0.38} h={0.05} m={LM.iron} seg={10} />
      <mesh position={[0, LAMP_Y + 0.47, 0]} material={M.roofRed}>
        <coneGeometry args={[0.42, 0.38, 10]} />
      </mesh>
      <Cyl p={[0, LAMP_Y + 0.7, 0]} rt={0.02} h={0.12} m={LM.iron} seg={4} />
      <mesh position={[0, LAMP_Y + 0.78, 0]} material={LM.iron}>
        <sphereGeometry args={[0.05, 6, 5]} />
      </mesh>
    </>
  );
}

export default function Lighthouse({ sky, animate, lowPower }) {
  const night = sky.stars;
  const invalidate = useThree((s) => s.invalidate);
  const beam = useRef();
  const halo = useRef();
  const hornAt = useRef(-100);
  const [horn, setHorn] = useState(false);
  const timer = useRef(0);
  const beamOn = smooth((night - 0.5) / 0.3);

  // Still frame (reduced motion): set the night look once.
  useEffect(() => {
    beamMat.uniforms.uOpacity.value = beamOn * (lowPower ? 0.3 : 0.38);
    M.lamp.emissiveIntensity = 0.4 + night * 2.2;
    M.window.emissiveIntensity = night * 0.9;
    M.halo.opacity = night * 0.45;
    invalidate();
  }, [beamOn, night, lowPower, invalidate]);

  useEffect(() => () => clearTimeout(timer.current), []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (beam.current) {
      beam.current.visible = beamOn > 0.01;
      if (animate) beam.current.rotation.y += Math.min(delta, 0.1) * 0.55;
    }
    // the lamp throbs while the horn sounds
    const h = t - hornAt.current;
    const pulse = animate && h >= 0 && h < HORN_TOTAL ? 0.5 + 0.5 * Math.sin(h * 6) : 0;
    M.lamp.emissiveIntensity = 0.4 + night * 2.2 + pulse * 1.5;
    M.halo.opacity = night * 0.45 + pulse * 0.3;
    if (halo.current) halo.current.scale.setScalar(1 + pulse * 0.35 + (animate ? 0.05 * Math.sin(t * 1.3) * night : 0));
  });

  const onTap = () => {
    if (!playFoghorn()) return;
    hornAt.current = -100; // stamped with the r3f clock on the next frame
    setHorn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setHorn(false);
      invalidate();
    }, HORN_TOTAL * 1000);
    invalidate();
  };

  // stamp the horn start on the next frame's clock
  useFrame((state) => {
    if (horn && hornAt.current < 0) hornAt.current = state.clock.elapsedTime;
    if (!horn) hornAt.current = -100;
  });

  return (
    <group position={[S.x, 0, S.z]} rotation={[0, S.rotY, 0]}>
      <StaticMerge>
        {/* rocky point */}
        {ROCKS.map(([x, y, z, sx, sy, sz], i) => (
          <mesh key={i} geometry={ROCK_GEO} material={i % 3 ? LM.rock : LM.rockDark} position={[x, y, z]} scale={[sx, sy, sz]} rotation={[i * 0.7, i * 1.3, i * 0.4]} />
        ))}
        <Cyl p={[0, BASE_Y - 0.55, 0]} rt={0.9} rb={1.05} h={1.1} m={LM.stone} seg={9} />
        <Cyl p={[0, BASE_Y - 0.04, 0]} rt={0.94} h={0.08} m={LM.stoneDark} seg={9} />
        <Tower />
        <Gallery />
      </StaticMerge>
      {/* generous invisible tap target (has handlers, so it never merges) */}
      <mesh position={[0, BASE_Y + TOWER_H / 2 + 0.4, 0]} material={LM.hit} onClick={tap(onTap)} {...pointer}>
        <cylinderGeometry args={[0.85, 0.85, TOWER_H + 1.3, 8]} />
      </mesh>
      <mesh position={[0, LAMP_Y, 0]} material={M.lamp} raycast={noRay}>
        <icosahedronGeometry args={[0.13, 0]} />
      </mesh>
      <mesh ref={halo} geometry={HALO_GEO} material={M.halo} position={[0, LAMP_Y, 0]} raycast={noRay} />
      <group ref={beam} position={[0, LAMP_Y, 0]} rotation={[0, 0.9, 0]}>
        {[0, Math.PI].map((ry) => (
          <group key={ry} rotation={[0, ry, -0.035]}>
            <mesh material={beamMat} position={[BEAM_LEN / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} raycast={noRay}>
              <coneGeometry args={[1.1, BEAM_LEN, 16, 1, true]} />
            </mesh>
          </group>
        ))}
      </group>
      {horn && (
        <Html position={[0, LAMP_Y + 1.2, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="lm-horn" aria-live="polite">
            BWAAAH&hellip; BWAAAH
          </div>
        </Html>
      )}
    </group>
  );
}
