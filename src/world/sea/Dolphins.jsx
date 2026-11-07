import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { seaClear } from '../../utils/paths.js';
import { aliveClock, testOn } from '../../wild/director.js';
import { splash } from './Spray.jsx';
import { BODY_GEO, CONE4, buildGeo, lanePoint, onScreen, rnd, std } from './kit.js';

// A pod of dolphins (a pair, sometimes with a little one) racing along the
// outer shallows, leaping in step, each a beat behind the one before, with
// a splash at every take-off and landing. Often at sunrise, now and then
// through the day, never at night. They pick a stretch of water the camera
// can see.

const MAT = {
  back: std('#7a8ea5', { roughness: 0.4 }),
  belly: std('#dfe6ec', { roughness: 0.4 }),
  fin: new THREE.MeshStandardMaterial({ color: '#6c8098', flatShading: true, roughness: 0.4, side: THREE.DoubleSide }),
};
// Nose along +z.
const DORSAL = buildGeo([0, 0, 0.18, 0, 0, -0.14, 0, 0.27, -0.24], [0, 1, 2, 0, 2, 1]);
const FLUKES = buildGeo([0, 0, -0.6, 0.3, 0.02, -0.86, 0, 0, -0.76, -0.3, 0.02, -0.86], [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]);
const PEC = buildGeo([0, 0, 0.08, 0.2, -0.06, -0.12, 0, 0, -0.06], [0, 1, 2, 0, 2, 1]);

function DolphinModel() {
  return (
    <group>
      <mesh geometry={BODY_GEO} material={MAT.back} scale={[0.17, 0.18, 0.72]} />
      <mesh geometry={BODY_GEO} material={MAT.belly} position={[0, -0.06, 0.04]} scale={[0.13, 0.11, 0.6]} />
      <mesh geometry={CONE4} material={MAT.back} position={[0, -0.03, 0.8]} rotation={[Math.PI / 2, 0, 0]} scale={[0.05, 0.2, 0.05]} />
      <mesh geometry={DORSAL} material={MAT.fin} position={[0, 0.14, 0]} />
      <mesh geometry={FLUKES} material={MAT.fin} />
      <mesh geometry={PEC} material={MAT.fin} position={[0.12, -0.08, 0.3]} />
      <mesh geometry={PEC} material={MAT.fin} position={[-0.12, -0.08, 0.3]} scale={[-1, 1, 1]} />
    </group>
  );
}

const LANE_E = 2.35; // just outside the end of Launch's Pier, inside the shark lane
const SPEED = 3.0; // world units per second
const PERIOD = 2.3; // seconds per leap cycle
const AIR = 1.05; // seconds in the air
const HEIGHT = 1.2;
// Each pod member: a beat behind, a little to one side, a little smaller.
const MEMBERS = [
  { delay: 0, de: 0, s: 1 },
  { delay: 0.17, de: 0.11, s: 0.96 },
  { delay: 0.34, de: -0.1, s: 0.62 }, // the little one
];

const p = { x: 0, z: 0 };
const q = { x: 0, z: 0 };

export default function Dolphins({ phase, lowPower = false }) {
  const refs = [useRef(), useRef(), useRef()];
  const camera = useThree((s) => s.camera);
  const clock = useMemo(aliveClock, []);
  const test = testOn('dolphins');
  const st = useMemo(() => ({ next: test ? 3 : rnd(20, 60), run: null, air: [false, false, false] }), [test]);

  useFrame((_, delta) => {
    const t = clock.tick(delta);
    if (!st.run && t >= st.next) {
      // sunrise is dolphin time; the rest of the day it's a treat
      const gap = test ? 18 : phase === 'sunrise' ? rnd(25, 50) : rnd(150, 330);
      if (phase === 'night' && !test) {
        st.next = t + 60;
      } else {
        // a stretch of the lane the camera can see, if there is one
        const dir = Math.random() < 0.5 ? 1 : -1;
        const arc = 1.25;
        const options = [];
        for (let i = 0; i < 24; i++) {
          const th = (i / 24) * Math.PI * 2;
          lanePoint(th + dir * arc * 0.5, LANE_E, p);
          lanePoint(th + dir * arc * 0.15, LANE_E, q);
          if (onScreen(camera, p.x, 0, p.z, 0.75, 0.75) && onScreen(camera, q.x, 0, q.z, 0.9, 0.85)) options.push(th);
        }
        const th0 = options.length ? options[Math.floor(Math.random() * options.length)] : rnd(0, Math.PI * 2);
        const len = arc * Math.sqrt(LANE_E) * 17;
        st.run = { t0: t, th0, dir, dur: len / SPEED, n: lowPower || Math.random() < 0.55 ? 2 : 3 };
        st.air.fill(false);
        st.next = t + gap;
      }
    }

    const run = st.run;
    for (let i = 0; i < 3; i++) {
      const g = refs[i].current;
      if (!g) continue;
      const m = MEMBERS[i];
      const tl = run ? t - run.t0 - m.delay : -1;
      if (!run || i >= run.n || tl < 0 || tl > run.dur) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      const k = tl / run.dur;
      const th = run.th0 + run.dir * k * 1.25;
      lanePoint(th, LANE_E + m.de, p);
      lanePoint(th + run.dir * 0.01, LANE_E + m.de, q);
      const heading = Math.atan2(q.x - p.x, q.z - p.z);
      // leap rhythm, the same for the whole pod so they jump in step
      const cyc = (tl + 0.4) % PERIOD;
      const inAir = cyc < AIR && tl > 0.6 && tl < run.dur - 1 && seaClear(p.x, p.z, 2, 1.6);
      let y = -0.45;
      let pitch = 0;
      if (inAir) {
        const a = cyc / AIR;
        y = -0.3 + 4 * HEIGHT * a * (1 - a);
        pitch = -Math.atan2(4 * HEIGHT * (1 - 2 * a), SPEED * AIR);
      }
      if (inAir !== st.air[i]) {
        splash(p.x, p.z, inAir ? 0.45 * m.s : 0.65 * m.s, inAir ? 6 : 9);
        st.air[i] = inAir;
      }
      g.position.set(p.x, y, p.z);
      g.rotation.set(pitch, heading, 0);
      g.scale.setScalar(m.s * 1.15);
    }
    if (run && t - run.t0 > run.dur + 1) st.run = null;
  });

  return refs.map((r, i) => (
    <group key={i} ref={r} visible={false} rotation-order="YXZ">
      <DolphinModel />
    </group>
  ));
}
