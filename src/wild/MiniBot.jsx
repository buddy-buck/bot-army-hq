import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BOT_SCALE, GEO, MAT } from '../components/Bot.jsx';

// An ambient "extra" bot: same body, head, eyes, antenna and feet as the real
// team (it reuses Bot.jsx's geometry and materials), plus two arms so it can
// hold things. Extras aren't in the data: they can't be tapped and have no
// name tag. Use them for the crowd: bar stools, the food truck line, the
// volleyball teams, waiters, the jet ski rider and so on.
//
// Pose it from your own useFrame through the ref:
//   const b = useRef();
//   <MiniBot ref={b} color="#2E86DE" right={<Tray />} />
//   b.current.root / pose / head / armL / armR / footL / footR / eyeL / eyeR
//   (all THREE.Object3D). Arms hang from the shoulder: rotation.x < 0 swings
//   an arm forward, rotation.z swings it out to the side (armL -z, armR +z).
//   b.current.reset() puts every part back to the standing rest pose.
// Units match the real bots: origin at the feet, about 1.35 tall with the
// default scale. Faces local +z.
//
// Props:
//   color   body color (any CSS color)
//   left / right   children held in the left / right hand
//   shadow  draw the soft ground shadow (default true; turn off on boats)
//   sleepy  half-closed eyes
//   scale   default BOT_SCALE

const ARM_GEO = GEO.arm;
const HAND_GEO = GEO.hand;

const bodyMats = new Map();
function bodyMat(color) {
  let m = bodyMats.get(color);
  if (!m) {
    m = {
      body: new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.55, emissive: color, emissiveIntensity: 0.1 }),
      bulb: new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, flatShading: true }),
    };
    bodyMats.set(color, m); // shared across extras of the same color, never disposed
  }
  return m;
}

// Friendly team colors for extras (from the real roster's palette).
export const EXTRA_COLORS = ['#2E86DE', '#D63AF9', '#2BA84A', '#F09024', '#FF04A0', '#19469D', '#e74c3c', '#16a085', '#8e44ad', '#f1c40f', '#2ec4c8', '#ff7a59'];
export const extraColor = (i) => EXTRA_COLORS[((i % EXTRA_COLORS.length) + EXTRA_COLORS.length) % EXTRA_COLORS.length];

const SHOULDER_Y = 0.5;
const SHOULDER_X = 0.19;

const MiniBot = forwardRef(function MiniBot({ color = '#2E86DE', left = null, right = null, shadow = true, sleepy = false, scale = BOT_SCALE, children, ...group }, ref) {
  const mats = useMemo(() => bodyMat(color), [color]);
  const root = useRef();
  const pose = useRef();
  const head = useRef();
  const armL = useRef();
  const armR = useRef();
  const footL = useRef();
  const footR = useRef();
  const eyeL = useRef();
  const eyeR = useRef();

  useImperativeHandle(ref, () => ({
    get root() { return root.current; },
    get pose() { return pose.current; },
    get head() { return head.current; },
    get armL() { return armL.current; },
    get armR() { return armR.current; },
    get footL() { return footL.current; },
    get footR() { return footR.current; },
    get eyeL() { return eyeL.current; },
    get eyeR() { return eyeR.current; },
    reset() {
      if (!pose.current) return;
      pose.current.position.set(0, 0, 0);
      pose.current.rotation.set(0, 0, 0);
      head.current.rotation.set(0, 0, 0);
      armL.current.rotation.set(0, 0, -0.12);
      armR.current.rotation.set(0, 0, 0.12);
      footL.current.position.set(-0.08, 0.06, 0);
      footR.current.position.set(0.08, 0.06, 0);
    },
  }));

  useEffect(() => {
    const s = sleepy ? 0.18 : 1;
    eyeL.current.scale.y = s;
    eyeR.current.scale.y = s;
  }, [sleepy]);

  return (
    <group ref={root} scale={scale} {...group}>
      {shadow && <mesh geometry={GEO.shadow} material={MAT.shadow} position={[0, 0.025, 0]} />}
      <group ref={pose}>
        <mesh ref={footL} geometry={GEO.foot} material={MAT.foot} position={[-0.08, 0.06, 0]} />
        <mesh ref={footR} geometry={GEO.foot} material={MAT.foot} position={[0.08, 0.06, 0]} />
        <mesh geometry={GEO.body} material={mats.body} position={[0, 0.38, 0]} />
        {/* arms hang from the shoulders; hands at the bottom */}
        <group ref={armL} position={[-SHOULDER_X, SHOULDER_Y, 0]} rotation={[0, 0, -0.12]}>
          <mesh geometry={ARM_GEO} material={mats.body} position={[0, -0.15, 0]} />
          <mesh geometry={HAND_GEO} material={MAT.face} position={[0, -0.32, 0]} />
          {left && <group position={[0, -0.34, 0.04]}>{left}</group>}
        </group>
        <group ref={armR} position={[SHOULDER_X, SHOULDER_Y, 0]} rotation={[0, 0, 0.12]}>
          <mesh geometry={ARM_GEO} material={mats.body} position={[0, -0.15, 0]} />
          <mesh geometry={HAND_GEO} material={MAT.face} position={[0, -0.32, 0]} />
          {right && <group position={[0, -0.34, 0.04]}>{right}</group>}
        </group>
        <group ref={head} position={[0, 0.74, 0]}>
          <mesh geometry={GEO.head} material={MAT.face} position={[0, 0.04, 0]} />
          <mesh ref={eyeL} geometry={GEO.eye} material={MAT.eye} position={[-0.07, 0.06, 0.165]} />
          <mesh ref={eyeR} geometry={GEO.eye} material={MAT.eye} position={[0.07, 0.06, 0.165]} />
          <mesh geometry={GEO.antenna} material={MAT.foot} position={[0, 0.29, 0]} />
          <mesh geometry={GEO.bulb} material={mats.bulb} position={[0, 0.38, 0]} />
        </group>
        {children}
      </group>
    </group>
  );
});

export default MiniBot;
