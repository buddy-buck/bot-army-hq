import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { aliveClock } from '../../wild/director.js';
import { audioCtx } from '../state.js';
import { GLOW_TEX, clamp01, isDaytime, pointAtNdc, rand, std } from './common.js';

// Hot air balloons drifting slowly high around the island, gently bobbing.
// The camera looks down on the island, so open sky is mostly out of frame.
// Each balloon keeps to its own patch of the upper part of the view, high
// over the island (well above the tower), drifting slowly across it and
// following along, unhurried, as the camera turns.
// Every so often the burner roars: the flame flares, the envelope glows from
// inside (much more noticeable at sunrise and sunset) and the balloon lifts
// a little. Out from just after dawn; they drift off and away before night.
//
// Interaction: tap a balloon for a big burner blast and a little hop; press
// and hold to keep the burner roaring and the balloon climbs (up to MAX_BOOST
// above its cruising height), then sinks gently back after release. A soft
// whoosh plays (WebAudio, only ever from the tap itself).

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
const MAX_BOOST = 6; // how far above cruising height a held burner can lift it
const MAX_HOLD = 8; // seconds; a stuck pointer never keeps the burner on

// Generous invisible tap target around the envelope and basket (local units).
const HIT = new THREE.SphereGeometry(6, 8, 6).translate(0, -0.3, 0);
const M_HIT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
const CORE = new THREE.ConeGeometry(0.07, 0.42, 5);

// Burner whoosh: looping filtered noise, swelling in and fading out on stop.
let noiseBuf = null;
function whoosh() {
  const ac = audioCtx();
  if (!ac) return null;
  try {
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; // a bit warmer than white noise
        d[i] = last;
      }
    }
    const t0 = ac.currentTime + 0.01;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(900, t0 + 0.25);
    bp.frequency.exponentialRampToValueAtTime(620, t0 + 1.2);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.28, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.6);
    src.connect(bp).connect(g).connect(ac.destination);
    src.start(t0);
    let done = false;
    const stop = () => {
      if (done) return;
      done = true;
      const t1 = Math.max(ac.currentTime, t0 + 0.35);
      g.gain.cancelScheduledValues(t1);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value || 0.16), t1);
      g.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.35);
      src.stop(t1 + 0.4);
    };
    stop.maxTimer = setTimeout(stop, MAX_HOLD * 1000);
    return stop;
  } catch {
    return null;
  }
}

function makeFlight(i) {
  return {
    ...SPOTS[i],
    pos: new THREE.Vector3(),
    placed: false,
    ph: rand(0, 10),
    nextBurn: rand(3, 9),
    burnUntil: 0,
    lift: 0,
    held: false, // finger/mouse down on it
    heldFor: 0,
    blastUntil: 0, // a tap's big blast
    boost: 0, // extra height from the player's burns
    vy: 0,
    sound: null,
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
  const cores = useRef([]);
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
        coreMat: new THREE.MeshBasicMaterial({ color: '#fffbe6', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
        f: makeFlight(i),
      })),
    [count]
  );
  useEffect(() => () => balloons.forEach((b) => [b.geo, b.mat, b.flameMat, b.glowMat, b.botMat, b.bulbMat, b.coreMat].forEach((x) => x.dispose())), [balloons]);

  // Burner controls. Release can happen anywhere (off the balloon, off the
  // canvas), so a window listener lets go of every held burner too.
  const release = (f) => {
    if (!f.held) return;
    f.held = false;
    if (f.sound) {
      clearTimeout(f.sound.maxTimer);
      f.sound();
      f.sound = null;
    }
  };
  useEffect(() => {
    const up = () => balloons.forEach((b) => release(b.f));
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
      up();
      document.body.style.cursor = '';
    };
  }, [balloons]);
  const handlers = useMemo(
    () =>
      balloons.map((b) => ({
        onPointerDown: (e) => {
          if (present.current < 0.5) return;
          e.stopPropagation();
          try {
            e.target.setPointerCapture?.(e.pointerId);
          } catch {
            // capture is a nicety
          }
          const f = b.f;
          if (f.held) return;
          f.held = true;
          f.heldFor = 0;
          f.blastUntil = clock.t + 1.3;
          f.vy = Math.max(f.vy, 1.2); // every tap gives a little hop
          f.sound = whoosh();
        },
        onPointerUp: (e) => {
          if (b.f.held) e.stopPropagation();
          release(b.f);
        },
        onPointerCancel: () => release(b.f),
        onPointerLeave: () => release(b.f),
        onLostPointerCapture: () => release(b.f),
        onClick: (e) => {
          if (present.current > 0.5) e.stopPropagation();
        },
        onPointerOver: (e) => {
          if (present.current < 0.5) return;
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          document.body.style.cursor = '';
        },
      })),
    [balloons, clock]
  );

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
      // The player's burner: climbs while held, a short blast for a tap,
      // then eases back down to cruising height.
      if (f.held) {
        f.heldFor += dt;
        if (f.heldFor > MAX_HOLD || !g.visible) release(f);
      }
      const manual = f.held || t < f.blastUntil;
      if (f.held) f.vy = Math.min(3.2, f.vy + 3.0 * dt);
      else f.vy += (-Math.min(0.7, 0.15 + f.boost * 0.12) - f.vy) * Math.min(1, dt * 0.9);
      f.boost += f.vy * dt;
      if (f.boost > MAX_BOOST) {
        f.boost = MAX_BOOST;
        f.vy = Math.min(f.vy, 0);
      }
      if (f.boost < 0) {
        f.boost = 0;
        f.vy = Math.max(f.vy, 0);
      }

      const burning = manual || t < f.burnUntil;
      f.lift = Math.min(1.4, Math.max(0, f.lift + (burning ? 0.35 : -0.05) * dt));
      let flick = burning ? 0.75 + 0.25 * Math.sin(t * 37 + i) * Math.sin(t * 23) : 0.12;
      if (manual) flick = 1.7 + 0.35 * Math.sin(t * 41 + i) * Math.sin(t * 27);

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
      g.position.set(f.pos.x, f.pos.y + f.boost + f.lift * 0.6 + Math.sin(t * 0.45 + f.ph) * 0.25, f.pos.z);
      g.rotation.set(Math.sin(t * 0.37 + f.ph) * 0.04, t * 0.05 + f.ph, Math.sin(t * 0.29 + f.ph * 2) * 0.05);

      const fl = flames.current[i];
      if (fl) {
        fl.visible = flick > 0.05;
        fl.scale.set(0.6 + flick * 0.5, 0.35 + flick * 1.3, 0.6 + flick * 0.5);
      }
      const co = cores.current[i];
      if (co) {
        co.visible = manual;
        if (manual) co.scale.set(0.8 + flick * 0.4, 0.6 + flick * 1.2, 0.8 + flick * 0.4);
      }
      b.coreMat.opacity = manual ? 0.85 : 0;
      b.flameMat.opacity = Math.min(1, 0.5 + flick * 0.5);
      b.glowMat.opacity = Math.min(0.95, flick * (manual ? 0.45 + 0.4 * dusk : 0.25 + 0.65 * dusk));
      const gl = glows.current[i];
      if (gl) gl.scale.setScalar(1.6 + flick * (manual ? 2.4 : 1.8));
      b.mat.emissiveIntensity = Math.min(0.9, flick * (0.05 + 0.4 * dusk) + (manual ? 0.12 : 0));
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
          <mesh ref={(el) => (cores.current[i] = el)} geometry={CORE} material={b.coreMat} position={[0, -1.86, 0]} visible={false} />
          <mesh geometry={HIT} material={M_HIT} {...handlers[i]} />
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
