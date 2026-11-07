import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DOCK, ISLAND, SEA_LANES, islandE, seaClear } from '../utils/paths.js';
import { aliveClock, testOn } from '../wild/director.js';
import { world } from '../world/state.js';
import Dolphins from '../world/sea/Dolphins.jsx';
import FishSchools from '../world/sea/Fish.jsx';
import Spray, { splash } from '../world/sea/Spray.jsx';
import Turtles from '../world/sea/Turtles.jsx';
import Whale from '../world/sea/Whale.jsx';
import Nessie from '../world/sea/Nessie.jsx';
import TidePools from '../world/sea/TidePools.jsx';
import Bigfoot from '../wild/Bigfoot.jsx';
import { BODY_GEO, CONE4, TRI_GEO, buildGeo, rnd, std } from '../world/sea/kit.js';

// Sea life and the living world around the island. All low-poly, a handful
// of meshes each, and a single cheap useFrame per creature.
//   Two great white shark fins circling in the shark lanes, with V wakes
//   A blue marlin that leaps far out every 40 to 90 seconds
//   Salmon hopping off the end of Launch's Pier
//   Schools of tropical fish in the shallows (and under Flo's glass floor)
//   Sea turtles cruising, coming up to breathe, one napping on the beach
//   Dolphin pods leaping in step: often at sunrise, now and then by day
//   A humpback whale breaching far out (rare)
//   Nessie surfacing far out now and then (rare; world/sea/Nessie.jsx)
//   Tide pools with starfish, anemones and crabs at low tide (TidePools.jsx)
//   Bigfoot, very very rarely, in the north-west woods (wild/Bigfoot.jsx)
//   Seagulls overhead, fireflies over the island at night
// Purely ambient: none of it says anything about the bots or the data.
// Not rendered at all when reduced motion is on.
//
// Test switches: ?test=whale, dolphins, turtles, fish, wake (a little test
// dinghy that shows off boat wakes and scares the fish), nessie, bigfoot,
// tide (holds the tide out so the tide pools stay open).

const MAT = {
  shark: std('#5d6873'),
  marlin: std('#1f4fb8', { roughness: 0.4 }),
  marlinBelly: std('#cfe0f2', { roughness: 0.4 }),
  marlinFin: std('#173a8a'),
  salmon: std('#e58a78', { roughness: 0.45 }),
  gull: std('#ffffff'),
  gullWing: std('#c9ced6'),
  beak: std('#f2a03d'),
  hull: std('#fdf8ee'),
  stripe: std('#ff7a3d'),
  motor: std('#2b2a33'),
};

// Fin: swept-back triangle with a little thickness at the base. Points along +x.
const FIN_GEO = buildGeo(
  [0.42, 0, 0, -0.4, 0, 0.07, -0.4, 0, -0.07, -0.28, 0.82, 0, 0.0, 0, 0.09, 0.0, 0, -0.09],
  [0, 4, 3, 4, 1, 3, 0, 3, 5, 5, 3, 2, 1, 2, 3]
);
const WING_GEO = buildGeo([0, 0, 0.08, 0, 0, -0.08, 0.7, 0.02, 0.02, 0.6, 0, -0.1], [0, 2, 1, 1, 2, 3]);

// --- Great white sharks -------------------------------------------------------

// Fins circle in their own lanes (sites.js), well clear of Launch's Pier and
// Flo's platform. Each registers in world.boats while its fin is up, so the
// water draws it a little V wake and the fish keep their distance.
function SharkFin({ id, lane, speed, offset, dir = 1 }) {
  const ref = useRef();
  const fin = useRef();
  const clock = useMemo(aliveClock, []);
  const boat = useMemo(() => ({ x: 0, z: 0, heading: 0, speed: 0, size: 1.1 }), []);
  useEffect(() => {
    world.boats.set(id, boat);
    return () => world.boats.delete(id);
  }, [id, boat]);
  useFrame((_, delta) => {
    const t = clock.tick(delta) + offset * 50;
    const a = offset + t * speed * dir;
    const x = Math.cos(a) * lane.rx;
    const z = Math.sin(a) * lane.rz;
    ref.current.position.set(x, 0, z);
    // heading along the path (derivative of the ellipse)
    const dx = -Math.sin(a) * lane.rx * dir;
    const dz = Math.cos(a) * lane.rz * dir;
    ref.current.rotation.y = Math.atan2(-dz, dx);
    // gentle bob, and now and then a slow dip under
    const dip = Math.max(0, Math.sin(t * 0.11 + offset * 3)) ** 8;
    fin.current.position.y = -0.12 + Math.sin(t * 1.3 + offset) * 0.04 - dip * 0.75;
    fin.current.rotation.z = Math.sin(t * 2.1 + offset) * 0.06;
    boat.x = x;
    boat.z = z;
    boat.heading = Math.atan2(dx, dz);
    boat.speed = dip < 0.3 ? speed * Math.hypot(dx, dz) : 0;
  });
  return (
    <group ref={ref}>
      <mesh ref={fin} geometry={FIN_GEO} material={MAT.shark} scale={1.25} />
    </group>
  );
}

// --- Blue marlin --------------------------------------------------------------

function MarlinBody() {
  return (
    <group>
      <mesh geometry={BODY_GEO} material={MAT.marlin} scale={[0.95, 0.24, 0.2]} />
      <mesh geometry={BODY_GEO} material={MAT.marlinBelly} position={[0.05, -0.09, 0]} scale={[0.8, 0.14, 0.16]} />
      {/* bill */}
      <mesh geometry={CONE4} material={MAT.marlinFin} position={[1.25, 0.03, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[0.035, 0.7, 0.035]} />
      {/* tall dorsal sail */}
      <mesh geometry={TRI_GEO} material={MAT.marlinFin} position={[0.6, 0.15, 0]} scale={[1.0, 0.55, 1]} />
      {/* crescent tail */}
      <mesh geometry={TRI_GEO} material={MAT.marlinFin} position={[-0.85, 0, 0]} rotation={[0, 0, 0.5]} scale={[0.45, 0.5, 1]} />
      <mesh geometry={TRI_GEO} material={MAT.marlinFin} position={[-0.85, 0, 0]} rotation={[0, 0, Math.PI - 0.5]} scale={[0.45, -0.5, 1]} />
    </group>
  );
}

// Leaps far out, between the tour boat's loop and the sailboats, on open water.
function Marlin() {
  const ref = useRef();
  const clock = useMemo(aliveClock, []);
  const st = useRef({ next: rnd(8, 16), jump: null, landed: false });
  const DUR = 1.7;
  const LEN = 5.5;
  const H = 2.8;
  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const s = st.current;
    if (!s.jump && t >= s.next) {
      const a = rnd(0, Math.PI * 2);
      const r = rnd(37, 43);
      const heading = a + Math.PI / 2 + rnd(-0.4, 0.4);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const ex = x + Math.cos(heading) * LEN;
      const ez = z - Math.sin(heading) * LEN;
      if (seaClear(x, z, 3) && seaClear(ex, ez, 3)) {
        s.jump = { t0: t, x, z, h: heading };
        s.landed = false;
        splash(x, z, 1.3, 12);
      } else s.next = t + 1;
    }
    const j = s.jump;
    if (!j) {
      ref.current.visible = false;
      return;
    }
    const k = (t - j.t0) / DUR;
    if (k > 0.95 && !s.landed) {
      s.landed = true;
      splash(j.x + Math.cos(j.h) * LEN, j.z - Math.sin(j.h) * LEN, 1.5, 16);
    }
    if (k > 1) {
      s.jump = null;
      s.next = t + rnd(40, 90);
      ref.current.visible = false;
      return;
    }
    ref.current.visible = true;
    const d = k * LEN;
    ref.current.position.set(j.x + Math.cos(j.h) * d, -0.3 + 4 * H * k * (1 - k), j.z - Math.sin(j.h) * d);
    ref.current.rotation.set(0, j.h, Math.atan((4 * H * (1 - 2 * k)) / LEN) * 0.9 + Math.sin(k * Math.PI) * 0.15);
  });
  return (
    <group ref={ref} visible={false} scale={1.3}>
      <MarlinBody />
    </group>
  );
}

// --- Salmon hopping off the end of Launch's Pier --------------------------------

// Out past the end of the pier (DOCK.x0, the west end), away from the
// cruiser on its north side and the dock office on its south side.
function Salmon() {
  const ref = useRef();
  const clock = useMemo(aliveClock, []);
  const st = useRef({ next: rnd(2, 5), hop: null, landed: false });
  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const s = st.current;
    if (!s.hop && t >= s.next) {
      const a = rnd(Math.PI * 0.68, Math.PI * 1.32);
      const r = rnd(1.6, 3.2);
      const x = DOCK.x0 - 0.3 + Math.cos(a) * r;
      const z = (DOCK.z0 + DOCK.z1) / 2 + Math.sin(a) * r;
      // hop roughly outward, never back under the pier
      const h = -a + rnd(-0.8, 0.8);
      s.hop = { t0: t, x, z, h };
      s.landed = false;
      splash(x, z, 0.3, 4);
    }
    const hop = s.hop;
    if (!hop) return;
    const k = (t - hop.t0) / 0.7;
    if (k > 0.9 && !s.landed) {
      s.landed = true;
      splash(hop.x + Math.cos(hop.h) * 1.1, hop.z - Math.sin(hop.h) * 1.1, 0.4, 6);
    }
    if (k > 1) {
      s.hop = null;
      s.next = t + rnd(3, 8);
      ref.current.visible = false;
      return;
    }
    ref.current.visible = true;
    const d = k * 1.1;
    ref.current.position.set(hop.x + Math.cos(hop.h) * d, -0.15 + 4 * 0.75 * k * (1 - k), hop.z - Math.sin(hop.h) * d);
    ref.current.rotation.set(0, hop.h, (1 - 2 * k) * 0.9);
  });
  return (
    <group ref={ref} visible={false}>
      <mesh geometry={BODY_GEO} material={MAT.salmon} scale={[0.26, 0.09, 0.07]} />
      <mesh geometry={TRI_GEO} material={MAT.salmon} position={[-0.22, 0, 0]} rotation={[0, 0, 0.6]} scale={[0.14, 0.14, 1]} />
    </group>
  );
}

// --- Seagulls -------------------------------------------------------------------

// Wide loops over the bigger island, high above the lighthouse lamp.
function Gull({ r, y, speed, offset }) {
  const ref = useRef();
  const lw = useRef();
  const rw = useRef();
  const clock = useMemo(aliveClock, []);
  useFrame((_, delta) => {
    const t = clock.tick(delta) + offset * 10;
    const a = offset + t * speed;
    ref.current.position.set(Math.cos(a) * r, y + Math.sin(t * 0.5 + offset) * 0.6, Math.sin(a) * r * (ISLAND.rz / ISLAND.rx));
    ref.current.rotation.set(0, -a - (Math.PI / 2) * Math.sign(speed), Math.sign(speed) * 0.25);
    // flap a few beats, then glide
    const cyc = (t * 0.35 + offset) % 1;
    const flap = cyc < 0.45 ? Math.sin(t * 9) * 0.55 : 0.12;
    lw.current.rotation.x = flap;
    rw.current.rotation.x = -flap;
  });
  return (
    <group ref={ref} scale={0.9}>
      <mesh geometry={BODY_GEO} material={MAT.gull} scale={[0.26, 0.08, 0.08]} />
      <mesh geometry={CONE4} material={MAT.beak} position={[0.3, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[0.03, 0.09, 0.03]} />
      <group ref={lw}>
        <mesh geometry={WING_GEO} material={MAT.gullWing} rotation={[0, Math.PI / 2, 0]} />
      </group>
      <group ref={rw}>
        <mesh geometry={WING_GEO} material={MAT.gullWing} rotation={[0, -Math.PI / 2, 0]} />
      </group>
    </group>
  );
}

function Seagulls() {
  return (
    <>
      <Gull r={17} y={9.5} speed={0.1} offset={0} />
      <Gull r={22} y={11} speed={0.085} offset={2.1} />
      <Gull r={13.5} y={8.6} speed={-0.12} offset={4.2} />
    </>
  );
}

// --- Fireflies at night -------------------------------------------------------

function Fireflies({ count = 70, strength = 1 }) {
  const clock = useMemo(aliveClock, []);
  const flies = useMemo(
    () =>
      Array.from({ length: count }, () => {
        let x;
        let z;
        do {
          x = rnd(-ISLAND.rx, ISLAND.rx) * 0.92;
          z = rnd(-ISLAND.rz, ISLAND.rz) * 0.92;
        } while (islandE(x, z) > 0.8 || Math.hypot(x, z) < 2.6);
        return { x, z, y: rnd(0.8, 2.4), ph: rnd(0, Math.PI * 2), sp: rnd(0.3, 0.8), blink: rnd(0.4, 1.1) };
      }),
    [count]
  );
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, [count]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    for (let i = 0; i < flies.length; i++) {
      const f = flies[i];
      pos[i * 3] = f.x + Math.sin(t * f.sp + f.ph) * 0.6;
      pos[i * 3 + 1] = f.y + Math.sin(t * f.sp * 1.7 + f.ph) * 0.3;
      pos[i * 3 + 2] = f.z + Math.cos(t * f.sp * 0.8 + f.ph) * 0.6;
      const glow = Math.max(0, Math.sin(t * f.blink + f.ph)) ** 3 * strength;
      col[i * 3] = glow;
      col[i * 3 + 1] = glow * 0.95;
      col[i * 3 + 2] = glow * 0.35;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial size={0.32} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation fog={false} />
    </points>
  );
}

// --- ?test=wake: a little dinghy doing figure-eights off the south beach --------

function TestDinghy() {
  const ref = useRef();
  const clock = useMemo(aliveClock, []);
  const boat = useMemo(() => ({ x: 0, z: 0, heading: 0, speed: 0, size: 1.8 }), []);
  const lamp = useMemo(() => ({ x: 0, z: 0, strength: 1 }), []); // a glow spot that follows it
  useEffect(() => {
    world.boats.set('test-dinghy', boat);
    world.glow.set('test-dinghy', lamp);
    return () => {
      world.boats.delete('test-dinghy');
      world.glow.delete('test-dinghy');
    };
  }, [boat, lamp]);
  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const w = 0.16;
    const x = 13 * Math.sin(w * t);
    const z = 24 + 4.5 * Math.sin(2 * w * t);
    const dx = 13 * w * Math.cos(w * t);
    const dz = 4.5 * 2 * w * Math.cos(2 * w * t);
    boat.x = x;
    boat.z = z;
    boat.heading = Math.atan2(dx, dz);
    boat.speed = Math.hypot(dx, dz);
    lamp.x = x - Math.sin(boat.heading) * 3;
    lamp.z = z - Math.cos(boat.heading) * 3;
    ref.current.position.set(x, 0.05, z);
    ref.current.rotation.set(0, boat.heading, 0);
  });
  return (
    <group ref={ref}>
      <mesh geometry={BODY_GEO} material={MAT.hull} scale={[0.4, 0.2, 0.9]} />
      <mesh geometry={BODY_GEO} material={MAT.stripe} position={[0, 0.08, 0]} scale={[0.42, 0.05, 0.92]} />
      <mesh geometry={BODY_GEO} material={MAT.motor} position={[0, 0.22, -0.85]} scale={[0.1, 0.18, 0.1]} />
    </group>
  );
}

// ---------------------------------------------------------------------------

export default function SeaLife({ sky, lowPower = false }) {
  const night = sky.stars > 0.5;
  return (
    <group>
      <SharkFin id="shark-inner" lane={SEA_LANES.sharkInner} speed={0.045} offset={0.8} dir={1} />
      <SharkFin id="shark-outer" lane={SEA_LANES.sharkOuter} speed={0.034} offset={3.6} dir={-1} />
      <Marlin />
      <Salmon />
      <FishSchools lowPower={lowPower} />
      <Turtles lowPower={lowPower} />
      <Dolphins phase={sky.phase} lowPower={lowPower} />
      <Whale />
      <Nessie hour={sky.hour} />
      <TidePools lowPower={lowPower} />
      <Bigfoot phase={sky.phase} />
      <Seagulls />
      <Spray />
      {testOn('wake') && <TestDinghy />}
      {night && <Fireflies count={lowPower ? 32 : 70} strength={Math.min(1, sky.stars)} />}
    </group>
  );
}
