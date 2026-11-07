import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CAMPFIRE, DECKS, ISLAND, ROCKS, islandWobble, nearestZone, siteDistance, terrainY } from '../../utils/paths.js';
import { aliveClock, readStore, testOn, writeStore } from '../../wild/director.js';
import { BODY_GEO, HIT_MAT, LOW_GEO, buildGeo, hoverPointer, islandToast, setHittable, std, tapOnly } from './kit.js';

// Tide pools. The island has a short tide of its own: one cycle every 6
// minutes of the page being looked at (hidden-tab time doesn't count). The
// first low tide starts about 40 s in and lasts about 2.5 minutes, fading in
// and out over ~12 s, so almost every visit catches one. At low tide little
// rock pools open up at the edge of the beach around the island (two on the
// south beach facing the default camera), with starfish, anemones and a crab
// that scuttles sideways. Tap a pool for a tide pool fact (they cycle, and
// the next one is remembered between visits).
// ?test=tide holds the tide out.
//
// tide.low (0 = high tide, 1 = all the way out) is exported for anyone who
// wants to react to it.

export const TIDE_PERIOD = 360;
const LOW_FROM = 40; // seconds into each cycle
const LOW_LEN = 150;
const FADE = 12;
export const tide = { low: 0 };

function lowTideAt(t) {
  const c = t % TIDE_PERIOD;
  const a = (c - LOW_FROM) / FADE;
  const b = (LOW_FROM + LOW_LEN - c) / FADE;
  const k = Math.min(1, Math.max(0, Math.min(a, b)));
  return k * k * (3 - 2 * k);
}

const FACTS = [
  'Starfish have no brain and no blood. They pump seawater around instead.',
  'Hermit crabs swap shells in a line, biggest first, so everyone trades up.',
  'A starfish can regrow a lost arm. Some can grow a whole new star from one arm.',
  'Crabs walk sideways because their legs bend best that way.',
  'Sea anemones are animals, not plants: cousins of jellyfish and coral.',
  'A starfish eats by pushing its stomach out of its mouth. Rude, but effective.',
  'Starfish have a simple eye at the tip of every arm.',
  "Clownfish live in an anemone's stinging tentacles, protected by a coat of slime.",
  "Tides come from the Moon's pull. Most beaches get two highs and two lows a day.",
  'Fiddler crabs wave their big claw to show off and drum on the sand to talk.',
  'Tide pool critters ride out hours of sun and air between tides. Tough little crew.',
];
const FACT_KEY = 'bah-tide-fact';

const MAT = {
  wet: std('#a88d5c', { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, roughness: 0.4 }),
  water: new THREE.MeshStandardMaterial({
    color: '#3fb7c4',
    emissive: '#0f4d57',
    emissiveIntensity: 0.25,
    flatShading: true,
    transparent: true,
    depthWrite: false,
    roughness: 0.12,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  }),
  rock: std('#8a8f93'),
  rockDark: std('#6c7176'),
  starOrange: std('#f08a3a'),
  starPurple: std('#9b4fb0'),
  anemone: std('#ff7fa8', { emissive: '#5a1030', emissiveIntensity: 0.15 }),
  anemoneGreen: std('#6fd29a', { emissive: '#103a24', emissiveIntensity: 0.15 }),
  crab: std('#e0532f'),
  crabDark: std('#a8361d'),
  eye: std('#161616'),
};

// Five-armed star, flat on its belly, pointing along +x. Radius 1.
const STAR_GEO = (() => {
  const v = [0, 0.22, 0];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.42 : 1;
    v.push(Math.cos(a) * r, 0, Math.sin(a) * r);
  }
  const idx = [];
  for (let i = 0; i < 10; i++) idx.push(0, 1 + ((i + 1) % 10), 1 + i);
  return buildGeo(v, idx);
})();

// Anemone: a stubby column with a crown of tentacles. Radius ~0.1.
const ANEMONE_GEO = (() => {
  const parts = [];
  const col = new THREE.CylinderGeometry(0.06, 0.075, 0.07, 7);
  col.translate(0, 0.035, 0);
  parts.push(col);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const c = new THREE.ConeGeometry(0.018, 0.11, 3);
    c.translate(0, 0.055, 0);
    c.rotateZ(0.85);
    c.rotateY(a);
    c.translate(Math.cos(a) * 0.035, 0.07, -Math.sin(a) * 0.035);
    parts.push(c);
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  g.computeVertexNormals();
  return g;
})();

// Three little legs on one side of a crab, splayed out along +x.
const CRAB_LEGS_GEO = (() => {
  const parts = [-0.05, 0, 0.05].map((z, i) => {
    const b = new THREE.BoxGeometry(0.11, 0.014, 0.016);
    b.translate(0.055, 0, 0);
    b.rotateZ(-0.5);
    b.rotateY((i - 1) * 0.35);
    b.translate(0.05, 0.03, z);
    return b.toNonIndexed();
  });
  return mergeGeometries(parts);
})();

const POOL_GEO = new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2);

// Where the pools go: preferred spots around the shore, each nudged along
// the beach to the clearest bit of sand near the waterline.
// South beach (in front of the default camera), west, north and east.
const PREFER = [0.92, 1.86, 3.1, 4.86, 5.9];
// Easter eggs on the south beach that aren't in sites.js: the message in a
// bottle and the photo booth (wild/Easter.jsx).
const KEEP_CLEAR = [
  [-2.5, 15.42, 1.6],
  [4.6, 13.4, 1.6],
  [CAMPFIRE.x, CAMPFIRE.z, 4.5],
];

function shorePoint(theta, e) {
  const dx = ISLAND.rx * Math.cos(theta);
  const dz = ISLAND.rz * Math.sin(theta);
  const s = Math.sqrt(e) * islandWobble(dx, dz);
  return { x: dx * s, z: dz * s };
}

function clearance(x, z) {
  let c = siteDistance(x, z) - 0.6;
  c = Math.min(c, nearestZone(x, z).distance - 2.6);
  for (const d of DECKS) c = Math.min(c, Math.hypot(Math.max(d.x0 - x, 0, x - d.x1), Math.max(d.z0 - z, 0, z - d.z1)) - 2.2);
  for (const r of ROCKS) c = Math.min(c, Math.hypot(r.x - x, r.z - z) - 0.9 - r.s);
  for (const [kx, kz, kr] of KEEP_CLEAR) c = Math.min(c, Math.hypot(kx - x, kz - z) - kr);
  return c;
}

let seed = 11;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function buildPools() {
  const pools = [];
  PREFER.forEach((th0, i) => {
    let best = null;
    for (let d = -0.16; d <= 0.16; d += 0.02) {
      for (const e of [0.935, 0.95]) {
        const p = shorePoint(th0 + d, e);
        const c = clearance(p.x, p.z) - Math.abs(d) * 2;
        if (!best || c > best.c) best = { ...p, c, th: th0 + d };
      }
    }
    if (!best || best.c < -0.3) return;
    // tilt to the beach slope so it sits flush on the sand
    const h = 0.25;
    const nx = terrainY(best.x - h, best.z) - terrainY(best.x + h, best.z);
    const nz = terrainY(best.x, best.z - h) - terrainY(best.x, best.z + h);
    const normal = new THREE.Vector3(nx, 2 * h, nz).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    const out = Math.atan2(best.x / ISLAND.rx ** 2, best.z / ISLAND.rz ** 2); // seaward, as a yaw
    const rx = 0.62 + rand() * 0.2;
    const rz = 0.42 + rand() * 0.15;
    // rocks around the rim, anemones and stars in and beside the water
    const rocks = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + rand() * 0.8;
      const s = 0.09 + rand() * 0.1;
      const g = LOW_GEO.clone();
      g.scale(s * 1.3, s * 0.8, s);
      g.rotateY(rand() * 3);
      g.translate(Math.cos(a) * (rx + 0.05), s * 0.25, Math.sin(a) * (rz + 0.05));
      rocks.push(g);
    }
    pools.push({
      i,
      x: best.x,
      z: best.z,
      y: terrainY(best.x, best.z) + 0.035, // a hair above the (coarser) sand mesh
      quat,
      yaw: out, // local +z faces the sea, x runs along the shore
      rx,
      rz,
      rocks: mergeGeometries(rocks),
      stars: [
        { x: rx * 0.35, z: -rz * 0.25, s: 0.13, rot: rand() * 6, mat: i % 2 ? MAT.starPurple : MAT.starOrange, y: 0.01 },
        { x: -rx - 0.22, z: rz * 0.4, s: 0.1, rot: rand() * 6, mat: i % 2 ? MAT.starOrange : MAT.starPurple, y: 0.005 },
      ],
      anemones: [
        { x: -rx * 0.45, z: rz * 0.3, mat: MAT.anemone, s: 1 },
        { x: -rx * 0.2, z: -rz * 0.45, mat: i % 2 ? MAT.anemone : MAT.anemoneGreen, s: 0.8 },
        { x: rx * 0.6, z: rz * 0.35, mat: MAT.anemoneGreen, s: 0.9 },
      ],
      crab: { x: rx * 0.2, z: rz + 0.38, ph: rand() * 6 },
    });
  });
  return pools;
}

function Crab({ crab, low, clock }) {
  const ref = useRef();
  const legL = useRef();
  const legR = useRef();
  const clawL = useRef();
  const clawR = useRef();
  useFrame(() => {
    if (low.current < 0.05) return;
    const t = clock.t + crab.ph;
    // scuttle a little way sideways, stop, wave, scuttle back
    const cyc = (t * 0.22) % 2;
    const moving = cyc % 1 < 0.45;
    const k = Math.min(1, (cyc % 1) / 0.45);
    const along = cyc < 1 ? k : 1 - k;
    const e = along * along * (3 - 2 * along);
    ref.current.position.x = crab.x + (e - 0.5) * 0.7;
    const wig = moving ? Math.sin(t * 28) * 0.35 : 0;
    legL.current.rotation.y = wig;
    legR.current.rotation.y = -wig;
    const wave = moving ? 0 : Math.max(0, Math.sin(t * 5)) * 0.6;
    clawL.current.rotation.z = wave;
    clawR.current.rotation.z = -wave * 0.6;
  });
  return (
    <group ref={ref} position={[crab.x, 0.02, crab.z]} rotation={[0, Math.PI, 0]} scale={1.3}>
      <mesh geometry={BODY_GEO} material={MAT.crab} position={[0, 0.05, 0]} scale={[0.1, 0.04, 0.075]} />
      <group ref={legR}>
        <mesh geometry={CRAB_LEGS_GEO} material={MAT.crabDark} />
      </group>
      <group ref={legL} scale={[-1, 1, 1]}>
        <mesh geometry={CRAB_LEGS_GEO} material={MAT.crabDark} />
      </group>
      <group ref={clawL} position={[-0.08, 0.05, 0.07]}>
        <mesh geometry={LOW_GEO} material={MAT.crab} position={[-0.02, 0.01, 0.03]} scale={[0.035, 0.028, 0.045]} />
      </group>
      <group ref={clawR} position={[0.08, 0.05, 0.07]}>
        <mesh geometry={LOW_GEO} material={MAT.crab} position={[0.02, 0.01, 0.03]} scale={[0.035, 0.028, 0.045]} />
      </group>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={LOW_GEO} material={MAT.eye} position={[s * 0.035, 0.11, 0.06]} scale={0.014} />
      ))}
    </group>
  );
}

function Pool({ pool, low, clock, onTap }) {
  const inner = useRef();
  const hit = useRef();
  const anem = useRef();
  useEffect(() => setHittable(hit.current, false), []);
  useFrame(() => {
    const k = low.current;
    setHittable(hit.current, k > 0.4);
    if (k < 0.002) return;
    // the critters rise out of the sand as the water drains away
    inner.current.position.y = (1 - k) * -0.22;
    inner.current.scale.setScalar(0.6 + 0.4 * k);
    const sway = Math.sin(clock.t * 1.3 + pool.i) * 0.12;
    for (const c of anem.current.children) c.rotation.z = sway;
  });
  return (
    <group position={[pool.x, pool.y, pool.z]} quaternion={pool.quat} scale={1.2}>
      <group rotation={[0, pool.yaw, 0]}>
        <mesh geometry={POOL_GEO} material={MAT.wet} scale={[pool.rx + 0.45, 1, pool.rz + 0.4]} />
        <mesh geometry={POOL_GEO} material={MAT.water} position={[0, 0.006, 0]} scale={[pool.rx, 1, pool.rz]} />
        <group ref={inner}>
          <mesh geometry={pool.rocks} material={MAT.rock} />
          {pool.stars.map((s, k) => (
            <mesh key={k} geometry={STAR_GEO} material={s.mat} position={[s.x, s.y, s.z]} rotation={[0, s.rot, 0]} scale={[s.s, s.s * 0.5, s.s]} />
          ))}
          <group ref={anem}>
            {pool.anemones.map((a, k) => (
              <mesh key={k} geometry={ANEMONE_GEO} material={a.mat} position={[a.x, -0.01, a.z]} scale={a.s} />
            ))}
          </group>
          <Crab crab={pool.crab} low={low} clock={clock} />
        </group>
        <mesh ref={hit} geometry={BODY_GEO} material={HIT_MAT} position={[0, 0.1, 0.15]} scale={[pool.rx + 0.5, 0.35, pool.rz + 0.7]} onClick={tapOnly(onTap)} {...hoverPointer} />
      </group>
    </group>
  );
}

export default function TidePools({ lowPower = false }) {
  const ref = useRef();
  const clock = useMemo(aliveClock, []);
  const test = testOn('tide');
  const low = useRef(test ? 1 : 0);
  const pools = useMemo(() => {
    const all = buildPools();
    // phones: keep the two on the south beach and one more
    return lowPower ? all.filter((p) => p.i <= 2) : all;
  }, [lowPower]);
  useEffect(() => () => pools.forEach((p) => p.rocks.dispose()), [pools]);

  const onTap = () => {
    const n = (parseInt(readStore('localStorage', FACT_KEY) || '0', 10) || 0) % FACTS.length;
    writeStore('localStorage', FACT_KEY, String((n + 1) % FACTS.length));
    islandToast(`Tide pool fact: ${FACTS[n]}`);
  };

  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const k = test ? 1 : lowTideAt(t);
    low.current = k;
    tide.low = k;
    const g = ref.current;
    if (!g) return;
    g.visible = k > 0.002;
    if (!g.visible) return;
    MAT.wet.opacity = 0.75 * Math.min(1, k * 1.4);
    MAT.water.opacity = 0.82 * k;
  });

  return (
    <group ref={ref} visible={false}>
      {pools.map((p) => (
        <Pool key={p.i} pool={p} low={low} clock={clock} onTap={onTap} />
      ))}
    </group>
  );
}
