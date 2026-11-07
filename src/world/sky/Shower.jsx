import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { aliveClock, testOn } from '../../wild/director.js';
import { Rainbow } from '../../wild/Weather.jsx';
import { cameraYaw, heightAtNdc, rand, smooth } from './common.js';

// A rare treat on some daytime visits: a light shower drifts past out at
// sea on the far side of the island, and as it clears a rainbow fades in
// behind the island (now and then a double), holds for a while and fades.
// About 1 visit in 10 gets one a minute or three in; after that a small
// chance every few minutes. ?test=rainbow plays it every ~45 seconds.

const SHOWER_SECONDS = 16;
const BOW_SECONDS = 30;
const DROPS = 110;
const PUFFS = [
  [0, 0, 0, 2.2, 1.0, 1.5], [2.0, -0.15, 0.3, 1.6, 0.85, 1.2], [-2.0, -0.2, -0.2, 1.7, 0.8, 1.2], [0.7, 0.6, 0, 1.4, 0.8, 1.1], [-0.9, 0.5, 0.3, 1.2, 0.7, 1.0],
];
const PUFF = new THREE.IcosahedronGeometry(1, 0);

function Shower({ start, clock, lowPower }) {
  const { camera } = useThree();
  const group = useRef();
  const n = lowPower ? 60 : DROPS;
  const cloudMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#c9d2de', flatShading: true, transparent: true, opacity: 0 }), []);
  const rainMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#dbe8f5', transparent: true, opacity: 0 }), []);
  const rain = useMemo(() => {
    const seeds = Array.from({ length: n }, () => ({ x: rand(-3.2, 3.2), z: rand(-1.4, 1.4), ph: Math.random(), sp: rand(0.9, 1.2) }));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3).setUsage(THREE.DynamicDrawUsage));
    return { seeds, g };
  }, [n]);
  useEffect(() => () => [cloudMat, rainMat, rain.g].forEach((x) => x.dispose()), [cloudMat, rainMat, rain]);
  // Out at sea, beyond the island on the far side, drifting sideways.
  const path = useMemo(() => {
    const yaw = cameraYaw(camera) + Math.PI + rand(-0.4, 0.4);
    const c = new THREE.Vector3(Math.sin(yaw) * 40, 0, Math.cos(yaw) * 40);
    c.y = Math.min(16, Math.max(7, heightAtNdc(camera, c.x, c.z, 0.72, 11)));
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
    return { c, side };
  }, [camera]);

  useFrame(() => {
    const e = clock.t - start;
    const k = smooth(0, 3, e) * (1 - smooth(SHOWER_SECONDS - 4, SHOWER_SECONDS, e));
    cloudMat.opacity = 0.9 * k;
    rainMat.opacity = 0.45 * k;
    const g = group.current;
    if (!g) return;
    g.visible = k > 0.01;
    const drift = (e / SHOWER_SECONDS - 0.5) * 22;
    g.position.copy(path.c).addScaledVector(path.side, drift);
    const pos = rain.g.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const d = rain.seeds[i];
      const y = -0.6 - ((e * 0.9 * d.sp + d.ph) % 1) * 11;
      pos[i * 6] = d.x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = d.z;
      pos[i * 6 + 3] = d.x - 0.08; pos[i * 6 + 4] = y - 0.7; pos[i * 6 + 5] = d.z;
    }
    rain.g.attributes.position.needsUpdate = true;
  });

  return (
    <group ref={group} visible={false}>
      {PUFFS.map(([x, y, z, sx, sy, sz], i) => (
        <mesh key={i} geometry={PUFF} material={cloudMat} position={[x, y, z]} scale={[sx, sy, sz]} />
      ))}
      <lineSegments geometry={rain.g} material={rainMat} frustumCulled={false} />
    </group>
  );
}

export default function PassingShower({ ctx }) {
  const { sky, lowPower } = ctx;
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const test = testOn('rainbow');
  const clock = useMemo(aliveClock, []);
  const [event, setEvent] = useState(null); // { id, start, double, bow }
  const S = useRef(null);
  if (!S.current) {
    const lucky = Math.random() < 0.1;
    S.current = { next: test ? 2 : lucky ? rand(60, 180) : rand(240, 420), lucky };
  }
  const busy = useRef(false);

  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const st = S.current;
    const s = skyRef.current;
    if (busy.current) {
      const e = t - busy.current.start;
      if (!busy.current.bow && e > SHOWER_SECONDS - 5) {
        busy.current.bow = true;
        setEvent({ ...busy.current });
      }
      if (e > SHOWER_SECONDS - 5 + BOW_SECONDS + 1) {
        busy.current = false;
        setEvent(null);
      }
      return;
    }
    if (t < st.next) return;
    const daytime = s.sunUp && (s.phase === 'day' || s.phase === 'golden') && (s.glowK || 0) < 0.8;
    // Lucky visits get one at the first check; otherwise a small chance every few minutes.
    const go = test || (daytime && (st.lucky ? true : Math.random() < 0.12));
    st.lucky = false;
    st.next = t + (test ? 45 : rand(240, 360));
    if (!go) return;
    busy.current = { id: t, start: t, double: Math.random() < 0.3, bow: false };
    setEvent({ ...busy.current });
  });

  if (!event) return null;
  return (
    <>
      <Shower key={`s${event.id}`} start={event.start} clock={clock} lowPower={lowPower} />
      {event.bow && <Rainbow key={`r${event.id}`} double={event.double} duration={BOW_SECONDS} fadeIn={5} fadeOut={7} strength={0.9} />}
    </>
  );
}
