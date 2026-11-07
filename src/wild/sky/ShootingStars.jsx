import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rareGap } from '../director.js';
import { farSide, isDark, rand } from './common.js';

// Shooting stars: every 20 to 60 seconds at night a bright streak slides down
// the sky with a fading tail. One mesh, reused.

const R = 140;

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const frag = /* glsl */ `
  uniform float uFade;
  varying vec2 vUv;
  void main() {
    float along = pow(vUv.x, 2.4);
    float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float core = pow(across, 1.5 + (1.0 - vUv.x) * 3.0);
    vec3 col = mix(vec3(0.55, 0.7, 1.0), vec3(1.0, 0.98, 0.9), vUv.x);
    float head = smoothstep(0.93, 1.0, vUv.x) * across;
    gl_FragColor = vec4(col * (along * core + head * 0.8) * uFade, 1.0);
  }
`;

const GEO = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0); // tail at x 0, head at x 1

export default function ShootingStars({ sky }) {
  const { camera } = useThree();
  const mesh = useRef();
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uFade: { value: 0 } },
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      }),
    []
  );
  useEffect(() => () => mat.dispose(), [mat]);
  const st = useMemo(
    () => ({
      wait: rareGap(8, 25),
      age: -1,
      life: 1,
      len: 20,
      width: 0.6,
      speed: 80,
      start: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      head: new THREE.Vector3(),
      x: new THREE.Vector3(),
      y: new THREE.Vector3(),
      z: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      side: { x: 0, z: -1 },
    }),
    []
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const m = mesh.current;
    if (!m) return;
    if (st.age < 0) {
      m.visible = false;
      st.wait -= dt;
      if (st.wait > 0) return;
      st.wait = rareGap(20, 60);
      if (!isDark(skyRef.current)) return;
      // Start somewhere in the camera's half of the sky, low-ish.
      const f = farSide(camera, st.side);
      const az = Math.atan2(f.x, f.z) + rand(-0.9, 0.9);
      const el = rand(0.08, 0.3);
      st.start.set(Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, Math.cos(az) * Math.cos(el) * R);
      // Mostly sideways and a little down, along the dome.
      const way = Math.random() < 0.5 ? 1 : -1;
      st.dir.set(Math.cos(az) * way, -rand(0.35, 0.7), -Math.sin(az) * way).normalize();
      st.age = 0;
      st.life = rand(0.7, 1.15);
      st.len = rand(16, 26);
      st.width = rand(0.45, 0.75);
      st.speed = rand(65, 95);
    }
    st.age += dt;
    if (st.age > st.life) {
      st.age = -1;
      m.visible = false;
      return;
    }
    const k = st.age / st.life;
    mat.uniforms.uFade.value = Math.min(1, k * 6) * (1 - k) * 1.4;
    st.head.copy(st.start).addScaledVector(st.dir, st.speed * st.age);
    const len = st.len * Math.min(1, st.age * 3 + 0.15);
    // Basis: x along the streak, z toward the dome center, y across.
    st.x.copy(st.dir);
    st.z.copy(st.head).multiplyScalar(-1).normalize();
    st.y.crossVectors(st.z, st.x).normalize();
    st.z.crossVectors(st.x, st.y);
    st.m.makeBasis(st.x, st.y, st.z);
    st.m.scale(st.x.set(len, st.width, 1));
    st.m.setPosition(st.head.x - st.dir.x * len, st.head.y - st.dir.y * len, st.head.z - st.dir.z * len);
    m.matrix.copy(st.m);
    m.matrixWorldNeedsUpdate = true;
    m.visible = true;
  });

  return <mesh ref={mesh} geometry={GEO} material={mat} matrixAutoUpdate={false} frustumCulled={false} visible={false} renderOrder={-5} />;
}
