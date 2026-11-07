import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { BOT_SCALE, Drink, GEO, MAT } from '../../components/Bot.jsx';
import MiniBot from '../MiniBot.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import { L, std } from './kit.jsx';
import StaticMerge from '../../utils/StaticMerge.jsx';

// Two palms with a hammock strung between them, swinging gently, and a bot
// fast asleep in it with floating Z's, day and night.

const S = SITES.hammock;
const PALM_X = 1.3; // trunk bases, local x
const PALM_H = 2.7;
const BEND = 0.3;
const ATTACH_Y = 1.15;
const FRONDS = 7;

function trunkGeo() {
  const g = new THREE.CylinderGeometry(0.09, 0.15, 1, 6, 4);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + BEND * y * y);
  }
  g.computeVertexNormals();
  return g;
}
function frondGeo() {
  const v = [0, 0, 0, -0.24, 0.8, 0, 0.24, 0.8, 0, 0, 1.7, 0, 0, 0.8, 0.07];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 4, 1, 0, 2, 4, 1, 4, 3, 4, 2, 3]);
  g.computeVertexNormals();
  return g;
}
const TRUNK_GEO = trunkGeo();
const FROND_GEO = frondGeo();
const NUT_GEO = new THREE.IcosahedronGeometry(0.09, 0);
const SHADOW_GEO = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
const TRUNK_MAT = std('#9a6b43', { roughness: 0.9 });
const FROND_MATS = ['#3f9b4f', '#4fb35a', '#2f8a46', '#5cbf63'].map((c) => std(c, { roughness: 0.8, side: THREE.DoubleSide }));
const NUT_MAT = std('#6b4a2a');
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: '#1d3b2a', transparent: true, opacity: 0.14, depthWrite: false });
const UP = new THREE.Vector3(0, 1, 0);

// One palm, bending away from the hammock (dir = +1 bends toward +x).
function Palm({ x, dir, yaw }) {
  const s = PALM_H / 2.8;
  const top = [x + dir * BEND, PALM_H, 0];
  return (
    <group>
      <mesh geometry={TRUNK_GEO} material={TRUNK_MAT} position={[x, -0.05, 0]} rotation={[0, dir > 0 ? 0 : Math.PI, 0]} scale={[1, PALM_H, 1]} />
      {Array.from({ length: FRONDS }, (_, f) => (
        <mesh
          key={f}
          geometry={FROND_GEO}
          material={FROND_MATS[f % 4]}
          position={top}
          rotation={new THREE.Euler(-Math.PI / 2 - (0.35 + (f % 2) * 0.18) * 1, yaw + (f / FRONDS) * Math.PI * 2, 0, 'YXZ')}
          scale={s}
        />
      ))}
      {[0, 1, 2].map((k) => {
        const a = yaw + (k / 3) * Math.PI * 2;
        return <mesh key={k} geometry={NUT_GEO} material={NUT_MAT} position={[top[0] + Math.cos(a) * 0.12, top[1] - 0.08, Math.sin(a) * 0.12]} />;
      })}
      <mesh geometry={SHADOW_GEO} material={SHADOW_MAT} position={[top[0], 0.03, 0]} scale={[1.1 * s, 1, 1.1 * s]} />
    </group>
  );
}

function Rope({ a, b }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const d = vb.clone().sub(va);
    return { pos: va.clone().add(vb).multiplyScalar(0.5).toArray(), quat: new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()), len: d.length() };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} material={L.rope}>
      <cylinderGeometry args={[0.015, 0.015, len, 4]} />
    </mesh>
  );
}

export default function HammockNap({ animate }) {
  const g0 = groundY(S.x, S.z);
  const swing = useRef();
  const bot = useRef();
  // The hammock's ends (GEO.hammock spans x +-0.68 at y 0.62, scaled).
  const endX = 0.68 * BOT_SCALE;
  const endY = 0.62 * BOT_SCALE;
  const trunkX = PALM_X + BEND * (ATTACH_Y / PALM_H) ** 2;

  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    if (swing.current) swing.current.rotation.x = Math.sin(t * 0.9) * 0.09;
    const b = bot.current;
    if (!b) return;
    // lying on its back like the real bots in their hammocks
    b.pose.rotation.set(0, 0, Math.PI / 2);
    const breathe = 1 + Math.sin(t * 1.2) * 0.03;
    b.pose.position.set(0.48, 0.42, 0);
    b.pose.scale.set(breathe, 1, breathe);
    b.head.rotation.set(0.15, 0, 0.25);
    b.armL.rotation.set(-0.3, 0, -0.05);
    b.armR.rotation.set(-1.2, 0, 0.35); // one arm flopped over the side
  });

  return (
    <group position={[S.x, g0, S.z]} rotation={[0, S.rotY, 0]}>
      <StaticMerge>
      <Palm x={-PALM_X} dir={-1} yaw={0.4} />
      <Palm x={PALM_X} dir={1} yaw={1.3} />
      <group position={[0, ATTACH_Y, 0]}>
        <group ref={swing} userData={{ noMerge: true }}>
          <group position={[0, -ATTACH_Y, 0]}>
            <Rope a={[-endX, endY, 0]} b={[-trunkX + 0.1, ATTACH_Y, 0]} />
            <Rope a={[endX, endY, 0]} b={[trunkX - 0.1, ATTACH_Y, 0]} />
            <group scale={BOT_SCALE}>
              <mesh geometry={GEO.hammock} material={MAT.hammock} />
            </group>
            <MiniBot ref={bot} color="#8e44ad" sleepy shadow={false} />
            <Html position={[-0.45, 1.75, 0]} center zIndexRange={[9, 0]} pointerEvents="none">
              <div className="zzz" aria-hidden="true">
                <span>Z</span>
                <span>Z</span>
                <span>Z</span>
              </div>
            </Html>
          </group>
        </group>
      </group>
      {/* a coconut drink and flip-flops on the sand below */}
      <group position={[0.35, 0, 0.55]} scale={1.5}>
        <Drink type="coconut" />
      </group>
      <mesh position={[-0.35, 0.02, 0.6]} rotation={[0, 0.3, 0]} material={L.tomato}>
        <boxGeometry args={[0.1, 0.02, 0.24]} />
      </mesh>
      <mesh position={[-0.2, 0.02, 0.62]} rotation={[0, -0.2, 0]} material={L.tomato}>
        <boxGeometry args={[0.1, 0.02, 0.24]} />
      </mesh>
      <mesh geometry={SHADOW_GEO} material={L.shadow} position={[0, 0.03, 0]} scale={[1.1, 1, 0.45]} />
      </StaticMerge>
    </group>
  );
}
