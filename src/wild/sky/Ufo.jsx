import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot from '../MiniBot.jsx';
import StaticMerge from '../../utils/StaticMerge.jsx';
import { claimTravel, rareGap, releaseTravel } from '../director.js';
import { world } from '../world.js';
import { farSide, isDark, rand, smooth } from './common.js';

// UFO: very rarely on a dark night a little saucer (with a bot at the
// controls) glides in, hovers over the water past the island, shines a faint
// tractor beam down on the waves, then zips away. Takes the travel slot so it
// never shares the sky with the seaplane or a drone.

const ENTER = 6;
const HOVER = 6.5;
const ZIP = 1.6;
const TOTAL = ENTER + HOVER + ZIP;
const LIGHTS = 8;

const GEO = {
  top: new THREE.CylinderGeometry(1.0, 2.25, 0.4, 12),
  bottom: new THREE.CylinderGeometry(2.25, 1.0, 0.32, 12),
  dome: new THREE.SphereGeometry(0.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  light: new THREE.IcosahedronGeometry(0.13, 0),
  beam: new THREE.ConeGeometry(3.0, 1, 16, 1, true).translate(0, -0.5, 0), // apex at 0, 1 tall, pointing down
  core: new THREE.ConeGeometry(1.4, 1, 12, 1, true).translate(0, -0.5, 0),
  spot: new THREE.CircleGeometry(3.0, 24).rotateX(-Math.PI / 2),
};

export default function Ufo({ sky }) {
  const { camera } = useThree();
  const saucer = useRef();
  const spin = useRef();
  const beam = useRef();
  const lights = useRef([]);
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const mats = useMemo(
    () => ({
      hull: new THREE.MeshStandardMaterial({ color: '#b8c2d6', metalness: 0.6, roughness: 0.35, flatShading: true }),
      belly: new THREE.MeshStandardMaterial({ color: '#6c7590', metalness: 0.5, roughness: 0.45, flatShading: true }),
      dome: new THREE.MeshStandardMaterial({ color: '#8ff7ff', emissive: '#3fd8e8', emissiveIntensity: 0.6, transparent: true, opacity: 0.5, roughness: 0.1, flatShading: true }),
      lights: Array.from({ length: LIGHTS }, () => new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false })),
      beam: new THREE.MeshBasicMaterial({ color: '#b9fff0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      core: new THREE.MeshBasicMaterial({ color: '#e8fff8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      spot: new THREE.MeshBasicMaterial({ color: '#bfffea', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    }),
    []
  );
  useEffect(
    () => () => {
      releaseTravel('ufo');
      world.glow.delete('ufo');
      [mats.hull, mats.belly, mats.dome, mats.beam, mats.core, mats.spot, ...mats.lights].forEach((m) => m.dispose());
    },
    [mats]
  );

  const st = useMemo(
    () => ({
      wait: rareGap(420, 900),
      age: -1,
      from: new THREE.Vector3(),
      hover: new THREE.Vector3(),
      to: new THREE.Vector3(),
      p: new THREE.Vector3(),
      prev: new THREE.Vector3(),
      side: { x: 0, z: -1 },
      t: 0,
      glow: { x: 0, z: 0, strength: 0 },
    }),
    []
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const g = saucer.current;
    if (!g) return;
    st.t += dt;
    if (st.age < 0) {
      g.visible = false;
      if (beam.current) beam.current.visible = false;
      st.wait -= dt;
      if (st.wait > 0) return;
      if (!isDark(skyRef.current)) {
        st.wait = rareGap(420, 900);
        return;
      }
      if (!claimTravel('ufo', TOTAL + 1)) {
        st.wait = 8;
        return;
      }
      const f = farSide(camera, st.side);
      const lx = -f.z;
      const lz = f.x;
      const way = Math.random() < 0.5 ? 1 : -1;
      const out = rand(22, 30);
      const lat = rand(-8, 8);
      st.hover.set(f.x * out + lx * lat, rand(9, 11.5), f.z * out + lz * lat);
      st.from.set(st.hover.x + lx * way * 90 + f.x * 40, 42, st.hover.z + lz * way * 90 + f.z * 40);
      st.to.set(st.hover.x - lx * way * 170 + f.x * 60, 60, st.hover.z - lz * way * 170 + f.z * 60);
      st.age = 0;
      g.position.copy(st.from);
    }
    st.age += dt;
    const a = st.age;
    if (a > TOTAL) {
      st.age = -1;
      st.wait = rareGap(420, 900);
      g.visible = false;
      if (beam.current) beam.current.visible = false;
      world.glow.delete('ufo');
      releaseTravel('ufo');
      return;
    }
    st.prev.copy(g.position);
    let beamOn = 0;
    if (a < ENTER) {
      st.p.lerpVectors(st.from, st.hover, smooth(a / ENTER));
      st.p.y += Math.sin(a * 1.7) * 0.4 * (1 - a / ENTER);
    } else if (a < ENTER + HOVER) {
      const h = a - ENTER;
      st.p.copy(st.hover);
      st.p.y += Math.sin(h * 2.1) * 0.25;
      st.p.x += Math.sin(h * 0.9) * 0.5;
      beamOn = smooth(h / 0.8) * smooth((HOVER - h) / 0.8) * (0.85 + 0.15 * Math.sin(h * 9));
    } else {
      const z = (a - ENTER - HOVER) / ZIP;
      st.p.lerpVectors(st.hover, st.to, z * z * z);
    }
    g.position.copy(st.p);
    g.visible = true;
    // Bank into the motion.
    const vx = (st.p.x - st.prev.x) / Math.max(dt, 1e-3);
    const vz = (st.p.z - st.prev.z) / Math.max(dt, 1e-3);
    const bank = (v) => Math.max(-0.35, Math.min(0.35, v * 0.012));
    g.rotation.z += (bank(-vx) - g.rotation.z) * Math.min(1, dt * 4);
    g.rotation.x += (bank(vz) - g.rotation.x) * Math.min(1, dt * 4);
    if (spin.current) spin.current.rotation.y += dt * 1.6;

    // Rim lights chase around the saucer.
    for (let i = 0; i < LIGHTS; i++) {
      const chase = 0.5 + 0.5 * Math.sin(st.t * 7 - i * ((Math.PI * 2) / LIGHTS) * 2);
      mats.lights[i].color.setHSL(((i / LIGHTS + st.t * 0.15) % 1 + 1) % 1, 0.95, 0.35 + chase * 0.4);
    }

    const b = beam.current;
    if (b) {
      b.visible = beamOn > 0.01;
      if (b.visible) {
        const h = Math.max(0.5, g.position.y - 0.25);
        b.position.set(g.position.x, g.position.y - 0.25, g.position.z);
        b.children[0].scale.set(1, h, 1);
        b.children[1].scale.set(1, h, 1);
        b.children[2].position.y = -h + 0.08;
        mats.beam.opacity = 0.13 * beamOn;
        mats.core.opacity = 0.16 * beamOn;
        mats.spot.opacity = 0.35 * beamOn;
      }
    }
    if (beamOn > 0.01) {
      st.glow.x = g.position.x;
      st.glow.z = g.position.z;
      st.glow.strength = beamOn;
      world.glow.set('ufo', st.glow);
    } else {
      world.glow.delete('ufo');
    }
  });

  return (
    <>
      <group ref={saucer} visible={false} scale={1.1}>
        <group ref={spin}>
          <mesh geometry={GEO.top} material={mats.hull} position={[0, 0.2, 0]} />
          {mats.lights.map((m, i) => {
            const ang = (i / LIGHTS) * Math.PI * 2;
            return <mesh key={i} geometry={GEO.light} material={m} position={[Math.cos(ang) * 2.2, 0.02, Math.sin(ang) * 2.2]} />;
          })}
        </group>
        {/* belly, dome and the (motionless) pilot bake together */}
        <StaticMerge>
          <mesh geometry={GEO.bottom} material={mats.belly} position={[0, -0.16, 0]} />
          <MiniBot color="#2BA84A" shadow={false} scale={0.55} position={[0, 0.3, 0]} />
          <mesh geometry={GEO.dome} material={mats.dome} position={[0, 0.38, 0]} />
        </StaticMerge>
      </group>
      <group ref={beam} visible={false}>
        <mesh geometry={GEO.beam} material={mats.beam} />
        <mesh geometry={GEO.core} material={mats.core} />
        <mesh geometry={GEO.spot} material={mats.spot} />
      </group>
    </>
  );
}
