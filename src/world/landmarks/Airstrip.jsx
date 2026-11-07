import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SITES, groundY } from '../../utils/paths.js';
import { aliveClock, claimTravel, releaseTravel, testOn } from '../../wild/director.js';
import { Beam, Box, Cone, Cyl, GLOW_GEO, M, canvasTexture, duskFactor, glowMaterial, std } from './kit.jsx';

// Bot Air: a short island landing strip inland on the east-middle of the
// island, between Chief's Tower and the Real Estate Lanai (SITES.runway).
// Everything is laid out in the footprint's own frame (lx along the strip,
// east +; lz across it, south +) and follows the site if it moves or turns.
// The strip runs along the south half (runway 09 at the west end with a
// turning pad, 27 at the east end), with edge lights; the north half holds
// the windsock, the apron, the hangar and the little control tower.
// The island-hopper parks on the apron nose-south. Every few minutes it
// taxis out, back-tracks to the turning pad, swings round, and takes off
// eastbound, climbing hard over the palms on the east shore before banking
// north over the sea and away. Later it comes back round from the south-east
// over the sea, flies a steep short-field approach over the shore palms
// (staying well north of the lanai), lands westbound, and taxis in.
// ?test=plane2 runs the whole cycle every few seconds.

const S = SITES.runway;
const ROT = S.rotY || 0;
const COS = Math.cos(ROT);
const SIN = Math.sin(ROT);
// footprint frame -> world (same as a group at [S.x, 0, S.z] rotated ROT about y)
const W = (lx, y, lz) => [S.x + lx * COS + lz * SIN, y, S.z - lx * SIN + lz * COS];

// Flat top a little above the highest ground anywhere in the footprint, so no
// grass bump ever pokes through the asphalt.
const BASE = (() => {
  let m = 0;
  for (let i = 0; i <= 48; i++) {
    for (let j = 0; j <= 14; j++) {
      const [x, , z] = W(-S.hx + (2 * S.hx * i) / 48, 0, -S.hz + (2 * S.hz * j) / 14);
      m = Math.max(m, groundY(x, z));
    }
  }
  return m;
})();

const RW = { x0: -S.hx + 0.15, x1: S.hx - 0.15, z: S.hz - 0.63, w: 0.9, y: BASE + 0.05 };
const APRON = { x0: -S.hx + 1.0, x1: -0.35, z0: -S.hz + 0.05, z1: -0.02, y: RW.y - 0.01 };
const LINK = { x: -S.hx + 2.1, w: 0.7 }; // taxiway from the apron down to the strip
const PARK = { x: LINK.x, z: -0.6, heading: 0 }; // nose south, toward the strip
const TURN = { x: RW.x0 + 0.6, r: 0.62 }; // turning pad at the west end (runway 09)
const HANGAR = { x0: APRON.x1, x1: APRON.x1 + 1.6, z: -0.72, r: 0.6 };
const HUT = { x: HANGAR.x1 + 1.15, z: -0.75 }; // east of the hangar, looking down the strip
const SOCK = { x: -S.hx + 0.5, z: -0.85 }; // by the turning pad, where pilots check it before takeoff

const MAT = {
  asphalt: std('#4b5058', { roughness: 0.95 }),
  shoulder: std('#c9c2b0', { roughness: 0.95 }),
  concrete: std('#d8d3c6', { roughness: 0.95 }),
  paint: std('#fbfaf4', { roughness: 0.9 }),
  taxi: std('#ffcf3a', { roughness: 0.9 }),
  red: std('#e0473c'),
  orange: std('#ff7a1a', { side: THREE.DoubleSide }),
  sockWhite: std('#fbf7ef', { side: THREE.DoubleSide }),
  hangar: std('#eef1f4', { side: THREE.DoubleSide }),
  hangarIn: std('#3b4250'),
  windshield: std('#22344f', { roughness: 0.25 }),
  tire: std('#26262a'),
};

// ---------------------------------------------------------------------------
// Runway, apron and markings
// ---------------------------------------------------------------------------

function numberTexture(text) {
  return canvasTexture(128, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#fbfaf4';
    x.font = '900 92px "Arial Black", Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, w / 2, h / 2 + 4);
  });
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const LIGHT_GEO = new THREE.IcosahedronGeometry(0.045, 0);

// White paint (center dashes, piano keys) and yellow taxi lines, instanced.
function paintList() {
  const white = [];
  const yellow = [];
  const top = RW.y + 0.003;
  for (let x = RW.x0 + 1.55; x < RW.x1 - 1.4; x += 0.7) white.push([x, top, RW.z, 0.34, 0.006, 0.05]);
  for (const [x0, dir] of [[RW.x0 + 0.12, 1], [RW.x1 - 0.12, -1]]) {
    for (const dz of [-0.42, -0.31, -0.2, 0.2, 0.31, 0.42]) white.push([x0 + dir * 0.25, top, RW.z + dz, 0.44, 0.006, 0.07]);
    white.push([x0 + dir * 0.02, top, RW.z, 0.04, 0.006, RW.w - 0.08]); // threshold bar
  }
  // taxi line: strip centerline up the link to the parking spot, plus a stop bar
  yellow.push([LINK.x, top, (RW.z + PARK.z) / 2 - 0.05, 0.04, 0.006, Math.abs(PARK.z - RW.z) - 0.1]);
  yellow.push([LINK.x, APRON.y + 0.003, PARK.z - 0.5, 0.5, 0.006, 0.04]);
  yellow.push([(APRON.x0 + APRON.x1) / 2, APRON.y + 0.003, APRON.z1 - 0.06, APRON.x1 - APRON.x0 - 0.1, 0.006, 0.03]);
  return { white, yellow };
}

function lightList() {
  const out = []; // [x, z, kind] kind: 0 edge, 1 threshold green, 2 taxi blue, 3 end red
  const half = RW.w / 2 + 0.08;
  const n = 16;
  for (let i = 0; i < n; i++) {
    const x = RW.x0 + 0.1 + ((RW.x1 - RW.x0 - 0.2) * i) / (n - 1);
    if (Math.abs(x - LINK.x) < LINK.w / 2 + 0.05) {
      out.push([x, RW.z + half, 0]);
      continue;
    }
    out.push([x, RW.z - half, 0], [x, RW.z + half, 0]);
  }
  for (const dz of [-0.4, -0.2, 0, 0.2, 0.4]) {
    out.push([RW.x0 - 0.06, RW.z + dz, 1], [RW.x1 + 0.06, RW.z + dz, 1]);
  }
  out.push([LINK.x - LINK.w / 2 - 0.06, APRON.z1 + 0.02, 2], [LINK.x + LINK.w / 2 + 0.06, APRON.z1 + 0.02, 2]);
  for (const [x, z] of [[APRON.x0, APRON.z0], [APRON.x1, APRON.z0], [APRON.x0, APRON.z1], [APRON.x1, APRON.z1]]) out.push([x, z, 2]);
  return out;
}
const LIGHT_COLORS = ['#fff1c4', '#4dff8a', '#5aa8ff', '#ff5a4a'];

function Runway({ night }) {
  const whiteRef = useRef();
  const yellowRef = useRef();
  const bulbRef = useRef();
  const haloRef = useRef();
  const paint = useMemo(paintList, []);
  const lights = useMemo(lightList, []);
  const nums = useMemo(() => [numberTexture('09'), numberTexture('27')], []);
  const numMats = useMemo(
    () => nums.map((map) => new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 })),
    [nums]
  );
  const bulbMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }), []);
  const haloMat = useMemo(() => glowMaterial('#ffffff', 0), []);
  useEffect(
    () => () => {
      nums.forEach((t) => t.dispose());
      numMats.forEach((m) => m.dispose());
      bulbMat.dispose();
      haloMat.dispose();
    },
    [nums, numMats, bulbMat, haloMat]
  );
  useEffect(() => {
    bulbMat.color.setScalar(0.45 + night * 0.75);
    haloMat.opacity = 0.4 * night;
    if (haloRef.current) haloRef.current.visible = night > 0.05;
  }, [night, bulbMat, haloMat]);

  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    const fill = (mesh, list) => {
      list.forEach(([x, y, z, sx, sy, sz], i) => {
        d.position.set(x, y, z);
        d.scale.set(sx, sy, sz);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    fill(whiteRef.current, paint.white);
    fill(yellowRef.current, paint.yellow);
    const c = new THREE.Color();
    lights.forEach(([x, z, k], i) => {
      const y = (z <= APRON.z1 + 0.1 ? APRON.y : RW.y) + 0.05;
      d.position.set(x, y, z);
      d.scale.setScalar(1);
      d.updateMatrix();
      bulbRef.current.setMatrixAt(i, d.matrix);
      c.set(LIGHT_COLORS[k]);
      bulbRef.current.setColorAt(i, c);
      d.scale.setScalar(0.1);
      d.updateMatrix();
      haloRef.current.setMatrixAt(i, d.matrix);
      haloRef.current.setColorAt(i, c);
    });
    for (const m of [bulbRef.current, haloRef.current]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }, [paint, lights]);

  const len = RW.x1 - RW.x0;
  const cx = (RW.x0 + RW.x1) / 2;
  const ax = (APRON.x0 + APRON.x1) / 2;
  const az = (APRON.z0 + APRON.z1) / 2;
  const linkZ0 = APRON.z1;
  const linkZ1 = RW.z - RW.w / 2;
  return (
    <group>
      {/* slab down to the ground so the terrain never pokes through */}
      <Box p={[cx, RW.y / 2 - 0.006, RW.z]} s={[len + 0.3, RW.y - 0.012, RW.w + 0.3]} m={MAT.shoulder} />
      <Box p={[cx, RW.y / 2, RW.z]} s={[len, RW.y, RW.w]} m={MAT.asphalt} />
      <Box p={[ax, APRON.y / 2, az]} s={[APRON.x1 - APRON.x0, APRON.y, APRON.z1 - APRON.z0]} m={MAT.concrete} />
      <Box p={[LINK.x, (RW.y - 0.005) / 2, (linkZ0 + linkZ1) / 2]} s={[LINK.w, RW.y - 0.005, linkZ1 - linkZ0 + 0.02]} m={MAT.asphalt} />
      {/* turning pad at the west end, where the plane swings round to take off */}
      <Cyl p={[TURN.x, (RW.y - 0.004) / 2, RW.z]} rt={TURN.r + 0.12} h={RW.y - 0.016} seg={14} m={MAT.shoulder} />
      <Cyl p={[TURN.x, (RW.y - 0.004) / 2, RW.z]} rt={TURN.r} h={RW.y - 0.004} seg={14} m={MAT.asphalt} />
      <instancedMesh ref={whiteRef} args={[BOX, MAT.paint, paint.white.length]} />
      <instancedMesh ref={yellowRef} args={[BOX, MAT.taxi, paint.yellow.length]} />
      {/* runway numbers: 09 reads for planes landing eastbound, 27 westbound */}
      <group position={[RW.x0 + 1.3, RW.y + 0.004, RW.z]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} material={numMats[0]}>
          <planeGeometry args={[0.7, 0.7]} />
        </mesh>
      </group>
      <group position={[RW.x1 - 1.1, RW.y + 0.004, RW.z]} rotation={[0, Math.PI / 2, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} material={numMats[1]}>
          <planeGeometry args={[0.7, 0.7]} />
        </mesh>
      </group>
      <instancedMesh ref={bulbRef} args={[LIGHT_GEO, bulbMat, lights.length]} />
      <instancedMesh ref={haloRef} args={[GLOW_GEO, haloMat, lights.length]} visible={night > 0.05} />
      {/* wheel chocks and a fuel drum by the hangar, a few cones on the apron */}
      <group position={[HANGAR.x0 - 0.45, APRON.y, HANGAR.z - 0.42]}>
        <Cyl p={[0, 0.17, 0]} rt={0.12} h={0.34} seg={8} m={MAT.red} />
        <Cyl p={[0, 0.345, 0]} rt={0.125} h={0.02} seg={8} m={M.white} />
        <Cyl p={[0.24, 0.13, 0.05]} rt={0.1} h={0.26} seg={8} m={M.bbBlue} />
      </group>
      {[[APRON.x0 + 0.25, APRON.z1 - 0.15], [APRON.x0 + 0.25, APRON.z0 + 0.15], [APRON.x1 - 0.2, APRON.z1 - 0.2]].map(([x, z], i) => (
        <group key={i} position={[x, APRON.y, z]}>
          <Cone p={[0, 0.1, 0]} rad={0.06} h={0.2} seg={6} m={MAT.orange} />
          <Cyl p={[0, 0.1, 0]} rt={0.045} h={0.03} seg={6} m={M.white} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Hangar: an arched roof opening west onto the apron
// ---------------------------------------------------------------------------

const ARCH_GEO = new THREE.CylinderGeometry(HANGAR.r, HANGAR.r, HANGAR.x1 - HANGAR.x0, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2);
const ARCH_END = new THREE.CircleGeometry(HANGAR.r, 12, 0, Math.PI).rotateY(Math.PI / 2);
const ARCH_RIM = new THREE.TorusGeometry(HANGAR.r, 0.045, 4, 12, Math.PI).rotateY(Math.PI / 2);
const RIB = new THREE.TorusGeometry(HANGAR.r + 0.012, 0.018, 3, 12, Math.PI).rotateY(Math.PI / 2);

function Hangar({ night }) {
  const sign = useMemo(
    () =>
      canvasTexture(256, 64, (x, w, h) => {
        x.fillStyle = '#19469D';
        x.fillRect(0, 0, w, h);
        x.fillStyle = '#FFDE69';
        x.fillRect(0, h - 8, w, 8);
        x.fillStyle = '#ffffff';
        x.font = '900 40px "Arial Black", Arial, sans-serif';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText('BOT AIR', w / 2, h / 2 - 3);
      }),
    []
  );
  const signMat = useMemo(() => new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: '#ffffff', emissiveIntensity: 0.2, roughness: 0.6 }), [sign]);
  const lampMat = useMemo(() => glowMaterial('#ffd890', 0), []);
  useEffect(() => {
    signMat.emissiveIntensity = 0.2 + night * 0.7;
    lampMat.opacity = 0.35 * night;
  }, [night, signMat, lampMat]);
  useEffect(() => () => (sign.dispose(), signMat.dispose(), lampMat.dispose()), [sign, signMat, lampMat]);
  const cx = (HANGAR.x0 + HANGAR.x1) / 2;
  const y = APRON.y;
  return (
    <group>
      <Box p={[cx, y / 2, HANGAR.z]} s={[HANGAR.x1 - HANGAR.x0 + 0.1, y, HANGAR.r * 2 + 0.1]} m={MAT.concrete} />
      <group position={[cx, y, HANGAR.z]}>
        <mesh geometry={ARCH_GEO} material={MAT.hangar} />
        {[-0.4, 0, 0.4].map((dx) => (
          <mesh key={dx} geometry={RIB} material={M.bbBlue} position={[dx, 0, 0]} />
        ))}
      </group>
      <mesh geometry={ARCH_END} material={MAT.hangarIn} position={[HANGAR.x1 - 0.02, y, HANGAR.z]} />
      <mesh geometry={ARCH_END} material={M.bbBlue} position={[HANGAR.x1, y, HANGAR.z]} />
      <mesh geometry={ARCH_RIM} material={M.bbYellow} position={[HANGAR.x0, y, HANGAR.z]} />
      <mesh geometry={ARCH_RIM} material={M.bbBlue} position={[HANGAR.x1, y, HANGAR.z]} />
      {/* toolbench and a spare prop inside */}
      <Box p={[HANGAR.x1 - 0.25, y + 0.2, HANGAR.z - 0.35]} s={[0.35, 0.05, 0.4]} m={M.wood} />
      <Box p={[HANGAR.x1 - 0.25, y + 0.1, HANGAR.z - 0.35]} s={[0.3, 0.2, 0.35]} m={M.darkWood} />
      <Box p={[HANGAR.x1 - 0.06, y + 0.45, HANGAR.z + 0.2]} s={[0.02, 0.5, 0.05]} r={[0.3, 0, 0]} m={M.wood} />
      {/* BOT AIR sign on the crest, both faces */}
      <group position={[cx, y + HANGAR.r + 0.17, HANGAR.z]}>
        <Box p={[0, -0.12, 0]} s={[0.04, 0.12, 0.04]} m={M.dark} />
        <mesh material={signMat} position={[0, 0.06, 0.012]}>
          <planeGeometry args={[1.1, 0.27]} />
        </mesh>
        <mesh material={signMat} position={[0, 0.06, -0.012]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[1.1, 0.27]} />
        </mesh>
      </group>
      {/* lamp over the door */}
      <mesh position={[HANGAR.x0 - 0.04, y + HANGAR.r + 0.02, HANGAR.z]} material={M.bbYellow}>
        <boxGeometry args={[0.08, 0.06, 0.16]} />
      </mesh>
      <mesh geometry={GLOW_GEO} material={lampMat} position={[HANGAR.x0 - 0.1, y + HANGAR.r - 0.05, HANGAR.z]} scale={0.22} visible={night > 0.05} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Control hut: a tiny tower with a glass cab and a rotating beacon
// ---------------------------------------------------------------------------

const BEAM_GEO = new THREE.ConeGeometry(0.16, 0.9, 10, 1, true).translate(0, -0.45, 0).rotateZ(Math.PI / 2);

function ControlHut({ night, animate }) {
  const beacon = useRef();
  const win = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8cc8ea', emissive: '#ffcf70', emissiveIntensity: 0, flatShading: true, roughness: 0.25 }), []);
  const beams = useMemo(() => [glowMaterial('#7dffb0', 0), glowMaterial('#ffffff', 0)], []);
  useEffect(() => {
    win.emissiveIntensity = night * 1.3;
    beams[0].opacity = 0.32 * night;
    beams[1].opacity = 0.28 * night;
  }, [night, win, beams]);
  useEffect(() => () => (win.dispose(), beams.forEach((b) => b.dispose())), [win, beams]);
  useFrame((_, delta) => {
    if (animate && beacon.current && night > 0.05) beacon.current.rotation.y += Math.min(delta, 0.1) * 2.4;
  });
  const y = APRON.y;
  const capY = y + 1.3;
  return (
    <group position={[HUT.x, 0, HUT.z]}>
      <Box p={[0, y / 2, 0]} s={[0.95, y, 0.95]} m={MAT.concrete} />
      {/* base room */}
      <Box p={[0, y + 0.4, 0]} s={[0.78, 0.8, 0.78]} m={M.white} />
      <Box p={[0, y + 0.3, 0.395]} s={[0.26, 0.56, 0.02]} m={M.bbBlue} />
      <Box p={[0, y + 0.82, 0]} s={[0.9, 0.05, 0.9]} m={M.bbBlue} />
      {/* glass cab on top */}
      <Box p={[0, y + 1.06, 0]} s={[0.66, 0.42, 0.66]} m={win} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <Box key={i} p={[sx * 0.33, y + 1.06, sz * 0.33]} s={[0.05, 0.44, 0.05]} m={M.white} />
      ))}
      <Box p={[0, capY, 0]} s={[0.82, 0.06, 0.82]} m={M.white} />
      <Box p={[0, capY + 0.04, 0]} s={[0.6, 0.04, 0.6]} m={M.bbBlue} />
      {/* antenna and the beacon */}
      <Cyl p={[0.28, capY + 0.32, -0.28]} rt={0.012} h={0.6} m={M.dark} />
      <Cyl p={[0, capY + 0.1, 0]} rt={0.05} h={0.08} seg={8} m={M.dark} />
      <mesh position={[0, capY + 0.18, 0]} material={M.bbYellow}>
        <icosahedronGeometry args={[0.07, 0]} />
      </mesh>
      <group ref={beacon} position={[0, capY + 0.18, 0]} visible={night > 0.05}>
        <mesh geometry={BEAM_GEO} material={beams[0]} />
        <mesh geometry={BEAM_GEO} material={beams[1]} rotation={[0, Math.PI, 0]} />
      </group>
      {/* little balcony rail around the base roof */}
      <Beam a={[-0.44, y + 1.0, 0.44]} b={[0.44, y + 1.0, 0.44]} r={0.012} m={M.white} />
      <Beam a={[0.44, y + 1.0, 0.44]} b={[0.44, y + 1.0, -0.44]} r={0.012} m={M.white} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Windsock: points downwind, fills in the gusts and droops in the lulls
// ---------------------------------------------------------------------------

const SOCK_SEGS = 5;
const SOCK_LEN = 0.17;
const SOCK_GEO = Array.from({ length: SOCK_SEGS }, (_, i) => {
  const r0 = 0.09 - i * 0.009;
  return new THREE.CylinderGeometry(r0 - 0.009, r0, SOCK_LEN, 8, 1, true).rotateZ(-Math.PI / 2).translate(SOCK_LEN / 2, 0, 0);
});

function Windsock({ animate }) {
  const turn = useRef();
  const segs = useRef([]);
  const clock = useMemo(() => aliveClock(), []);
  const [wx, , wz] = W(SOCK.x, 0, SOCK.z);
  const g = groundY(wx, wz);
  const pose = (t) => {
    const dir = 0.7 + Math.sin(t * 0.045) * 0.6 + Math.sin(t * 0.13 + 1) * 0.15;
    const wind = 0.55 + Math.sin(t * 0.07 + 1) * 0.3 + Math.sin(t * 0.9) * 0.08;
    if (turn.current) turn.current.rotation.y = dir;
    const droop = -(1 - Math.min(1, Math.max(0, wind))) * 1.1;
    segs.current.forEach((s, i) => {
      if (!s) return;
      s.rotation.z = droop / SOCK_SEGS + (i ? 0 : -0.05);
      s.rotation.y = Math.sin(t * 6 + i * 0.9) * 0.06 * wind;
    });
  };
  useLayoutEffect(() => pose(14)); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, delta) => {
    if (animate) pose(clock.tick(delta) + 14);
  });
  // nested chain: each segment hangs off the end of the last
  let chain = null;
  for (let i = SOCK_SEGS - 1; i >= 0; i--) {
    chain = (
      <group ref={(el) => (segs.current[i] = el)} position={[i ? SOCK_LEN : 0, 0, 0]}>
        <mesh geometry={SOCK_GEO[i]} material={i % 2 ? MAT.sockWhite : MAT.orange} />
        {chain}
      </group>
    );
  }
  return (
    <group position={[SOCK.x, g, SOCK.z]}>
      <Cyl p={[0, 0.05, 0]} rt={0.12} h={0.1} seg={8} m={MAT.concrete} />
      <Cyl p={[0, 0.7, 0]} rt={0.025} h={1.4} m={M.white} />
      {[0.35, 0.85].map((y) => (
        <Cyl key={y} p={[0, y, 0]} rt={0.03} h={0.12} m={MAT.red} />
      ))}
      <group ref={turn} position={[0, 1.36, 0]}>
        <mesh position={[0.03, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={M.dark}>
          <torusGeometry args={[0.092, 0.01, 4, 10]} />
        </mesh>
        <group position={[0.03, 0, 0]}>{chain}</group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// The island-hopper and its routes
// ---------------------------------------------------------------------------

// A route is a list of segments, each either a path with a speed ramp
// (pts, v0 -> v1) or a pause (hold: at, dur) or a turn on the spot (turn:
// at, h0 -> h1, dur). air: flying (banks into turns). pitch: extra nose-up
// (p0 -> p1). prop: 0..1 engine. scale: s0 -> s1 (fades in or out at sea).
function buildRoute(list) {
  let t = 0;
  for (const s of list) {
    if (s.pts) {
      const v = s.pts.map((p) => new THREE.Vector3(...p));
      s.curve = v.length === 2 ? new THREE.LineCurve3(v[0], v[1]) : new THREE.CatmullRomCurve3(v, false, 'centripetal');
      s.len = s.curve.getLength();
      s.dur = (2 * s.len) / (s.v0 + s.v1);
      s.acc = (s.v1 - s.v0) / s.dur;
    } else {
      s.pos = new THREE.Vector3(...s.at);
    }
    s.t0 = t;
    t += s.dur;
  }
  return { segs: list, dur: t };
}

// Routes are written in the footprint frame (lx, world y, lz) and turned
// into world points. Heights are absolute: the climb-out and the approach
// clear the palms on the east shore (tops ~3.5 around x 16-17.5) and stay
// north of the lanai deck (z > -1) while low.
const GY = RW.y;
const C = RW.z; // strip centerline
const LIFT = TURN.x + 2.35; // liftoff point, eastbound
const PARK_W = W(PARK.x, APRON.y, PARK.z);
const PARK_H = PARK.heading + ROT;
const TURN_W = W(TURN.x, GY, C);
const OUT = buildRoute([
  { hold: true, at: PARK_W, dur: 2.5, prop: [0, 0.35] }, // engine start
  {
    pts: [PARK_W, W(LINK.x, APRON.y + 0.002, -0.1), W(LINK.x - 0.02, GY, C - 0.37), W(LINK.x - 0.25, GY, C - 0.07), W(LINK.x - 0.6, GY, C), TURN_W],
    v0: 0.2, v1: 0.5, prop: [0.35, 0.4],
  },
  { turn: true, at: TURN_W, h0: -Math.PI / 2 + ROT, h1: (-3 * Math.PI) / 2 + ROT, dur: 3.2, prop: [0.4, 0.45] }, // swing round on the pad
  { hold: true, at: TURN_W, dur: 2.2, prop: [0.45, 1] }, // run-up
  { pts: [TURN_W, W(LIFT, GY, C)], v0: 0.2, v1: 2.4, prop: [1, 1], pitch: [0, 0.12] },
  {
    pts: [
      W(LIFT, GY, C), W(-0.4, 0.78, C), W(1.0, 1.4, C), W(2.4, 2.05, C), W(3.6, 2.62, C), W(4.7, 3.25, C), W(5.7, 3.82, C),
      W(6.7, 4.08, C - 0.05), W(7.8, 4.32, C - 0.15), W(9.2, 4.6, 0.3), W(10.6, 5.05, -0.6), W(12.0, 5.6, -2.2), W(13.1, 6.3, -4.8), W(13.7, 7.2, -8.5), W(13.8, 8.2, -13),
    ],
    v0: 2.4, v1: 3.8, air: true, prop: [1, 1], pitch: [0.12, 0.04],
  },
  { pts: [W(13.8, 8.2, -13), W(13.5, 9.8, -28)], v0: 3.8, v1: 4.2, air: true, prop: [1, 1], pitch: [0.04, 0.04], scale: [1, 0.12] },
]);
const IN = buildRoute([
  { pts: [W(40, 10.5, 28), W(26, 8.4, 16)], v0: 4.2, v1: 4.0, air: true, prop: [0.8, 0.8], pitch: [0.08, 0.1], scale: [0.12, 1] },
  {
    // round from the south-east over the sea onto a long final, then a steep
    // short-field descent once past the shore palms (nose kept near level)
    pts: [W(26, 8.4, 16), W(19, 6.4, 6.0), W(14.5, 5.0, 1.6), W(11.5, 4.45, 0.78), W(9.0, 4.1, C), W(7.2, 4.05, C), W(5.7, 3.8, C), W(4.7, 3.28, C), W(3.4, 2.42, C), W(2.0, 1.45, C), W(1.0, 0.86, C)],
    v0: 4.0, v1: 2.3, air: true, prop: [0.75, 0.5], pitch: [0.1, 0.1], climbK: 0.3,
  },
  { pts: [W(1.0, 0.86, C), W(0.3, 0.56, C), W(-0.3, GY, C)], v0: 2.3, v1: 2.1, air: true, prop: [0.5, 0.45], pitch: [0.1, 0.22], climbK: 0.3 }, // flare
  { pts: [W(-0.3, GY, C), W(LINK.x + 0.6, GY, C)], v0: 2.1, v1: 0.45, touch: true, prop: [0.45, 0.4], pitch: [0.16, 0] },
  {
    pts: [W(LINK.x + 0.6, GY, C), W(LINK.x + 0.3, GY, C - 0.05), W(LINK.x + 0.02, GY, C - 0.37), W(LINK.x, APRON.y + 0.005, -0.1), PARK_W],
    v0: 0.45, v1: 0.15, prop: [0.4, 0.35],
  },
  { turn: true, at: PARK_W, h0: Math.PI + ROT, h1: Math.PI * 2 + ROT, dur: 4, prop: [0.35, 0.3] }, // swing round
  { hold: true, at: PARK_W, dur: 2.5, prop: [0.3, 0] }, // engine off
]);

const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const PLANE_SCALE = 1.0; // a touch smaller than before, to suit the shorter strip

// Where the plane is on a route at time t. Writes into `out`, no allocations.
function sampleRoute(route, t, out) {
  const segs = route.segs;
  let i = 0;
  while (i < segs.length - 1 && t >= segs[i].t0 + segs[i].dur) i++;
  const s = segs[i];
  const lt = Math.min(Math.max(t - s.t0, 0), s.dur);
  const k = s.dur > 0 ? lt / s.dur : 1;
  out.seg = i;
  out.k = k;
  out.moving = false;
  if (s.curve) {
    const dist = s.v0 * lt + 0.5 * s.acc * lt * lt;
    const u = Math.min(1, Math.max(0, dist / s.len));
    s.curve.getPointAt(u, out.pos);
    const u2 = Math.min(1, u + 0.004);
    const u1 = u2 - 0.004;
    s.curve.getPointAt(u2, out.tan);
    s.curve.getPointAt(u1, out.tmp);
    out.tan.sub(out.tmp);
    out.moving = true;
    out.heading = Math.atan2(out.tan.x, out.tan.z);
    out.climb = Math.atan2(out.tan.y, Math.hypot(out.tan.x, out.tan.z));
  } else {
    out.pos.copy(s.pos);
    out.climb = 0;
    if (s.turn) {
      const e = k * k * (3 - 2 * k);
      out.heading = lerp(s.h0, s.h1, e);
      out.moving = true;
    }
  }
  out.air = !!s.air;
  out.prop = s.prop ? lerp(s.prop[0], s.prop[1], k) : 0;
  out.pitch = s.pitch ? lerp(s.pitch[0], s.pitch[1], k) : 0;
  out.climbK = s.climbK ?? 0.7;
  out.scale = s.scale ? lerp(s.scale[0], s.scale[1], k) : 1;
  out.touch = !!s.touch;
  return out;
}

const PROP_DISC = new THREE.CircleGeometry(0.27, 16);
const WHEEL = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8).rotateZ(Math.PI / 2);
const SHADOW_GEO = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
const PUFF_GEO = new THREE.IcosahedronGeometry(1, 0);
const PUFFS = 6;

function PlaneModel({ propRef, discRef, discMat, nav }) {
  return (
    <group>
      {/* gear: two mains and a nose wheel, bottoms at y = 0 */}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Beam a={[sx * 0.1, 0.25, 0.05]} b={[sx * 0.3, 0.07, 0.05]} r={0.016} m={M.dark} />
          <mesh geometry={WHEEL} material={MAT.tire} position={[sx * 0.3, 0.07, 0.05]} />
          <Box p={[sx * 0.3, 0.12, 0.05]} s={[0.07, 0.03, 0.18]} m={M.white} />
        </group>
      ))}
      <Beam a={[0, 0.25, 0.45]} b={[0, 0.06, 0.5]} r={0.014} m={M.dark} />
      <mesh geometry={WHEEL} material={MAT.tire} position={[0, 0.06, 0.5]} scale={0.85} />
      <group position={[0, 0.36, 0]}>
        {/* fuselage, nose and tail cone (built with the nose along +z) */}
        <Cyl p={[0, 0, 0.05]} rt={0.19} rb={0.17} h={0.8} seg={8} r={[Math.PI / 2, 0, 0]} m={M.white} />
        <Cyl p={[0, -0.01, 0.55]} rt={0.13} rb={0.19} h={0.2} seg={8} r={[Math.PI / 2, 0, 0]} m={M.white} />
        <Cyl p={[0, 0.05, -0.62]} rt={0.17} rb={0.045} h={0.55} seg={8} r={[Math.PI / 2 + 0.1, 0, 0]} m={M.white} />
        <Box p={[0, -0.03, 0.05]} s={[0.395, 0.07, 0.95]} m={M.bbBlue} />
        <Box p={[0, -0.09, 0.05]} s={[0.385, 0.035, 0.9]} m={M.bbYellow} />
        {/* cockpit windows and windshield */}
        <Box p={[0, 0.08, 0.2]} s={[0.375, 0.08, 0.36]} m={MAT.windshield} />
        <Box p={[0, 0.12, 0.42]} s={[0.25, 0.1, 0.03]} r={[-0.55, 0, 0]} m={MAT.windshield} />
        {/* high wing with yellow tips and struts */}
        <Box p={[0, 0.215, 0.1]} s={[1.8, 0.045, 0.34]} m={M.white} />
        <Box p={[0, 0.218, 0.0]} s={[1.4, 0.046, 0.06]} m={M.bbBlue} />
        {[-1, 1].map((sx) => (
          <group key={sx}>
            <Box p={[sx * 0.86, 0.215, 0.1]} s={[0.1, 0.05, 0.345]} m={M.bbYellow} />
            <Beam a={[sx * 0.16, -0.1, 0.1]} b={[sx * 0.56, 0.19, 0.1]} r={0.012} m={M.white} />
          </group>
        ))}
        {/* tail */}
        <Box p={[0, 0.24, -0.86]} s={[0.03, 0.32, 0.26]} r={[-0.2, 0, 0]} m={M.bbBlue} />
        <Box p={[0, 0.39, -0.92]} s={[0.032, 0.05, 0.2]} m={M.bbYellow} />
        <Box p={[0, 0.08, -0.86]} s={[0.64, 0.03, 0.2]} m={M.white} />
        {[-1, 1].map((sx) => (
          <Box key={sx} p={[sx * 0.3, 0.081, -0.86]} s={[0.06, 0.032, 0.2]} m={M.bbBlue} />
        ))}
        {/* nav lights: red left (+x), green right, white tail */}
        <mesh position={[0.92, 0.215, 0.12]} geometry={LIGHT_GEO} material={nav.red} />
        <mesh position={[-0.92, 0.215, 0.12]} geometry={LIGHT_GEO} material={nav.green} />
        <mesh ref={nav.strobeRef} position={[0, 0.42, -0.97]} geometry={GLOW_GEO} material={nav.strobe} scale={0.14} visible={false} />
        {/* propeller */}
        <group position={[0, -0.01, 0.66]}>
          <Cone p={[0, 0, 0.04]} rad={0.06} h={0.1} seg={8} r={[Math.PI / 2, 0, 0]} m={M.bbYellow} />
          <group ref={propRef}>
            <Box p={[0, 0, 0]} s={[0.5, 0.05, 0.015]} m={M.dark} />
            <Box p={[0.235, 0, 0.002]} s={[0.03, 0.05, 0.017]} m={M.bbYellow} />
            <Box p={[-0.235, 0, 0.002]} s={[0.03, 0.05, 0.017]} m={M.bbYellow} />
          </group>
          <mesh ref={discRef} geometry={PROP_DISC} material={discMat} position={[0, 0, 0.01]} visible={false} />
        </group>
      </group>
    </group>
  );
}

function Plane({ ctx, night }) {
  const animate = ctx.animate;
  const test = testOn('plane2');
  const root = useRef();
  const att = useRef();
  const prop = useRef();
  const disc = useRef();
  const strobe = useRef();
  const shadow = useRef();
  const puffRefs = useRef([]);
  const mats = useMemo(
    () => ({
      disc: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      red: new THREE.MeshBasicMaterial({ color: '#ff5a4a' }),
      green: new THREE.MeshBasicMaterial({ color: '#4dff8a' }),
      strobe: glowMaterial('#ffffff', 0.9),
      shadow: new THREE.MeshBasicMaterial({ color: '#1d3b2a', transparent: true, opacity: 0, depthWrite: false }),
      puffs: Array.from({ length: PUFFS }, () => new THREE.MeshBasicMaterial({ color: '#efe6d2', transparent: true, opacity: 0, depthWrite: false })),
    }),
    []
  );
  useEffect(() => () => [mats.disc, mats.red, mats.green, mats.strobe, mats.shadow, ...mats.puffs].forEach((m) => m.dispose()), [mats]);
  useEffect(() => {
    mats.red.color.set('#ff5a4a').multiplyScalar(0.55 + night * 0.6);
    mats.green.color.set('#4dff8a').multiplyScalar(0.55 + night * 0.6);
  }, [night, mats]);

  const st = useMemo(
    () => ({
      clock: aliveClock(),
      phase: 'parked',
      nextAt: test ? 3 : 70 + Math.random() * 110,
      start: 0,
      lastSeg: -1,
      heading: PARK_H,
      pitch: 0,
      bank: 0,
      prop: 0,
      propA: 0,
      s: { pos: new THREE.Vector3(), tan: new THREE.Vector3(), tmp: new THREE.Vector3(), heading: 0, climb: 0, climbK: 0.7 },
      puffs: Array.from({ length: PUFFS }, () => ({ age: 9, x: 0, y: 0, z: 0, vx: 0, vz: 0 })),
      puffNext: 0,
    }),
    [test]
  );
  useEffect(() => () => releaseTravel('plane2'), []);

  const place = (x, y, z, heading, pitch, bank, scale) => {
    root.current.position.set(x, y, z);
    root.current.rotation.y = heading;
    root.current.scale.setScalar(scale * PLANE_SCALE);
    att.current.rotation.set(-pitch, 0, bank);
  };

  useLayoutEffect(() => {
    if (root.current) place(PARK_W[0], PARK_W[1], PARK_W[2], PARK_H, 0, 0, 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const spawnPuffs = (x, y, z, heading) => {
    const c = Math.cos(heading);
    const sn = Math.sin(heading);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const p = st.puffs[st.puffNext];
        st.puffNext = (st.puffNext + 1) % PUFFS;
        const lx = side * 0.34;
        p.x = x + lx * c - k * 0.2 * sn;
        p.z = z - lx * sn - k * 0.2 * c;
        p.y = y + 0.06;
        p.vx = -sn * 0.5 + side * c * 0.15;
        p.vz = -c * 0.5 - side * sn * 0.15;
        p.age = -k * 0.12;
      }
    }
  };

  useFrame((state, delta) => {
    if (!animate || !root.current) return;
    const dt = Math.min(delta, 0.1);
    const t = st.clock.tick(delta);
    const s = st.s;

    if (st.phase === 'parked' && t >= st.nextAt) {
      if (claimTravel('plane2', OUT.dur + 2)) {
        st.phase = 'out';
        st.start = t;
        st.lastSeg = -1;
      } else st.nextAt = t + 3;
    } else if (st.phase === 'away' && t >= st.nextAt) {
      if (claimTravel('plane2', IN.dur + 2)) {
        st.phase = 'in';
        st.start = t;
        st.heading = sampleRoute(IN, 0, s).heading;
        st.pitch = 0;
        st.bank = 0;
        st.lastSeg = -1;
        root.current.visible = true;
      } else st.nextAt = t + 3;
    }

    if (st.phase === 'out' || st.phase === 'in') {
      const route = st.phase === 'out' ? OUT : IN;
      const rt = t - st.start;
      claimTravel('plane2', 4);
      sampleRoute(route, rt, s);
      const prevHeading = st.heading;
      if (s.moving) st.heading += wrap(s.heading - st.heading) * Math.min(1, dt * (s.air ? 5 : 9)); // eased, so kinks never snap
      const rate = wrap(st.heading - prevHeading) / Math.max(dt, 1e-3);
      const bankWant = s.air ? Math.max(-0.65, Math.min(0.65, -rate * 1.1)) : 0;
      st.bank += (bankWant - st.bank) * Math.min(1, dt * 2.5);
      const pitchWant = (s.air ? s.climb * s.climbK : 0) + s.pitch;
      st.pitch += (pitchWant - st.pitch) * Math.min(1, dt * 3);
      st.prop += (s.prop - st.prop) * Math.min(1, dt * 2);
      if (s.touch && st.lastSeg !== s.seg) spawnPuffs(s.pos.x, s.pos.y, s.pos.z, st.heading);
      st.lastSeg = s.seg;
      place(s.pos.x, s.pos.y, s.pos.z, st.heading, st.pitch, st.bank, s.scale);
      // shadow on land and decks, fading with height
      const gy = groundY(s.pos.x, s.pos.z);
      const h = s.pos.y - gy;
      const op = gy > 0.04 ? 0.2 * Math.max(0, 1 - h / 3.5) * s.scale : 0;
      mats.shadow.opacity = op;
      shadow.current.visible = op > 0.01;
      if (op > 0.01) {
        shadow.current.position.set(s.pos.x, gy + 0.02, s.pos.z);
        shadow.current.scale.setScalar(0.9 + h * 0.08);
      }
      if (rt >= route.dur) {
        releaseTravel('plane2');
        st.prop = 0;
        if (st.phase === 'out') {
          st.phase = 'away';
          root.current.visible = false;
          shadow.current.visible = false;
          st.nextAt = t + (test ? 5 : 40 + Math.random() * 40);
        } else {
          st.phase = 'parked';
          st.heading = PARK_H;
          place(PARK_W[0], PARK_W[1], PARK_W[2], PARK_H, 0, 0, 1);
          st.nextAt = t + (test ? 4 : 150 + Math.random() * 110);
        }
      }
    }

    // propeller: blades blur into a disc at speed
    st.propA += st.prop * dt * 55;
    prop.current.rotation.z = st.propA;
    prop.current.visible = st.prop < 0.65;
    mats.disc.opacity = Math.max(0, st.prop - 0.15) * 0.3;
    disc.current.visible = st.prop > 0.2;
    strobe.current.visible = st.phase !== 'parked' && st.phase !== 'away' && t % 1.3 < 0.07;

    // touchdown puffs: grow, drift back and fade
    for (let i = 0; i < PUFFS; i++) {
      const p = st.puffs[i];
      const m = puffRefs.current[i];
      if (!m) continue;
      if (p.age > 1.4) {
        if (m.visible) m.visible = false;
        continue;
      }
      p.age += dt;
      if (p.age < 0) continue;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      m.visible = true;
      m.position.set(p.x, p.y + p.age * 0.12, p.z);
      m.scale.setScalar(0.06 + p.age * 0.2);
      mats.puffs[i].opacity = 0.6 * (1 - p.age / 1.4);
    }
  });

  return (
    <group>
      <group ref={root}>
        <group ref={att}>
          <PlaneModel propRef={prop} discRef={disc} discMat={mats.disc} nav={{ red: mats.red, green: mats.green, strobe: mats.strobe, strobeRef: strobe }} />
        </group>
      </group>
      <mesh ref={shadow} geometry={SHADOW_GEO} material={mats.shadow} visible={false} />
      {mats.puffs.map((m, i) => (
        <mesh key={i} ref={(el) => (puffRefs.current[i] = el)} geometry={PUFF_GEO} material={m} visible={false} />
      ))}
    </group>
  );
}

export default function Airstrip({ ctx }) {
  const night = duskFactor(ctx.sky);
  return (
    <group>
      <group position={[S.x, 0, S.z]} rotation={[0, ROT, 0]}>
        <Runway night={night} />
        <Hangar night={night} />
        <ControlHut night={night} animate={ctx.animate} />
        <Windsock animate={ctx.animate} />
      </group>
      <Plane ctx={ctx} night={night} />
    </group>
  );
}
