import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SEA_LANES } from '../../utils/paths.js';
import { testOn } from '../../wild/director.js';
import { world } from '../state.js';
import MiniBot, { CREW_COLORS } from '../MiniBot.jsx';
import { angDiff, giveWay, waveY, hullGeometry, nearestBoat, registerBoat, ridePose, setNightLights, signTexture, Spray, std, wakeSpray } from './kit.js';
import { Beam, Box, Light, SideLights } from './parts.jsx';

// The glass-bottom tour boat: a wide, cheerful boat with a striped canopy and
// a glass panel in the floor. It loops the tour lane, and now and then it
// slows and idles over a patch of reef so the tourists can look down, point
// and take photos. At night lights under the hull make the sea glow.

const ID = 'tour';
const LEN = 5.4;
const BEAM = 2.4;
const DECK = 0.4;
const ROOF = DECK + 1.62;
const CRUISE = 1.35;
const DIR = 1; // east -> south -> west -> north
// ?test=tour: start just before the south-west reef, always stop at reefs.
const TEST = testOn('tour');

// Reef patches on the tour loop (angles on the lane ellipse). The boat
// stops over some of them; none is near the tug's run to the pier (west).
export const REEF_ANGLES = [0.75, 2.05, 4.25, 5.45];
const reefPoint = (a) => [SEA_LANES.tour.rx * Math.cos(a), SEA_LANES.tour.rz * Math.sin(a)];

const HULL_GEO = hullGeometry(LEN, BEAM, 0.66, { bow: 0.3, stern: 0.94, taper: 0.72, sheer: 0.14 });
const BAND_GEO = hullGeometry(LEN * 1.006, BEAM * 1.01, 0.12, { bow: 0.3, stern: 0.94, taper: 1, sheer: 0.14 });
const DECK_GEO = hullGeometry(LEN * 0.95, BEAM * 0.92, 0.05, { bow: 0.3, stern: 0.94, taper: 1, sheer: 0.14 });
// A soft ring of light on the water: bright near the hull, fading to nothing.
const HALO_GEO = (() => {
  const g = new THREE.RingGeometry(1.0, 3.6, 28, 3).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    const k = Math.max(0, 1 - (r - 1.0) / 2.6) ** 1.6;
    col[i * 3] = k;
    col[i * 3 + 1] = k;
    col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
})();
const CORAL_GEO = new THREE.ConeGeometry(0.22, 0.5, 5, 1);
const PHONE_GEO = new THREE.BoxGeometry(0.1, 0.16, 0.025);
const FLASH_GEO = new THREE.SphereGeometry(0.035, 6, 4);
const SIGN_GEO = new THREE.PlaneGeometry(3.0, 0.3);

const M = {
  hull: std('#fdf8ee'),
  band: std('#2ec4c8'),
  deck: std('#d9b382'),
  post: std('#fdf8ee', { roughness: 0.4 }),
  stripeA: std('#ffde69'),
  stripeB: std('#fdf8ee'),
  bench: std('#2ec4c8'),
  dark: std('#2b2a33'),
  rail: std('#cfd6de', { roughness: 0.35, metalness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: '#86e9ff', emissive: '#3fd8ff', emissiveIntensity: 0.15, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.1, depthWrite: false }),
  frame: std('#19469D'),
  halo: new THREE.MeshBasicMaterial({ color: '#46e8ff', vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  underLight: std('#bff6ff', { emissive: '#5ff0ff', emissiveIntensity: 0.1 }),
  flash: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
  coral: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8, emissive: '#ff7aa8', emissiveIntensity: 0.12 }),
};

// Tourists: where they stand on deck and which way they face.
const TOURISTS = [
  { x: 0.78, z: 0.75, rot: -Math.PI / 2 },
  { x: 0.78, z: -0.65, rot: -Math.PI / 2 },
  { x: -0.78, z: 0.35, rot: Math.PI / 2 },
  { x: -0.78, z: -0.95, rot: Math.PI / 2 },
  { x: 0.2, z: 1.75, rot: 0.2 },
];

function Reefs() {
  const mesh = useMemo(() => {
    const per = 9;
    const m = new THREE.InstancedMesh(CORAL_GEO, M.coral, REEF_ANGLES.length * per);
    const o = new THREE.Object3D();
    const colors = ['#ff7aa8', '#ffb067', '#b48cff', '#ff9a7a', '#7fe0c0'];
    const c = new THREE.Color();
    let i = 0;
    REEF_ANGLES.forEach((a, k) => {
      const [x, z] = reefPoint(a);
      for (let j = 0; j < per; j++) {
        const r = 0.6 + ((j * 37 + k * 11) % 10) * 0.22;
        const b = j * 2.4 + k;
        o.position.set(x + Math.cos(b) * r, -0.62 + (j % 3) * 0.08, z + Math.sin(b) * r);
        o.rotation.set(((j % 4) - 1.5) * 0.25, b, ((j % 3) - 1) * 0.3);
        o.scale.setScalar(0.7 + (j % 4) * 0.25);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
        m.setColorAt(i, c.set(colors[(j + k) % colors.length]));
        i++;
      }
    });
    return m;
  }, []);
  useEffect(() => () => mesh.dispose(), [mesh]);
  return <primitive object={mesh} />;
}

export default function TourBoat({ ctx }) {
  const group = useRef();
  const halo = useRef();
  const night = useRef(0);
  night.current = ctx.sky?.stars ?? 0;
  const tourists = [useRef({}), useRef({}), useRef({}), useRef({}), useRef({})];
  const guide = useRef({});
  const phones = useMemo(
    () =>
      TOURISTS.map(() => {
        const p = new THREE.Group();
        const body = new THREE.Mesh(PHONE_GEO, M.dark);
        const flash = new THREE.Mesh(FLASH_GEO, M.flash);
        flash.position.set(0.02, 0.05, -0.02);
        p.add(body, flash);
        p.position.set(0, 0.06, 0.04);
        p.visible = false;
        return p;
      }),
    []
  );
  const sign = useMemo(() => {
    const tex = signTexture('GLASS BOTTOM TOURS', { bg: '#19469D', fg: '#ffde69', font: '900 54px system-ui, sans-serif' });
    return new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.1, flatShading: true, side: THREE.DoubleSide });
  }, []);
  useEffect(() => () => (sign.map.dispose(), sign.dispose()), [sign]);
  const spray = useMemo(() => new Spray(ctx.lowPower ? 30 : 60, { gravity: 7, drag: 1.3 }), [ctx.lowPower]);
  useEffect(() => () => spray.dispose(), [spray]);
  useEffect(
    () => () => {
      world.boats.delete(ID);
      world.glow.delete(ID);
    },
    []
  );

  // Hand each tourist their phone once the bots have mounted.
  useEffect(() => {
    tourists.forEach((r, i) => r.current.handR?.add(phones[i]));
    return () => phones.forEach((p) => p.parent?.remove(p));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const st = useMemo(() => {
    const a = TEST ? REEF_ANGLES[1] - DIR * 0.2 : Math.random() * Math.PI * 2;
    return { a, prevA: a, off: 0, v: CRUISE, stopUntil: 0, lastStop: -99, excite: 0, clock: 0 };
  }, []);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;
    const s = st;
    s.clock += dt;
    const n = night.current;
    setNightLights(n);

    // Lane with a sideways nudge outward when something sits in the way ahead.
    const { rx, rz } = SEA_LANES.tour;
    const ex = rx + s.off;
    const ez = rz + s.off * (rz / rx);
    const mag = Math.hypot(ex * Math.sin(s.a), ez * Math.cos(s.a));
    let blocked = false;
    for (let d = 4; d <= 14; d += 5) {
      const b = s.a + (DIR * d) / mag;
      if (nearestBoat(ID, rx * Math.cos(b), rz * Math.sin(b)) < 3.4) blocked = true;
    }
    s.off += ((blocked ? 4 : 0) - s.off) * Math.min(1, dt * 0.3);

    // Reef stops: on reaching a reef patch, maybe ease to a stop over it,
    // idle a while, then carry on.
    if (s.clock > s.stopUntil && s.clock - s.lastStop > (TEST ? 20 : 40)) {
      for (const r of REEF_ANGLES) {
        const before = angDiff(r - DIR * 0.07, s.prevA) * DIR;
        const now = angDiff(r - DIR * 0.07, s.a) * DIR;
        if (before > 0 && now <= 0 && before < 0.5 && (TEST || Math.random() < 0.65)) {
          s.stopUntil = s.clock + 13 + Math.random() * 5;
          s.lastStop = s.clock;
        }
      }
    }
    s.prevA = s.a;
    const idling = s.clock < s.stopUntil;
    const x0 = ex * Math.cos(s.a);
    const z0 = ez * Math.sin(s.a);
    const heading = Math.atan2(-ex * Math.sin(s.a) * DIR, ez * Math.cos(s.a) * DIR);
    const target = idling ? 0 : CRUISE * giveWay(ID, x0, z0, heading, 2, 9, 2.4);
    s.v += (target - s.v) * Math.min(1, dt * (idling ? 0.45 : 0.3));
    if (s.v < 0.01 && idling) s.v = 0;
    s.a += (DIR * s.v * dt) / mag;
    s.excite += ((idling && s.v < 0.4 ? 1 : 0) - s.excite) * Math.min(1, dt * 0.8);

    ridePose(g, x0, z0, heading, t, LEN, BEAM, 1.7);
    g.position.y += Math.sin(t * 0.9) * 0.025;
    registerBoat(ID, x0, z0, heading, s.v, LEN, 2);
    wakeSpray(spray, x0, z0, heading, s.v * 1.3, LEN, BEAM, t, { bow: 0.8 });
    spray.update(dt);

    // Night: lights under the glass and a soft glow in the water around the hull.
    M.glass.emissiveIntensity = 0.15 + n * 1.4;
    M.underLight.emissiveIntensity = 0.1 + n * 2.2;
    sign.emissiveIntensity = 0.1 + n * 0.6;
    if (halo.current) {
      halo.current.position.set(x0, waveY(x0, z0, t) + 0.05, z0);
      halo.current.rotation.y = heading;
      M.halo.opacity = n * (0.55 + Math.sin(t * 1.3) * 0.08);
      halo.current.visible = n > 0.05;
    }
    if (n > 0.05) world.glow.set(ID, { x: x0, z: z0, strength: n });
    else world.glow.delete(ID);

    // Tourists: look down through the glass, point, take photos. More of it over the reef.
    let flashOn = 0;
    for (let i = 0; i < tourists.length; i++) {
      const p = tourists[i].current;
      if (!p.pose) continue;
      const cyc = (t * 0.11 + i * 0.37) % 1;
      const ex2 = s.excite;
      const mode = ex2 > 0.5 ? ((i + Math.floor(t * 0.18)) % 3) : cyc < 0.45 ? 0 : cyc < 0.7 ? 1 : cyc < 0.85 ? 2 : 3;
      const bob = Math.sin(t * 2.2 + i) * 0.04;
      const lean = i === 4 ? 0.05 : 0.18 + ex2 * 0.2;
      // 0: look down, 1: point, 2: photo, 3: just enjoy the ride
      p.pose.rotation.x = (mode === 3 ? 0.02 : lean) + bob * 0.5;
      p.head.rotation.x = mode === 3 ? -0.15 : i === 4 ? 0.1 : 0.45 + ex2 * 0.15;
      p.head.rotation.y = Math.sin(t * 0.5 + i * 2) * (mode === 3 ? 0.6 : 0.25);
      const point = mode === 1;
      const photo = mode === 2;
      p.armR.rotation.x = photo ? -1.45 : point ? -1.05 + Math.sin(t * 3 + i) * 0.1 : -0.1 + bob;
      p.armR.rotation.z = photo ? -0.25 : point ? 0.1 : 0.12;
      p.armL.rotation.x = photo ? -1.4 : -0.08 - bob;
      p.armL.rotation.z = photo ? 0.25 : -0.12;
      phones[i].visible = photo;
      if (photo && ((t + i * 0.7) % 2.6) < 0.12) flashOn = 1;
    }
    M.flash.opacity = flashOn;
    const gp = guide.current;
    if (gp.pose) {
      // the guide points out the reef while the boat idles
      const show = s.excite > 0.5 && Math.sin(t * 0.4) > -0.2;
      gp.armL.rotation.x = show ? -1.2 : -0.6;
      gp.armL.rotation.z = show ? -0.9 + Math.sin(t * 1.4) * 0.15 : -0.1;
      gp.armR.rotation.x = -0.6;
      gp.head.rotation.y = show ? 0.9 : Math.sin(t * 0.3) * 0.3;
    }
  });

  return (
    <>
      <Reefs />
      <group ref={group}>
        {/* hull, teal band and deck */}
        <mesh geometry={HULL_GEO} material={M.hull} position={[0, DECK, 0]} />
        <mesh geometry={BAND_GEO} material={M.band} position={[0, DECK - 0.17, 0]} />
        <mesh geometry={DECK_GEO} material={M.deck} position={[0, DECK + 0.03, 0]} />
        {/* the glass floor panel, framed, with lights below it */}
        <Box p={[0, DECK + 0.045, 0]} s={[0.98, 0.03, 2.5]} m={M.frame} />
        <Box p={[0, DECK + 0.065, 0]} s={[0.82, 0.02, 2.32]} m={M.glass} />
        {[-0.8, 0, 0.8].map((z) => (
          <Box key={z} p={[0, DECK - 0.62, z]} s={[0.5, 0.05, 0.4]} m={M.underLight} />
        ))}
        {[-1.08, 1.08].map((x) => (
          <Box key={x} p={[x, DECK - 0.3, 0]} s={[0.04, 0.08, 3.2]} m={M.underLight} />
        ))}
        {/* benches along both rails */}
        <Box p={[1.0, DECK + 0.2, 0]} s={[0.3, 0.06, 3.0]} m={M.bench} />
        <Box p={[-1.0, DECK + 0.2, 0]} s={[0.3, 0.06, 3.0]} m={M.bench} />
        {/* rails */}
        <Beam a={[1.12, DECK + 0.45, -2.3]} b={[1.12, DECK + 0.45, 1.6]} r={0.022} m={M.rail} />
        <Beam a={[-1.12, DECK + 0.45, -2.3]} b={[-1.12, DECK + 0.45, 1.6]} r={0.022} m={M.rail} />
        <Beam a={[1.12, DECK + 0.45, 1.6]} b={[0, DECK + 0.5, 2.6]} r={0.022} m={M.rail} />
        <Beam a={[-1.12, DECK + 0.45, 1.6]} b={[0, DECK + 0.5, 2.6]} r={0.022} m={M.rail} />
        {/* canopy: four posts and a yellow and white striped roof */}
        {[
          [1.08, 1.55],
          [-1.08, 1.55],
          [1.08, -1.75],
          [-1.08, -1.75],
        ].map(([x, z]) => (
          <Beam key={`${x}${z}`} a={[x, DECK, z]} b={[x, ROOF, z]} r={0.035} m={M.post} />
        ))}
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Box key={i} p={[0, ROOF + 0.04 + (i % 2) * 0.004, -1.95 + i * 0.6]} s={[2.5, 0.06, 0.6]} m={i % 2 ? M.stripeB : M.stripeA} />
        ))}
        <mesh geometry={SIGN_GEO} material={sign} position={[1.27, ROOF - 0.1, -0.1]} rotation={[0, Math.PI / 2, 0]} />
        <mesh geometry={SIGN_GEO} material={sign} position={[-1.27, ROOF - 0.1, -0.1]} rotation={[0, -Math.PI / 2, 0]} />
        {/* helm console at the stern */}
        <Box p={[0.55, DECK + 0.32, -2.0]} s={[0.5, 0.6, 0.3]} m={M.frame} />
        <Beam a={[0.55, DECK + 0.66, -1.9]} b={[0.55, DECK + 0.8, -1.75]} r={0.02} m={M.dark} />
        <MiniBot color="#ffde69" parts={guide} position={[0.55, DECK, -2.45]} scale={0.85} shadow={false} />
        {TOURISTS.map((spot, i) => (
          <MiniBot key={i} color={CREW_COLORS[(i * 3 + 1) % CREW_COLORS.length]} parts={tourists[i]} position={[spot.x, DECK, spot.z]} rotationY={spot.rot} scale={0.8} shadow={false} />
        ))}
        {/* running lights */}
        <SideLights x={1.15} y={DECK + 0.1} z={1.7} />
        <Light p={[0, ROOF + 0.15, -1.9]} kind="white" />
        <Light p={[0, DECK + 0.15, -2.7]} kind="white" s={0.8} />
      </group>
      <mesh ref={halo} geometry={HALO_GEO} material={M.halo} scale={[0.9, 1, 1.2]} visible={false} renderOrder={4} />
      <primitive object={spray.mesh} />
    </>
  );
}
