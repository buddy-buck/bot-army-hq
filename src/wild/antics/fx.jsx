import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Tiny one-shot particle bursts shared by every antic: gold high-five stars,
// sand dust when a bot falls (or a castle piece lands), and water splashes.
// Any useFrame can call puff(kind, x, y, z, n); <Puffs /> (mounted once by
// BotAntics) moves and draws them with one InstancedMesh per kind.

const KINDS = {
  star: { cap: 48, geo: new THREE.OctahedronGeometry(0.06, 0), mat: new THREE.MeshBasicMaterial({ color: '#ffd95a', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }), life: 0.75, speed: 1.5, up: 1.0, grav: 1.2, size: 1 },
  dust: { cap: 40, geo: new THREE.IcosahedronGeometry(0.09, 0), mat: new THREE.MeshStandardMaterial({ color: '#f3dfb0', flatShading: true, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false }), life: 0.9, speed: 0.7, up: 0.45, grav: 0.4, size: 1.3 },
  splash: { cap: 40, geo: new THREE.IcosahedronGeometry(0.05, 0), mat: new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.9, depthWrite: false }), life: 0.8, speed: 0.8, up: 2.2, grav: 5.5, size: 1 },
};

const pools = {};
for (const [k, d] of Object.entries(KINDS)) {
  pools[k] = { ...d, data: new Float32Array(d.cap * 8), next: 0, alive: 0 }; // x y z vx vy vz age life
}

let scaleDown = 1; // lowPower halves every burst

// Spawn n particles of a kind at a world point.
export function puff(kind, x, y, z, n = 8) {
  const p = pools[kind];
  if (!p) return;
  const count = Math.max(2, Math.round(n * scaleDown));
  for (let i = 0; i < count; i++) {
    const o = p.next * 8;
    p.next = (p.next + 1) % p.cap;
    const a = Math.random() * Math.PI * 2;
    const s = p.speed * (0.5 + Math.random() * 0.6);
    p.data[o] = x;
    p.data[o + 1] = y;
    p.data[o + 2] = z;
    p.data[o + 3] = Math.cos(a) * s;
    p.data[o + 4] = p.up * (0.6 + Math.random() * 0.7);
    p.data[o + 5] = Math.sin(a) * s;
    p.data[o + 6] = 0;
    p.data[o + 7] = p.life * (0.7 + Math.random() * 0.5);
  }
  p.alive = p.cap;
}

const dummy = new THREE.Object3D();

export function Puffs({ lowPower = false }) {
  const refs = { star: useRef(), dust: useRef(), splash: useRef() };
  useEffect(() => {
    scaleDown = lowPower ? 0.5 : 1;
  }, [lowPower]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    for (const k in pools) {
      const p = pools[k];
      const mesh = refs[k].current;
      if (!mesh || p.alive === 0) continue;
      let any = 0;
      const d = p.data;
      for (let i = 0; i < p.cap; i++) {
        const o = i * 8;
        const life = d[o + 7];
        let s = 0;
        if (life > 0) {
          d[o + 6] += dt;
          const k01 = d[o + 6] / life;
          if (k01 >= 1) d[o + 7] = 0;
          else {
            d[o + 4] -= p.grav * dt;
            d[o] += d[o + 3] * dt;
            d[o + 1] += d[o + 4] * dt;
            d[o + 2] += d[o + 5] * dt;
            if (d[o + 1] < 0 && k === 'splash') d[o + 7] = 0;
            s = p.size * (k === 'dust' ? 0.6 + k01 : 1) * (1 - k01 * k01);
            any++;
          }
        }
        dummy.position.set(d[o], d[o + 1], d[o + 2]);
        dummy.rotation.set(d[o + 6] * 4, d[o + 6] * 3, 0);
        dummy.scale.setScalar(s || 0.0001);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (!any) p.alive = 0; // all done: skip until the next burst
    }
  });

  useEffect(() => {
    // start with everything hidden
    for (const k in pools) {
      const mesh = refs[k].current;
      if (!mesh) continue;
      dummy.scale.setScalar(0.0001);
      dummy.position.set(0, -50, 0);
      dummy.updateMatrix();
      for (let i = 0; i < pools[k].cap; i++) mesh.setMatrixAt(i, dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {Object.entries(KINDS).map(([k, d]) => (
        <instancedMesh key={k} ref={refs[k]} args={[d.geo, d.mat, d.cap]} frustumCulled={false} renderOrder={4} />
      ))}
    </>
  );
}
