import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { aliveClock } from '../../wild/director.js';
import { GLOW_TEX, clamp01, isDaytime, pointAtNdc, rand, std } from './common.js';

// Hot air balloons drifting slowly high around the island, gently bobbing.
// The camera looks down on the island, so open sky is mostly out of frame.
// Each balloon keeps to its own patch of the upper part of the view, high
// over the island (well above the tower), drifting slowly across it and
// following along, unhurried, as the camera turns.
// Every so often the burner roars: the flame flares, the envelope glows from
// inside (much more noticeable at sunrise and sunset) and the balloon lifts
// a little. Out from just after dawn; they drift off and away before night.

// Envelope outline (radius, height), from the mouth up to the crown.
const PROFILE = [
  [0.3, -1.9], [0.5, -1.6], [1.0, -0.95], [1.45, -0.2], [1.66, 0.55], [1.6, 1.2], [1.3, 1.78], [0.78, 2.18], [0.0, 2.34],
].map(([r, y]) => new THREE.Vector2(r, y));
const GORES = 12;

// Striped envelope: alternating gores, a band near the mouth, a crown cap.
function envelopeGeometry(a, b, band) {
  const g = new THREE.LatheGeometry(PROFILE, GORES).toNonIndexed();
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  const cc = new THREE.Color(band);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 3; k++) {
      x += pos.getX(i + k) / 3;
      y += pos.getY(i + k) / 3;
      z += pos.getZ(i + k) / 3;
    }
    const ang = (Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2);
    const gore = Math.floor((ang / (Math.PI * 2)) * GORES);
    if (y < -1.1) c.copy(cc);
    else if (y > 2.0) c.copy(ca);
    else c.copy(gore % 2 ? ca : cb);
    for (let k = 0; k < 3; k++) c.toArray(colors, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const _target = new THREE.Vector3();
const _out = new THREE.Vector3();
const _step = new THREE.Vector3();

const BASKET = new THREE.BoxGeometry(0.62, 0.46, 0.62);
const RIM = new THREE.BoxGeometry(0.7, 0.07, 0.7);
const BURNER = new THREE.CylinderGeometry(0.1, 0.13, 0.16, 6);
const FLAME = new THREE.ConeGeometry(0.13, 0.5, 6);
const HEAD = new THREE.IcosahedronGeometry(0.15, 1);
const STALK = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4);
const BULB = new THREE.IcosahedronGeometry(0.045, 0);
const ROPES = (() => {
  const pts = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    pts.push(sx * 0.27, -2.3, sz * 0.27, sx * 0.21, -1.88, sz * 0.21);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
})();
const M_BASKET = std('#8a5a32');
const M_RIM = std('#5e3b1e');
const M_BURNER = std('#3a3f48', { metalness: 0.5, roughness: 0.4 });
const M_ROPE = new THREE.LineBasicMaterial({ color: '#4a3a2a' });

// Buddy Buck blue and yellow; a team-y magenta and orange; a teal one.
const LOOKS = [
  { a: '#19469D', b: '#FFDE69', band: '#19469D', bot: '#FFDE69' },
  { a: '#e0338a', b: '#ff8a2b', band: '#7a2a8a', bot: '#2ec4c8' },
  { a: '#2ec4c8', b: '#fff4e2', band: '#ff6b5a', bot: '#ff8a2b' },
];

// Screen patch (ndc x, y) and height for each balloon.
const SPOTS = [
  { sx: -0.62, sy: 0.62, alt: 12 },
  { sx: 0.6, sy: 0.68, alt: 13 },
  { sx: 0.05, sy: 0.84, alt: 13.8 },
];
const SCALE = 0.5;
const MAX_SPEED = 1.6; // units per second, so camera drags never yank them

function makeFlight(i) {
  return {
    ...SPOTS[i],
    pos: new THREE.Vector3(),
    placed: false,
    ph: rand(0, 10),
    nextBurn: rand(3, 9),
    burnUntil: 0,
    lift: 0,
  };
}

export default function Balloons({ ctx }) {
  const { sky, lowPower } = ctx;
  const { camera } = useThree();
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const count = lowPower ? 2 : 3;
  const clock = useMemo(aliveClock, []);
  const groups = useRef([]);
  const flames = useRef([]);
  const glows = useRef([]);
  const present = useRef(isDaytime(sky) ? 1 : 0);

  const balloons = useMemo(
    () =>
      LOOKS.slice(0, count).map((look, i) => ({
        look,
        geo: envelopeGeometry(look.a, look.b, look.band),
        mat: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75, emissive: '#ff8a30', emissiveIntensity: 0 }),
        flameMat: new THREE.MeshBasicMaterial({ color: '#ffc04a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
        glowMat: new THREE.SpriteMaterial({ map: GLOW_TEX, color: '#ff9a40', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
        botMat: std(look.bot, { emissive: look.bot, emissiveIntensity: 0.15 }),
        bulbMat: new THREE.MeshBasicMaterial({ color: '#fff3a0' }),
        f: makeFlight(i),
      })),
    [count]
  );
  useEffect(() => () => balloons.forEach((b) => [b.geo, b.mat, b.flameMat, b.glowMat, b.botMat, b.bulbMat].forEach((x) => x.dispose())), [balloons]);

  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const dt = Math.min(delta, 0.1);
    const s = skyRef.current;
    // Drift in after dawn, drift off before night (about a minute either way).
    const want = isDaytime(s) ? 1 : 0;
    present.current += (want - present.current) * Math.min(1, dt * 0.04) + Math.sign(want - present.current) * dt * 0.004;
    present.current = clamp01(present.current);
    const away = 1 - present.current;
    const dusk = Math.max(s.glowK || 0, s.sunUp ? 0 : 1);

    balloons.forEach((b, i) => {
      const g = groups.current[i];
      if (!g) return;
      g.visible = present.current > 0.003;
      if (!g.visible) return;
      const f = b.f;
      // Burner: short roars every 5 to 14 seconds.
      if (t > f.nextBurn) {
        f.burnUntil = t + rand(1.1, 2.2);
        f.nextBurn = t + rand(5, 14);
      }
      const burning = t < f.burnUntil;
      f.lift = Math.min(1.4, Math.max(0, f.lift + (burning ? 0.35 : -0.05) * dt));
      const flick = burning ? 0.75 + 0.25 * Math.sin(t * 37 + i) * Math.sin(t * 23) : 0.12;

      // Head for this balloon's patch of the view, never faster than a breeze.
      pointAtNdc(camera, f.sx + Math.sin(t * 0.021 + f.ph) * 0.28, f.sy + Math.sin(t * 0.017 + f.ph * 2) * 0.06, f.alt, _target);
      // Drifting off for the night: up and away from the island.
      if (away > 0) {
        _out.set(_target.x, 0, _target.z).normalize();
        _target.addScaledVector(_out, away * 70);
        _target.y += away * 30;
      }
      if (!f.placed) {
        f.pos.copy(_target);
        f.placed = true;
      }
      _step.subVectors(_target, f.pos);
      const len = _step.length();
      const max = (MAX_SPEED + away * 4) * dt;
      f.pos.addScaledVector(_step, len > max ? max / len : Math.min(1, dt * 0.5));
      g.position.set(f.pos.x, f.pos.y + f.lift * 0.6 + Math.sin(t * 0.45 + f.ph) * 0.25, f.pos.z);
      g.rotation.set(Math.sin(t * 0.37 + f.ph) * 0.04, t * 0.05 + f.ph, Math.sin(t * 0.29 + f.ph * 2) * 0.05);

      const fl = flames.current[i];
      if (fl) {
        fl.visible = flick > 0.05;
        fl.scale.set(0.6 + flick * 0.5, 0.35 + flick * 1.3, 0.6 + flick * 0.5);
      }
      b.flameMat.opacity = 0.5 + flick * 0.5;
      b.glowMat.opacity = flick * (0.25 + 0.65 * dusk);
      const gl = glows.current[i];
      if (gl) gl.scale.setScalar(1.6 + flick * 1.8);
      b.mat.emissiveIntensity = flick * (0.05 + 0.4 * dusk);
    });
  });

  return (
    <group>
      {balloons.map((b, i) => (
        <group key={i} ref={(el) => (groups.current[i] = el)} scale={SCALE}>
          <mesh geometry={b.geo} material={b.mat} />
          <lineSegments geometry={ROPES} material={M_ROPE} />
          <mesh geometry={BASKET} material={M_BASKET} position={[0, -2.55, 0]} />
          <mesh geometry={RIM} material={M_RIM} position={[0, -2.31, 0]} />
          <mesh geometry={BURNER} material={M_BURNER} position={[0, -2.08, 0]} />
          <mesh ref={(el) => (flames.current[i] = el)} geometry={FLAME} material={b.flameMat} position={[0, -1.82, 0]} />
          <sprite ref={(el) => (glows.current[i] = el)} material={b.glowMat} position={[0, -1.55, 0]} />
          {/* a little bot passenger peeking over the rim */}
          <group position={[0.12, -2.16, 0.12]}>
            <mesh geometry={HEAD} material={b.botMat} />
            <mesh geometry={STALK} material={M_BURNER} position={[0, 0.2, 0]} />
            <mesh geometry={BULB} material={b.bulbMat} position={[0, 0.29, 0]} />
          </group>
        </group>
      ))}
    </group>
  );
}
