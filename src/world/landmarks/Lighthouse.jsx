import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SITES, ZONES, terrainY } from '../../utils/paths.js';
import { audioCtx } from '../state.js';
import { aliveClock, testOn } from '../../wild/director.js';
import { Box, Cyl, SoftGlow, duskFactor, pointer, spriteGlowMaterial, std, tap } from './kit.jsx';

// The lighthouse on the north-east point: a white tower with red bands on a
// pile of rocks at the waterline, an iron gallery, a glass lantern room and
// a red cap. From golden hour on, a beam sweeps slowly over the sea.
// Easter egg: tap it for the foghorn (sound rings roll out from the lamp and
// the beam flashes).
// On top: a weather vane (compass arms N/E/S/W and a little bot riding the
// arrow) that points into the breeze. It swings smoothly with the gusts and
// now and then a big gust whirls it round two or three times
// (every 35 to 90 s; ?test=vane makes it every ~8 s).

const S = SITES.lighthouse;
export const LAMP_Y = S.height - 0.15; // lamp center
const GALLERY_Y = LAMP_Y - 0.42; // gallery deck top
const BASE_Y = 0.78; // top of the stone plinth
const R_BOT = 0.74;
const R_TOP = 0.5;
const BANDS = 4;
const HORN_S = 2.6;

const LM = {
  white: std('#fbf7ef'),
  red: std('#d0333a'),
  redCap: std('#c62a32', { roughness: 0.6 }),
  iron: std('#2f3236', { roughness: 0.5, metalness: 0.3 }),
  rock: std('#7f878c'),
  rockDark: std('#626a70'),
  plinth: std('#a7aeb2'),
  door: std('#3d6a8a'),
  glass: new THREE.MeshStandardMaterial({ color: '#d8f3ff', transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.2, depthWrite: false }),
  hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
};

// Soft light cone: brightest at the lamp, fading to nothing at the far end
// and toward the edges (so it reads as a shaft of light, not a solid cone).
const BEAM_LEN = 14;
const BEAM_GEO = new THREE.ConeGeometry(2.3, BEAM_LEN, 24, 1, true).translate(0, -BEAM_LEN / 2, 0).rotateZ(Math.PI / 2);
function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uColor: { value: new THREE.Color('#fff2c4') } },
    vertexShader: /* glsl */ `
      varying float vV;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        vV = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uI;
      uniform vec3 uColor;
      varying float vV;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        float along = pow(vV, 1.3) * smoothstep(0.0, 0.3, vV);
        float rim = pow(abs(dot(normalize(vN), normalize(vView))), 1.4);
        gl_FragColor = vec4(uColor * along * rim * uI * 0.9, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const RING_GEO = new THREE.TorusGeometry(1, 0.035, 4, 40).rotateX(Math.PI / 2);
const ROCK_GEO = new THREE.DodecahedronGeometry(1, 0);
const noRay = () => null;

// Rocks piled around the foot, down into the water.
const LOOKOUT = ZONES.lookout; // the next-door neighbor
const TO_LOOKOUT = Math.atan2(LOOKOUT.z - S.z, LOOKOUT.x - S.x);
const ROCK_LIST = (() => {
  const out = [];
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.sin(i * 7.3) * 0.2;
    let r = 1.05 + (i % 3) * 0.32;
    // keep the side facing the Research Lookout tidy: big outer rocks there
    // pull in close, so the two neighbors don't crowd each other
    const off = Math.abs(Math.atan2(Math.sin(a - TO_LOOKOUT), Math.cos(a - TO_LOOKOUT)));
    if (off < 0.6) r = Math.min(r, 1.1);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const g = Math.max(terrainY(S.x + x, S.z + z), -0.55);
    const s = 0.42 + ((i * 37) % 10) / 22;
    out.push({ x, z, y: g + s * 0.35, s, rot: i * 1.7, dark: i % 2 });
  }
  // a few big ones holding the plinth
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    out.push({ x: Math.cos(a) * 0.75, z: Math.sin(a) * 0.75, y: 0.25, s: 0.62, rot: i * 2.3, dark: 0 });
  }
  return out;
})();

function Rocks() {
  const light = useRef();
  const dark = useRef();
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    let li = 0;
    let di = 0;
    for (const r of ROCK_LIST) {
      d.position.set(r.x, r.y, r.z);
      d.rotation.set(r.rot, r.rot * 1.3, r.rot * 0.7);
      d.scale.set(r.s * 1.2, r.s * 0.75, r.s);
      d.updateMatrix();
      if (r.dark) dark.current.setMatrixAt(di++, d.matrix);
      else light.current.setMatrixAt(li++, d.matrix);
    }
    light.current.count = li;
    dark.current.count = di;
    light.current.instanceMatrix.needsUpdate = true;
    dark.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      <instancedMesh ref={light} args={[ROCK_GEO, LM.rock, ROCK_LIST.length]} />
      <instancedMesh ref={dark} args={[ROCK_GEO, LM.rockDark, ROCK_LIST.length]} />
    </group>
  );
}

// Deep two-tone foghorn: detuned saw + square through a lowpass, slow swell
// in, a sag in pitch, slow release. ~2.5 seconds.
function playFoghorn() {
  const ac = audioCtx();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  const t0 = ac.currentTime + 0.02;
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.32, t0 + 0.45);
  out.gain.setValueAtTime(0.32, t0 + 1.9);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.55);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(180, t0);
  lp.frequency.linearRampToValueAtTime(420, t0 + 0.5);
  lp.frequency.linearRampToValueAtTime(300, t0 + 2.5);
  lp.Q.value = 2;
  lp.connect(out);
  out.connect(ac.destination);
  const tones = [
    ['sawtooth', 87, 0.5],
    ['square', 87 * 1.014, 0.28],
    ['sine', 43.5, 0.6],
  ];
  for (const [type, f, g] of tones) {
    const o = ac.createOscillator();
    const og = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f * 0.97, t0);
    o.frequency.linearRampToValueAtTime(f, t0 + 0.3);
    o.frequency.setValueAtTime(f, t0 + 1.8);
    o.frequency.linearRampToValueAtTime(f * 0.93, t0 + 2.5);
    og.gain.value = g;
    o.connect(og);
    og.connect(lp);
    o.start(t0);
    o.stop(t0 + 2.7);
  }
}

// ---------------------------------------------------------------------------
// Weather vane

// The breeze comes from the north-west, the same wind the sailboats beat
// into (Sailboat.jsx UPWIND). The arrow points where the wind comes FROM.
const UPWIND = 3.6;
const VANE_BASE = UPWIND - Math.PI / 2; // rotation.y that aims local +x upwind
const VANE_Y = LAMP_Y + 1.1; // compass arms height
const TAU = Math.PI * 2;
const wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
const rand = (n) => {
  const s = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return s - Math.floor(s);
};

function letterMaterial(ch) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.font = '900 52px "Arial Black", Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 8;
  x.strokeStyle = 'rgba(255,255,255,0.9)';
  x.strokeText(ch, 32, 35);
  x.fillStyle = '#2f3236';
  x.fillText(ch, 32, 35);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: t, alphaTest: 0.35, fog: false });
}

// A little bot cut out of sheet iron, riding the arrow.
function botSilhouette() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.roundRect(40, 14, 52, 40, 12); // head
  x.roundRect(46, 58, 40, 40, 8); // body
  x.rect(62, 0, 6, 16); // antenna
  x.arc(65, 4, 7, 0, TAU);
  x.rect(30, 62, 18, 8); // arm, waving forward
  x.rect(24, 50, 8, 20);
  x.rect(84, 64, 22, 8); // arm, back
  x.rect(50, 96, 10, 22); // legs
  x.rect(72, 96, 10, 22);
  x.fill();
  // eyes and a smile punched through
  x.globalCompositeOperation = 'destination-out';
  x.beginPath();
  x.arc(56, 32, 5, 0, TAU);
  x.arc(76, 32, 5, 0, TAU);
  x.fill();
  x.fillRect(58, 42, 16, 4);
  const t = new THREE.CanvasTexture(c);
  return new THREE.MeshStandardMaterial({ color: '#2f3236', alphaMap: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3 });
}

const VM = {};
function vaneMats() {
  if (!VM.N) {
    for (const ch of ['N', 'E', 'S', 'W']) VM[ch] = letterMaterial(ch);
    VM.bot = botSilhouette();
    VM.gold = std('#c9a24a', { roughness: 0.35, metalness: 0.5 });
    VM.fin = std('#c62a32', { roughness: 0.6, side: THREE.DoubleSide });
  }
  return VM;
}
const LETTERS = [
  ['N', 0, -1],
  ['E', 1, 0],
  ['S', 0, 1],
  ['W', -1, 0],
];
const ARROW_HEAD = new THREE.ConeGeometry(0.06, 0.16, 4).rotateZ(-Math.PI / 2);
const TAIL_GEO = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.lineTo(-0.2, 0.13);
  sh.lineTo(-0.24, 0.13);
  sh.lineTo(-0.2, 0);
  sh.lineTo(-0.24, -0.08);
  sh.lineTo(-0.2, -0.08);
  sh.closePath();
  return new THREE.ShapeGeometry(sh);
})();

function WeatherVane({ animate }) {
  const mats = vaneMats();
  const vane = useRef();
  const st = useMemo(() => ({ a: VANE_BASE, w: 0, spin: 0, nextSpin: testOn('vane') ? 4 : 35 + rand(1) * 40, n: 1, clock: aliveClock() }), []);
  useFrame((_, delta) => {
    if (!animate || !vane.current) return;
    const dt = Math.min(delta, 0.05);
    const t = st.clock.tick(delta);
    // the wind wanders: slow drift plus quicker gusty wobbles
    const gust = 0.5 + 0.5 * Math.sin(t * 0.21 + 1.3) * Math.sin(t * 0.13);
    const want = VANE_BASE + Math.sin(t * 0.05) * 0.45 + Math.sin(t * 0.17 + 2) * 0.22 + (Math.sin(t * 1.3) * 0.6 + Math.sin(t * 2.9 + 1) * 0.4) * 0.14 * gust;
    if (st.spin > 0) {
      // a big gust: free-wheel with little friction, then settle back
      st.spin -= dt;
      st.w -= st.w * 0.55 * dt;
    } else {
      st.w += (wrap(want - st.a) * 7 - st.w * 2.6) * dt; // springy, a touch of overshoot
      if (t > st.nextSpin) {
        st.n += 1;
        st.spin = 1.6 + rand(st.n) * 0.9;
        st.w = (rand(st.n + 0.5) > 0.35 ? 1 : -1) * (11 + rand(st.n + 0.3) * 5);
        st.nextSpin = t + (testOn('vane') ? 8 : 35 + rand(st.n + 0.7) * 55);
      }
    }
    st.a = wrap(st.a + st.w * dt);
    vane.current.rotation.y = st.a;
  });
  return (
    <group position={[0, VANE_Y, 0]} scale={1.4}>
      {/* fixed compass arms with the letters */}
      <Box p={[0, 0, 0]} s={[0.56, 0.018, 0.018]} m={LM.iron} />
      <Box p={[0, 0, 0]} s={[0.018, 0.018, 0.56]} m={LM.iron} />
      {LETTERS.map(([ch, dx, dz]) => (
        <sprite key={ch} position={[dx * 0.36, 0.02, dz * 0.36]} scale={[0.17, 0.17, 0.17]} material={mats[ch]} raycast={noRay} />
      ))}
      <Cyl p={[0, 0.12, 0]} rt={0.012} h={0.5} m={LM.iron} />
      {/* the turning part: arrow, tail fin and the bot */}
      <group ref={vane} position={[0, 0.3, 0]} rotation={[0, st.a, 0]}>
        <mesh position={[0, 0, 0]} material={mats.gold}>
          <sphereGeometry args={[0.03, 6, 4]} />
        </mesh>
        <Box p={[0.02, 0, 0]} s={[0.5, 0.016, 0.016]} m={LM.iron} />
        <mesh geometry={ARROW_HEAD} position={[0.3, 0, 0]} material={mats.gold} />
        <mesh geometry={TAIL_GEO} position={[-0.04, 0, 0]} material={mats.fin} />
        <mesh position={[-0.02, 0.1, 0]} material={mats.bot}>
          <planeGeometry args={[0.18, 0.18]} />
        </mesh>
      </group>
    </group>
  );
}

export default function Lighthouse({ ctx }) {
  const { sky, animate, onToast } = ctx;
  const on = duskFactor(sky);
  const spin = useRef();
  const lampCore = useRef();
  const rings = [useRef(), useRef(), useRef()];
  const mats = useMemo(
    () => ({
      beamA: beamMaterial(),
      beamB: beamMaterial(),
      lamp: new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd77a', emissiveIntensity: 0.4, flatShading: true }),
      glow: spriteGlowMaterial('#ffe6a0', 0),
      halo: spriteGlowMaterial('#ffc96a', 0),
      rings: [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: '#eaf6ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })),
      window: new THREE.MeshStandardMaterial({ color: '#2c4a6e', emissive: '#ffcf7a', emissiveIntensity: 0, flatShading: true }),
    }),
    []
  );
  useEffect(() => () => {
    Object.values(mats).forEach((m) => (Array.isArray(m) ? m.forEach((x) => x.dispose()) : m.dispose()));
  }, [mats]);
  const st = useMemo(() => ({ horn: -1, angle: 0.6 }), []);
  const onRef = useRef(on);
  onRef.current = on;

  // Static look (reduced motion, or before the first frame).
  useEffect(() => {
    mats.window.emissiveIntensity = on * 1.2;
    if (!animate) {
      mats.beamA.uniforms.uI.value = on;
      mats.beamB.uniforms.uI.value = on;
      mats.glow.opacity = 0.9 * on;
      mats.halo.opacity = 0.35 * on;
      mats.lamp.emissiveIntensity = 0.4 + on * 2.2;
    }
  }, [on, animate, mats]);

  useFrame((state, delta) => {
    if (!animate) return;
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;
    const night = onRef.current;
    st.angle += dt * 0.42;
    if (spin.current) spin.current.rotation.y = st.angle;
    // foghorn: flash the beam and roll sound rings out from the lamp
    let flash = 0;
    if (st.horn >= 0) {
      st.horn += dt;
      const k = st.horn / HORN_S;
      flash = Math.sin(Math.min(1, k) * Math.PI) * (0.75 + 0.25 * Math.sin(st.horn * 18));
      rings.forEach((r, i) => {
        const m = mats.rings[i];
        const ph = (st.horn - i * 0.45) / 1.8;
        if (!r.current) return;
        const live = ph > 0 && ph < 1;
        r.current.visible = live;
        if (live) {
          r.current.scale.setScalar(0.6 + ph * 5.5);
          m.opacity = 0.55 * (1 - ph);
        }
      });
      if (st.horn > HORN_S + 1) {
        st.horn = -1;
        rings.forEach((r) => r.current && (r.current.visible = false));
      }
    }
    const I = Math.min(1.25, night + flash);
    mats.beamA.uniforms.uI.value = I;
    mats.beamB.uniforms.uI.value = I;
    mats.glow.opacity = 0.9 * night + 0.8 * flash;
    mats.halo.opacity = 0.35 * night + 0.4 * flash;
    mats.lamp.emissiveIntensity = 0.4 + night * 2.2 + flash * 2.5;
    if (lampCore.current) lampCore.current.rotation.y = -t * 0.3;
  });

  const blow = tap(() => {
    if (st.horn >= 0) return;
    playFoghorn();
    st.horn = 0;
    onToast?.('BWAAAMP! The lighthouse says hi.');
  });

  // Door and windows face the island center.
  const face = Math.atan2(-S.x, -S.z);
  const bandH = (GALLERY_Y - 0.08 - BASE_Y) / BANDS;
  const rAt = (y) => R_BOT + (R_TOP - R_BOT) * ((y - BASE_Y) / (GALLERY_Y - 0.08 - BASE_Y));
  return (
    <group position={[S.x, 0, S.z]}>
      <Rocks />
      <group onClick={blow} {...pointer}>
        {/* stone plinth and the striped tower */}
        <Cyl p={[0, BASE_Y / 2, 0]} rt={0.98} rb={1.08} h={BASE_Y} seg={10} m={LM.plinth} />
        {Array.from({ length: BANDS }, (_, i) => {
          const y0 = BASE_Y + i * bandH;
          return <Cyl key={i} p={[0, y0 + bandH / 2, 0]} rt={rAt(y0 + bandH)} rb={rAt(y0)} h={bandH} seg={14} m={i % 2 ? LM.red : LM.white} />;
        })}
        {/* door, steps and little windows on the island side */}
        <group rotation={[0, face, 0]}>
          <Box p={[0, BASE_Y + 0.38, rAt(BASE_Y + 0.4) - 0.02]} s={[0.36, 0.72, 0.08]} m={LM.door} />
          <Box p={[0, BASE_Y + 0.78, rAt(BASE_Y + 0.8) - 0.0]} s={[0.46, 0.08, 0.1]} m={LM.white} />
          <Box p={[0, BASE_Y - 0.12, 1.12]} s={[0.6, 0.12, 0.3]} m={LM.plinth} />
          <Box p={[0, BASE_Y - 0.36, 1.32]} s={[0.6, 0.12, 0.3]} m={LM.plinth} />
          {[0.38, 0.62].map((f, i) => {
            const y = BASE_Y + f * (GALLERY_Y - BASE_Y);
            return <Box key={i} p={[0, y, rAt(y) - 0.01]} s={[0.16, 0.24, 0.06]} m={mats.window} />;
          })}
        </group>
        {/* gallery with an iron railing */}
        <Cyl p={[0, GALLERY_Y - 0.05, 0]} rt={0.9} rb={0.62} h={0.14} seg={14} m={LM.iron} />
        {Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2;
          return <Cyl key={i} p={[Math.cos(a) * 0.84, GALLERY_Y + 0.17, Math.sin(a) * 0.84]} rt={0.015} h={0.34} m={LM.iron} />;
        })}
        <mesh position={[0, GALLERY_Y + 0.34, 0]} rotation={[Math.PI / 2, 0, 0]} material={LM.iron}>
          <torusGeometry args={[0.84, 0.022, 4, 28]} />
        </mesh>
        {/* lantern room: glass, mullions, the lamp */}
        <Cyl p={[0, GALLERY_Y + 0.05, 0]} rt={0.46} h={0.1} seg={10} m={LM.red} />
        <mesh position={[0, LAMP_Y + 0.05, 0]} material={LM.glass} renderOrder={3}>
          <cylinderGeometry args={[0.42, 0.42, 0.72, 10, 1, true]} />
        </mesh>
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return <Cyl key={`m${i}`} p={[Math.cos(a) * 0.42, LAMP_Y + 0.05, Math.sin(a) * 0.42]} rt={0.018} h={0.72} m={LM.iron} />;
        })}
        <mesh ref={lampCore} position={[0, LAMP_Y, 0]} material={mats.lamp}>
          <octahedronGeometry args={[0.17, 0]} />
        </mesh>
        <Cyl p={[0, LAMP_Y - 0.2, 0]} rt={0.08} rb={0.12} h={0.18} seg={8} m={LM.iron} />
        {/* red cap, ball and the weather vane */}
        <Cyl p={[0, LAMP_Y + 0.44, 0]} rt={0.5} h={0.06} seg={12} m={LM.redCap} />
        <mesh position={[0, LAMP_Y + 0.68, 0]} material={LM.redCap}>
          <coneGeometry args={[0.5, 0.46, 12]} />
        </mesh>
        <mesh position={[0, LAMP_Y + 0.95, 0]} material={LM.iron}>
          <sphereGeometry args={[0.07, 8, 6]} />
        </mesh>
        <WeatherVane animate={animate} />
        {/* easy tap target around the whole tower */}
        <mesh position={[0, (LAMP_Y + 1) / 2, 0]} material={LM.hit}>
          <cylinderGeometry args={[1.0, 1.1, LAMP_Y + 1, 8]} />
        </mesh>
      </group>
      {/* lamp glow and the sweeping beam (never in the way of taps) */}
      <SoftGlow p={[0, LAMP_Y, 0]} size={1.6} material={mats.glow} />
      <SoftGlow p={[0, LAMP_Y, 0]} size={5.5} material={mats.halo} />
      <group ref={spin} position={[0, LAMP_Y, 0]} rotation={[0, st.angle, 0]}>
        <group rotation={[0, 0, -0.05]}>
          <mesh geometry={BEAM_GEO} material={mats.beamA} raycast={noRay} renderOrder={6} />
        </group>
        <group rotation={[0, Math.PI, -0.05]}>
          <mesh geometry={BEAM_GEO} material={mats.beamB} raycast={noRay} renderOrder={6} />
        </group>
      </group>
      {rings.map((r, i) => (
        <mesh key={i} ref={r} geometry={RING_GEO} material={mats.rings[i]} position={[0, LAMP_Y, 0]} visible={false} raycast={noRay} />
      ))}
    </group>
  );
}
