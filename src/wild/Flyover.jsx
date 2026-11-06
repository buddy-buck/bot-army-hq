import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { brandTexture } from '../components/Island.jsx';
import { claimTravel, readStore, releaseTravel, TEST, writeStore } from './director.js';

// Buddy flies over: once per browser session, a little seaplane with the BB
// logo on its tail crosses the sky trailing a "Buck's Island" banner, then
// it's gone. Never loops. Waits for the travel slot like everything else.

const FLAG = 'bah-flyover-seen';
const DELAY = TEST.plane ? 2 : 22; // seconds after the island loads (?plane=test: right away, every visit)
const DURATION = 15;

function bannerTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#fffaf0';
  x.fillRect(0, 0, 512, 96);
  x.strokeStyle = '#19469D';
  x.lineWidth = 6;
  x.strokeRect(3, 3, 506, 90);
  x.fillStyle = '#19469D';
  x.font = '900 58px "Arial Black", Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText("Buck's Island", 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const std = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.5 });

function Seaplane({ propRef }) {
  const tail = useMemo(() => {
    const map = brandTexture('bb');
    return new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.6 });
  }, []);
  const mats = useMemo(() => ({ white: std('#fdf8ee'), blue: std('#19469D'), gold: std('#FFDE69'), dark: std('#2b2a33') }), []);
  useEffect(() => () => [tail.map, tail, ...Object.values(mats)].forEach((m) => m.dispose()), [tail, mats]);
  // Built pointing along +x (the flight direction).
  return (
    <group>
      <mesh material={mats.white} rotation={[0, 0, -Math.PI / 2]}>
        <capsuleGeometry args={[0.32, 1.9, 4, 8]} />
      </mesh>
      <mesh material={mats.blue} position={[0, -0.02, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[0.335, 0.335, 0.9, 8]} />
      </mesh>
      <mesh material={mats.white} position={[0.15, 0.3, 0]}>
        <boxGeometry args={[0.7, 0.06, 3.4]} />
      </mesh>
      <mesh material={mats.gold} position={[0.15, 0.31, 1.62]}>
        <boxGeometry args={[0.72, 0.065, 0.2]} />
      </mesh>
      <mesh material={mats.gold} position={[0.15, 0.31, -1.62]}>
        <boxGeometry args={[0.72, 0.065, 0.2]} />
      </mesh>
      <mesh material={mats.white} position={[-1.25, 0.05, 0]}>
        <boxGeometry args={[0.4, 0.05, 1.2]} />
      </mesh>
      {/* tail fin with the BB logo on both sides */}
      <mesh material={tail} position={[-1.3, 0.45, 0]}>
        <planeGeometry args={[0.62, 0.42]} />
      </mesh>
      {/* floats */}
      {[-0.55, 0.55].map((z) => (
        <group key={z}>
          <mesh material={mats.white} position={[0.15, -0.72, z]} rotation={[0, 0, -Math.PI / 2]}>
            <capsuleGeometry args={[0.1, 1.5, 3, 6]} />
          </mesh>
          <mesh material={mats.dark} position={[0.15, -0.45, z]}>
            <boxGeometry args={[0.04, 0.5, 0.04]} />
          </mesh>
        </group>
      ))}
      <group ref={propRef} position={[1.32, 0, 0]}>
        <mesh material={mats.dark}>
          <boxGeometry args={[0.04, 0.9, 0.08]} />
        </mesh>
      </group>
    </group>
  );
}

export default function Flyover() {
  const { camera } = useThree();
  const group = useRef();
  const plane = useRef();
  const banner = useRef();
  const propRef = useRef();
  const run = useRef(null);
  const alive = useRef(0); // seconds of frames actually drawn, so nothing plays unseen in a hidden tab
  const done = useRef(!TEST.plane && readStore('sessionStorage', FLAG) !== null);
  const bannerMat = useMemo(() => new THREE.MeshStandardMaterial({ map: bannerTexture(), side: THREE.DoubleSide, roughness: 0.8 }), []);
  useEffect(() => () => (bannerMat.map.dispose(), bannerMat.dispose()), [bannerMat]);
  useEffect(() => () => releaseTravel('plane'), []);

  useFrame((state, delta) => {
    alive.current += Math.min(delta, 0.1);
    const now = alive.current;
    const g = group.current;
    if (!g) return;
    if (!run.current) {
      g.visible = false;
      if (done.current || now < DELAY) return;
      if (!claimTravel('plane', DURATION + 1)) return;
      done.current = true;
      writeStore('sessionStorage', FLAG, '1');
      // Cross the view from left to right, a bit behind the island.
      const fwd = new THREE.Vector3(-camera.position.x, 0, -camera.position.z).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      run.current = { start: now, fwd, right, basis: new THREE.Matrix4().makeBasis(right, new THREE.Vector3(0, 1, 0), fwd.clone().negate()) };
    }
    const r = run.current;
    const u = (now - r.start) / DURATION;
    if (u < 1) claimTravel('plane', 2); // keep the travel slot while flying
    if (u >= 1) {
      g.visible = false;
      releaseTravel('plane');
      return;
    }
    g.visible = true;
    const p = r.fwd.clone().multiplyScalar(4).add(r.right.clone().multiplyScalar(THREE.MathUtils.lerp(-52, 52, u)));
    g.position.set(p.x, 6.2 + Math.sin(Math.PI * u) * 1.2, p.z);
    g.quaternion.setFromRotationMatrix(r.basis);
    if (plane.current) plane.current.rotation.x = Math.sin(now * 1.4) * 0.06;
    if (banner.current) banner.current.position.y = -0.1 + Math.sin(now * 3) * 0.06;
    if (propRef.current) propRef.current.rotation.x = now * 40;
  });

  return (
    <group ref={group} visible={false} scale={1.1}>
      <group ref={plane}>
        <Seaplane propRef={propRef} />
      </group>
      {/* tow line and banner trailing behind */}
      <mesh position={[-2.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, 2.2, 3]} />
        <meshBasicMaterial color="#5a5048" />
      </mesh>
      <mesh ref={banner} material={bannerMat} position={[-6.2, -0.1, 0]}>
        <planeGeometry args={[5.4, 1.0]} />
      </mesh>
    </group>
  );
}
