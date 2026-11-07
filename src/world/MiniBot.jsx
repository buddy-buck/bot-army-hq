import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BOT_GEO as GEO, BOT_MAT as MAT, BOT_SCALE, Drink } from '../components/Bot.jsx';

// A lightweight, non-interactive bot for the ambient crew: tiki bar regulars,
// the food-truck line, waiters, volleyball players, the DJ, tourists.
// Same shapes and look as the team bots (Bot.jsx), plus two simple arms.
// No name tag, no tap target, no useFrame: the parent animates it through
// `parts`.
//
//   const parts = useRef({});
//   <MiniBot color="#2ec4c8" parts={parts} />
//   useFrame(() => { parts.current.armR.rotation.x = -1.2; });
//
// parts.current = { root, pose, head, armL, armR, handL, handR, footL, footR,
//                   eyeL, eyeR, bulb }
//   root : outer group (position / rotation.y in the world)
//   pose : the body (tilt, hop, lie down) - same pivot as Bot.jsx's pose
//   armL/armR : shoulder pivots; rotation.x < 0 raises the arm forward,
//               rotation.z swings it out to the side (armL: -z, armR: +z)
//   handL/handR : attach props here (a tray, a phone, a fishing rod)
// Arms hang straight down at rest. Set showArms={false} for the classic
// armless look of the team bots.

const ARM_GEO = new THREE.CapsuleGeometry(0.035, 0.22, 2, 6).translate(0, -0.15, 0);
const HAND_GEO = new THREE.SphereGeometry(0.05, 6, 5);

export function useBotMaterials(color) {
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.55, emissive: color, emissiveIntensity: 0.1 }),
      bulb: new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, flatShading: true }),
    }),
    [color]
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return mats;
}

export default function MiniBot({ color = '#2ec4c8', parts, position, rotationY = 0, scale = BOT_SCALE, drink = null, showArms = true, sleepy = false, shadow = true, children }) {
  const mats = useBotMaterials(color);
  const r = {
    root: useRef(),
    pose: useRef(),
    head: useRef(),
    armL: useRef(),
    armR: useRef(),
    handL: useRef(),
    handR: useRef(),
    footL: useRef(),
    footR: useRef(),
    eyeL: useRef(),
    eyeR: useRef(),
    bulb: useRef(),
  };
  useEffect(() => {
    if (!parts) return;
    const out = {};
    for (const [k, v] of Object.entries(r)) out[k] = v.current;
    parts.current = out;
  });
  const eyeY = sleepy ? 0.18 : 1;
  return (
    <group ref={r.root} position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {shadow && <mesh geometry={GEO.shadow} material={MAT.shadow} position={[0, 0.025, 0]} />}
      <group ref={r.pose}>
        <mesh ref={r.footL} geometry={GEO.foot} material={MAT.foot} position={[-0.08, 0.06, 0]} />
        <mesh ref={r.footR} geometry={GEO.foot} material={MAT.foot} position={[0.08, 0.06, 0]} />
        <mesh geometry={GEO.body} material={mats.body} position={[0, 0.38, 0]} />
        <group ref={r.armL} position={[-0.19, 0.5, 0]} visible={showArms}>
          <mesh geometry={ARM_GEO} material={mats.body} />
          <group ref={r.handL} position={[0, -0.31, 0]}>
            <mesh geometry={HAND_GEO} material={MAT.face} />
          </group>
        </group>
        <group ref={r.armR} position={[0.19, 0.5, 0]} visible={showArms}>
          <mesh geometry={ARM_GEO} material={mats.body} />
          <group ref={r.handR} position={[0, -0.31, 0]}>
            <mesh geometry={HAND_GEO} material={MAT.face} />
            {drink && (
              <group position={[0, 0.02, 0.05]} scale={1.3}>
                <Drink type={drink} />
              </group>
            )}
          </group>
        </group>
        <group ref={r.head} position={[0, 0.74, 0]}>
          <mesh geometry={GEO.head} material={MAT.face} position={[0, 0.04, 0]} />
          <mesh ref={r.eyeL} geometry={GEO.eye} material={MAT.eye} position={[-0.07, 0.06, 0.165]} scale={[1, eyeY, 1]} />
          <mesh ref={r.eyeR} geometry={GEO.eye} material={MAT.eye} position={[0.07, 0.06, 0.165]} scale={[1, eyeY, 1]} />
          <mesh geometry={GEO.antenna} material={MAT.foot} position={[0, 0.29, 0]} />
          <mesh ref={r.bulb} geometry={GEO.bulb} material={mats.bulb} position={[0, 0.38, 0]} />
        </group>
        {children}
      </group>
    </group>
  );
}

// A friendly palette for crew and visitors (not team colors, so nobody is
// mistaken for a real bot on the roster).
export const CREW_COLORS = ['#2ec4c8', '#ff8a5c', '#9b7bff', '#5fd16b', '#ffb84d', '#ff6fae', '#4aa8ff', '#c2d94a', '#e07b39', '#7ad0ff'];
