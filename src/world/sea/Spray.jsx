import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { splashFoam } from './fx.js';
import { rnd, std } from './kit.js';

// Splash droplets for everything that leaps: one shared pool, one draw.
// splash(x, z, size) throws droplets up and leaves foam and a ripple ring.

const N = 180;
const pool = Array.from({ length: N }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0 }));
let head = 0;
let active = 0;

export function splash(x, z, size = 1, count = 12, foam = true) {
  for (let i = 0; i < count; i++) {
    const d = pool[head];
    head = (head + 1) % N;
    if (!d.on) active++;
    const a = rnd(0, Math.PI * 2);
    const v = rnd(0.6, 1.5) * size;
    d.on = true;
    d.x = x + Math.cos(a) * 0.15 * size;
    d.z = z + Math.sin(a) * 0.15 * size;
    d.y = 0.05;
    d.vx = Math.cos(a) * v;
    d.vz = Math.sin(a) * v;
    d.vy = rnd(2.2, 3.8) * Math.sqrt(size);
    d.s = rnd(0.045, 0.085) * size ** 0.4;
  }
  if (foam) splashFoam(x, z, size);
}

const GEO = new THREE.IcosahedronGeometry(1, 0);
const MAT = std('#ffffff', { emissive: '#cfefff', emissiveIntensity: 0.35, roughness: 0.3 });
const dummy = new THREE.Object3D();
const GRAVITY = 6.5; // a little floaty, keeps it calm

export default function Spray() {
  const ref = useRef();
  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh || active === 0) return;
    const dt = Math.min(delta, 0.05);
    for (let i = 0; i < N; i++) {
      const d = pool[i];
      if (!d.on) continue;
      d.vy -= GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      if (d.y < -0.15) {
        d.on = false;
        active--;
        dummy.scale.setScalar(0);
      } else {
        dummy.scale.setScalar(d.s);
      }
      dummy.position.set(d.x, d.y, d.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[GEO, MAT, N]} frustumCulled={false} onUpdate={(m) => hideAll(m)} />;
}

function hideAll(mesh) {
  dummy.position.set(0, -50, 0);
  dummy.scale.setScalar(0);
  dummy.updateMatrix();
  for (let i = 0; i < N; i++) mesh.setMatrixAt(i, dummy.matrix);
  mesh.instanceMatrix.needsUpdate = true;
}
