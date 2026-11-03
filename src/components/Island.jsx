import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  DECKS,
  FLOWERS,
  HUB_RADIUS,
  ISLAND,
  LOOKOUT_H,
  PALMS,
  ROCKS,
  TOWER_LEG_H,
  ZONES,
  groundY,
  islandE,
  islandWobble,
  ringPoints,
  terrainY,
  zonePathCurve,
} from '../utils/paths.js';
import { labelState } from './labels.js';

// ---------------------------------------------------------------------------
// Shared materials and geometry
// ---------------------------------------------------------------------------

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

const M = {
  wood: std('#a8774a'),
  darkWood: std('#7a5232'),
  plank: std('#c08a57'),
  thatch: std('#d9b26a'),
  thatchDark: std('#c2954c'),
  white: std('#fdf8ee'),
  bamboo: std('#cdae6e'),
  stone: std('#9aa3a8'),
  dark: std('#3b3430'),
  lisnGreen: std('#2E5248'),
  lisnOrange: std('#F09024'),
  bbBlue: std('#19469D'),
  bbYellow: std('#FFDE69'),
  chief: std('#D63AF9'),
  nasty: std('#FF4500'),
  launch: std('#2BA84A'),
  research: std('#2BA84A'),
  claude: std('#D97757'),
  claudeSoft: std('#f2c4ae'),
  cash: std('#5fae6e'),
  cashBand: std('#ffffff'),
  shell: std('#ffd6e4'),
  football: std('#8a4b26'),
  coconut: std('#6b4a2a'),
  screenDTV: new THREE.MeshStandardMaterial({ color: '#FF04A0', emissive: '#FF04A0', emissiveIntensity: 0.7, flatShading: true }),
  screen: new THREE.MeshStandardMaterial({ color: '#bfe8ff', emissive: '#7cc8ff', emissiveIntensity: 0.5, flatShading: true }),
};

const PYRAMID = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4); // square base, half-extent 0.707
const PYR_K = 1 / Math.SQRT1_2;

function Box({ p, s, m, r }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <boxGeometry args={s} />
    </mesh>
  );
}

function Cyl({ p, rt = 0.06, rb, h, m, seg = 6, r }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <cylinderGeometry args={[rt, rb ?? rt, h, seg]} />
    </mesh>
  );
}

function Cone({ p, rad, h, m, seg = 8, r }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <coneGeometry args={[rad, h, seg]} />
    </mesh>
  );
}

// Square-based roof: halfX, halfZ are the half-widths of the base.
function Roof({ p, halfX, halfZ, h, m }) {
  return <mesh position={p} geometry={PYRAMID} material={m} scale={[halfX * PYR_K, h, halfZ * PYR_K]} />;
}

function useGlowMaterial(color, night, base = 0.1, boost = 1.3) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, flatShading: true }), [color, base]);
  useEffect(() => {
    mat.emissiveIntensity = base + night * boost;
  }, [mat, night, base, boost]);
  return mat;
}

// ---------------------------------------------------------------------------
// Ground, water, foam, paths
// ---------------------------------------------------------------------------

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function Terrain({ onTap }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(40, 30, 80, 60);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrainY(pos.getX(i), pos.getZ(i)));
    const ng = g.toNonIndexed();
    g.dispose();
    const p = ng.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    const floor = new THREE.Color('#e3cf98');
    const deep = new THREE.Color('#4fb3b0');
    const grassA = new THREE.Color('#6fbf5c');
    const grassB = new THREE.Color('#8bd172');
    const sandA = new THREE.Color('#f3dea9');
    const sandB = new THREE.Color('#f8e8bd');
    for (let f = 0; f < p.count; f += 3) {
      const cx = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3;
      const cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
      const cz = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
      const e = islandE(cx, cz);
      const j = hash2(cx, cz);
      if (cy < -0.08) {
        c.copy(floor).lerp(deep, Math.min(1, (-cy - 0.08) / 0.6));
      } else if (cy < 0.07) {
        c.set('#e6cd93');
      } else if (e > 0.8) {
        c.copy(sandA).lerp(sandB, j);
      } else {
        c.copy(grassA).lerp(grassB, j);
        if (cy > 1.0) c.lerp(new THREE.Color('#9ad97c'), 0.35);
      }
      for (let k = 0; k < 3; k++) c.toArray(colors, (f + k) * 3);
    }
    ng.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    ng.computeVertexNormals();
    return ng;
  }, []);
  return (
    <mesh geometry={geometry} onClick={onTap}>
      <meshStandardMaterial vertexColors flatShading roughness={0.95} />
    </mesh>
  );
}

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

function Water({ tint, animate, onTap, glow = 0 }) {
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
    float d = length(vXZ / vec2(13.0, 9.5));
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

function ribbon(points, width, out) {
  const base = out.pos.length / 3;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const nx = -tz * (width / 2);
    const nz = tx * (width / 2);
    for (const sgn of [1, -1]) {
      const x = points[i].x + nx * sgn;
      const z = points[i].z + nz * sgn;
      out.pos.push(x, groundY(x, z) + 0.06, z);
    }
    if (i < n - 1) {
      const k = base + i * 2;
      out.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
}

function SandPaths() {
  const geometry = useMemo(() => {
    const out = { pos: [], idx: [] };
    for (const key of Object.keys(ZONES)) {
      const c = zonePathCurve(key);
      if (c) ribbon(c.getSpacedPoints(28), 0.75, out);
    }
    ribbon(ringPoints(HUB_RADIUS, 80), 0.8, out);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
    g.setIndex(out.idx);
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#f6e3b4" roughness={1} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Palms (instanced), flowers, rocks
// ---------------------------------------------------------------------------

const FRONDS = 7;
const BEND = 0.3;

function makeTrunkGeometry() {
  const g = new THREE.CylinderGeometry(0.09, 0.15, 1, 6, 4);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + BEND * y * y);
  }
  g.computeVertexNormals();
  return g;
}

function makeFrondGeometry() {
  const v = [
    0, 0, 0, // 0 base
    -0.24, 0.8, 0, // 1 left
    0.24, 0.8, 0, // 2 right
    0, 1.7, 0, // 3 tip
    0, 0.8, 0.07, // 4 ridge
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 4, 1, 0, 2, 4, 1, 4, 3, 4, 2, 3]);
  g.computeVertexNormals();
  return g;
}

function Palms({ animate }) {
  const trunkRef = useRef();
  const frondRef = useRef();
  const nutRef = useRef();
  const shadowRef = useRef();
  const trunkGeo = useMemo(makeTrunkGeometry, []);
  const frondGeo = useMemo(makeFrondGeometry, []);
  const nutGeo = useMemo(() => new THREE.IcosahedronGeometry(0.09, 0), []);
  const shadowGeo = useMemo(() => new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), []);

  const palms = useMemo(
    () =>
      PALMS.map((p) => {
        const gy = groundY(p.x, p.z) - 0.05;
        const local = new THREE.Vector3(BEND, p.h, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.tiltDir);
        return { ...p, gy, top: new THREE.Vector3(p.x + local.x, gy + local.y, p.z + local.z), s: p.h / 2.8 };
      }),
    []
  );

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const frondColors = useMemo(() => ['#3f9b4f', '#4fb35a', '#2f8a46', '#5cbf63'].map((c) => new THREE.Color(c)), []);

  useLayoutEffect(() => {
    palms.forEach((p, i) => {
      dummy.position.set(p.x, p.gy, p.z);
      dummy.rotation.set(0, p.tiltDir, 0);
      dummy.scale.set(1, p.h, 1);
      dummy.updateMatrix();
      trunkRef.current.setMatrixAt(i, dummy.matrix);
      trunkRef.current.setColorAt(i, new THREE.Color('#9a6b43').offsetHSL(0, 0, (hash2(p.x, p.z) - 0.5) * 0.08));

      for (let k = 0; k < 3; k++) {
        const a = p.yaw + (k / 3) * Math.PI * 2;
        dummy.position.set(p.top.x + Math.cos(a) * 0.12, p.top.y - 0.08, p.top.z + Math.sin(a) * 0.12);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        nutRef.current.setMatrixAt(i * 3 + k, dummy.matrix);
      }

      dummy.position.set(p.top.x, groundY(p.top.x, p.top.z) + 0.03, p.top.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1.1 * p.s, 1, 1.1 * p.s);
      dummy.updateMatrix();
      shadowRef.current.setMatrixAt(i, dummy.matrix);

      for (let f = 0; f < FRONDS; f++) frondRef.current.setColorAt(i * FRONDS + f, frondColors[(i + f) % frondColors.length]);
    });
    trunkRef.current.instanceMatrix.needsUpdate = true;
    if (trunkRef.current.instanceColor) trunkRef.current.instanceColor.needsUpdate = true;
    nutRef.current.instanceMatrix.needsUpdate = true;
    shadowRef.current.instanceMatrix.needsUpdate = true;
    if (frondRef.current.instanceColor) frondRef.current.instanceColor.needsUpdate = true;
    updateFronds(0);
  }, [palms]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close-up views: palms between the camera and what it's looking at fold
  // their fronds away so they don't block the view.
  const fold = useMemo(() => new Float32Array(palms.length).fill(1), [palms]);
  const controls = useThree((st) => st.controls);
  const seg = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), line: new THREE.Line3(), q: new THREE.Vector3() }), []);

  function updateFolds(camera, dt) {
    const target = controls?.target;
    const close = target && camera.position.distanceTo(target) < 18;
    if (close) {
      seg.line.set(camera.position, target);
    }
    palms.forEach((p, i) => {
      let want = 1;
      if (close) {
        seg.line.closestPointToPoint(p.top, true, seg.q);
        const d = seg.q.distanceTo(p.top);
        const toTarget = p.top.distanceTo(target);
        if (d < 2.4 && toTarget > 1.2) want = 0.15;
      }
      fold[i] += (want - fold[i]) * Math.min(1, dt * 4);
    });
  }

  function updateFronds(t) {
    const mesh = frondRef.current;
    if (!mesh) return;
    palms.forEach((p, i) => {
      for (let f = 0; f < FRONDS; f++) {
        const yaw = p.yaw + (f / FRONDS) * Math.PI * 2 + Math.sin(t * 0.7 + i + f) * 0.035;
        const droop = 0.35 + (f % 2) * 0.18 + Math.sin(t * 0.9 + i * 1.7 + f * 0.6) * 0.05;
        dummy.position.copy(p.top);
        dummy.rotation.set(-Math.PI / 2 - droop * (2 - fold[i]), yaw, 0, 'YXZ');
        dummy.scale.setScalar(p.s * fold[i]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i * FRONDS + f, dummy.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  useFrame((state, delta) => {
    updateFolds(state.camera, animate ? Math.min(delta, 0.1) : 1);
    updateFronds(animate ? state.clock.elapsedTime : 0);
  });

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[trunkGeo, undefined, palms.length]}>
        <meshStandardMaterial flatShading roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={frondRef} args={[frondGeo, undefined, palms.length * FRONDS]}>
        <meshStandardMaterial flatShading roughness={0.8} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={nutRef} args={[nutGeo, M.coconut, palms.length * 3]} />
      <instancedMesh ref={shadowRef} args={[shadowGeo, undefined, palms.length]}>
        <meshBasicMaterial color="#1d3b2a" transparent opacity={0.14} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

function Flowers() {
  const ref = useRef();
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.1, 0), []);
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    FLOWERS.forEach((f, i) => {
      d.position.set(f.x, groundY(f.x, f.z) + 0.08, f.z);
      d.scale.setScalar(f.s);
      d.updateMatrix();
      ref.current.setMatrixAt(i, d.matrix);
      ref.current.setColorAt(i, new THREE.Color(f.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, FLOWERS.length]}>
      <meshStandardMaterial flatShading roughness={0.6} />
    </instancedMesh>
  );
}

function Rocks() {
  const ref = useRef();
  const geo = useMemo(() => new THREE.DodecahedronGeometry(1, 0), []);
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    ROCKS.forEach((r, i) => {
      d.position.set(r.x, Math.max(terrainY(r.x, r.z), -0.3), r.z);
      d.rotation.set(r.rot, r.rot * 2, 0);
      d.scale.set(r.s * 1.3, r.s * 0.7, r.s);
      d.updateMatrix();
      ref.current.setMatrixAt(i, d.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, []);
  return <instancedMesh ref={ref} args={[geo, M.stone, ROCKS.length]} />;
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

function Flag({ p, color, animate, w = 0.6, h = 0.36 }) {
  const ref = useRef();
  useFrame((state) => {
    if (animate && ref.current) ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 2.2) * 0.25;
  });
  return (
    <group position={p}>
      <Cyl p={[0, 0.45, 0]} rt={0.025} h={0.9} m={M.darkWood} />
      <group ref={ref} position={[0, 0.72, 0]}>
        <mesh position={[w / 2, 0, 0]}>
          <boxGeometry args={[w, h, 0.02]} />
          <meshStandardMaterial color={color} flatShading side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

function Lantern({ p, night, color = '#ffcf6b' }) {
  const mat = useGlowMaterial(color, night, 0.15, 1.6);
  return (
    <group position={p}>
      <mesh material={mat}>
        <icosahedronGeometry args={[0.1, 0]} />
      </mesh>
      {night > 0.3 && (
        <mesh>
          <sphereGeometry args={[0.3, 10, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.22 * night} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
    </group>
  );
}

function Tower({ night, animate }) {
  const g = terrainY(0, 0);
  const top = g + TOWER_LEG_H;
  const legs = [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]];
  const ladderBottom = terrainY(0, 1.6);
  const ladderLen = Math.hypot(top - ladderBottom, 0.5);
  const ladderTilt = Math.atan2(0.5, top - ladderBottom);
  const rungs = Math.floor(ladderLen / 0.35);
  return (
    <group>
      {legs.map(([x, z], i) => (
        <Cyl key={i} p={[x, g + TOWER_LEG_H / 2 - 0.2, z]} rt={0.08} rb={0.11} h={TOWER_LEG_H + 0.4} m={M.wood} />
      ))}
      <Box p={[0, g + 1.1, -0.85]} s={[1.7, 0.07, 0.07]} m={M.darkWood} />
      <Box p={[0, g + 1.1, 0.85]} s={[1.7, 0.07, 0.07]} m={M.darkWood} />
      <Box p={[-0.85, g + 1.1, 0]} s={[0.07, 0.07, 1.7]} m={M.darkWood} />
      <Box p={[0.85, g + 1.1, 0]} s={[0.07, 0.07, 1.7]} m={M.darkWood} />
      <Box p={[0, top, 0]} s={[2.2, 0.16, 2.2]} m={M.plank} />
      <Box p={[0, top + 0.34, -1.05]} s={[2.2, 0.06, 0.06]} m={M.wood} />
      <Box p={[-1.05, top + 0.34, 0]} s={[0.06, 0.06, 2.2]} m={M.wood} />
      <Box p={[1.05, top + 0.34, 0]} s={[0.06, 0.06, 2.2]} m={M.wood} />
      {[[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]].map(([x, z], i) => (
        <Cyl key={`p${i}`} p={[x, top + 0.68, z]} rt={0.05} h={1.36} m={M.wood} />
      ))}
      <Roof p={[0, top + 1.36 + 0.55, 0]} halfX={1.35} halfZ={1.35} h={1.1} m={M.thatch} />
      <Roof p={[0, top + 1.36 + 0.2, 0]} halfX={1.5} halfZ={1.5} h={0.45} m={M.thatchDark} />
      <Flag p={[0, top + 1.36 + 1.05, 0]} color="#D63AF9" animate={animate} />
      {/* ladder on the south side */}
      <group position={[0, (top + ladderBottom) / 2, 1.35]} rotation={[-ladderTilt, 0, 0]}>
        <Box p={[-0.24, 0, 0]} s={[0.06, ladderLen, 0.06]} m={M.darkWood} />
        <Box p={[0.24, 0, 0]} s={[0.06, ladderLen, 0.06]} m={M.darkWood} />
        {Array.from({ length: rungs }, (_, i) => (
          <Box key={i} p={[0, -ladderLen / 2 + 0.25 + i * 0.35, 0]} s={[0.48, 0.04, 0.05]} m={M.wood} />
        ))}
      </group>
      <Lantern p={[1.0, top + 1.2, 1.0]} night={night} />
      <Lantern p={[-1.0, top + 1.2, 1.0]} night={night} />
    </group>
  );
}

function Cabana({ night }) {
  const cx = -6.5;
  const cz = -4.5;
  const g = groundY(cx, cz);
  return (
    <group position={[cx, g, cz]}>
      <Box p={[0, 0.08, 0]} s={[4.4, 0.22, 3.2]} m={M.plank} />
      {[[-2, -1.4], [2, -1.4], [-2, 1.4], [2, 1.4]].map(([x, z], i) => (
        <Cyl key={i} p={[x, 1.1, z]} rt={0.08} h={2.1} m={M.wood} />
      ))}
      <Roof p={[0, 2.15 + 0.62, 0]} halfX={2.55} halfZ={1.95} h={1.3} m={M.thatch} />
      <Roof p={[0, 2.12 + 0.18, 0]} halfX={2.8} halfZ={2.15} h={0.42} m={M.thatchDark} />
      {/* LISN banner under the front of the roof */}
      <Box p={[0, 1.88, 1.46]} s={[1.9, 0.36, 0.05]} m={M.lisnGreen} />
      <Box p={[0, 1.76, 1.49]} s={[1.9, 0.07, 0.03]} m={M.lisnOrange} />
      {/* work table + laptops */}
      <Box p={[0, 0.75, -0.4]} s={[2.8, 0.08, 0.75]} m={M.wood} />
      {[[-1.3, -0.7], [1.3, -0.7], [-1.3, -0.1], [1.3, -0.1]].map(([x, z], i) => (
        <Box key={`l${i}`} p={[x, 0.45, z]} s={[0.07, 0.6, 0.07]} m={M.darkWood} />
      ))}
      {[-0.9, 0, 0.9].map((x, i) => (
        <group key={`lap${i}`} position={[x, 0.8, -0.4]}>
          <Box p={[0, 0, 0.05]} s={[0.42, 0.03, 0.28]} m={M.dark} />
          <Box p={[0, 0.14, -0.1]} s={[0.42, 0.28, 0.02]} r={[-0.25, 0, 0]} m={M.screen} />
        </group>
      ))}
      {/* Duvall TV monitor */}
      <group position={[-1.55, 0, -1.2]}>
        <Box p={[0, 0.65, 0]} s={[0.07, 1.1, 0.07]} m={M.dark} />
        <Box p={[0, 1.3, 0]} s={[1.0, 0.64, 0.07]} m={M.dark} />
        <Box p={[0, 1.3, 0.04]} s={[0.9, 0.54, 0.02]} m={M.screenDTV} />
      </group>
      {/* surfboard */}
      <mesh position={[2.45, 0.85, 0.6]} rotation={[0, 0.3, 0.22]} scale={[0.22, 0.95, 0.05]} material={M.lisnOrange}>
        <sphereGeometry args={[1, 10, 8]} />
      </mesh>
      <Lantern p={[-2, 1.75, 1.4]} night={night} />
      <Lantern p={[2, 1.75, 1.4]} night={night} />
    </group>
  );
}

function Lanai({ night, animate }) {
  const deck = DECKS.find((d) => d.id === 'lanai');
  const cx = (deck.x0 + deck.x1) / 2;
  const cz = (deck.z0 + deck.z1) / 2;
  const w = deck.x1 - deck.x0;
  const d = deck.z1 - deck.z0;
  const y = deck.y;
  const stilts = [];
  for (const x of [deck.x0 + 0.2, cx - 0.9, cx + 0.9, deck.x1 - 0.2]) for (const z of [deck.z0 + 0.2, cz, deck.z1 - 0.2]) stilts.push([x, z]);
  const railPosts = [];
  for (let z = deck.z0 + 0.1; z <= deck.z1; z += 0.9) railPosts.push([deck.x1 - 0.08, z]);
  for (let x = deck.x0 + 1.2; x < deck.x1; x += 0.9) {
    railPosts.push([x, deck.z0 + 0.08]);
    railPosts.push([x, deck.z1 - 0.08]);
  }
  const rampBottom = Math.max(terrainY(deck.x0 - 0.9, 1.0), 0);
  const rampAngle = Math.atan2(y - rampBottom, 0.9);
  return (
    <group>
      <Box p={[cx, y - 0.07, cz]} s={[w, 0.14, d]} m={M.plank} />
      {stilts.map(([x, z], i) => (
        <Cyl key={i} p={[x, y - 0.75, z]} rt={0.09} h={1.4} m={M.darkWood} />
      ))}
      {railPosts.map(([x, z], i) => (
        <Box key={`r${i}`} p={[x, y + 0.25, z]} s={[0.07, 0.5, 0.07]} m={M.wood} />
      ))}
      <Box p={[deck.x1 - 0.08, y + 0.5, cz]} s={[0.06, 0.06, d]} m={M.wood} />
      <Box p={[cx + 0.6, y + 0.5, deck.z0 + 0.08]} s={[w - 1.2, 0.06, 0.06]} m={M.wood} />
      <Box p={[cx + 0.6, y + 0.5, deck.z1 - 0.08]} s={[w - 1.2, 0.06, 0.06]} m={M.wood} />
      {/* steps up from the sand */}
      <Box p={[deck.x0 - 0.45, (y + rampBottom) / 2, 1.0]} s={[Math.hypot(0.9, y - rampBottom), 0.08, 1.2]} r={[0, 0, rampAngle]} m={M.plank} />
      {/* desk */}
      <Box p={[cx, y + 0.62, -0.5]} s={[4.0, 0.07, 0.6]} m={M.wood} />
      {[-1.9, 1.9].map((x, i) => (
        <Box key={`dl${i}`} p={[cx + x, y + 0.31, -0.5]} s={[0.07, 0.6, 0.5]} m={M.darkWood} />
      ))}
      {[-1.2, 0, 1.2].map((x, i) => (
        <group key={`lap${i}`} position={[cx + x, y + 0.67, -0.5]}>
          <Box p={[0, 0, 0.05]} s={[0.42, 0.03, 0.28]} m={M.dark} />
          <Box p={[0, 0.14, -0.1]} s={[0.42, 0.28, 0.02]} r={[-0.25, 0, 0]} m={M.screen} />
        </group>
      ))}
      {/* Buddy Buck Show umbrella */}
      <group position={[deck.x1 - 0.9, y, deck.z1 - 0.8]}>
        <Cyl p={[0, 1.0, 0]} rt={0.035} h={2.0} m={M.white} />
        <Cone p={[0, 2.05, 0]} rad={1.15} h={0.45} m={M.bbBlue} />
        <Cone p={[0, 2.3, 0]} rad={0.3} h={0.18} m={M.bbYellow} />
      </group>
      <Flag p={[deck.x1 - 0.1, y, deck.z0 + 0.1]} color="#FFDE69" animate={animate} />
      <Lantern p={[deck.x1 - 0.08, y + 0.6, deck.z0 + 0.1]} night={night} />
      <Lantern p={[deck.x1 - 0.08, y + 0.6, deck.z1 - 0.1]} night={night} />
    </group>
  );
}

function Torch({ p, night, animate }) {
  const flame = useRef();
  const mat = useGlowMaterial('#ff8a2a', night, 0.6, 1.4);
  useFrame((state) => {
    if (!animate || !flame.current) return;
    const t = state.clock.elapsedTime;
    flame.current.scale.set(1, 1 + Math.sin(t * 9 + p[0]) * 0.15 + Math.sin(t * 13) * 0.08, 1);
  });
  return (
    <group position={p}>
      <Cyl p={[0, 0.65, 0]} rt={0.04} rb={0.06} h={1.3} m={M.bamboo} />
      <Cyl p={[0, 1.33, 0]} rt={0.1} rb={0.07} h={0.16} m={M.darkWood} />
      <mesh ref={flame} position={[0, 1.52, 0]} material={mat}>
        <coneGeometry args={[0.09, 0.26, 5]} />
      </mesh>
      {night > 0.3 && (
        <mesh position={[0, 1.5, 0]}>
          <sphereGeometry args={[0.35, 10, 8]} />
          <meshBasicMaterial color="#ff9a3c" transparent opacity={0.2 * night} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
    </group>
  );
}

function TikiHut({ night, animate }) {
  const cx = 0.5;
  const cz = 6.8;
  const g = groundY(cx, cz);
  return (
    <group>
      <group position={[cx, g, cz]}>
        <Cyl p={[0, 0.55, 0]} rt={1.02} rb={1.08} h={1.1} seg={10} m={M.bamboo} />
        <Box p={[0, 0.42, 1.03]} s={[0.5, 0.8, 0.06]} m={M.darkWood} />
        <Cone p={[0, 1.1 + 0.72, 0]} rad={1.55} h={1.45} seg={10} m={M.thatch} />
        <Cone p={[0, 1.1 + 0.25, 0]} rad={1.72} h={0.5} seg={10} m={M.thatchDark} />
      </group>
      <Torch p={[-1.6, groundY(-1.6, 7.2), 7.2]} night={night} animate={animate} />
      <Torch p={[2.7, groundY(2.7, 6.6), 6.6]} night={night} animate={animate} />
    </group>
  );
}

function MoneyDesk({ night }) {
  const cx = -9.5;
  const cz = 0.5;
  const g = groundY(cx, cz);
  return (
    <group position={[cx, g, cz]}>
      <Cyl p={[0, 0.36, 0]} rt={0.06} h={0.72} m={M.darkWood} />
      <Cyl p={[0, 0.74, 0]} rt={0.58} h={0.06} seg={10} m={M.white} />
      <Cyl p={[0, 1.3, 0]} rt={0.03} h={2.6} m={M.white} />
      <Cone p={[0, 2.3, 0]} rad={1.2} h={0.45} m={M.lisnGreen} />
      <Cone p={[0, 2.56, 0]} rad={0.25} h={0.16} m={M.white} />
      {/* stacks of cash */}
      {[[-0.22, 0.1, 2], [0.08, 0.22, 3], [0.22, -0.1, 1]].map(([x, z, n], i) => (
        <group key={i} position={[x, 0.77, z]} rotation={[0, i * 0.5, 0]}>
          <Box p={[0, n * 0.025, 0]} s={[0.2, n * 0.05, 0.1]} m={M.cash} />
          <Box p={[0, n * 0.025, 0]} s={[0.05, n * 0.05 + 0.004, 0.104]} m={M.cashBand} />
        </group>
      ))}
      <Lantern p={[0.4, 0.86, -0.2]} night={night} />
    </group>
  );
}

function Boat({ animate }) {
  const ref = useRef();
  useFrame((state) => {
    if (!animate || !ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y = 0.12 + Math.sin(t * 1.1) * 0.05;
    ref.current.rotation.z = Math.sin(t * 0.9) * 0.035;
    ref.current.rotation.x = Math.sin(t * 0.7 + 1) * 0.025;
  });
  return (
    <group ref={ref} position={[-15.4, 0.12, 5.95]}>
      <Box p={[0, 0, 0]} s={[1.8, 0.34, 0.8]} m={M.white} />
      <Box p={[0, 0.05, 0]} s={[1.82, 0.08, 0.82]} m={M.launch} />
      <mesh position={[1.15, 0, 0]} rotation={[0, 0, -Math.PI / 2]} material={M.white} scale={[0.57, 1, 0.57]}>
        <coneGeometry args={[0.7, 0.5, 4]} />
      </mesh>
      <Box p={[-0.3, 0.2, 0]} s={[0.7, 0.06, 0.6]} m={M.plank} />
      <Cyl p={[0.2, 0.75, 0]} rt={0.025} h={1.2} m={M.darkWood} />
      <mesh position={[0.45, 1.05, 0]} material={M.launch}>
        <boxGeometry args={[0.45, 0.28, 0.02]} />
      </mesh>
    </group>
  );
}

function Dock({ night, animate }) {
  const deck = DECKS.find((d) => d.id === 'dock');
  const cx = (deck.x0 + deck.x1) / 2;
  const cz = (deck.z0 + deck.z1) / 2;
  const y = deck.y;
  const rampBottom = Math.max(terrainY(deck.x1 + 0.8, cz), 0);
  const rampAngle = Math.atan2(y - rampBottom, 0.8);
  return (
    <group>
      <Box p={[cx, y - 0.05, cz]} s={[deck.x1 - deck.x0, 0.1, deck.z1 - deck.z0]} m={M.plank} />
      {[-16.3, -14.7, -13.1, -11.5].flatMap((x) =>
        [deck.z0 + 0.05, deck.z1 - 0.05].map((z) => <Cyl key={`${x}${z}`} p={[x, y - 0.55, z]} rt={0.08} h={1.3} m={M.darkWood} />)
      )}
      <Box p={[deck.x1 + 0.4, (y + rampBottom) / 2, cz]} s={[Math.hypot(0.8, y - rampBottom), 0.08, 1.2]} r={[0, 0, -rampAngle]} m={M.plank} />
      <Boat animate={animate} />
      <Cyl p={[-16.3, y + 0.25, deck.z1 - 0.05]} rt={0.09} h={0.5} m={M.darkWood} />
      <Lantern p={[-16.3, y + 0.6, deck.z1 - 0.05]} night={night} />
    </group>
  );
}

function Bungalow({ night }) {
  const cx = 1.8;
  const cz = -7.3;
  const g = groundY(cx, cz);
  const windowMat = useGlowMaterial('#ffd27a', night, 0.05, 1.5);
  return (
    <group position={[cx, g, cz]}>
      {[[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]].map(([x, z], i) => (
        <Cyl key={i} p={[x, 0.14, z]} rt={0.07} h={0.4} m={M.darkWood} />
      ))}
      <Box p={[0, 0.3, 0.15]} s={[2.0, 0.1, 1.8]} m={M.plank} />
      <Box p={[0, 0.9, 0]} s={[1.7, 1.1, 1.3]} m={M.white} />
      <Roof p={[0, 1.45 + 0.42, 0]} halfX={1.15} halfZ={0.95} h={0.85} m={M.thatch} />
      <Box p={[0, 0.75, 0.66]} s={[0.42, 0.8, 0.04]} m={M.darkWood} />
      <Box p={[-0.55, 1.0, 0.66]} s={[0.36, 0.3, 0.04]} m={windowMat} />
      <Box p={[0.55, 1.0, 0.66]} s={[0.36, 0.3, 0.04]} m={windowMat} />
    </group>
  );
}

function Lookout({ night, animate }) {
  const cx = 5.2;
  const cz = -3.0;
  const g = terrainY(cx, cz);
  const top = g + LOOKOUT_H;
  const rampFoot = groundY(cx, -1.0);
  const rampLen = Math.hypot(1.25, top - rampFoot);
  const rampAngle = Math.atan2(top - rampFoot, 1.25);
  return (
    <group>
      <group position={[cx, g, cz]}>
        {[[-0.85, -0.65], [0.85, -0.65], [-0.85, 0.65], [0.85, 0.65]].map(([x, z], i) => (
          <Cyl key={i} p={[x, (LOOKOUT_H + 0.55) / 2 - 0.1, z]} rt={0.07} h={LOOKOUT_H + 0.6} m={M.wood} />
        ))}
        <Box p={[0, LOOKOUT_H, 0]} s={[1.9, 0.12, 1.5]} m={M.plank} />
        <Box p={[0, LOOKOUT_H + 0.45, -0.68]} s={[1.75, 0.06, 0.06]} m={M.wood} />
        <Box p={[-0.88, LOOKOUT_H + 0.45, 0]} s={[0.06, 0.06, 1.3]} m={M.wood} />
        <Box p={[0.88, LOOKOUT_H + 0.45, 0]} s={[0.06, 0.06, 1.3]} m={M.wood} />
        {/* telescope */}
        <group position={[0.6, LOOKOUT_H + 0.06, -0.45]}>
          <Cyl p={[0, 0.3, 0]} rt={0.02} h={0.6} m={M.dark} />
          <Cyl p={[0, 0.65, 0]} rt={0.05} rb={0.07} h={0.6} r={[0.9, 0.6, 0]} m={M.bbBlue} />
        </group>
        <Flag p={[-0.85, LOOKOUT_H + 0.06, -0.65]} color="#2BA84A" animate={animate} w={0.5} h={0.3} />
        <Lantern p={[0.88, LOOKOUT_H + 0.62, 0.65]} night={night} />
      </group>
      {/* ramp down to the sand path */}
      <group position={[cx, (top + rampFoot) / 2, cz + 0.75 + 0.625]} rotation={[rampAngle, 0, 0]}>
        <Box p={[0, 0, 0]} s={[0.62, 0.07, rampLen]} m={M.plank} />
        {Array.from({ length: 5 }, (_, i) => (
          <Box key={i} p={[0, 0.05, -rampLen / 2 + 0.25 + i * (rampLen - 0.5) / 4]} s={[0.62, 0.04, 0.06]} m={M.darkWood} />
        ))}
      </group>
    </group>
  );
}

// Nasty's umbrella: red and white striped canopy with a navy crown dotted
// with little white stars. The vibe, not a literal flag.
const CANOPY = (() => {
  const seg = 14;
  const g = new THREE.CylinderGeometry(0.46, 1.25, 0.34, seg, 1, true).toNonIndexed();
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  const red = new THREE.Color('#c8202f');
  const white = new THREE.Color('#fbf7ef');
  for (let i = 0; i < n; i++) (Math.floor(i / 6) % 2 ? white : red).toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
})();
const CANOPY_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, side: THREE.DoubleSide });
const NAVY = std('#1f3a8a');
const STAR_GEO = new THREE.OctahedronGeometry(0.045, 0).scale(1, 0.4, 1);

function StarsAndStripesCanopy() {
  return (
    <group position={[0, 1.98, 0]}>
      <mesh geometry={CANOPY} material={CANOPY_MAT} />
      <Cone p={[0, 0.27, 0]} rad={0.5} h={0.2} seg={14} m={NAVY} />
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return <mesh key={i} geometry={STAR_GEO} material={M.white} position={[Math.cos(a) * 0.3, 0.25, Math.sin(a) * 0.3]} rotation={[0.38 * Math.sin(a), a, -0.38 * Math.cos(a)]} />;
      })}
      <mesh geometry={STAR_GEO} material={M.white} position={[0, 0.38, 0]} />
      <Cyl p={[0, 0.42, 0]} rt={0.04} h={0.08} m={M.white} />
    </group>
  );
}

function BeachChair() {
  const cx = 8.6;
  const cz = 6.0;
  const g = groundY(cx, cz);
  const backAngle = 1.0;
  return (
    <group position={[cx, g, cz]}>
      <Box p={[0, 0.28, 0.12]} s={[0.66, 0.07, 1.05]} m={M.nasty} />
      <Box p={[0, 0.3, 0.12]} s={[0.2, 0.072, 1.06]} m={M.white} />
      <group position={[0, 0.3, -0.4]} rotation={[backAngle, 0, 0]}>
        <Box p={[0, 0, -0.36]} s={[0.66, 0.07, 0.72]} m={M.nasty} />
        <Box p={[0, 0.002, -0.36]} s={[0.2, 0.072, 0.73]} m={M.white} />
      </group>
      {[[-0.3, 0.55], [0.3, 0.55], [-0.3, -0.35], [0.3, -0.35]].map(([x, z], i) => (
        <Box key={i} p={[x, 0.13, z]} s={[0.05, 0.26, 0.05]} m={M.white} />
      ))}
      <group position={[0.9, 0, -0.5]} rotation={[0, 0, -0.12]}>
        <Cyl p={[0, 1.0, 0]} rt={0.03} h={2.0} m={M.white} />
        <StarsAndStripesCanopy />
      </group>
      {/* a cooler (Nasty keeps the coconut in hand) */}
      <group position={[-0.75, 0, 0.3]}>
        <Box p={[0, 0.13, 0]} s={[0.42, 0.26, 0.3]} m={M.white} />
        <Box p={[0, 0.28, 0]} s={[0.44, 0.05, 0.32]} m={M.nasty} />
      </group>
      {/* a fantasy football on the sand */}
      <mesh position={[-0.6, 0.1, 1.0]} rotation={[0, 0.6, 0]} scale={[0.17, 0.11, 0.11]} material={M.football}>
        <sphereGeometry args={[1, 8, 6]} />
      </mesh>
    </group>
  );
}

// Claude's VIP guest bungalow: a cozy little hut with a porch, a lei-pink
// door, glowing windows at night, potted plants and a "Welcome Claude" sign.
function GuestBungalow({ night, onTap, showSign }) {
  const zone = ZONES.guestdesk;
  const cx = zone.x;
  const cz = zone.z;
  const g = groundY(cx, cz);
  const windowMat = useGlowMaterial('#ffe1b8', night, 0.08, 1.5);
  const signX = -1.55;
  const signZ = 0.95;
  const signTagPos = [signX, 1.3, signZ];
  return (
    <group position={[cx, g, cz]}>
      {/* stilts and porch deck */}
      {[[-0.85, -0.55], [0.85, -0.55], [-0.85, 0.95], [0.85, 0.95]].map(([x, z], i) => (
        <Cyl key={i} p={[x, 0.02, z]} rt={0.06} h={0.3} m={M.darkWood} />
      ))}
      <Box p={[0, 0.1, 0.2]} s={[1.95, 0.08, 1.75]} m={M.plank} />
      {/* walls, door and windows */}
      <Box p={[0, 0.66, -0.15]} s={[1.6, 1.05, 1.0]} m={M.white} />
      <Box p={[0.15, 0.55, 0.36]} s={[0.4, 0.78, 0.04]} m={M.claude} />
      <Box p={[-0.48, 0.78, 0.36]} s={[0.36, 0.3, 0.04]} m={windowMat} />
      <Box p={[0.65, 0.78, 0.36]} s={[0.22, 0.3, 0.04]} m={windowMat} />
      <Box p={[-0.81, 0.78, -0.15]} s={[0.04, 0.3, 0.4]} m={windowMat} />
      {/* thatch roof with a little overhang over the porch */}
      <Roof p={[0, 1.18 + 0.4, -0.05]} halfX={1.1} halfZ={0.9} h={0.8} m={M.thatch} />
      <Roof p={[0, 1.18 + 0.1, -0.05]} halfX={1.22} halfZ={1.02} h={0.3} m={M.thatchDark} />
      {/* porch posts and a lantern */}
      <Cyl p={[-0.85, 0.62, 0.95]} rt={0.04} h={1.0} m={M.wood} />
      <Cyl p={[0.85, 0.62, 0.95]} rt={0.04} h={1.0} m={M.wood} />
      <Box p={[0, 1.1, 0.95]} s={[1.8, 0.06, 0.06]} m={M.wood} />
      <Lantern p={[0.85, 1.25, 0.95]} night={night} />
      {/* a hanging lei garland over the door */}
      {Array.from({ length: 7 }, (_, i) => {
        const x = -0.3 + i * 0.1 + 0.15;
        const y = 1.02 - Math.sin((i / 6) * Math.PI) * 0.1;
        return (
          <mesh key={i} position={[x, y, 0.39]} material={i % 2 ? M.shell : M.claudeSoft}>
            <icosahedronGeometry args={[0.04, 0]} />
          </mesh>
        );
      })}
      {/* potted plants by the steps */}
      {[-0.65, 0.95].map((x, i) => (
        <group key={i} position={[x, 0.14, 1.0]}>
          <Cyl p={[0, 0.08, 0]} rt={0.09} rb={0.07} h={0.16} seg={8} m={M.claude} />
          <Cone p={[0, 0.28, 0]} rad={0.13} h={0.3} seg={6} m={M.launch} />
        </group>
      ))}
      {/* welcome sign on a post */}
      <group position={[signX, 0, signZ]} rotation={[0, 0.35, 0]}>
        <Cyl p={[0, 0.45, 0]} rt={0.035} h={0.9} m={M.darkWood} />
        <Box p={[0, 0.88, 0.02]} s={[0.78, 0.32, 0.05]} m={M.plank} />
        <Box p={[0, 0.88, 0.05]} s={[0.66, 0.22, 0.01]} m={M.white} />
      </group>
      {showSign && <WelcomeSign onTap={onTap} position={signTagPos} />}
    </group>
  );
}

function WelcomeSign({ onTap, position }) {
  const zone = ZONES.guestdesk;
  const g = groundY(zone.x, zone.z);
  const world = useMemo(() => [zone.x + position[0], g + position[1], zone.z + position[2]], [zone, g, position]);
  // Rendered in island space so the tag lines up with the label director.
  return (
    <group position={[-zone.x, -g, -zone.z]}>
      <ZoneTag zoneKey="guestdesk" tagKey="welcome" zone={zone} label="Welcome Claude" className="welcome-sign" position={world} onZoneTap={onTap} />
    </group>
  );
}

// A clickable tag floating over a zone. tagKey is its slot in the label
// director (so tags never overlap); zoneKey is where tapping flies to.
function ZoneTag({ zoneKey, tagKey = zoneKey, zone, label = zone.label, position, className = '', onZoneTap }) {
  const ref = useRef();
  const pos = useMemo(() => position || [zone.x, groundY(zone.x, zone.z) + zone.labelY, zone.z], [zone, position]);
  useEffect(() => {
    labelState.zones.set(tagKey, { x: pos[0], y: pos[1], z: pos[2], name: label });
    return () => labelState.zones.delete(tagKey);
  }, [tagKey, pos, label]);
  // Hide this tag while it would overlap a nearer one (the label director decides).
  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    const show = labelState.visibleZones.has(tagKey);
    const op = show ? '1' : '0';
    if (el.style.opacity !== op) {
      el.style.opacity = op;
      el.style.pointerEvents = show ? 'auto' : 'none';
      el.tabIndex = show ? 0 : -1;
    }
  });
  return (
    <Html position={pos} center zIndexRange={[10, 0]}>
      <button
        ref={ref}
        type="button"
        className={`zone-tag ${className}`}
        style={{ opacity: 0 }}
        onClick={(e) => {
          e.stopPropagation();
          onZoneTap?.(zoneKey);
        }}
      >
        {label}
      </button>
    </Html>
  );
}

function ZoneLabels({ onZoneTap }) {
  return Object.entries(ZONES)
    .filter(([, z]) => !z.noLabel)
    .map(([key, z]) => <ZoneTag key={key} zoneKey={key} zone={z} onZoneTap={onZoneTap} />);
}

// ---------------------------------------------------------------------------

export default function Island({ sky, animate = true, onGroundTap, onZoneTap, showLabels = true, lowPower = false }) {
  const night = sky.stars;
  return (
    <group>
      <Terrain onTap={onGroundTap} />
      <Water tint={sky.water} animate={animate} onTap={onGroundTap} glow={animate && !lowPower ? sky.stars : 0} />
      <Foam animate={animate} />
      <SandPaths />
      <Palms animate={animate} />
      <Flowers />
      <Rocks />
      <Tower night={night} animate={animate} />
      <Cabana night={night} />
      <Lanai night={night} animate={animate} />
      <TikiHut night={night} animate={animate} />
      <MoneyDesk night={night} />
      <Dock night={night} animate={animate} />
      <Bungalow night={night} />
      <Lookout night={night} animate={animate} />
      <BeachChair />
      <GuestBungalow night={night} onTap={onZoneTap} showSign={showLabels} />
      {showLabels && <ZoneLabels onZoneTap={onZoneTap} />}
    </group>
  );
}
