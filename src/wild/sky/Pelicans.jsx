import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rareGap } from '../director.js';
import StaticMerge from '../../utils/StaticMerge.jsx';
import { farSide, isDaylight, rand, smooth } from './common.js';

// Pelicans: a V of big-beaked pelicans glides low over the island every minute
// or two in the daytime. They flap a few slow beats, then glide, the beat
// rolling back down the V from the leader.

const SPEED = 6.5;
const HALF = 105; // path runs from -HALF to +HALF along its heading

const GEO = {
  body: new THREE.IcosahedronGeometry(1, 0),
  head: new THREE.IcosahedronGeometry(0.26, 0),
  beak: new THREE.ConeGeometry(0.1, 1.25, 4).rotateX(Math.PI / 2),
  pouch: new THREE.ConeGeometry(0.15, 1.0, 4).rotateX(Math.PI / 2),
  wing: new THREE.BoxGeometry(1.9, 0.07, 0.72).translate(0.95, 0, 0),
  tip: new THREE.BoxGeometry(0.75, 0.075, 0.55).translate(0.37, 0, 0),
  tail: new THREE.ConeGeometry(0.22, 0.5, 4).rotateX(-Math.PI / 2),
};
const MAT = {
  body: new THREE.MeshLambertMaterial({ color: '#f6f2ea', flatShading: true }),
  beak: new THREE.MeshLambertMaterial({ color: '#f6b23c', flatShading: true }),
  pouch: new THREE.MeshLambertMaterial({ color: '#f39a5a', flatShading: true }),
  tip: new THREE.MeshLambertMaterial({ color: '#3b3f4c', flatShading: true }),
  eye: new THREE.MeshBasicMaterial({ color: '#1d2230' }),
};
const EYE = new THREE.SphereGeometry(0.05, 5, 4);

// Faces +z; wings along x.
function Pelican({ setRef }) {
  const root = useRef();
  const wl = useRef();
  const wr = useRef();
  const tl = useRef();
  const tr = useRef();
  setRef({ root, wl, wr, tl, tr });
  return (
    <group ref={root}>
      {/* body, head, tail and eyes merge; the flapping wings stay separate */}
      <StaticMerge>
        <mesh geometry={GEO.body} material={MAT.body} scale={[0.42, 0.38, 1.05]} />
        <mesh geometry={GEO.head} material={MAT.body} position={[0, 0.28, 0.98]} />
        <mesh geometry={EYE} material={MAT.eye} position={[0.15, 0.36, 1.08]} />
        <mesh geometry={EYE} material={MAT.eye} position={[-0.15, 0.36, 1.08]} />
        <mesh geometry={GEO.beak} material={MAT.beak} position={[0, 0.27, 1.75]} />
        <mesh geometry={GEO.pouch} material={MAT.pouch} position={[0, 0.12, 1.6]} scale={[0.8, 0.9, 1]} />
        <mesh geometry={GEO.tail} material={MAT.body} position={[0, 0.02, -1.2]} />
      </StaticMerge>
      <group ref={wl} position={[0.3, 0.12, 0.1]}>
        <mesh geometry={GEO.wing} material={MAT.body} />
        <group ref={tl} position={[1.85, 0, -0.05]}>
          <mesh geometry={GEO.tip} material={MAT.tip} />
        </group>
      </group>
      <group ref={wr} position={[-0.3, 0.12, 0.1]} scale={[-1, 1, 1]}>
        <mesh geometry={GEO.wing} material={MAT.body} />
        <group ref={tr} position={[1.85, 0, -0.05]}>
          <mesh geometry={GEO.tip} material={MAT.tip} />
        </group>
      </group>
    </group>
  );
}

export default function Pelicans({ sky, lowPower }) {
  const { camera } = useThree();
  const n = lowPower ? 5 : 7;
  const birds = useRef([]);
  const flock = useRef();
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const st = useRef({ t: 0, wait: firstWait(), flying: false, s: 0, ox: 0, oz: 0, hx: 1, hz: 0, y: 12, side: { x: 0, z: -1 } });

  // V slots: leader at the point, the rest trailing back on alternate sides.
  const slots = [];
  for (let i = 0; i < n; i++) {
    const rank = Math.ceil(i / 2);
    const side = i === 0 ? 0 : i % 2 ? 1 : -1;
    slots.push({ x: side * rank * 2.7, y: rank * 0.18, z: -rank * 2.5, lag: rank * 0.28 });
  }

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const s = st.current;
    s.t += dt;
    const g = flock.current;
    if (!g) return;
    if (!s.flying) {
      g.visible = false;
      s.wait -= dt;
      if (s.wait > 0) return;
      if (!isDaylight(skyRef.current)) {
        s.wait = 20;
        return;
      }
      // Cross the island's sky, passing across the camera's view.
      const f = farSide(camera, s.side);
      const ang = Math.atan2(f.x, f.z) + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2 + rand(-0.5, 0.5);
      s.hx = Math.sin(ang);
      s.hz = Math.cos(ang);
      const pass = rand(-6, 22); // offset toward the far side
      s.ox = f.x * pass;
      s.oz = f.z * pass;
      s.y = rand(11, 15);
      s.s = -HALF;
      s.flying = true;
    }
    s.s += SPEED * dt;
    if (s.s > HALF) {
      s.flying = false;
      s.wait = rareGap(60, 120);
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(s.ox + s.hx * s.s, s.y + Math.sin(s.t * 0.25) * 0.8, s.oz + s.hz * s.s);
    g.rotation.y = Math.atan2(s.hx, s.hz);
    for (let i = 0; i < n; i++) {
      const b = birds.current[i];
      if (!b || !b.root.current) continue;
      const sl = slots[i];
      const lt = s.t - sl.lag;
      // 5 s cycle: three slow beats, then a glide.
      const c = ((lt % 5) + 5) % 5;
      const amp = c < 2.4 ? smooth(Math.min(c, 2.4 - c) / 0.3) : 0;
      const flap = Math.sin(c * Math.PI * 2 * (3 / 2.4)) * 0.55 * amp;
      const glide = (1 - amp) * 0.06;
      b.wl.current.rotation.z = flap + glide;
      b.wr.current.rotation.z = -(flap + glide); // mirrored wing
      b.tl.current.rotation.z = flap * 0.6;
      b.tr.current.rotation.z = flap * 0.6;
      b.root.current.position.set(sl.x, sl.y - flap * 0.15 + Math.sin(s.t * 0.6 + i) * 0.12, sl.z);
      b.root.current.rotation.z = Math.sin(s.t * 0.5 + i * 0.7) * 0.05;
    }
  });

  return (
    <group ref={flock} visible={false} scale={0.9}>
      {slots.map((_, i) => (
        <Pelican key={i} setRef={(r) => (birds.current[i] = r)} />
      ))}
    </group>
  );
}

// The first flight comes sooner than the rest.
function firstWait() {
  return rareGap(35, 75);
}
