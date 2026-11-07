import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { aliveClock, claimSlot, releaseSlot, testOn } from '../../wild/director.js';
import { islandE, siteDistance, terrainY } from '../../utils/paths.js';
import { world } from '../state.js';
import { GLOW_TEX, pick, rand, smooth, std } from './common.js';

// Easter egg: a little flying saucer, rarely, on a dark night. It zips in,
// hovers over a beach, shines a tractor beam on a beach ball (or a coconut),
// lifts it a bit, fumbles it, wobbles, and zooms off. Tap it while it's
// here for a word from our visitor.
//
// Roughly once per 15-20 minutes of night viewing. Takes the 'rare' slot
// (shared with the whale) and the 'sky' slot. ?test=ufo brings it often.

const OWNER = 'ufo';
const DURATION = 14.5;
const HOVER_Y = 6.2;
const LINES = [
  'We come in peace. And for the mai tais.',
  'Take me to your Chief.',
  'Beep boop. Wrong island, great vibes.',
  'Just borrowing a beach ball. Back in a jiffy.',
  'Five stars. Would abduct again.',
];

// Sand spots around the beach, clear of landmarks.
const SPOTS = (() => {
  const out = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const e1 = islandE(dx, dz);
    const k = Math.sqrt(0.88 / e1);
    const x = dx * k;
    const z = dz * k;
    if (siteDistance(x, z) > 1.6) out.push({ x, z, y: terrainY(x, z) });
  }
  return out;
})();

// Saucer: a faceted disc.
const SAUCER = new THREE.LatheGeometry(
  [[0, -0.36], [0.85, -0.2], [1.55, -0.02], [1.6, 0.03], [1.0, 0.18], [0.55, 0.26], [0, 0.28]].map(([r, y]) => new THREE.Vector2(r, y)),
  16
);
const DOME = new THREE.SphereGeometry(0.58, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
const PILOT = new THREE.IcosahedronGeometry(0.2, 1);
const EYE = new THREE.SphereGeometry(0.045, 6, 4);
const LIGHT = new THREE.SphereGeometry(0.13, 6, 4);
const BEAM = new THREE.CylinderGeometry(0.4, 1.7, 1, 20, 1, true).translate(0, -0.5, 0);
const HIT = new THREE.SphereGeometry(2.3, 8, 6);
const BALL = (() => {
  const g = new THREE.SphereGeometry(0.32, 12, 8).toNonIndexed();
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const palette = ['#ff4d4d', '#ffffff', '#3f8cff', '#ffe14d', '#ffffff', '#45d16a'].map((c) => new THREE.Color(c));
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const gore = Math.floor((((Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * 6);
    const c = Math.abs(y) > 0.28 ? palette[1] : palette[gore];
    for (let k = 0; k < 3; k++) c.toArray(cols, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
})();
const COCONUT = new THREE.IcosahedronGeometry(0.24, 1);

const M_SAUCER = std('#c4ccd6', { metalness: 0.45, roughness: 0.35, emissive: '#5a6878', emissiveIntensity: 0.55 });
const M_PILOT = std('#7dff8a', { emissive: '#3fbf5a', emissiveIntensity: 0.6 });
const M_EYE = new THREE.MeshBasicMaterial({ color: '#10202a' });
const M_BALL = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5 });
const M_COCONUT = std('#6b4a2a');
const RIM_COLORS = ['#ff4d6d', '#ffe14d', '#4dd2ff', '#7dff8a'].map((c) => new THREE.Color(c));
const N_LIGHTS = 10;

const beamVertex = /* glsl */ `
  varying float vY;
  varying vec2 vUv;
  void main() {
    vY = -position.y;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const beamFragment = /* glsl */ `
  uniform float uK;
  uniform float uTime;
  varying float vY;
  varying vec2 vUv;
  void main() {
    float rings = 0.55 + 0.45 * sin(vY * 22.0 - uTime * 7.0);
    float edge = 0.6 + 0.4 * sin(vUv.x * 6.2832 * 6.0 + uTime * 2.0);
    float a = (0.3 + 0.35 * rings) * edge * (0.55 + 0.45 * vY) * uK;
    gl_FragColor = vec4(vec3(0.55, 1.0, 0.8), a);
  }
`;

const easeOut = (x) => 1 - (1 - x) ** 3;
const easeIn = (x) => x * x * x;

export default function Ufo({ ctx }) {
  const { sky, onToast } = ctx;
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const test = testOn('ufo');
  const clock = useMemo(aliveClock, []);
  const root = useRef();
  const ship = useRef();
  const beam = useRef();
  const ball = useRef();
  const lights = useRef();
  const glow = useRef();

  const beamMat = useMemo(
    () => new THREE.ShaderMaterial({ uniforms: { uK: { value: 0 }, uTime: { value: 0 } }, vertexShader: beamVertex, fragmentShader: beamFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    []
  );
  const domeMat = useMemo(() => std('#8affe6', { emissive: '#3fffd0', emissiveIntensity: 0.7, transparent: true, opacity: 0.55, roughness: 0.2 }), []);
  const lightMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }), []);
  const glowMat = useMemo(() => new THREE.SpriteMaterial({ map: GLOW_TEX, color: '#8affd0', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), []);
  useEffect(() => () => [beamMat, domeMat, lightMat, glowMat].forEach((m) => m.dispose()), [beamMat, domeMat, lightMat, glowMat]);
  useEffect(() => () => {
    releaseSlot('sky', OWNER);
    releaseSlot('rare', OWNER);
    world.glow.delete(OWNER);
  }, []);

  const S = useRef({
    visit: null, // { start, spot, from, to, coconut }
    next: test ? 3 : rand(60, 120),
    wobble: 0,
  });
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), c: new THREE.Color() }), []);

  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const dt = Math.min(delta, 0.1);
    const st = S.current;
    const s = skyRef.current;
    const dark = s.isNight && s.stars > 0.5;

    if (!st.visit && t > st.next) {
      // One roll a minute: about once every 17 minutes of night viewing.
      st.next = t + (test ? 22 : 60);
      if ((test || (dark && Math.random() < 1 / 17)) && SPOTS.length) {
        if (claimSlot('rare', OWNER, DURATION + 1)) {
          if (claimSlot('sky', OWNER, DURATION + 1)) {
            const spot = pick(SPOTS);
            const a = rand(0, Math.PI * 2);
            const b = a + rand(1.5, 3);
            st.visit = {
              start: t,
              spot,
              from: new THREE.Vector3(spot.x + Math.cos(a) * 80, 38, spot.z + Math.sin(a) * 80),
              to: new THREE.Vector3(spot.x + Math.cos(b) * 110, 55, spot.z + Math.sin(b) * 110),
              coconut: Math.random() < 0.3,
            };
          } else releaseSlot('rare', OWNER);
        }
      }
    }

    const g = root.current;
    if (!g) return;
    const v = st.visit;
    if (!v) {
      g.visible = false;
      return;
    }
    const e = t - v.start;
    if (e > DURATION) {
      st.visit = null;
      releaseSlot('sky', OWNER);
      releaseSlot('rare', OWNER);
      world.glow.delete(OWNER);
      g.visible = false;
      ship.current.position.set(0, -500, 0); // parked out of reach of taps
      return;
    }
    g.visible = true;
    const sp = v.spot;
    const hoverY = sp.y + HOVER_Y;

    // Ship path: zip in, hover, zoom away.
    const P = ship.current.position;
    if (e < 2.4) {
      const k = easeOut(e / 2.4);
      P.lerpVectors(v.from, tmp.v.set(sp.x, hoverY, sp.z), k);
      P.y += Math.sin(k * Math.PI) * 4;
    } else if (e < 10.4) {
      P.set(sp.x + Math.sin(e * 1.3) * 0.15, hoverY + Math.sin(e * 2.1) * 0.12, sp.z + Math.cos(e * 1.1) * 0.15);
    } else {
      const k = easeIn(Math.min(1, (e - 10.4) / 1.8));
      P.lerpVectors(tmp.v.set(sp.x, hoverY, sp.z), v.to, k);
    }
    // Wobble: on arrival, after the fumble, and when tapped.
    st.wobble = Math.max(0, st.wobble - dt * 0.6);
    const settle = Math.max(0, 1 - Math.abs(e - 2.6) / 1.2) + Math.max(0, 1 - Math.abs(e - 9.3) / 1.0) + st.wobble;
    ship.current.rotation.set(Math.sin(e * 9) * 0.18 * settle + (e < 2.4 ? 0.25 : 0), e * 1.6, Math.cos(e * 8) * 0.16 * settle);
    ship.current.scale.setScalar(e > 10.4 ? 1 - smooth(11.4, 12.2, e) : smooth(0, 0.6, e));

    // Tractor beam: on 3.6-8.4, flickers off.
    let beamK = smooth(3.6, 4.2, e) * (1 - smooth(8.2, 8.5, e));
    if (e > 7.9 && e < 8.4) beamK *= Math.sin(e * 60) > 0 ? 1 : 0.2;
    beamMat.uniforms.uK.value = beamK;
    beamMat.uniforms.uTime.value = e;
    if (beam.current) {
      beam.current.visible = beamK > 0.01;
      beam.current.position.set(P.x, P.y - 0.3, P.z);
      beam.current.scale.set(1, P.y - 0.3 - sp.y, 1);
    }
    if (beamK > 0.01) world.glow.set(OWNER, { x: sp.x, z: sp.z, strength: beamK });
    else world.glow.delete(OWNER);

    // The ball: pops in unseen, floats up in the beam, falls and bounces.
    const B = ball.current;
    if (B) {
      let y = 0;
      let spin = 0;
      if (e < 8.3) {
        const up = smooth(4.2, 8.0, e);
        y = up * 2.3 + Math.sin(e * 3) * 0.1 * up;
        spin = up * e * 2.5;
      } else {
        const ft = e - 8.3;
        const h0 = 2.3;
        const tFall = Math.sqrt((2 * h0) / 9.8);
        if (ft < tFall) y = h0 - 0.5 * 9.8 * ft * ft;
        else {
          const b = ft - tFall;
          y = Math.max(0, 0.45 * Math.sin(Math.min(1, b / 0.55) * Math.PI)) + Math.max(0, 0.12 * Math.sin(Math.max(0, b - 0.55) / 0.3 * Math.PI)) * (b < 0.85 ? 1 : 0);
        }
        spin = 20 + ft * 3;
      }
      B.position.set(sp.x, sp.y + (v.coconut ? 0.2 : 0.3) + y, sp.z);
      B.rotation.set(spin * 0.6, spin, 0);
      B.scale.setScalar(smooth(0, 0.4, e) * (1 - smooth(13.5, 14.4, e)));
      B.children[0].visible = !v.coconut;
      B.children[1].visible = v.coconut;
    }

    // Rim lights chase around the edge.
    const L = lights.current;
    if (L) {
      for (let i = 0; i < N_LIGHTS; i++) {
        const on = (Math.floor(e * 8) + i) % 3 === 0;
        tmp.c.copy(RIM_COLORS[(i + Math.floor(e * 2)) % RIM_COLORS.length]).multiplyScalar(on ? 1 : 0.25);
        L.setColorAt(i, tmp.c);
      }
      if (L.instanceColor) L.instanceColor.needsUpdate = true;
    }
    if (glow.current) glow.current.material.opacity = 0.45 + 0.25 * Math.sin(e * 5);
  });

  // Rim light positions, set once.
  useEffect(() => {
    const L = lights.current;
    if (!L) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < N_LIGHTS; i++) {
      const a = (i / N_LIGHTS) * Math.PI * 2;
      L.setMatrixAt(i, m.makeTranslation(Math.cos(a) * 1.5, 0.01, Math.sin(a) * 1.5));
      L.setColorAt(i, RIM_COLORS[i % RIM_COLORS.length]);
    }
    L.instanceMatrix.needsUpdate = true;
  }, []);

  const onTap = (ev) => {
    if (!S.current.visit) return;
    ev.stopPropagation();
    S.current.wobble = 1.2;
    onToast?.(pick(LINES));
  };

  return (
    <group ref={root} visible={false}>
      <group ref={ship} position={[0, -500, 0]}>
        <mesh geometry={SAUCER} material={M_SAUCER} />
        <mesh geometry={DOME} material={domeMat} position={[0, 0.22, 0]} />
        <group position={[0, 0.42, 0]}>
          <mesh geometry={PILOT} material={M_PILOT} />
          <mesh geometry={EYE} material={M_EYE} position={[0.08, 0.04, 0.17]} />
          <mesh geometry={EYE} material={M_EYE} position={[-0.08, 0.04, 0.17]} />
        </group>
        <instancedMesh ref={lights} args={[LIGHT, lightMat, N_LIGHTS]} />
        <sprite ref={glow} material={glowMat} position={[0, -0.45, 0]} scale={[2.6, 1.4, 1]} />
        <mesh
          geometry={HIT}
          onClick={onTap}
          onPointerOver={(ev) => {
            if (!S.current.visit) return;
            ev.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = '';
          }}
        >
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={beam} geometry={BEAM} material={beamMat} visible={false} renderOrder={4} />
      <group ref={ball}>
        <mesh geometry={BALL} material={M_BALL} />
        <mesh geometry={COCONUT} material={M_COCONUT} visible={false} />
      </group>
    </group>
  );
}
