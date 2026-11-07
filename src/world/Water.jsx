import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ISLAND, islandE, islandWobble, terrainY } from '../utils/paths.js';

// The sea around the island: the wave surface, the far ocean, the lagoon
// floor and the surf foam on the beach. Owned by the water upgrade.

// Waves run on the GPU: the vertex shader lifts each vertex, and flat
// shading picks up the new slopes for free. At night a faint bioluminescent
// shimmer glints in the shallows (skipped on low-power devices).
const WAVE_GLSL = /* glsl */ `
  uniform float uTime;
  varying vec2 vXZ;
  float waveY(vec2 p, float t) {
    return 0.07 * sin(p.x * 0.35 + t * 0.8) + 0.05 * cos(p.y * 0.42 + t * 0.63) + 0.03 * sin((p.x + p.y) * 0.9 + t * 1.4);
  }
`;

function WaterSurface({ tint, animate, onTap, glow = 0 }) {
  const ref = useRef();
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(170, 170, 84, 84);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const shallow = new THREE.Color('#72e6da');
    const mid = new THREE.Color('#2bb9cb');
    const deep = new THREE.Color('#1784b3');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const e = islandE(pos.getX(i), pos.getZ(i));
      if (e < 2.0) c.copy(shallow).lerp(mid, Math.max(0, (e - 1.1) / 0.9));
      else c.copy(mid).lerp(deep, Math.min(1, (e - 2.0) / 4));
      c.toArray(colors, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uGlow: { value: 0 } }), []);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.82, roughness: 0.3, metalness: 0.05 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uGlow = uniforms.uGlow;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WAVE_GLSL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n  vXZ = position.xz;\n  transformed.y += waveY(position.xz, uTime);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uGlow;\nvarying vec2 vXZ;`)
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
  if (uGlow > 0.0) {
    float d = length(vXZ / vec2(${ISLAND.rx.toFixed(1)}, ${ISLAND.rz.toFixed(1)}));
    float band = smoothstep(0.95, 1.08, d) * (1.0 - smoothstep(1.2, 1.55, d));
    float s = sin(vXZ.x * 4.1 + uTime * 0.9) * sin(vXZ.y * 3.7 - uTime * 0.7) * sin((vXZ.x - vXZ.y) * 2.3 + uTime * 0.5);
    totalEmissiveRadiance += vec3(0.2, 0.85, 1.0) * pow(max(s, 0.0), 12.0) * band * uGlow * 0.9;
  }`
        );
    };
    m.customProgramCacheKey = () => 'island-water-v1';
    return m;
  }, [uniforms]);

  useEffect(() => {
    material.color.set(tint);
  }, [material, tint]);
  useEffect(() => {
    uniforms.uGlow.value = glow;
  }, [uniforms, glow]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    if (animate) uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group>
      <mesh ref={ref} geometry={geometry} material={material} onClick={onTap} renderOrder={1} />
      {/* Far ocean, static, fades into the horizon fog. Sits well below the
          wave troughs (lowest about -0.15) so it never pokes through. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
        <circleGeometry args={[420, 48]} />
        <meshStandardMaterial color="#2a86c8" roughness={0.4} />
      </mesh>
      {/* Lagoon floor beyond the terrain mesh */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
        <circleGeometry args={[84, 48]} />
        <meshStandardMaterial color="#3d9fae" roughness={1} />
      </mesh>
    </group>
  );
}

function Foam({ animate }) {
  const ref = useRef();
  const geometry = useMemo(() => {
    const n = 160;
    const inner = 0.93;
    const outer = 1.07;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const dx = ISLAND.rx * Math.cos(a);
      const dz = ISLAND.rz * Math.sin(a);
      const w = islandWobble(dx, dz);
      for (const e of [inner, outer]) {
        const s = Math.sqrt(e) * w;
        const x = dx * s;
        const z = dz * s;
        pos.push(x, Math.max(terrainY(x, z), 0) + 0.05, z);
      }
      if (i < n) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, []);
  useFrame((state) => {
    if (!ref.current || !animate) return;
    const t = state.clock.elapsedTime;
    ref.current.material.opacity = 0.42 + 0.18 * Math.sin(t * 0.9);
    const s = 1 + 0.006 * Math.sin(t * 0.9);
    ref.current.scale.set(s, 1, s);
  });
  return (
    <mesh ref={ref} geometry={geometry} renderOrder={2}>
      <meshBasicMaterial color="#ffffff" transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function Water({ sky, animate = true, onTap, lowPower = false }) {
  return (
    <group>
      <WaterSurface tint={sky.water} animate={animate} onTap={onTap} glow={animate && !lowPower ? sky.stars : 0} />
      <Foam animate={animate} />
    </group>
  );
}
