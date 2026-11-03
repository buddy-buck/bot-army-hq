import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Dynamic sky: gradient dome, sun or moon, stars at night, drifting
// low-poly clouds, and the scene's lights and fog, all from Duvall time.
// At night a buck constellation hides low in the northern sky.

const DOME_RADIUS = 170;

const domeVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const domeFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
    gl_FragColor = vec4(col, 1.0);
  }
`;

function SkyDome({ top, horizon }) {
  const uniforms = useMemo(() => ({ uTop: { value: new THREE.Color(top) }, uHorizon: { value: new THREE.Color(horizon) } }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    uniforms.uTop.value.set(top);
    uniforms.uHorizon.value.set(horizon);
  }, [top, horizon, uniforms]);
  return (
    <mesh renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[DOME_RADIUS, 32, 16]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={domeVertex}
        fragmentShader={domeFragment}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

function Stars({ opacity, animate }) {
  const ref = useRef();
  const geometry = useMemo(() => {
    const n = 420;
    const pos = new Float32Array(n * 3);
    let seed = 1234;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const y = 0.12 + rnd() * 0.88;
      const r = Math.sqrt(1 - y * y);
      const R = DOME_RADIUS * 0.92;
      pos[i * 3] = Math.cos(a) * r * R;
      pos[i * 3 + 1] = y * R;
      pos[i * 3 + 2] = Math.sin(a) * r * R;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((state) => {
    if (!ref.current) return;
    const shimmer = animate ? 0.88 + 0.12 * Math.sin(state.clock.elapsedTime * 0.7) : 1;
    ref.current.material.opacity = opacity * shimmer;
    ref.current.visible = opacity > 0.02;
  });
  return (
    <points ref={ref} geometry={geometry} frustumCulled={false} visible={opacity > 0.02}>
      <pointsMaterial color="#ffffff" size={2.2} sizeAttenuation={false} transparent opacity={opacity} depthWrite={false} fog={false} />
    </points>
  );
}

// Easter egg: a buck (deer with antlers) drawn in the stars, low in the
// northern sky. Night only. Tap it and it lights up.
// Points are (u, v) on a small grid; the deer faces left.
const BUCK_STARS = {
  nose: [-2.7, 2.15],
  head: [-1.95, 2.75],
  ear: [-1.5, 2.95],
  antlerBase: [-1.85, 3.1],
  a1: [-2.45, 3.85],
  a2: [-2.15, 4.65],
  a3: [-3.05, 4.3],
  a4: [-1.35, 3.85],
  a5: [-0.95, 4.6],
  a6: [-0.55, 3.75],
  chest: [-1.7, 1.15],
  shoulder: [-0.95, 1.75],
  back: [1.55, 1.6],
  rump: [2.45, 1.25],
  tail: [2.9, 1.7],
  belly: [-0.85, 0.55],
  flank: [1.85, 0.55],
  frontHoof: [-1.05, -1.25],
  frontHoof2: [-0.45, -1.2],
  backHoof: [1.75, -1.25],
  backHoof2: [2.4, -1.15],
};
const BUCK_LINES = [
  ['nose', 'head'], ['head', 'ear'], ['head', 'antlerBase'],
  ['antlerBase', 'a1'], ['a1', 'a2'], ['a1', 'a3'],
  ['antlerBase', 'a4'], ['a4', 'a5'], ['a4', 'a6'],
  ['nose', 'chest'], ['ear', 'shoulder'], ['shoulder', 'back'], ['back', 'rump'], ['rump', 'tail'],
  ['chest', 'belly'], ['belly', 'flank'], ['flank', 'rump'],
  ['belly', 'frontHoof'], ['belly', 'frontHoof2'], ['flank', 'backHoof'], ['flank', 'backHoof2'],
];
const BUCK = { scale: 3.9, base: 5, dist: 150, turn: 0.5 }; // low in the sky, north-west, beside the tower

function buckPoint([u, v]) {
  return [u * BUCK.scale, BUCK.base + (v + 1.3) * BUCK.scale, -BUCK.dist];
}

function BuckConstellation({ visible, animate, onTap }) {
  const lineMat = useRef();
  const starMat = useRef();
  const glowStart = useRef(-100);
  const { invalidate, clock } = useThree();
  const { starGeo, lineGeo, hitPos, hitSize } = useMemo(() => {
    const names = Object.keys(BUCK_STARS);
    const pts = names.map((n) => buckPoint(BUCK_STARS[n]));
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    const lp = [];
    for (const [a, b] of BUCK_LINES) lp.push(...buckPoint(BUCK_STARS[a]), ...buckPoint(BUCK_STARS[b]));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const pad = 4;
    return {
      starGeo: sg,
      lineGeo: lg,
      hitPos: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, -BUCK.dist + 0.5],
      hitSize: [Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2],
    };
  }, []);

  useFrame((state) => {
    if (!lineMat.current || !starMat.current) return;
    const k = (state.clock.elapsedTime - glowStart.current) / 3.5;
    const glow = k >= 0 && k < 1 ? Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - k) : 0;
    const twinkle = animate ? 0.9 + 0.1 * Math.sin(state.clock.elapsedTime * 1.3) : 1;
    lineMat.current.opacity = (0.2 + glow * 0.75) * twinkle;
    starMat.current.size = 3.4 + glow * 4;
    starMat.current.color.set(glow > 0.05 ? '#ffffff' : '#e4ecff');
    if (glow > 0) invalidate();
  });

  if (!visible) return null;
  return (
    <group rotation={[0, BUCK.turn, 0]}>
      <lineSegments geometry={lineGeo} frustumCulled={false}>
        <lineBasicMaterial ref={lineMat} color="#cfe0ff" transparent opacity={0.2} depthWrite={false} fog={false} />
      </lineSegments>
      <points geometry={starGeo} frustumCulled={false}>
        <pointsMaterial ref={starMat} color="#e4ecff" size={3.4} sizeAttenuation={false} transparent depthWrite={false} fog={false} />
      </points>
      <mesh
        position={hitPos}
        onClick={(e) => {
          e.stopPropagation();
          glowStart.current = clock.elapsedTime;
          invalidate();
          onTap?.();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        <planeGeometry args={hitSize} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} fog={false} />
      </mesh>
    </group>
  );
}

function SunMoon({ sky }) {
  const sunPos = useMemo(() => new THREE.Vector3(...sky.sunDir).multiplyScalar(DOME_RADIUS * 0.8), [sky.sunDir]);
  const moonPos = useMemo(() => new THREE.Vector3(...sky.moonDir).multiplyScalar(DOME_RADIUS * 0.8), [sky.moonDir]);
  return (
    <group>
      {sky.sunUp && (
        <group position={sunPos}>
          <mesh>
            <sphereGeometry args={[6, 16, 12]} />
            <meshBasicMaterial color={sky.phase === 'day' ? '#fff8dc' : '#ffd08a'} fog={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[11, 16, 12]} />
            <meshBasicMaterial color="#fff1c4" transparent opacity={0.25} depthWrite={false} fog={false} />
          </mesh>
        </group>
      )}
      {sky.moonUp && sky.isNight && (
        <group position={moonPos}>
          <mesh>
            <sphereGeometry args={[4, 16, 12]} />
            <meshBasicMaterial color="#f4f1ff" fog={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[8, 16, 12]} />
            <meshBasicMaterial color="#b9c6ff" transparent opacity={0.15} depthWrite={false} fog={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

const CLOUD_DEFS = [
  { a: 0.3, r: 88, y: 30, s: 2.6 },
  { a: 1.4, r: 100, y: 36, s: 3.2 },
  { a: 2.3, r: 80, y: 27, s: 2.2 },
  { a: 3.3, r: 95, y: 34, s: 2.9 },
  { a: 4.2, r: 84, y: 29, s: 2.4 },
  { a: 5.2, r: 105, y: 40, s: 3.4 },
];

function Clouds({ color, animate }) {
  const ref = useRef();
  const puff = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
  const material = useMemo(() => new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: color, emissiveIntensity: 0.35 }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    material.color.set(color);
    material.emissive.set(color);
  }, [color, material]);
  useFrame((_, dt) => {
    if (animate && ref.current) ref.current.rotation.y += Math.min(dt, 0.1) * 0.006;
  });
  return (
    <group ref={ref}>
      {CLOUD_DEFS.map((c, i) => (
        <group key={i} position={[Math.cos(c.a) * c.r, c.y, Math.sin(c.a) * c.r]} scale={c.s}>
          <mesh geometry={puff} material={material} scale={[2.2, 1.2, 1.6]} />
          <mesh geometry={puff} material={material} position={[1.9, -0.2, 0.3]} scale={[1.6, 1.0, 1.3]} />
          <mesh geometry={puff} material={material} position={[-1.8, -0.3, -0.2]} scale={[1.5, 0.9, 1.2]} />
          <mesh geometry={puff} material={material} position={[0.4, 0.7, 0]} scale={[1.3, 1.0, 1.1]} />
        </group>
      ))}
    </group>
  );
}

function Lights({ sky }) {
  const dir = useRef();
  const pos = useMemo(() => new THREE.Vector3(...sky.lightDir).multiplyScalar(40), [sky.lightDir]);
  return (
    <>
      <hemisphereLight args={[sky.hemiSky, sky.hemiGround, sky.hemiI]} color={sky.hemiSky} groundColor={sky.hemiGround} intensity={sky.hemiI} />
      <directionalLight ref={dir} position={pos} color={sky.sun} intensity={sky.sunI} />
      <ambientLight intensity={sky.isNight ? 0.25 : 0.15} color={sky.isNight ? '#8090ff' : '#ffffff'} />
    </>
  );
}

export default function Sky({ sky, animate = true, useFog = true, onBuck }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = new THREE.Color(sky.horizon);
    scene.fog = useFog ? new THREE.Fog(sky.fog, 70, 230) : null;
  }, [scene, sky.horizon, sky.fog, useFog]);

  return (
    <>
      <SkyDome top={sky.top} horizon={sky.horizon} />
      <Stars opacity={sky.stars} animate={animate} />
      <BuckConstellation visible={sky.isNight && sky.stars > 0.5} animate={animate} onTap={onBuck} />
      <SunMoon sky={sky} />
      <Clouds color={sky.cloud} animate={animate} />
      <Lights sky={sky} />
    </>
  );
}
