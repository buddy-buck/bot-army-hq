import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { aliveClock, testOn } from '../../wild/director.js';
import { isDaytime, pointAtNdc, rand, smooth, std } from './common.js';

// A V of brown pelicans crossing the sky every few minutes by day. They flap
// a few beats and glide, the way pelicans do, and the flap ripples back
// down the V from the leader.

// One wing panel, lying flat along +x from the shoulder (z is forward).
function panel(x0, x1, front0, back0, front1, back1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, 0, front0, x1, 0, front1, x1, 0, back1, x0, 0, front0, x1, 0, back1, x0, 0, back0], 3));
  g.computeVertexNormals();
  return g;
}
const INNER = panel(0, 1.0, 0.24, -0.2, 0.2, -0.18);
const OUTER = panel(0, 1.05, 0.2, -0.18, 0.06, -0.02);
const BODY = new THREE.IcosahedronGeometry(0.3, 0).scale(0.75, 0.62, 1.9);
const HEAD = new THREE.IcosahedronGeometry(0.15, 0).scale(0.9, 0.9, 1.1);
const BEAK = new THREE.ConeGeometry(0.06, 0.78, 4).rotateX(Math.PI / 2);
const POUCH = new THREE.IcosahedronGeometry(0.07, 0).scale(0.7, 0.9, 3.2);
const TAIL = new THREE.ConeGeometry(0.12, 0.35, 4).rotateX(-Math.PI / 2);

const M_BODY = std('#7d746a');
const M_WING = std('#6c6359', { side: THREE.DoubleSide });
const M_TIP = std('#3a3530', { side: THREE.DoubleSide });
const M_HEAD = std('#f2e8cc');
const M_BEAK = std('#d9a03a');
const M_POUCH = std('#b0784a');

const SPEED = 3.2; // units per second (a crossing takes about 20 seconds)

function Pelican({ parts }) {
  // parts: { root, wings: [inner pivot, outer pivot] for each side }
  const set = (key) => (el) => (parts[key] = el);
  const wing = (side) => (
    <group scale={[side, 1, 1]} position={[side * 0.18, 0.08, 0.05]}>
      <group ref={set(side > 0 ? 'rIn' : 'lIn')}>
        <mesh geometry={INNER} material={M_WING} />
        <group position={[1.0, 0, 0]} ref={set(side > 0 ? 'rOut' : 'lOut')}>
          <mesh geometry={OUTER} material={M_TIP} />
        </group>
      </group>
    </group>
  );
  return (
    <group ref={set('root')}>
      <mesh geometry={BODY} material={M_BODY} />
      <mesh geometry={HEAD} material={M_HEAD} position={[0, 0.16, 0.56]} />
      <mesh geometry={BEAK} material={M_BEAK} position={[0, 0.12, 1.0]} />
      <mesh geometry={POUCH} material={M_POUCH} position={[0, 0.03, 0.92]} />
      <mesh geometry={TAIL} material={M_BODY} position={[0, 0.02, -0.68]} />
      {wing(1)}
      {wing(-1)}
    </group>
  );
}

export default function Pelicans({ ctx }) {
  const { sky, lowPower } = ctx;
  const { camera } = useThree();
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const test = testOn('pelicans');
  const count = lowPower ? 5 : 7;
  const clock = useMemo(aliveClock, []);
  const flock = useRef();
  const birds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const rank = Math.ceil(i / 2);
        const side = i === 0 ? 0 : i % 2 ? 1 : -1;
        return { rank, offset: [side * rank * 1.7, rank * 0.15, -rank * 1.45], parts: {}, ph: Math.random() * 0.4 };
      }),
    [count]
  );
  const pass = useRef({ active: false, start: 0, next: test ? 3 : rand(40, 90), from: new THREE.Vector3(), to: new THREE.Vector3(), dir: new THREE.Vector3(), len: 60, y: 12 });

  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const p = pass.current;
    const g = flock.current;
    if (!g) return;
    if (!p.active) {
      g.visible = false;
      if (t < p.next) return;
      if (!test && !isDaytime(skyRef.current)) {
        p.next = t + 30;
        return;
      }
      // A new crossing from one side of the view to the other, high over
      // the island, so they're seen whichever way the camera faces.
      const side = Math.random() < 0.5 ? 1 : -1;
      const sy = rand(0.45, 0.72);
      const alt = rand(10.5, 13.5);
      pointAtNdc(camera, -1.7 * side, sy + rand(-0.1, 0.1), alt, p.from);
      pointAtNdc(camera, 1.7 * side, sy + rand(-0.1, 0.1), alt, p.to);
      p.dir.subVectors(p.to, p.from);
      p.len = p.dir.length();
      p.dir.divideScalar(p.len);
      p.y = alt;
      const h = Math.atan2(p.dir.x, p.dir.z);
      p.start = t;
      p.active = true;
      g.rotation.y = h;
    }
    const k = (t - p.start) / (p.len / SPEED);
    if (k >= 1) {
      p.active = false;
      p.next = t + (test ? 8 : rand(150, 280));
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(p.from.x + p.dir.x * p.len * k, p.from.y + (p.to.y - p.from.y) * k + Math.sin(k * Math.PI * 2) * 0.5, p.from.z + p.dir.z * p.len * k);

    for (const b of birds) {
      const P = b.parts;
      if (!P.root) continue;
      // Flap about 3 seconds, glide about 4; the wave runs back down the V.
      const tb = t - b.rank * 0.3 - b.ph;
      const cyc = ((tb % 7) + 7) % 7;
      const flap = smooth(0, 0.4, cyc) * (1 - smooth(2.8, 3.4, cyc));
      const beat = Math.sin(tb * Math.PI * 2 * 1.3);
      const inner = flap * 0.55 * beat + (1 - flap) * 0.06;
      const outer = flap * 0.45 * Math.sin(tb * Math.PI * 2 * 1.3 - 0.7) + (1 - flap) * -0.04;
      P.rIn.rotation.z = inner;
      P.lIn.rotation.z = inner;
      P.rOut.rotation.z = outer;
      P.lOut.rotation.z = outer;
      P.root.position.set(b.offset[0], b.offset[1] - flap * beat * 0.06 + Math.sin(t * 0.7 + b.rank) * 0.08, b.offset[2]);
      P.root.rotation.z = Math.sin(t * 0.5 + b.rank * 0.8) * 0.05;
    }
  });

  return (
    <group ref={flock} visible={false} scale={0.6}>
      {birds.map((b, i) => (
        <Pelican key={i} parts={b.parts} />
      ))}
    </group>
  );
}
