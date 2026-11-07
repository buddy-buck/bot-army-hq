import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { terrainY } from '../utils/paths.js';
import { aliveClock, claimSlot, readStore, releaseSlot, testOn, writeStore } from './director.js';
import { ripple, splashFoam } from '../world/sea/fx.js';
import { splash } from '../world/sea/Spray.jsx';
import { BODY_GEO, CONE4, HIT_MAT, LOW_GEO, angleDiff, hoverPointer, islandToast, rnd, setHittable, std, tapOnly } from '../world/sea/kit.js';

// The rarest thing on the island: Bigfoot. About once every 20 to 30
// minutes of the page actually being looked at (hidden-tab time doesn't
// count), by day or golden hour only, a big shaggy Sasquatch creeps out of
// the palms in the quiet north-west woods, strides west past Nudge's hammock
// in the classic mid-stride film pose (with one long look back at the
// camera), wades into the sea and dives under with a splash. ~22 s.
// Tap him while he's visible: "You saw Bigfoot!" (sightings are counted).
// Shares the 'rare' slot with the whale and Nessie so rarities never stack.
// ?test=bigfoot: shows up within seconds and comes back about every 40 s.

const MAT = {
  fur: std('#5b3a22', { roughness: 0.95 }),
  dark: std('#3f2716', { roughness: 0.95 }),
  face: std('#2a1c12', { roughness: 0.8 }),
  sole: std('#2f2219'),
};

// Through the woods west of the Content Cabana, between the nap hammock and
// Nudge's hammock (posts near (-13.6,-7.45) and (-12.4,-8.55)), then down the
// beach into the sea north-west. Starts tucked behind the palm at (-12.6,-5.7).
const PATH = new THREE.CatmullRomCurve3(
  [
    [-12.0, -4.95],
    [-12.6, -5.15],
    [-13.6, -5.8],
    [-14.6, -6.5],
    [-15.4, -7.2],
    [-16.2, -8.0],
    [-17.0, -8.9],
    [-17.7, -9.7],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  'centripetal'
);
const PATH_LEN = PATH.getLength();

const PEEK = 2.4; // seconds standing half behind the palm
const DIVE = 1.6;
const GLANCE_AT = 0.33; // fraction of the path where he looks back at us
const SIGHTINGS = 'bah-bigfoot-sightings';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Facing +z, feet at y = 0, about 2.3 units tall. Hunched, long arms,
// pointed crown: the 1967 silhouette.
function BigfootModel({ parts }) {
  const { legL, legR, shinL, shinR, armL, armR, upper, head } = parts;
  const leg = (ref, shin, s) => (
    <group ref={ref} position={[s * 0.22, 1.02, 0]}>
      <mesh geometry={BODY_GEO} material={MAT.fur} position={[0, -0.27, 0]} scale={[0.19, 0.32, 0.2]} />
      <group ref={shin} position={[0, -0.55, 0]}>
        <mesh geometry={BODY_GEO} material={MAT.fur} position={[0, -0.2, 0]} scale={[0.14, 0.28, 0.15]} />
        <mesh geometry={BODY_GEO} material={MAT.sole} position={[0, -0.43, 0.07]} scale={[0.12, 0.06, 0.23]} />
      </group>
    </group>
  );
  const arm = (ref, s) => (
    <group ref={ref} position={[s * 0.5, 0.42, 0.02]}>
      <mesh geometry={BODY_GEO} material={MAT.fur} position={[s * 0.03, -0.3, 0]} scale={[0.12, 0.34, 0.13]} />
      <mesh geometry={BODY_GEO} material={MAT.fur} position={[s * 0.05, -0.82, 0.03]} scale={[0.1, 0.3, 0.11]} />
      <mesh geometry={LOW_GEO} material={MAT.face} position={[s * 0.06, -1.15, 0.05]} scale={[0.08, 0.11, 0.07]} />
      {/* shaggy tuft hanging off the elbow */}
      <mesh geometry={CONE4} material={MAT.dark} position={[s * 0.06, -0.55, -0.08]} rotation={[Math.PI - 0.3, 0, 0]} scale={[0.08, 0.2, 0.08]} />
    </group>
  );
  return (
    <group>
      {leg(legL, shinL, -1)}
      {leg(legR, shinR, 1)}
      {/* hips */}
      <mesh geometry={BODY_GEO} material={MAT.dark} position={[0, 1.08, -0.02]} scale={[0.38, 0.22, 0.27]} />
      {/* upper body pivots at the waist so he can turn and look */}
      <group ref={upper} position={[0, 1.18, 0]} rotation={[0.18, 0, 0]}>
        <mesh geometry={BODY_GEO} material={MAT.fur} position={[0, 0.3, 0]} scale={[0.43, 0.45, 0.31]} />
        <mesh geometry={BODY_GEO} material={MAT.dark} position={[0, 0.22, 0.14]} scale={[0.32, 0.3, 0.2]} />
        {/* big hunched shoulders */}
        <mesh geometry={BODY_GEO} material={MAT.fur} position={[0, 0.62, -0.06]} scale={[0.56, 0.24, 0.32]} />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={CONE4} material={MAT.dark} position={[s * 0.3, 0.52, -0.2]} rotation={[Math.PI + 0.4, 0, s * 0.3]} scale={[0.12, 0.22, 0.1]} />
        ))}
        {arm(armL, -1)}
        {arm(armR, 1)}
        {/* head sits low and forward, pointed crown */}
        <group ref={head} position={[0, 0.82, 0.1]}>
          <mesh geometry={BODY_GEO} material={MAT.fur} scale={[0.2, 0.2, 0.2]} />
          <mesh geometry={CONE4} material={MAT.fur} position={[0, 0.2, -0.04]} rotation={[-0.25, Math.PI / 4, 0]} scale={[0.15, 0.26, 0.15]} />
          <mesh geometry={BODY_GEO} material={MAT.face} position={[0, -0.02, 0.13]} scale={[0.14, 0.13, 0.09]} />
          {/* heavy brow */}
          <mesh geometry={BODY_GEO} material={MAT.dark} position={[0, 0.07, 0.15]} scale={[0.15, 0.035, 0.06]} />
        </group>
      </group>
    </group>
  );
}

export default function Bigfoot({ phase }) {
  const ref = useRef();
  const hit = useRef();
  const parts = {
    legL: useRef(),
    legR: useRef(),
    shinL: useRef(),
    shinR: useRef(),
    armL: useRef(),
    armR: useRef(),
    upper: useRef(),
    head: useRef(),
  };
  const camera = useThree((s) => s.camera);
  const clock = useMemo(aliveClock, []);
  const test = testOn('bigfoot');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const st = useMemo(() => ({ next: test ? 3 : rnd(1200, 1800), ev: null }), [test]);
  const p = useMemo(() => new THREE.Vector3(), []);
  const tan = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => releaseSlot('rare', 'bigfoot'), []);
  useEffect(() => setHittable(hit.current, false), []);

  const onTap = () => {
    const ev = st.ev;
    if (!ev || ev.seen) return;
    ev.seen = true;
    const n = (parseInt(readStore('localStorage', SIGHTINGS) || '0', 10) || 0) + 1;
    writeStore('localStorage', SIGHTINGS, String(n));
    islandToast(n === 1 ? "You saw Bigfoot! Nobody's going to believe you." : `Bigfoot again?! Sighting #${n}. Still blurry, somehow.`);
  };

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.tick(delta);
    if (!st.ev) {
      if (t < st.next) return;
      const daylight = phaseRef.current === 'day' || phaseRef.current === 'golden';
      if (!test && !daylight) {
        st.next = t + 60; // wait for the sun
        return;
      }
      if (!claimSlot('rare', 'bigfoot', 34)) {
        st.next = t + (test ? 5 : 30);
        return;
      }
      st.ev = { t0: t, s: 0, stride: 0, diveT: -1, wet: false, nextRipple: 0, seen: false };
      g.visible = true;
      setHittable(hit.current, true);
    }

    const ev = st.ev;
    const dt = Math.min(delta, 0.05);
    const tau = t - ev.t0;
    const u = ev.s / PATH_LEN;

    // Speed along the path: still while peeking, a cautious first step,
    // the long steady stride, slower while turned to look, slower in the water.
    let v = 0;
    if (tau > PEEK) {
      v = 0.95 * smooth(PEEK, PEEK + 1.8, tau);
      v *= 1 - 0.45 * Math.exp(-(((u - GLANCE_AT) / 0.07) ** 2));
      if (ev.wet) v *= 0.6;
    }
    if (ev.diveT < 0) ev.s = Math.min(PATH_LEN, ev.s + v * dt);
    ev.stride += v * dt * 2.9;

    PATH.getPointAt(Math.min(1, ev.s / PATH_LEN), p);
    PATH.getTangentAt(Math.min(1, ev.s / PATH_LEN), tan);
    const heading = Math.atan2(tan.x, tan.z);
    const ground = terrainY(p.x, p.z);
    ev.wet = ground < -0.05;

    let y = ground;
    let pitch = 0;
    if (ev.wet && ev.diveT < 0 && t >= ev.nextRipple) {
      ripple(p.x, p.z, 0.7);
      ev.nextRipple = t + 0.7;
    }
    if (ev.s >= PATH_LEN && ev.diveT < 0) {
      ev.diveT = t;
      splash(p.x + tan.x * 0.8, p.z + tan.z * 0.8, 1.6, 22);
    }
    if (ev.diveT >= 0) {
      const k = (t - ev.diveT) / DIVE;
      pitch = smooth(0, 0.5, k) * 1.25;
      y = ground - smooth(0.1, 1, k) * 2.6;
      if (k > 0.55 && !ev.foam) {
        ev.foam = true;
        splashFoam(p.x + tan.x * 1.2, p.z + tan.z * 1.2, 1.4, 2);
      }
      if (k > 1) {
        st.ev = null;
        st.next = t + (test ? 22 : rnd(1200, 1800));
        g.visible = false;
        setHittable(hit.current, false);
        releaseSlot('rare', 'bigfoot');
        return;
      }
    }

    g.position.set(p.x, y, p.z);
    g.rotation.set(pitch, heading, 0, 'YXZ');

    // The walk: big swinging stride, arms opposite, a heavy bob.
    const ph = ev.stride;
    const amp = Math.min(1, v / 0.6);
    const sw = Math.sin(ph) * 0.55 * amp;
    parts.legL.current.rotation.x = sw;
    parts.legR.current.rotation.x = -sw;
    parts.shinL.current.rotation.x = Math.max(0, -Math.cos(ph)) * 0.7 * amp;
    parts.shinR.current.rotation.x = Math.max(0, Math.cos(ph)) * 0.7 * amp;
    parts.armL.current.rotation.x = -sw * 0.9;
    parts.armR.current.rotation.x = sw * 0.9;
    g.position.y += Math.abs(Math.cos(ph)) * 0.05 * amp;

    // Peeking: lean out from behind the palm. Then the famous look back.
    let look = 0;
    if (tau < PEEK + 0.6) look = Math.sin(Math.min(1, tau / PEEK) * Math.PI) * 0.6;
    const glance = Math.exp(-(((u - GLANCE_AT) / 0.06) ** 2));
    const toCam = angleDiff(Math.atan2(camera.position.x - p.x, camera.position.z - p.z), heading);
    look += Math.max(-1.5, Math.min(1.5, toCam)) * glance;
    parts.upper.current.rotation.y = look * 0.55;
    parts.upper.current.rotation.z = tau < PEEK ? Math.sin(Math.min(1, tau / PEEK) * Math.PI) * -0.18 : 0;
    parts.head.current.rotation.y = look * 0.5;
  });

  return (
    <group ref={ref} visible={false}>
      <BigfootModel parts={parts} />
      <mesh ref={hit} geometry={BODY_GEO} material={HIT_MAT} position={[0, 1.2, 0]} scale={[0.75, 1.35, 0.7]} onClick={tapOnly(onTap)} {...hoverPointer} />
    </group>
  );
}
