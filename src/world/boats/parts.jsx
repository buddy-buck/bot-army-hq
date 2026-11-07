import { useMemo } from 'react';
import * as THREE from 'three';
import { LIGHT_GEO, LIGHTS } from './kit.js';

// Small building blocks shared by the boats.

const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
const UP = new THREE.Vector3(0, 1, 0);
export const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);

// A thin rod from a to b (masts' stays, rails, crane cables).
export function Beam({ a, b, r = 0.02, m }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const d = vb.clone().sub(va);
    return { pos: va.add(vb).multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()), len: d.length() };
  }, [a[0], a[1], a[2], b[0], b[1], b[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  return <mesh geometry={UNIT_CYL} material={m} position={pos} quaternion={quat} scale={[r, len, r]} />;
}

export function Box({ p, s, m, r }) {
  return (
    <mesh geometry={BOX_GEO} position={p} rotation={r} scale={s} material={m} />
  );
}

// A running light: kind is 'red' | 'green' | 'white'.
export function Light({ p, kind = 'white', s = 1 }) {
  return <mesh geometry={LIGHT_GEO} material={LIGHTS[kind]} position={p} scale={s} />;
}

// Port (red, +x) and starboard (green, -x) lights at the bow.
export function SideLights({ x, y, z, s = 1 }) {
  return (
    <>
      <Light p={[x, y, z]} kind="red" s={s} />
      <Light p={[-x, y, z]} kind="green" s={s} />
    </>
  );
}
