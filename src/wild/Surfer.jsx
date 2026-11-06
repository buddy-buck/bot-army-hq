import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { claimTravel, releaseTravel, TEST } from './director.js';

// Echo goes surfing: every 3 to 5 minutes, Echo rides a wave past the far
// side of the island and is gone again. Never a constant loop, and it waits
// for the travel slot like the boat, drone and plane.

const DURATION = 11;
const nextGap = () => (TEST.surf ? 20 : 180 + Math.random() * 120); // ?surf=test: every 30 seconds or so

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.55, ...extra });

// A curling wave crest, built along +x, curling toward +z.
const CREST = (() => {
  const g = new THREE.CylinderGeometry(0.55, 0.55, 5, 8, 1, true, 0, Math.PI * 1.1);
  g.rotateZ(Math.PI / 2);
  return g;
})();

export default function Surfer({ color = '#2E86DE' }) {
  const { camera } = useThree();
  const group = useRef();
  const rider = useRef();
  const run = useRef(null);
  const alive = useRef(0); // seconds of frames actually drawn, so nothing plays unseen in a hidden tab
  const nextAt = useRef(TEST.surf ? 2 : 60 + Math.random() * 90); // first ride 1 to 2.5 minutes in

  const mats = useMemo(
    () => ({
      body: std(color, { emissive: color, emissiveIntensity: 0.1 }),
      face: std('#fff8ec'),
      eye: std('#1f2430'),
      board: std('#fdf8ee'),
      stripe: std('#F09024'),
      crest: new THREE.MeshStandardMaterial({ color: '#7fe3e8', transparent: true, opacity: 0.85, flatShading: true, side: THREE.DoubleSide, roughness: 0.3 }),
      foam: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }),
    }),
    [color]
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => () => releaseTravel('surf'), []);

  useFrame((state, delta) => {
    alive.current += Math.min(delta, 0.1);
    const now = alive.current;
    const g = group.current;
    if (!g) return;
    if (!run.current) {
      g.visible = false;
      if (now < nextAt.current) return;
      if (!claimTravel('surf', DURATION + 0.5)) {
        nextAt.current = now + 5;
        return;
      }
      const fwd = new THREE.Vector3(-camera.position.x, 0, -camera.position.z).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      // Always left to right, so the wave (local -z) stays on the far side of Echo.
      run.current = { start: now, fwd, right, yaw: Math.atan2(right.x, right.z) };
    }
    const r = run.current;
    const u = (now - r.start) / DURATION;
    if (u < 1) claimTravel('surf', 2); // keep the travel slot while riding
    if (u >= 1) {
      run.current = null;
      g.visible = false;
      releaseTravel('surf');
      nextAt.current = now + nextGap();
      return;
    }
    g.visible = true;
    // Behind the island (from where the camera is), clear of the shore.
    const p = r.fwd.clone().multiplyScalar(17).add(r.right.clone().multiplyScalar(THREE.MathUtils.lerp(-26, 26, u)));
    const fade = Math.min(1, u / 0.08, (1 - u) / 0.08);
    g.position.set(p.x, -0.3 + fade * 0.3, p.z);
    g.rotation.y = r.yaw - Math.PI / 2;
    g.scale.setScalar(Math.max(0.01, fade) * 1.35);
    if (rider.current) {
      rider.current.position.y = 0.32 + Math.sin(now * 2.4) * 0.06;
      rider.current.rotation.z = Math.sin(now * 1.7) * 0.12;
    }
  });

  return (
    <group ref={group} visible={false}>
      {/* the wave Echo is riding */}
      <mesh geometry={CREST} material={mats.crest} position={[-0.6, 0.3, -0.9]} />
      {[-2, -1, 0, 1, 2].map((x) => (
        <mesh key={x} material={mats.foam} position={[x - 0.6, 0.85, -0.55]}>
          <icosahedronGeometry args={[0.18, 0]} />
        </mesh>
      ))}
      <group ref={rider}>
        {/* surfboard */}
        <mesh material={mats.board} scale={[1.0, 0.06, 0.3]}>
          <sphereGeometry args={[1, 10, 6]} />
        </mesh>
        <mesh material={mats.stripe} position={[0, 0.03, 0]} scale={[0.9, 0.02, 0.06]}>
          <boxGeometry args={[1.8, 1, 1]} />
        </mesh>
        {/* Echo: crouched, arms out for balance */}
        <group position={[0, 0.1, 0]} rotation={[0, Math.PI / 2, 0]}>
          <mesh material={mats.body} position={[0, 0.3, 0]}>
            <capsuleGeometry args={[0.17, 0.18, 3, 8]} />
          </mesh>
          <mesh material={mats.face} position={[0, 0.66, 0]}>
            <icosahedronGeometry args={[0.19, 1]} />
          </mesh>
          <mesh material={mats.eye} position={[-0.07, 0.68, 0.165]}>
            <sphereGeometry args={[0.032, 6, 5]} />
          </mesh>
          <mesh material={mats.eye} position={[0.07, 0.68, 0.165]}>
            <sphereGeometry args={[0.032, 6, 5]} />
          </mesh>
          <mesh material={mats.body} position={[-0.3, 0.42, 0]} rotation={[0, 0, 1.2]}>
            <capsuleGeometry args={[0.035, 0.24, 2, 6]} />
          </mesh>
          <mesh material={mats.body} position={[0.3, 0.42, 0]} rotation={[0, 0, -1.2]}>
            <capsuleGeometry args={[0.035, 0.24, 2, 6]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
