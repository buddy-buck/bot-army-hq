import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { testOn } from '../../wild/director.js';
import { world } from '../state.js';

// Close-up checking camera: ?test=camtug, camtour, camsail or camjet makes
// the camera ride alongside that boat (it overrides the orbit each frame).
const CAMS = { camtug: 'tug', camtour: 'tour', camsail: 'sail-a', camjet: 'jetski' };
export const boatCamId = () => {
  for (const [k, id] of Object.entries(CAMS)) if (testOn(k) && !testOn('all')) return id;
  return null;
};

export default function BoatCam({ id }) {
  const { camera } = useThree();
  const tmp = useMemo(() => ({ look: new THREE.Vector3(), at: new THREE.Vector3(), angle: 0 }), []);
  useFrame((_, delta) => {
    const b = world.boats.get(id);
    if (!b) return;
    tmp.angle += Math.min(delta, 0.1) * 0.12;
    const d = b.size * 1.6 + 5;
    tmp.at.set(b.x + Math.cos(tmp.angle) * d, b.size * 0.5 + 2.4, b.z + Math.sin(tmp.angle) * d);
    camera.position.copy(tmp.at);
    tmp.look.set(b.x, 0.8, b.z);
    camera.lookAt(tmp.look);
  });
  return null;
}
