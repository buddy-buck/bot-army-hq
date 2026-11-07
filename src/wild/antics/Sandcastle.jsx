import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { extraColor } from '../MiniBot.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import { dayKeyPT } from '../../utils/time.js';
import { rareGap, readStore, writeStore } from '../director.js';
import { puff } from './fx.jsx';
import { AMAT, ease, ramp, std } from './common.jsx';

// An extra building a sandcastle with a bucket and shovel. The castle gains
// a piece every 40-60 seconds of frames drawn (mound, four towers, walls, a
// keep, then the flag). The stage is saved for the day, so it keeps growing
// across reloads. When it's done the builder admires it, a wave washes it
// away, and it starts over. A new day starts a new castle.

const SITE = SITES.sandcastle;
const CASTLE = { x: SITE.x + 0.25, z: SITE.z + 0.1 };
const BOT_AT = { x: SITE.x - 0.6, z: SITE.z };
const STAGES = 8;
const STORE_KEY = 'bah-sandcastle';
const ADMIRE = 7;
const WAVE = 3.2;
const POP = 0.6;

const sandMat = AMAT.sand;
const wetMat = AMAT.sandDark;
const foamMat = new THREE.MeshStandardMaterial({ color: '#f4fbff', transparent: true, opacity: 0.8, roughness: 0.4, flatShading: true, depthWrite: false });
const G = {
  mound: new THREE.IcosahedronGeometry(0.45, 1).scale(1, 0.35, 1),
  tower: new THREE.CylinderGeometry(0.085, 0.1, 0.32, 6),
  crown: new THREE.CylinderGeometry(0.11, 0.09, 0.06, 6),
  wall: new THREE.BoxGeometry(0.34, 0.15, 0.06),
  keep: new THREE.CylinderGeometry(0.11, 0.13, 0.46, 6),
  roof: new THREE.ConeGeometry(0.14, 0.16, 6),
  pole: new THREE.CylinderGeometry(0.008, 0.008, 0.26, 3),
  flag: new THREE.BoxGeometry(0.12, 0.07, 0.008),
  foam: new THREE.BoxGeometry(2.6, 0.04, 0.7),
  bucket: new THREE.CylinderGeometry(0.075, 0.055, 0.1, 8).translate(0, -0.05, 0),
  handle: new THREE.CylinderGeometry(0.01, 0.01, 0.2, 3).translate(0, -0.1, 0),
  blade: new THREE.BoxGeometry(0.07, 0.08, 0.012).translate(0, -0.23, 0),
};
const bucketMat = std('#2e86de');
const shovelMat = std('#ffd23f');

const T = 0.22; // tower offset from the middle
const PIECES = [
  [{ g: G.mound, m: sandMat, p: [0, 0.03, 0] }],
  ...[[-T, -T], [T, -T], [-T, T], [T, T]].map(([x, z]) => [
    { g: G.tower, m: sandMat, p: [x, 0.25, z] },
    { g: G.crown, m: wetMat, p: [x, 0.43, z] },
  ]),
  [
    { g: G.wall, m: wetMat, p: [0, 0.22, -T] },
    { g: G.wall, m: wetMat, p: [0, 0.22, T] },
    { g: G.wall, m: wetMat, p: [-T, 0.22, 0], r: Math.PI / 2 },
    { g: G.wall, m: wetMat, p: [T, 0.22, 0], r: Math.PI / 2 },
  ],
  [
    { g: G.keep, m: sandMat, p: [0, 0.36, 0] },
    { g: G.roof, m: wetMat, p: [0, 0.67, 0] },
  ],
  [
    { g: G.pole, m: AMAT.white, p: [0, 0.86, 0] },
    { g: G.flag, m: AMAT.red, p: [0.065, 0.94, 0] },
  ],
];

function loadStage() {
  const v = readStore('localStorage', STORE_KEY);
  if (!v) return 0;
  const [day, n] = v.split(':');
  return day === dayKeyPT() ? Math.max(0, Math.min(STAGES, Number(n) || 0)) : 0;
}
const saveStage = (n) => writeStore('localStorage', STORE_KEY, `${dayKeyPT()}:${n}`);

export default function Sandcastle({ animate = true }) {
  const bot = useRef();
  const pieces = useRef([]);
  const foam = useRef();
  const st = useRef(null);
  if (!st.current) {
    const stage = loadStage();
    st.current = { t: 0, stage, mode: stage >= STAGES ? 'admire' : 'build', modeT: 0, next: stage === 0 ? 8 : rareGap(40, 60), popAt: -10, day: dayKeyPT(), burst: false };
  }

  useFrame((_, delta) => {
    const b = bot.current;
    if (!b?.root) return;
    const s = st.current;
    const dt = animate ? Math.min(delta, 0.1) : 0;
    s.t += dt;
    s.modeT += dt;
    const t = s.t;
    const gy = groundY(CASTLE.x, CASTLE.z);
    b.reset();

    let sink = 0;
    if (animate && s.mode === 'build') {
      if (s.t > s.next) {
        // a new day while the page was open: start over
        const day = dayKeyPT();
        if (day !== s.day) {
          s.day = day;
          s.stage = 0;
        }
        s.stage = Math.min(STAGES, s.stage + 1);
        saveStage(s.stage);
        s.popAt = t;
        s.next = t + rareGap(40, 60);
        puff('dust', CASTLE.x, gy + 0.15, CASTLE.z, 6);
        if (s.stage >= STAGES) {
          s.mode = 'admire';
          s.modeT = 0;
          s.burst = false;
        }
      }
    } else if (animate && s.mode === 'admire') {
      if (!s.burst && s.modeT > 1.0) {
        s.burst = true;
        puff('star', CASTLE.x, gy + 1.0, CASTLE.z, 10);
      }
      if (s.modeT > ADMIRE) {
        s.mode = 'wave';
        s.modeT = 0;
      }
    } else if (animate && s.mode === 'wave') {
      sink = ease(ramp(s.modeT, 0.9, 2.2));
      if (s.modeT > WAVE) {
        s.stage = 0;
        saveStage(0);
        s.mode = 'build';
        s.modeT = 0;
        s.next = t + 6;
      }
    }

    // castle pieces
    for (let i = 0; i < STAGES; i++) {
      const g = pieces.current[i];
      if (!g) continue;
      const on = i < s.stage;
      g.visible = on;
      if (!on) continue;
      let sc = 1;
      if (i === s.stage - 1 && animate) {
        const k = (t - s.popAt) / POP;
        if (k >= 0 && k < 1) sc = Math.max(0.01, ease(k) * (1 + Math.sin(k * Math.PI) * 0.15));
      }
      g.scale.set(sc * (1 + sink * 0.3), sc * (1 - sink * 0.95) + 0.001, sc * (1 + sink * 0.3));
    }

    // the wave
    if (foam.current) {
      const on = s.mode === 'wave';
      foam.current.visible = on;
      if (on) {
        const k = s.modeT / WAVE;
        const reach = Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
        foam.current.position.set(CASTLE.x, gy + 0.03, CASTLE.z + 1.4 - reach * 1.7);
        foamMat.opacity = 0.85 * Math.min(1, (1 - k) * 4);
      }
    }

    // the builder
    if (s.mode === 'build') {
      // kneeling, digging with the shovel, a bucket dump now and then
      b.pose.position.y = -0.1;
      b.pose.rotation.x = 0.35;
      b.footL.position.set(-0.08, 0.1, -0.16);
      b.footR.position.set(0.08, 0.1, -0.16);
      const dig = animate ? Math.sin(t * 5) : 0;
      b.armR.rotation.set(-0.7 + dig * 0.45, 0, 0.12);
      const dump = animate ? ramp((t % 7) / 7, 0.78, 0.86) * (1 - ramp((t % 7) / 7, 0.94, 1)) : 0;
      b.armL.rotation.set(-0.5 - dump * 0.8, 0, -0.12 + dump * 0.3);
      b.head.rotation.x = 0.35;
      b.head.rotation.y = animate ? Math.sin(t * 0.6) * 0.15 : 0;
    } else if (s.mode === 'admire') {
      // stands back, hands on hips, a proud little nod
      b.armL.rotation.set(0.35, 0, -0.65);
      b.armR.rotation.set(0.35, 0, 0.65);
      b.head.rotation.x = animate ? Math.sin(t * 3) * 0.1 : 0;
      b.head.rotation.z = 0.12;
      b.pose.position.y = animate ? Math.abs(Math.sin(t * 2.5)) * 0.02 : 0;
    } else {
      // whoa! arms up, hops back
      const k = s.modeT;
      const up = ease(ramp(k, 0.4, 0.8)) * (1 - ramp(k, 2.4, 3.0));
      b.armL.rotation.set(-2.7 * up, 0, -0.3 * up);
      b.armR.rotation.set(-2.7 * up, 0, 0.3 * up);
      b.pose.position.y = Math.sin(ramp(k, 0.4, 0.9) * Math.PI) * 0.15;
      b.head.rotation.x = k > 2.0 ? 0.3 : -0.2 * up;
      b.head.rotation.z = k > 2.2 ? Math.sin(k * 5) * 0.15 : 0; // oh well
    }
  });

  const bx = BOT_AT.x;
  const bz = BOT_AT.z;
  return (
    <group>
      <group position={[CASTLE.x, groundY(CASTLE.x, CASTLE.z), CASTLE.z]}>
        {PIECES.map((parts, i) => (
          <group key={i} ref={(el) => (pieces.current[i] = el)} visible={false}>
            {parts.map((pt, j) => (
              <mesh key={j} geometry={pt.g} material={pt.m} position={pt.p} rotation={[0, pt.r || 0, 0]} />
            ))}
          </group>
        ))}
      </group>
      <mesh ref={foam} geometry={G.foam} material={foamMat} visible={false} />
      <MiniBot
        ref={bot}
        color={extraColor(10)}
        position={[bx, groundY(bx, bz), bz]}
        rotation={[0, Math.atan2(CASTLE.x - bx, CASTLE.z - bz) + 0.25, 0]}
        left={
          <group rotation={[0.5, 0, 0]}>
            <mesh geometry={G.bucket} material={bucketMat} />
          </group>
        }
        right={
          <group rotation={[0.9, 0, 0]}>
            <mesh geometry={G.handle} material={shovelMat} />
            <mesh geometry={G.blade} material={shovelMat} />
          </group>
        }
      />
    </group>
  );
}
