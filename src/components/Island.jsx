import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  CABANA_DESK_Z,
  CABANA_STATIONS,
  DECKS,
  DOCK,
  PATIO_LOUNGERS,
  SITES,
  TOWER_SEATS,
  FLOWERS,
  HUB_RADIUS,
  ISLAND,
  LOOKOUT_H,
  PALMS,
  ROCKS,
  TOWER_LEG_H,
  ZONES,
  groundY,
  inSandPatch,
  islandE,
  islandWobble,
  ringPoints,
  terrainY,
  zonePathCurve,
} from '../utils/paths.js';
import { labelState } from './labels.js';
import { isIslandNight } from '../wild/director.js';
import Water from '../world/Water.jsx';
import FloVilla, { FLO_TAG_Y } from '../world/landmarks/FloVilla.jsx';
import {
  BambooPost,
  Beam,
  Box,
  Cone,
  Cyl,
  Flag,
  Fringe,
  Lantern,
  M,
  StringLights,
  Torch,
  TowerChair,
  brandTexture,
  canvasTexture,
  pointer,
  tap,
  hash2,
  std,
  useGlowMaterial,
  HELIPAD,
  helipadState,
} from '../world/landmarks/kit.jsx';

// The building kit lives in world/landmarks/kit.jsx; older imports read the
// brand screens from here.
export { brandTexture };

// ---------------------------------------------------------------------------
// Lanai laptops
// ---------------------------------------------------------------------------

const BRANDS = ['bb', 'dtv', 'lis'];
const SCREEN_GEO = new THREE.PlaneGeometry(0.38, 0.25);

function useBrandMaterials(night) {
  const mats = useMemo(
    () =>
      BRANDS.map((k) => {
        const map = brandTexture(k);
        return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.6 });
      }),
    []
  );
  useEffect(() => {
    mats.forEach((m) => (m.emissiveIntensity = 0.55 + night * 0.5));
  }, [mats, night]);
  useEffect(() => () => mats.forEach((m) => (m.map.dispose(), m.dispose())), [mats]);
  return mats;
}

// A laptop whose screen shows a brand logo. The logos rotate between the
// laptops every few seconds so all three brands get screen time.
function BrandLaptop({ p, index, mats, animate }) {
  const screen = useRef();
  useFrame((state) => {
    if (!screen.current) return;
    const step = animate ? Math.floor(state.clock.elapsedTime / 8) : 0;
    const m = mats[(index + step) % mats.length];
    if (screen.current.material !== m) screen.current.material = m;
  });
  return (
    <group position={p}>
      <Box p={[0, 0, 0.05]} s={[0.42, 0.03, 0.28]} m={M.dark} />
      <group position={[0, 0.14, -0.1]} rotation={[-0.25, 0, 0]}>
        <Box p={[0, 0, 0]} s={[0.42, 0.28, 0.02]} m={M.dark} />
        <mesh ref={screen} position={[0, 0, 0.0115]} geometry={SCREEN_GEO} material={mats[index % mats.length]} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Ground, water, foam, paths
// ---------------------------------------------------------------------------

function Terrain({ onTap }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(56, 46, 112, 92);
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
      } else if (e > 0.8 || inSandPatch(cx, cz)) {
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



// Helipad on top of Chief's Tower: the thatch is cut flat and a round pad
// sits on steel struts above it. Green edge lights glow at night, a windsock
// shows the breeze, and the helicopter's downwash ripples the thatch.
// Looking straight down (the reduced-motion view), the pad fades so Chief
// and Claude's chairs still show through it.
const PAD_THATCH_TOP = 1.15; // half-width of the thatch's flat top
const PAD_THATCH_RISE = 0.62;
const PAD_T = 0.14;
const THATCH_FRUSTUM = new THREE.CylinderGeometry(PAD_THATCH_TOP * Math.SQRT2, 2.2 * Math.SQRT2, PAD_THATCH_RISE, 4, 1, true).rotateY(Math.PI / 4);
const PAD_GEO = new THREE.CylinderGeometry(HELIPAD.r, HELIPAD.r * 0.97, PAD_T, 28);
const PAD_RING = new THREE.RingGeometry(1.0, 1.08, 40).rotateX(-Math.PI / 2);
const PAD_EDGE = new THREE.RingGeometry(1.3, 1.4, 40).rotateX(-Math.PI / 2);
const PAD_NET = new THREE.RingGeometry(HELIPAD.r, HELIPAD.r + 0.3, 28, 2).rotateX(-Math.PI / 2);
const PAD_HALO = new THREE.RingGeometry(1.2, 1.75, 40).rotateX(-Math.PI / 2);
const RIPPLE_GEO = new THREE.RingGeometry(0.93, 1.0, 36).rotateX(-Math.PI / 2);
const PAD_LIGHT_GEO = new THREE.IcosahedronGeometry(0.045, 0);
const PAD_LIGHTS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  return [Math.cos(a) * (HELIPAD.r - 0.05), Math.sin(a) * (HELIPAD.r - 0.05)];
});
const PAD_M = {
  deck: std('#5d636b', { transparent: true }),
  white: std('#f4f1ea', { transparent: true, side: THREE.DoubleSide }),
  yellow: std('#ffd23a', { transparent: true, side: THREE.DoubleSide }),
  steel: std('#7d858e', { roughness: 0.5, metalness: 0.3 }),
  net: std('#d9c79a', { wireframe: true }),
  sock: std('#ff7a1a', { side: THREE.DoubleSide }),
  halo: new THREE.MeshBasicMaterial({ color: '#5dff8f', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }),
};
const RIPPLE_MATS = [0, 1].map(() => new THREE.MeshBasicMaterial({ color: '#fff3c9', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
const FADE_MATS = [PAD_M.deck, PAD_M.white, PAD_M.yellow];

function Helipad({ canopyY, night, animate }) {
  const padY = HELIPAD.y;
  const top = canopyY + PAD_THATCH_RISE;
  const lightMat = useGlowMaterial('#5dff8f', night, 0.3, 2.0);
  const thatch = useRef();
  const sock = useRef();
  const ripples = [useRef(), useRef()];
  const fx = useMemo(() => ({ fade: 0 }), []);
  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    const wash = helipadState.wash || 0;
    // Steep top-down view: fade the pad so the chairs show.
    const cam = state.camera.position;
    const dist = Math.hypot(cam.x, cam.y - padY, cam.z) || 1;
    const steep = Math.min(1, Math.max(0, ((cam.y - padY) / dist - 0.78) / 0.14));
    if (Math.abs(steep - fx.fade) > 0.01) {
      fx.fade = steep;
      for (const m of FADE_MATS) m.opacity = 1 - steep * 0.7;
    }
    if (thatch.current) {
      const k = 1 + wash * 0.025 * Math.sin(t * 31);
      thatch.current.scale.set(k, 1 - wash * 0.03, k);
    }
    ripples.forEach((r, i) => {
      if (!r.current) return;
      const ph = (t * 0.9 + i * 0.5) % 1;
      const rad = PAD_THATCH_TOP * 1.2 + ph * 1.2;
      r.current.visible = wash > 0.02;
      r.current.scale.setScalar(rad);
      r.current.position.y = top + 0.03 - (rad - PAD_THATCH_TOP) * (PAD_THATCH_RISE / (2.2 - PAD_THATCH_TOP));
      r.current.material.opacity = wash * 0.45 * (1 - ph);
    });
    if (sock.current) {
      // Gentle breeze; the rotor wash makes it flap hard.
      sock.current.rotation.y = 0.6 + Math.sin(t * 0.13) * 0.5 + wash * Math.sin(t * 17) * 0.5;
      sock.current.rotation.z = -0.25 + Math.sin(t * 1.3) * 0.08 - wash * 0.2;
    }
  });
  useEffect(() => {
    PAD_M.halo.opacity = 0.22 * night;
  }, [night]);
  return (
    <group>
      {/* thatch skirt, cut flat on top */}
      <mesh ref={thatch} geometry={THATCH_FRUSTUM} material={M.thatchSeeTower} position={[0, canopyY + PAD_THATCH_RISE / 2, 0]} renderOrder={2} />
      {/* struts from the corner posts and from the thatch top up to the pad */}
      {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z], i) => (
        <group key={i}>
          <Beam a={[x * 1.5, canopyY, z * 1.5]} b={[x * 0.92, padY - PAD_T, z * 0.92]} r={0.045} m={PAD_M.steel} />
          <Beam a={[x * PAD_THATCH_TOP * 0.95, top - 0.05, z * PAD_THATCH_TOP * 0.95]} b={[x * 0.85, padY - PAD_T, z * 0.85]} r={0.035} m={PAD_M.steel} />
        </group>
      ))}
      <mesh position={[0, padY - PAD_T - 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} material={PAD_M.steel}>
        <torusGeometry args={[1.22, 0.04, 4, 24]} />
      </mesh>
      {/* the pad, with its markings */}
      <mesh geometry={PAD_GEO} material={PAD_M.deck} position={[0, padY - PAD_T / 2, 0]} />
      <mesh geometry={PAD_EDGE} material={PAD_M.white} position={[0, padY + 0.004, 0]} />
      <mesh geometry={PAD_RING} material={PAD_M.yellow} position={[0, padY + 0.004, 0]} />
      <Box p={[-0.24, padY + 0.008, 0]} s={[0.13, 0.012, 0.78]} m={PAD_M.yellow} />
      <Box p={[0.24, padY + 0.008, 0]} s={[0.13, 0.012, 0.78]} m={PAD_M.yellow} />
      <Box p={[0, padY + 0.008, 0]} s={[0.36, 0.012, 0.12]} m={PAD_M.yellow} />
      {/* safety net and rim */}
      <mesh geometry={PAD_NET} material={PAD_M.net} position={[0, padY - 0.1, 0]} />
      <mesh position={[0, padY - 0.1, 0]} rotation={[Math.PI / 2, 0, 0]} material={PAD_M.steel}>
        <torusGeometry args={[HELIPAD.r + 0.3, 0.025, 4, 32]} />
      </mesh>
      {PAD_LIGHTS.map(([x, z], i) => (
        <mesh key={i} geometry={PAD_LIGHT_GEO} material={lightMat} position={[x, padY + 0.04, z]} />
      ))}
      {night > 0.2 && <mesh geometry={PAD_HALO} material={PAD_M.halo} position={[0, padY + 0.03, 0]} />}
      {ripples.map((r, i) => (
        <mesh key={i} ref={r} geometry={RIPPLE_GEO} material={RIPPLE_MATS[i]} visible={false} />
      ))}
      {/* windsock on the north-west edge, Chief's flag on the north-east */}
      <group position={[-1.25, padY, -0.7]}>
        <Cyl p={[0, 0.38, 0]} rt={0.02} h={0.76} m={PAD_M.steel} />
        <group ref={sock} position={[0, 0.72, 0]}>
          <mesh position={[0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={PAD_M.sock}>
            <cylinderGeometry args={[0.07, 0.035, 0.4, 7, 1, true]} />
          </mesh>
          <mesh position={[0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={PAD_M.white}>
            <cylinderGeometry args={[0.057, 0.048, 0.09, 7, 1, true]} />
          </mesh>
        </group>
      </group>
      <Flag p={[1.25, padY, -0.7]} color="#D63AF9" animate={animate} />
    </group>
  );
}

const TOWER_HALF = 1.55;

function Tower({ night, animate }) {
  const g = terrainY(0, 0);
  const top = g + TOWER_LEG_H;
  const deckTop = top + 0.08;
  const L = TOWER_HALF - 0.15;
  const legs = [[-L, -L], [L, -L], [-L, L], [L, L]];
  const ladderX = 1.0;
  const ladderBottom = terrainY(ladderX, TOWER_HALF + 0.6);
  const ladderLen = Math.hypot(top - ladderBottom, 0.5);
  const ladderTilt = Math.atan2(0.5, top - ladderBottom);
  const rungs = Math.floor(ladderLen / 0.35);
  const postH = 2.05;
  const canopyY = deckTop + postH;
  const braceY0 = g + 0.4;
  const braceY1 = top - 0.25;
  return (
    <group>
      {/* bamboo legs with cross braces */}
      {legs.map(([x, z], i) => (
        <BambooPost key={i} p={[x, g - 0.2, z]} h={TOWER_LEG_H + 0.2} r={0.11} />
      ))}
      {[
        [[-L, braceY0, -L], [L, braceY1, -L]], [[L, braceY0, -L], [-L, braceY1, -L]],
        [[-L, braceY0, L], [L, braceY1, L]], [[L, braceY0, L], [-L, braceY1, L]],
        [[-L, braceY0, -L], [-L, braceY1, L]], [[-L, braceY0, L], [-L, braceY1, -L]],
        [[L, braceY0, -L], [L, braceY1, L]], [[L, braceY0, L], [L, braceY1, -L]],
      ].map(([a, b], i) => (
        <Beam key={`b${i}`} a={a} b={b} r={0.035} m={M.bambooNode} />
      ))}
      {/* deck with plank lines */}
      <Box p={[0, top, 0]} s={[TOWER_HALF * 2, 0.16, TOWER_HALF * 2]} m={M.plank} />
      {[-1.0, -0.33, 0.33, 1.0].map((x) => (
        <Box key={`pl${x}`} p={[x, top + 0.081, 0]} s={[0.03, 0.005, TOWER_HALF * 2 - 0.05]} m={M.darkWood} />
      ))}
      {/* low bamboo rail: open on every side so the chairs show */}
      {[
        [[-TOWER_HALF, deckTop + 0.45, -TOWER_HALF], [TOWER_HALF, deckTop + 0.45, -TOWER_HALF]],
        [[-TOWER_HALF, deckTop + 0.45, -TOWER_HALF], [-TOWER_HALF, deckTop + 0.45, TOWER_HALF]],
        [[TOWER_HALF, deckTop + 0.45, -TOWER_HALF], [TOWER_HALF, deckTop + 0.45, TOWER_HALF]],
        [[-TOWER_HALF, deckTop + 0.45, TOWER_HALF], [ladderX - 0.4, deckTop + 0.45, TOWER_HALF]],
      ].map(([a, b], i) => (
        <Beam key={`r${i}`} a={a} b={b} r={0.03} m={M.bamboo} />
      ))}
      {/* tall corner posts holding the canopy up high */}
      {legs.map(([x, z], i) => (
        <BambooPost key={`cp${i}`} p={[x * 1.07, deckTop, z * 1.07]} h={postH} r={0.07} />
      ))}
      {/* see-through thatch on bamboo rafters, cut flat on top for the helipad */}
      {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z], i) => (
        <Beam key={`raf${i}`} a={[x * 2.15, canopyY + 0.02, z * 2.15]} b={[x * PAD_THATCH_TOP, canopyY + PAD_THATCH_RISE, z * PAD_THATCH_TOP]} r={0.04} m={M.bambooNode} />
      ))}
      <Helipad canopyY={canopyY} night={night} animate={animate} />
      <Fringe p={[0, canopyY, 0]} halfX={2.2} halfZ={2.2} drop={0.3} m={M.thatchSeeTower} />
      <StringLights
        points={[[-L * 1.07, canopyY - 0.12, L * 1.07], [L * 1.07, canopyY - 0.12, L * 1.07], [L * 1.07, canopyY - 0.12, -L * 1.07], [-L * 1.07, canopyY - 0.12, -L * 1.07], [-L * 1.07, canopyY - 0.12, L * 1.07]]}
        sag={0.2}
        per={5}
        night={night}
      />
      {/* two chairs, a little table between them */}
      <TowerChair seat={TOWER_SEATS[0]} top={deckTop} cushion={M.chief} />
      <TowerChair seat={TOWER_SEATS[1]} top={deckTop} cushion={M.claude} />
      <group position={[0, deckTop, 0.42]}>
        <Cyl p={[0, 0.2, 0]} rt={0.04} h={0.4} m={M.darkWood} />
        <Cyl p={[0, 0.42, 0]} rt={0.26} h={0.05} seg={10} m={M.bamboo} />
        <mesh position={[-0.08, 0.5, 0.02]} material={M.coconut}>
          <icosahedronGeometry args={[0.08, 0]} />
        </mesh>
        <mesh position={[0.09, 0.52, -0.04]} material={M.lisnOrange}>
          <icosahedronGeometry args={[0.07, 0]} />
        </mesh>
      </group>
      {/* brass telescope on a tripod, aimed out to sea */}
      <group position={[1.05, deckTop, -1.0]} rotation={[0, 2.4, 0]}>
        {[0, 2.1, 4.2].map((a, i) => (
          <Cyl key={i} p={[Math.sin(a) * 0.12, 0.3, Math.cos(a) * 0.12]} rt={0.015} h={0.62} m={M.darkWood} r={[Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2]} />
        ))}
        <Cyl p={[0, 0.72, 0.1]} rt={0.045} rb={0.065} h={0.7} m={M.brass} r={[1.25, 0, 0]} />
      </group>
      {/* ladder on the south side */}
      <group position={[ladderX, (top + ladderBottom) / 2, TOWER_HALF + 0.15]} rotation={[-ladderTilt, 0, 0]}>
        <Box p={[-0.24, 0, 0]} s={[0.06, ladderLen, 0.06]} m={M.darkWood} />
        <Box p={[0.24, 0, 0]} s={[0.06, ladderLen, 0.06]} m={M.darkWood} />
        {Array.from({ length: rungs }, (_, i) => (
          <Box key={i} p={[0, -ladderLen / 2 + 0.25 + i * 0.35, 0]} s={[0.48, 0.04, 0.05]} m={M.wood} />
        ))}
      </group>
      <Lantern p={[L, canopyY - 0.35, L]} night={night} />
      <Lantern p={[-L, canopyY - 0.35, L]} night={night} />
      <Lantern p={[L, canopyY - 0.35, -L]} night={night} />
      <Lantern p={[-L, canopyY - 0.35, -L]} night={night} />
    </group>
  );
}

// Content Cabana: wider now, with a double-sided work table inside (three
// workstations a side). The rest of the content crew works the beach patio
// next door.
const CAB_HX = 2.8;
const CAB_HZ = 1.9;

function Cabana({ night }) {
  const zone = ZONES.cabana;
  const cx = zone.x;
  const cz = zone.z;
  const g = groundY(cx, cz);
  const eaveY = 2.15;
  const apexY = 3.6;
  const hx = CAB_HX + 0.35;
  const hz = CAB_HZ + 0.4;
  const corners = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  const ridgeX = 1.2;
  const px = CAB_HX - 0.15;
  const pz = CAB_HZ - 0.15;
  return (
    <group position={[cx, g, cz]}>
      {/* deck with a woven mat */}
      <Box p={[0, 0.08, 0]} s={[CAB_HX * 2, 0.22, CAB_HZ * 2]} m={M.plank} />
      <Box p={[0, 0.195, 0]} s={[CAB_HX * 2 - 0.6, 0.02, CAB_HZ * 2 - 0.6]} m={M.mat} />
      {[-1.8, -0.6, 0.6, 1.8].map((x, i) => (
        <Box key={`ms${i}`} p={[x, 0.2, 0]} s={[0.12, 0.02, CAB_HZ * 2 - 0.6]} m={M.matStripe} />
      ))}
      {/* bamboo posts: corners plus one mid-span each long side */}
      {[[-px, -pz], [px, -pz], [-px, pz], [px, pz], [0, -pz], [0, pz]].map(([x, z], i) => (
        <BambooPost key={i} p={[x, 0.15, z]} h={2.05} r={0.09} />
      ))}
      <Beam a={[-px - 0.1, 2.12, -pz]} b={[px + 0.1, 2.12, -pz]} r={0.05} m={M.bamboo} />
      <Beam a={[-px - 0.1, 2.12, pz]} b={[px + 0.1, 2.12, pz]} r={0.05} m={M.bamboo} />
      <Beam a={[-px, 2.12, -pz - 0.1]} b={[-px, 2.12, pz + 0.1]} r={0.05} m={M.bamboo} />
      <Beam a={[px, 2.12, -pz - 0.1]} b={[px, 2.12, pz + 0.1]} r={0.05} m={M.bamboo} />
      {/* hip rafters + ridge under see-through thatch */}
      {corners.map(([x, z], i) => (
        <Beam key={`hr${i}`} a={[x, eaveY, z]} b={[Math.sign(x) * ridgeX, apexY, 0]} r={0.045} m={M.bambooNode} />
      ))}
      <Beam a={[-ridgeX - 0.1, apexY, 0]} b={[ridgeX + 0.1, apexY, 0]} r={0.06} m={M.bambooNode} />
      {[-2.0, -1.0, 0, 1.0, 2.0].flatMap((x) =>
        [-1, 1].map((sz) => (
          <Beam key={`cr${x}${sz}`} a={[x, eaveY, sz * hz]} b={[Math.max(-ridgeX, Math.min(ridgeX, x)), apexY, 0]} r={0.025} m={M.bamboo} />
        ))
      )}
      <CabanaThatch eaveY={eaveY} apexY={apexY} hx={hx} hz={hz} ridgeX={ridgeX} />
      <Fringe p={[0, eaveY, 0]} halfX={hx} halfZ={hz} drop={0.32} m={M.thatchSee} />
      {/* LISN banner under the front of the roof */}
      <Box p={[0, 1.9, pz + 0.06]} s={[1.9, 0.36, 0.05]} m={M.lisnGreen} />
      <Box p={[0, 1.78, pz + 0.09]} s={[1.9, 0.07, 0.03]} m={M.lisnOrange} />
      {/* double-sided work table with six laptops */}
      <Box p={[0, 0.75, CABANA_DESK_Z]} s={[4.3, 0.08, 0.95]} m={M.wood} />
      {[[-2.0, -0.35], [2.0, -0.35], [-2.0, 0.35], [2.0, 0.35]].map(([x, z], i) => (
        <Box key={`l${i}`} p={[x, 0.45, CABANA_DESK_Z + z]} s={[0.07, 0.6, 0.07]} m={M.bamboo} />
      ))}
      {CABANA_STATIONS.map((s, i) => (
        <group key={`lap${i}`} position={[s.x, 0.8, CABANA_DESK_Z + Math.sign(s.z) * 0.24]} rotation={[0, s.z < 0 ? Math.PI : 0, 0]}>
          <Box p={[0, 0, 0.05]} s={[0.42, 0.03, 0.28]} m={M.dark} />
          <Box p={[0, 0.14, -0.1]} s={[0.42, 0.28, 0.02]} r={[-0.25, 0, 0]} m={M.screen} />
        </group>
      ))}
      {/* Duvall TV monitor on the west end */}
      <group position={[-px + 0.25, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <Box p={[0, 0.65, 0]} s={[0.07, 1.1, 0.07]} m={M.dark} />
        <Box p={[0, 1.3, 0]} s={[1.0, 0.64, 0.07]} m={M.dark} />
        <Box p={[0, 1.3, 0.04]} s={[0.9, 0.54, 0.02]} m={M.screenDTV} />
      </group>
      {/* surfboard leaning on the east end */}
      <mesh position={[px + 0.35, 0.85, 0.9]} rotation={[0, 0.3, 0.22]} scale={[0.22, 0.95, 0.05]} material={M.lisnOrange}>
        <sphereGeometry args={[1, 10, 8]} />
      </mesh>
      <StringLights points={[[-px, 2.0, pz], [px, 2.0, pz], [px, 2.0, -pz], [-px, 2.0, -pz], [-px, 2.0, pz]]} sag={0.22} per={7} night={night} />
      <Lantern p={[-px, 1.75, pz]} night={night} />
      <Lantern p={[px, 1.75, pz]} night={night} />
    </group>
  );
}

// Hip roof (ridge along x) as four see-through thatch panels.
function CabanaThatch({ eaveY, apexY, hx, hz, ridgeX }) {
  const geo = useMemo(() => {
    const A = [-hx, eaveY, -hz];
    const B = [hx, eaveY, -hz];
    const C = [hx, eaveY, hz];
    const D = [-hx, eaveY, hz];
    const R0 = [-ridgeX, apexY, 0];
    const R1 = [ridgeX, apexY, 0];
    const tris = [
      A, R0, B, B, R0, R1, // back
      D, C, R0, C, R1, R0, // front
      A, D, R0, // left hip
      B, R1, C, // right hip
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
    g.computeVertexNormals();
    return g;
  }, [eaveY, apexY, hx, hz, ridgeX]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={M.thatchSee} renderOrder={3} />;
}

// Beach patio next to the cabana: five loungers facing the water, with
// LISN-striped umbrellas and a little side table.
function Lounger({ s, color }) {
  return (
    <group position={[s.x, 0, s.z]} rotation={[0, s.rotY, 0]}>
      <Box p={[0, 0.26, 0.12]} s={[0.62, 0.07, 1.0]} m={color} />
      <Box p={[0, 0.28, 0.12]} s={[0.18, 0.072, 1.01]} m={M.white} />
      <group position={[0, 0.28, -0.38]} rotation={[1.0, 0, 0]}>
        <Box p={[0, 0, -0.34]} s={[0.62, 0.07, 0.68]} m={color} />
        <Box p={[0, 0.002, -0.34]} s={[0.18, 0.072, 0.69]} m={M.white} />
      </group>
      {[[-0.28, 0.52], [0.28, 0.52], [-0.28, -0.32], [0.28, -0.32]].map(([x, z], i) => (
        <Box key={i} p={[x, 0.12, z]} s={[0.05, 0.24, 0.05]} m={M.bamboo} />
      ))}
    </group>
  );
}

function PatioUmbrella({ x, z, color }) {
  return (
    <group position={[x, groundY(x, z), z]}>
      <Cyl p={[0, 1.0, 0]} rt={0.03} h={2.0} m={M.white} />
      <Cone p={[0, 2.05, 0]} rad={0.95} h={0.4} seg={8} m={color} />
      <Cone p={[0, 2.28, 0]} rad={0.18} h={0.14} seg={8} m={M.white} />
    </group>
  );
}

function Patio() {
  const zone = ZONES.patio;
  const colors = [M.lisnOrange, M.lisnGreen, M.lisnOrange, M.lisnGreen, M.lisnOrange];
  return (
    <group>
      {PATIO_LOUNGERS.map((s) => {
        const x = zone.x + s.x;
        const z = zone.z + s.z;
        return (
          <group key={s.i} position={[0, groundY(x, z), 0]}>
            <Lounger s={{ ...s, x, z }} color={colors[s.i]} />
          </group>
        );
      })}
      {[-1.95, 0.65].map((dx, i) => (
        <PatioUmbrella key={i} x={zone.x + dx} z={zone.z + 0.75} color={i ? M.lisnGreen : M.lisnOrange} />
      ))}
      <group position={[zone.x + 1.95, groundY(zone.x + 1.95, zone.z + 0.9), zone.z + 0.9]}>
        <Cyl p={[0, 0.2, 0]} rt={0.03} h={0.4} m={M.bamboo} />
        <Cyl p={[0, 0.42, 0]} rt={0.2} h={0.04} seg={8} m={M.bamboo} />
        <mesh position={[0, 0.5, 0]} material={M.coconut}>
          <icosahedronGeometry args={[0.07, 0]} />
        </mesh>
      </group>
    </group>
  );
}

function Lanai({ night, animate }) {
  const brandMats = useBrandMaterials(night);
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
  const rampZ = (deck.ramp.z0 + deck.ramp.z1) / 2;
  const rampBottom = Math.max(terrainY(deck.x0 - 0.9, rampZ), 0);
  const rampAngle = Math.atan2(y - rampBottom, 0.9);
  return (
    <group>
      <Box p={[cx, y - 0.07, cz]} s={[w, 0.14, d]} m={M.plank} />
      {stilts.map(([x, z], i) => (
        <Cyl key={i} p={[x, y - 0.75, z]} rt={0.09} h={1.4} m={M.darkWood} />
      ))}
      {railPosts.map(([x, z], i) => (
        <Cyl key={`r${i}`} p={[x, y + 0.25, z]} rt={0.04} h={0.5} m={M.bamboo} />
      ))}
      <Beam a={[deck.x1 - 0.08, y + 0.5, deck.z0]} b={[deck.x1 - 0.08, y + 0.5, deck.z1]} r={0.035} m={M.bamboo} />
      <Beam a={[deck.x0 + 1.2, y + 0.5, deck.z0 + 0.08]} b={[deck.x1, y + 0.5, deck.z0 + 0.08]} r={0.035} m={M.bamboo} />
      <Beam a={[deck.x0 + 1.2, y + 0.5, deck.z1 - 0.08]} b={[deck.x1, y + 0.5, deck.z1 - 0.08]} r={0.035} m={M.bamboo} />
      {/* tall bamboo poles at the deck corners carry the string lights */}
      {[[deck.x0 + 0.15, deck.z0 + 0.15], [deck.x1 - 0.15, deck.z0 + 0.15], [deck.x1 - 0.15, deck.z1 - 0.15], [deck.x0 + 0.15, deck.z1 - 0.15]].map(([x, z], i) => (
        <BambooPost key={`lp${i}`} p={[x, y, z]} h={2.0} r={0.06} />
      ))}
      <StringLights
        points={[[deck.x0 + 0.15, y + 1.95, deck.z1 - 0.15], [deck.x0 + 0.15, y + 1.95, deck.z0 + 0.15], [deck.x1 - 0.15, y + 1.95, deck.z0 + 0.15], [deck.x1 - 0.15, y + 1.95, deck.z1 - 0.15]]}
        sag={0.3}
        per={8}
        night={night}
      />
      {/* woven rug under the desk */}
      <Box p={[cx, y + 0.01, cz + 0.1]} s={[4.4, 0.02, 2.4]} m={M.mat} />
      {[-1.6, -0.5, 0.5, 1.6].map((x, i) => (
        <Box key={`rs${i}`} p={[cx + x, y + 0.022, cz + 0.1]} s={[0.14, 0.02, 2.4]} m={M.matStripe} />
      ))}
      {/* steps up from the sand */}
      <Box p={[deck.x0 - 0.45, (y + rampBottom) / 2, rampZ]} s={[Math.hypot(0.9, y - rampBottom), 0.08, 1.2]} r={[0, 0, rampAngle]} m={M.plank} />
      {/* desk */}
      <Box p={[cx, y + 0.62, -0.5]} s={[4.0, 0.07, 0.6]} m={M.wood} />
      {[-1.9, 1.9].map((x, i) => (
        <Box key={`dl${i}`} p={[cx + x, y + 0.31, -0.5]} s={[0.07, 0.6, 0.5]} m={M.darkWood} />
      ))}
      {[-1.2, 0, 1.2].map((x, i) => (
        <BrandLaptop key={`lap${i}`} p={[cx + x, y + 0.67, -0.5]} index={i} mats={brandMats} animate={animate} />
      ))}
      {/* Buddy Buck Show umbrella */}
      <group position={[deck.x1 - 0.9, y, deck.z1 - 0.8]}>
        <Cyl p={[0, 1.0, 0]} rt={0.035} h={2.0} m={M.white} />
        <Cone p={[0, 2.05, 0]} rad={1.15} h={0.45} m={M.bbBlue} />
        <Fringe p={[0, 1.83, 0]} halfX={1.15} halfZ={1.15} drop={0.14} round m={M.bbYellow} />
        <Cone p={[0, 2.3, 0]} rad={0.3} h={0.18} m={M.bbYellow} />
      </group>
      <Flag p={[deck.x1 - 0.1, y, deck.z0 + 0.1]} color="#FFDE69" animate={animate} />
      <Lantern p={[deck.x1 - 0.08, y + 0.6, deck.z0 + 0.1]} night={night} />
      <Lantern p={[deck.x1 - 0.08, y + 0.6, deck.z1 - 0.1]} night={night} />
    </group>
  );
}


function TikiHut({ night, animate }) {
  const cx = ZONES.tikihut.x;
  const cz = ZONES.tikihut.z;
  const t1 = [cx - 2.1, cz + 0.4];
  const t2 = [cx + 2.2, cz - 0.2];
  const g = groundY(cx, cz);
  // String lights from each torch up onto the thatch and round the front of
  // the roof: they stay above the heads of the crew standing out front.
  const lights = useMemo(() => {
    const roof = (a) => [cx + Math.cos(a) * 1.05, g + 1.63, cz + Math.sin(a) * 1.05];
    return [[t1[0], groundY(...t1) + 1.36, t1[1]], roof(2.5), roof(1.95), roof(Math.PI / 2), roof(1.2), roof(0.55), [t2[0], groundY(...t2) + 1.36, t2[1]]];
  }, [cx, cz, g]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      <group position={[cx, g, cz]}>
        <Cyl p={[0, 0.55, 0]} rt={1.02} rb={1.08} h={1.1} seg={10} m={M.bamboo} />
        <Box p={[0, 0.42, 1.03]} s={[0.5, 0.8, 0.06]} m={M.darkWood} />
        <Cone p={[0, 1.1 + 0.72, 0]} rad={1.55} h={1.45} seg={10} m={M.thatch} />
        <Cone p={[0, 1.1 + 0.25, 0]} rad={1.72} h={0.5} seg={10} m={M.thatchDark} />
        <Fringe p={[0, 1.1, 0]} halfX={1.7} halfZ={1.7} drop={0.3} round />
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return <Cyl key={i} p={[Math.cos(a) * 1.09, 0.55, Math.sin(a) * 1.09]} rt={0.045} h={1.1} m={i % 2 ? M.bambooNode : M.bambooGreen} />;
        })}
      </group>
      <StringLights points={lights} sag={0.06} per={3} night={night} />
      <Torch p={[t1[0], groundY(...t1), t1[1]]} night={night} animate={animate} />
      <Torch p={[t2[0], groundY(...t2), t2[1]]} night={night} animate={animate} />
    </group>
  );
}

// Benji's Money Desk: piled high. Tall stacks of banded cash (one instanced
// mesh, the band baked in with vertex colors), a few bundles spilled on the
// desk and the sand, a pallet of cash, stacks of gold coins (one more
// instanced mesh), gold bars and a fat money bag with a $ on it. Benji's
// spot on the north side stays clear. Tap the desk for a close-up.
const BRICK = { w: 0.2, h: 0.05, d: 0.1 };
const BRICK_GEO = (() => {
  const g = new THREE.BoxGeometry(BRICK.w, BRICK.h, BRICK.d, 3, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (Math.abs(Math.abs(x) - BRICK.w / 6) < 1e-4) pos.setX(i, Math.sign(x) * 0.026);
  }
  const flat = g.toNonIndexed();
  g.dispose();
  const p = flat.attributes.position;
  const col = new Float32Array(p.count * 3);
  const cash = new THREE.Color('#5fae6e');
  const cashTop = new THREE.Color('#7cc78a');
  const band = new THREE.Color('#fff7e0');
  for (let f = 0; f < p.count; f += 3) {
    const cx = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3;
    const top = p.getY(f) > 0.02 && p.getY(f + 1) > 0.02 && p.getY(f + 2) > 0.02;
    const c = Math.abs(cx) < 0.026 ? band : top ? cashTop : cash;
    for (let k = 0; k < 3; k++) c.toArray(col, (f + k) * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(col, 3));
  flat.computeVertexNormals();
  return flat;
})();
const COIN_GEO = new THREE.CylinderGeometry(0.038, 0.038, 0.012, 9);
const MONEY_M = {
  brick: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }),
  gold: std('#ffd03a', { roughness: 0.35, metalness: 0.15, emissive: '#b98200', emissiveIntensity: 0.4 }),
  bag: std('#c9a46a'),
  bagDark: std('#8a6a3c'),
  pallet: std('#b48a5a'),
};

// Deterministic jitter so the piles look the same every visit.
const jit = (i, k = 1) => (Math.sin(i * 91.17 + k * 13.3) * 43758.5453) % 1;

// [x, y, z, rotY, tiltX, tiltZ] in the desk's frame (desk top at 0.77).
const DESK_TOP = 0.77;
const MONEY_BRICKS = (() => {
  const out = [];
  // tall stacks on the west, east and south of the desk top
  [
    [-0.36, 0.02, 11, 0.2],
    [0.3, 0.22, 9, -0.4],
    [-0.2, 0.26, 7, 0.9],
    [-0.06, 0.4, 4, 0.1],
    [0.12, 0.08, 5, 1.4],
    [0.15, 0.38, 3, -0.2],
    [-0.3, -0.16, 6, 0.6],
    [0.27, 0.4, 5, 1.0],
  ].forEach(([x, z, n, r], si) => {
    for (let i = 0; i < n; i++) {
      const j = si * 20 + i;
      out.push([x + jit(j) * 0.012, DESK_TOP + BRICK.h * (i + 0.5), z + jit(j, 2) * 0.012, r + jit(j, 3) * 0.12, 0, 0]);
    }
  });
  // spilled bundles: one sliding off the desk edge, a few on the sand
  out.push([-0.46, DESK_TOP + 0.02, 0.33, 0.8, 0.0, 0.35]);
  out.push([0.45, DESK_TOP + 0.025, 0.12, -1.1, 0, 0]);
  [[0.55, 0.72, 0.4], [-0.62, 0.58, 1.9], [0.08, 0.86, -0.3], [0.32, 0.92, 1.2], [-0.25, 0.8, 2.6], [0.97, 0.8, 2.2]].forEach(([x, z, r], i) =>
    out.push([x, 0.03 + (i % 2) * 0.004, z, r, 0, i % 3 ? 0 : 0.12])
  );
  out.push([0.58, 0.075, 0.74, 1.0, 0, 0]); // one tossed on top
  // a pallet of cash on the sand to the west: 3 x 2 bricks, 4 high
  for (let y = 0; y < 4; y++)
    for (let ix = 0; ix < 3; ix++)
      for (let iz = 0; iz < 2; iz++) {
        if (y === 3 && ix === 2) continue; // top layer half taken already
        out.push([-0.98 + (ix - 1) * 0.105, 0.09 + BRICK.h * (y + 0.5), 0.42 + (iz - 0.5) * 0.21, Math.PI / 2, 0, 0]);
      }
  return out;
})();
const MONEY_COINS = (() => {
  const out = [];
  [[0.2, -0.08, 9], [0.29, 0.0, 6], [0.0, -0.04, 4], [0.98, 0.08, 7], [0.7, 0.86, 5]].forEach(([x, z, n], si) => {
    const y0 = si < 3 ? DESK_TOP : 0.02;
    for (let i = 0; i < n; i++) out.push([x + jit(si * 9 + i) * 0.008, y0 + 0.006 + i * 0.012, z + jit(si * 9 + i, 4) * 0.008, 0, 0]);
  });
  // loose coins on the desk and spilling out of the bag
  for (let i = 0; i < 14; i++) {
    const onDesk = i < 5;
    const a = i * 2.4;
    const r = onDesk ? 0.2 + (i % 3) * 0.08 : 0.3 + (i % 4) * 0.07;
    const x = onDesk ? 0.05 + Math.cos(a) * r * 0.5 : 0.78 + Math.cos(a) * r;
    const z = onDesk ? 0.2 + Math.sin(a) * r * 0.4 : 0.45 + Math.abs(Math.sin(a)) * r;
    out.push([x, (onDesk ? DESK_TOP : 0.015) + 0.006, z, (i % 3) * 0.25, 0.1]);
  }
  return out;
})();
const MONEY_SHOT_POS = (() => {
  const { x, z } = ZONES.moneydesk;
  return { x, z, g: groundY(x, z) };
})();
// Low three-quarter view from the south-east: the piles in front, Benji
// behind the desk, the lantern and the palms on the west side behind.
export const MONEY_SHOT = { target: [MONEY_SHOT_POS.x - 0.05, MONEY_SHOT_POS.g + 0.85, MONEY_SHOT_POS.z + 0.15], dist: 4.2, polar: 1.12, theta: 0.55, hold: 12000 };

function DollarBag() {
  const sign = useMemo(() => {
    const map = canvasTexture(64, 64, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.font = 'bold 54px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#fff3c4';
      ctx.strokeText('$', w / 2, h / 2 + 3);
      ctx.fillStyle = '#2E5248';
      ctx.fillText('$', w / 2, h / 2 + 3);
    });
    return new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.2, roughness: 0.8 });
  }, []);
  useEffect(() => () => (sign.map.dispose(), sign.dispose()), [sign]);
  return (
    <group position={[0.78, 0, 0.42]} rotation={[0, 0.55, 0]}>
      <mesh position={[0, 0.2, 0]} scale={[0.24, 0.21, 0.22]} material={MONEY_M.bag}>
        <icosahedronGeometry args={[1, 1]} />
      </mesh>
      <Cyl p={[0, 0.43, 0]} rt={0.05} rb={0.08} h={0.1} seg={7} m={MONEY_M.bag} />
      <Cyl p={[0, 0.4, 0]} rt={0.085} h={0.03} seg={8} m={MONEY_M.bagDark} />
      <Cone p={[0, 0.52, 0]} rad={0.09} h={0.12} seg={6} m={MONEY_M.bag} r={[Math.PI, 0, 0]} />
      <mesh position={[0, 0.21, 0.216]} rotation={[-0.12, 0, 0]} material={sign}>
        <planeGeometry args={[0.24, 0.24]} />
      </mesh>
    </group>
  );
}

function MoneyDesk({ night, onShot }) {
  const cx = ZONES.moneydesk.x;
  const cz = ZONES.moneydesk.z;
  const g = groundY(cx, cz);
  const bricks = useRef();
  const coins = useRef();
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    MONEY_BRICKS.forEach(([x, y, z, r, tx, tz], i) => {
      d.position.set(x, y, z);
      d.rotation.set(tx, r, tz);
      d.updateMatrix();
      bricks.current.setMatrixAt(i, d.matrix);
    });
    bricks.current.instanceMatrix.needsUpdate = true;
    MONEY_COINS.forEach(([x, y, z, r, tilt], i) => {
      d.position.set(x, y, z);
      d.rotation.set(tilt, r, 0);
      d.updateMatrix();
      coins.current.setMatrixAt(i, d.matrix);
    });
    coins.current.instanceMatrix.needsUpdate = true;
  }, []);
  const onTap = useMemo(() => tap(() => onShot?.(MONEY_SHOT)), [onShot]);
  return (
    <group position={[cx, g, cz]} onClick={onTap} {...pointer}>
      <Cyl p={[0, 0.36, 0]} rt={0.06} h={0.72} m={M.darkWood} />
      <Cyl p={[0, 0.74, 0]} rt={0.58} h={0.06} seg={10} m={M.white} />
      <Cyl p={[0, 1.3, 0]} rt={0.03} h={2.6} m={M.white} />
      <Cone p={[0, 2.3, 0]} rad={1.2} h={0.45} m={M.lisnGreen} />
      <Cone p={[0, 2.56, 0]} rad={0.25} h={0.16} m={M.white} />
      {/* cash: stacks, spills and a pallet (one draw) */}
      <instancedMesh ref={bricks} args={[BRICK_GEO, MONEY_M.brick, MONEY_BRICKS.length]} frustumCulled={false} />
      {/* the pallet under the cash */}
      <Box p={[-0.98, 0.045, 0.42]} s={[0.4, 0.09, 0.5]} m={MONEY_M.pallet} />
      {/* gold coins (one draw) and two gold bars */}
      <instancedMesh ref={coins} args={[COIN_GEO, MONEY_M.gold, MONEY_COINS.length]} frustumCulled={false} />
      <Box p={[0.5, 0.04, 0.95]} s={[0.2, 0.07, 0.09]} r={[0, 0.3, 0]} m={MONEY_M.gold} />
      <Box p={[0.45, 0.11, 0.97]} s={[0.2, 0.07, 0.09]} r={[0, -0.2, 0]} m={MONEY_M.gold} />
      <DollarBag />
      <Lantern p={[0.4, 0.86, -0.2]} night={night} />
    </group>
  );
}

// Buddy's cabin cruiser, moored on the north side of Launch's Pier: a blue
// hull with gold trim, a white cabin and a flybridge. Bobs and rocks gently.
const CRUISER_AT = { x: DOCK.x0 + 3.4, z: DOCK.z0 - 1.25 };

function Cruiser({ animate }) {
  const ref = useRef();
  const sign = useMemo(() => new THREE.MeshStandardMaterial({ map: brandTexture('bb'), roughness: 0.6 }), []);
  useEffect(() => () => (sign.map.dispose(), sign.dispose()), [sign]);
  useFrame((state) => {
    if (!ref.current) return;
    const t = animate ? state.clock.elapsedTime : 0;
    ref.current.position.y = 0.1 + Math.sin(t * 0.9) * 0.06;
    ref.current.rotation.z = Math.sin(t * 0.75) * 0.04;
    ref.current.rotation.x = Math.sin(t * 0.6 + 1) * 0.02;
  });
  // Built pointing along -x (bow out to sea, west).
  return (
    <group position={[CRUISER_AT.x, 0, CRUISER_AT.z]}>
      <group ref={ref}>
        {/* hull */}
        <Box p={[0, 0.05, 0]} s={[3.2, 0.5, 1.25]} m={M.bbBlue} />
        <mesh position={[-2.0, 0.05, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.36, 1, 0.9]} material={M.bbBlue}>
          <coneGeometry args={[0.7, 0.8, 4, 1]} />
        </mesh>
        <Box p={[0, 0.27, 0]} s={[3.24, 0.07, 1.29]} m={M.bbYellow} />
        <mesh position={[-2.0, 0.27, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.1, 1, 0.92]} material={M.bbYellow}>
          <coneGeometry args={[0.7, 0.82, 4, 1]} />
        </mesh>
        <Box p={[0.1, 0.31, 0]} s={[3.1, 0.04, 1.15]} m={M.plank} />
        {/* cabin */}
        <Box p={[-0.2, 0.62, 0]} s={[1.5, 0.58, 1.0]} m={M.white} />
        <Box p={[-0.2, 0.93, 0]} s={[1.62, 0.06, 1.1]} m={M.bbYellow} />
        {[-0.65, -0.2, 0.25].map((x) => (
          <Box key={x} p={[x, 0.68, 0.505]} s={[0.3, 0.2, 0.02]} m={M.porthole} />
        ))}
        {[-0.65, -0.2, 0.25].map((x) => (
          <Box key={`b${x}`} p={[x, 0.68, -0.505]} s={[0.3, 0.2, 0.02]} m={M.porthole} />
        ))}
        <Box p={[-1.0, 0.75, 0]} s={[0.06, 0.32, 0.9]} r={[0, 0, 0.5]} m={M.glass} />
        {/* flybridge with a little wheel */}
        <Box p={[0.15, 1.05, 0]} s={[0.8, 0.16, 0.9]} m={M.white} />
        <Cyl p={[-0.05, 1.22, 0]} rt={0.12} h={0.03} seg={8} m={M.darkWood} r={[0, 0, Math.PI / 2]} />
        <Beam a={[0.55, 1.1, -0.42]} b={[0.55, 1.45, -0.42]} r={0.02} m={M.white} />
        <Beam a={[0.55, 1.1, 0.42]} b={[0.55, 1.45, 0.42]} r={0.02} m={M.white} />
        <Box p={[0.55, 1.47, 0]} s={[0.5, 0.04, 0.95]} m={M.bbBlue} />
        {/* stern rail, antenna and gold pennant */}
        <Beam a={[1.55, 0.36, -0.55]} b={[1.55, 0.36, 0.55]} r={0.02} m={M.bbYellow} />
        <Cyl p={[0.55, 1.8, 0.3]} rt={0.012} h={0.7} m={M.white} />
        <Box p={[0.68, 2.05, 0.3]} s={[0.24, 0.13, 0.01]} m={M.bbYellow} />
        {/* BB on the transom */}
        <mesh position={[1.61, 0.08, 0]} rotation={[0, Math.PI / 2, 0]} material={sign}>
          <planeGeometry args={[0.6, 0.34]} />
        </mesh>
      </group>
      {/* mooring lines to the pier */}
      <Beam a={[-1.1, 0.35, 0.6]} b={[-1.1, DOCK.y + 0.25, DOCK.z0 - CRUISER_AT.z + 0.1]} r={0.012} m={M.rope} />
      <Beam a={[1.2, 0.35, 0.6]} b={[1.2, DOCK.y + 0.25, DOCK.z0 - CRUISER_AT.z + 0.1]} r={0.012} m={M.rope} />
    </group>
  );
}

// Red and white life ring (striped with vertex colors).
const LIFE_RING_GEO = (() => {
  const g = new THREE.TorusGeometry(0.17, 0.05, 6, 16);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const red = new THREE.Color('#e0412f');
  const white = new THREE.Color('#fbf7ef');
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getY(i), pos.getX(i)) + Math.PI;
    (Math.floor(a / (Math.PI / 2) + 0.25) % 2 ? white : red).toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
})();
const LIFE_RING_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 });
function Bollard({ p }) {
  return (
    <group position={p}>
      <Cyl p={[0, 0.13, 0]} rt={0.08} rb={0.1} h={0.26} m={M.darkWood} />
      <Cyl p={[0, 0.28, 0]} rt={0.12} h={0.05} m={M.dark} />
    </group>
  );
}

function Dock({ night, animate }) {
  const deck = DOCK;
  const cx = (deck.x0 + deck.x1) / 2;
  const cz = (deck.z0 + deck.z1) / 2;
  const y = deck.y;
  const rampBottom = Math.max(terrainY(deck.x1 + 0.8, cz), 0);
  const rampAngle = Math.atan2(y - rampBottom, 0.8);
  const stiltXs = [];
  for (let x = deck.x0 + 0.15; x < deck.x1; x += 1.6) stiltXs.push(x);
  return (
    <group>
      <Box p={[cx, y - 0.05, cz]} s={[deck.x1 - deck.x0, 0.1, deck.z1 - deck.z0]} m={M.plank} />
      {stiltXs.map((x) => (
        <Box key={`pl${x}`} p={[x + 0.8, y + 0.001, cz]} s={[0.03, 0.005, deck.z1 - deck.z0 - 0.04]} m={M.darkWood} />
      ))}
      {stiltXs.flatMap((x) =>
        [deck.z0 + 0.05, deck.z1 - 0.05].map((z) => <Cyl key={`${x}${z}`} p={[x, y - 0.55, z]} rt={0.09} h={1.3} m={M.darkWood} />)
      )}
      <Box p={[deck.x1 + 0.4, (y + rampBottom) / 2, cz]} s={[Math.hypot(0.8, y - rampBottom), 0.08, deck.z1 - deck.z0]} r={[0, 0, -rampAngle]} m={M.plank} />
      {/* bollards (two hold the cruiser's lines) and lantern posts along the pier */}
      {/* (south side: clear of the fishing spot near the end, two by the
          dock office houseboat) */}
      {[CRUISER_AT.x - 1.1, CRUISER_AT.x + 1.2, deck.x0 + 7.4, deck.x0 + 9.6].map((x) => (
        <Bollard key={`bn${x}`} p={[x, y, deck.z0 + 0.13]} />
      ))}
      {[deck.x0 + 3.2, deck.x0 + 5.4, deck.x0 + 8.2, deck.x1 - 0.6].map((x) => (
        <Bollard key={`bs${x}`} p={[x, y, deck.z1 - 0.13]} />
      ))}
      {[
        [deck.x0 + 0.15, deck.z1 - 0.1],
        [deck.x0 + 0.15, deck.z0 + 0.1],
        [deck.x0 + 4.3, deck.z1 - 0.1],
        [deck.x0 + 6.2, deck.z0 + 0.1],
        [deck.x0 + 8.9, deck.z1 - 0.1],
        [deck.x1 - 0.15, deck.z0 + 0.1],
      ].map(([x, z]) => (
        <group key={`lp${x}${z}`}>
          <Cyl p={[x, y + 0.3, z]} rt={0.06} h={0.6} m={M.darkWood} />
          <Lantern p={[x, y + 0.7, z]} night={night} />
        </group>
      ))}
      {/* a life ring on the end post, a coil of rope and a bait bucket */}
      <group position={[deck.x0 + 0.42, y, deck.z0 + 0.1]}>
        <Cyl p={[0, 0.4, 0]} rt={0.05} h={0.8} m={M.darkWood} />
        <mesh position={[0, 0.5, -0.07]} geometry={LIFE_RING_GEO} material={LIFE_RING_MAT} />
      </group>
      <mesh position={[deck.x0 + 2.1, y + 0.04, deck.z1 - 0.35]} rotation={[Math.PI / 2, 0, 0]} material={M.rope}>
        <torusGeometry args={[0.16, 0.05, 5, 12]} />
      </mesh>
      <Cyl p={[deck.x0 + 6.0, y + 0.1, deck.z1 - 0.3]} rt={0.12} rb={0.1} h={0.2} seg={8} m={M.bbBlue} />
      <Flag p={[deck.x0 + 0.5, y, cz]} color="#2BA84A" animate={animate} />
      <Cruiser animate={animate} />
    </group>
  );
}

// The Research Lookout stands beside the lighthouse and matches it: red
// and white banded posts and rail caps, and a rope-and-plank gangway from
// its east side down to the lighthouse door step.
const LH_RED = std('#d0333a');
const LH_WHITE = std('#fbf7ef');
const GANGWAY = (() => {
  const L = SITES.lighthouse;
  const { x: cx, z: cz } = ZONES.lookout;
  const top = terrainY(cx, cz) + LOOKOUT_H + 0.06;
  const face = Math.atan2(-L.x, -L.z); // the lighthouse door faces the island center
  const a = [cx + 0.95, top, cz - 0.35];
  const b = [L.x + Math.sin(face) * 1.25, 0.74, L.z + Math.cos(face) * 1.25];
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const run = Math.hypot(dx, dz);
  const len = Math.hypot(run, a[1] - b[1]);
  return { a, b, yaw: Math.atan2(dx, dz), pitch: Math.atan2(a[1] - b[1], run), len, run };
})();

function Gangway() {
  const { a, b, yaw, pitch, len } = GANGWAY;
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const n = Math.floor(len / 0.2);
  const side = (s) => [Math.cos(yaw) * s, 0, -Math.sin(yaw) * s];
  const post = (p, s, h) => {
    const o = side(s);
    return [p[0] + o[0], p[1] + h, p[2] + o[2]];
  };
  return (
    <group>
      <group position={mid} rotation={[0, yaw, 0]}>
        <group rotation={[pitch, 0, 0]}>
          {Array.from({ length: n }, (_, i) => (
            <Box key={i} p={[0, 0, -len / 2 + 0.1 + i * (len - 0.2) / (n - 1)]} s={[0.5, 0.04, 0.14]} m={i % 2 ? M.plank : M.wood} />
          ))}
          {[-0.2, 0.2].map((x) => (
            <Box key={x} p={[x, -0.035, 0]} s={[0.04, 0.04, len]} m={M.darkWood} />
          ))}
        </group>
      </group>
      {/* rope hand lines on red and white posts */}
      {[-0.27, 0.27].map((s) => (
        <group key={s}>
          <Beam a={post(a, s, 0.55)} b={post(b, s, 0.55)} r={0.016} m={M.rope} seg={4} />
          <Cyl p={post(b, s, 0.28)} rt={0.035} h={0.56} m={LH_RED} />
          <Cyl p={post(b, s, 0.58)} rt={0.04} h={0.05} m={LH_WHITE} />
        </group>
      ))}
    </group>
  );
}

function Lookout({ night, animate }) {
  const cx = ZONES.lookout.x;
  const cz = ZONES.lookout.z;
  const g = terrainY(cx, cz);
  const top = g + LOOKOUT_H;
  const rampFoot = groundY(cx, cz + 2.0);
  const rampLen = Math.hypot(1.25, top - rampFoot);
  const rampAngle = Math.atan2(top - rampFoot, 1.25);
  return (
    <group>
      <group position={[cx, g, cz]}>
        {[[-0.85, -0.65], [0.85, -0.65], [-0.85, 0.65], [0.85, 0.65]].map(([x, z], i) => (
          <group key={i}>
            <Cyl p={[x, (LOOKOUT_H + 0.55) / 2 - 0.1, z]} rt={0.07} h={LOOKOUT_H + 0.6} m={M.wood} />
            {/* lighthouse bands above the deck */}
            <Cyl p={[x, LOOKOUT_H + 0.2, z]} rt={0.078} h={0.18} m={LH_RED} />
            <Cyl p={[x, LOOKOUT_H + 0.38, z]} rt={0.078} h={0.18} m={LH_WHITE} />
          </group>
        ))}
        <Box p={[0, LOOKOUT_H, 0]} s={[1.9, 0.12, 1.5]} m={M.plank} />
        <Box p={[0, LOOKOUT_H - 0.075, 0]} s={[1.94, 0.05, 1.54]} m={LH_RED} />
        <Box p={[0, LOOKOUT_H + 0.45, -0.68]} s={[1.75, 0.06, 0.06]} m={LH_WHITE} />
        <Box p={[-0.88, LOOKOUT_H + 0.45, 0]} s={[0.06, 0.06, 1.3]} m={LH_WHITE} />
        {/* east rail stops short of the gangway to the lighthouse */}
        <Box p={[0.88, LOOKOUT_H + 0.45, 0.33]} s={[0.06, 0.06, 0.64]} m={LH_WHITE} />
        {/* telescope */}
        <group position={[0.6, LOOKOUT_H + 0.06, -0.45]}>
          <Cyl p={[0, 0.3, 0]} rt={0.02} h={0.6} m={M.dark} />
          <Cyl p={[0, 0.65, 0]} rt={0.05} rb={0.07} h={0.6} r={[0.9, 0.6, 0]} m={M.bbBlue} />
        </group>
        <Flag p={[-0.85, LOOKOUT_H + 0.06, -0.65]} color="#2BA84A" animate={animate} w={0.5} h={0.3} />
        <Lantern p={[0.88, LOOKOUT_H + 0.62, 0.65]} night={night} />
      </group>
      <Gangway />
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
  const cx = ZONES.beachchair.x;
  const cz = ZONES.beachchair.z;
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

// Some tags sit higher than the zone's labelY: Chief's tag floats over the
// helipad (so it never covers the helicopter), Flo's clears her villa roof.
const TAG_POS = {
  tower: [0, HELIPAD.y + 1.9, 0],
  bungalow: [ZONES.bungalow.x, FLO_TAG_Y, ZONES.bungalow.z],
};

// A few landmark tags (tapping one flies there, like a zone tag).
const LANDMARK_TAGS = [
  { key: 'lighthouse', label: 'Lighthouse', pos: [SITES.lighthouse.x, SITES.lighthouse.height + 2.4, SITES.lighthouse.z] },
  { key: 'visitor', label: 'Visitor Center', pos: [SITES.visitor.x, 5.0, SITES.visitor.z] },
  { key: 'runway', label: 'Airstrip', pos: [SITES.runway.x, 2.4, SITES.runway.z] }, // centered over the inland strip
];

function ZoneLabels({ onZoneTap }) {
  return (
    <>
      {Object.entries(ZONES)
        .filter(([, z]) => !z.noLabel)
        .map(([key, z]) => (
          <ZoneTag key={key} zoneKey={key} zone={z} position={TAG_POS[key]} onZoneTap={onZoneTap} />
        ))}
      {LANDMARK_TAGS.map((t) => (
        <ZoneTag key={t.key} zoneKey={t.key} tagKey={`site-${t.key}`} zone={t} label={t.label} position={t.pos} className="zone-tag-landmark" onZoneTap={onZoneTap} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------

// onShot (optional): ask App's camera for a close-up, see MONEY_SHOT and
// FloVilla's GLASS_SHOT.
export default function Island({ sky, animate = true, onGroundTap, onZoneTap, showLabels = true, lowPower = false, onShot }) {
  const night = sky.stars;
  const bedtime = isIslandNight(sky.hour);
  return (
    <group>
      <Terrain onTap={onGroundTap} />
      <Water sky={sky} animate={animate} onTap={onGroundTap} lowPower={lowPower} />
      <SandPaths />
      <Palms animate={animate} />
      <Flowers />
      <Rocks />
      <Tower night={night} animate={animate} />
      <Cabana night={night} />
      <Patio />
      <Lanai night={night} animate={animate} />
      <TikiHut night={night} animate={animate} />
      <MoneyDesk night={night} onShot={onShot} />
      <Dock night={night} animate={animate} />
      <FloVilla night={night} animate={animate} bedtime={bedtime} onShot={onShot} />
      <Lookout night={night} animate={animate} />
      <BeachChair />
      {showLabels && <ZoneLabels onZoneTap={onZoneTap} />}
    </group>
  );
}
