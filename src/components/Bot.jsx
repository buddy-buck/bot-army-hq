import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { couriers, receivedPulses } from './Handoff.jsx';
import { botFx, fxNow, labelState } from './labels.js';
import { botHash, groundY } from '../utils/paths.js';

// One bot: a small rounded robot in its team color. Status always comes from
// data.json:
//   working  : at its station with a tablet (plus a lantern at night)
//   idle     : relaxing with a mai tai, margarita or coconut drink, either
//              standing near its station or stretched out in a hammock
//   sleeping : in a hammock with zzz's
// When the status changes, the bot puts its drink down and walks to its new
// spot. Nasty always has a coconut. Claude wears a lei and holds a mai tai.

export const BOT_SCALE = 1.35;
const DRINK_SCALE = 1.6; // big, easy-to-see drinks
const CLINK_PERIOD = 26; // seconds between cheers for a pair of chillin' bots
const CLINK_LEN = 2.4;
const WALK_SPEED = 1.3; // units per second
export const WAVE_SECONDS = 2.4;

const GEO = {
  body: new THREE.CapsuleGeometry(0.17, 0.2, 3, 8),
  head: new THREE.IcosahedronGeometry(0.19, 1),
  eye: new THREE.SphereGeometry(0.032, 6, 5),
  antenna: new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4),
  bulb: new THREE.IcosahedronGeometry(0.048, 0),
  foot: new THREE.SphereGeometry(0.065, 6, 5),
  arm: new THREE.CapsuleGeometry(0.035, 0.24, 2, 6),
  hand: new THREE.SphereGeometry(0.055, 6, 5),
  shadow: new THREE.CircleGeometry(0.32, 16).rotateX(-Math.PI / 2),
  ring: new THREE.RingGeometry(0.36, 0.46, 32).rotateX(-Math.PI / 2),
  hit: new THREE.CylinderGeometry(0.42, 0.42, 1.2, 8),
  tablet: new THREE.BoxGeometry(0.24, 0.15, 0.02),
  screen: new THREE.PlaneGeometry(0.2, 0.11),
  post: new THREE.CylinderGeometry(0.018, 0.018, 0.62, 4),
  lantern: new THREE.IcosahedronGeometry(0.065, 0),
  glow: new THREE.SphereGeometry(0.2, 10, 8),
  hammockPost: new THREE.CylinderGeometry(0.05, 0.07, 1.25, 6),
  tuft: new THREE.ConeGeometry(0.22, 0.3, 5),
  // drinks (origin at the bottom of the glass)
  tallGlass: new THREE.CylinderGeometry(0.052, 0.04, 0.15, 8).translate(0, 0.075, 0),
  foam: new THREE.CylinderGeometry(0.053, 0.053, 0.025, 8).translate(0, 0.14, 0),
  umbrella: new THREE.ConeGeometry(0.085, 0.045, 8),
  stick: new THREE.CylinderGeometry(0.005, 0.005, 0.11, 3),
  straw: new THREE.CylinderGeometry(0.008, 0.008, 0.17, 4),
  stemBase: new THREE.CylinderGeometry(0.038, 0.038, 0.012, 8),
  stem: new THREE.CylinderGeometry(0.009, 0.009, 0.07, 4).translate(0, 0.04, 0),
  bowl: new THREE.ConeGeometry(0.07, 0.075, 10).rotateX(Math.PI).translate(0, 0.112, 0),
  rim: new THREE.TorusGeometry(0.066, 0.008, 4, 14).rotateX(Math.PI / 2).translate(0, 0.15, 0),
  lime: new THREE.IcosahedronGeometry(0.026, 0),
  coconut: new THREE.IcosahedronGeometry(0.08, 1).translate(0, 0.075, 0),
  // lei
  leiRing: new THREE.TorusGeometry(0.155, 0.022, 5, 18).rotateX(Math.PI / 2),
  flower: new THREE.IcosahedronGeometry(0.042, 0),
};

GEO.hammock = (() => {
  const seg = 12;
  const half = 0.68;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const x = -half + (i / seg) * half * 2;
    const y = 0.62 - 0.26 * (1 - (x / half) ** 2);
    pos.push(x, y, -0.22, x, y + 0.04, 0, x, y, 0.22);
    if (i < seg) {
      const k = i * 3;
      idx.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
})();

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, ...extra });

const MAT = {
  face: std('#fff8ec', { roughness: 0.5 }),
  eye: new THREE.MeshBasicMaterial({ color: '#1d2230' }),
  foot: std('#4a4f5c'),
  shadow: new THREE.MeshBasicMaterial({ color: '#13261b', transparent: true, opacity: 0.22, depthWrite: false }),
  hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  tablet: std('#2a2f3a'),
  screen: new THREE.MeshBasicMaterial({ color: '#9fe3ff' }),
  post: std('#7a5232'),
  lantern: std('#ffd9a0', { emissive: '#ffb066', emissiveIntensity: 1.8 }),
  glow: new THREE.MeshBasicMaterial({ color: '#ffc58a', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }),
  hammock: new THREE.MeshStandardMaterial({ color: '#f2e2c4', flatShading: true, side: THREE.DoubleSide, roughness: 1 }),
  palm: std('#9a6b43'),
  tuft: std('#4fb35a'),
  maitai: std('#ff6b3d', { emissive: '#ff6b3d', emissiveIntensity: 0.15 }),
  maitaiTop: std('#ffb07a'),
  margarita: std('#b9ec6f', { emissive: '#b9ec6f', emissiveIntensity: 0.12 }),
  glass: std('#e8f6ff', { roughness: 0.2 }),
  salt: std('#ffffff'),
  lime: std('#3fae4a'),
  coconut: std('#6b4a2a'),
  umbrellaPink: std('#ff4fa3'),
  umbrellaTeal: std('#18c2c2'),
  white: std('#ffffff'),
  strawPink: std('#ff7ab8'),
  strawTeal: std('#2fd3c4'),
  leaf: std('#3fae5a'),
  leiPink: std('#ff5fa2'),
  leiWhite: std('#ffffff'),
  leiCoral: std('#ff7a59'),
};

const DRINK_TYPES = ['maitai', 'margarita', 'coconut'];
// Drinks these two never put down.
const ALWAYS_DRINK = { nasty: 'coconut', claude: 'maitai' };

function Drink({ type }) {
  if (type === 'margarita') {
    return (
      <group>
        <mesh geometry={GEO.stemBase} material={MAT.glass} />
        <mesh geometry={GEO.stem} material={MAT.glass} />
        <mesh geometry={GEO.bowl} material={MAT.margarita} />
        <mesh geometry={GEO.rim} material={MAT.salt} />
        <mesh geometry={GEO.lime} material={MAT.lime} position={[0.065, 0.15, 0]} />
        <mesh geometry={GEO.straw} material={MAT.strawTeal} position={[-0.02, 0.17, 0]} rotation={[0, 0, 0.25]} />
      </group>
    );
  }
  if (type === 'coconut') {
    return (
      <group>
        <mesh geometry={GEO.coconut} material={MAT.coconut} />
        <mesh geometry={GEO.straw} material={MAT.strawPink} position={[-0.02, 0.19, 0]} rotation={[0, 0, 0.3]} />
        <mesh geometry={GEO.stick} material={MAT.white} position={[0.03, 0.2, 0]} rotation={[0, 0, -0.35]} />
        <mesh geometry={GEO.umbrella} material={MAT.umbrellaTeal} position={[0.05, 0.25, 0]} rotation={[0, 0, -0.35]} />
      </group>
    );
  }
  return (
    <group>
      <mesh geometry={GEO.tallGlass} material={MAT.maitai} />
      <mesh geometry={GEO.foam} material={MAT.maitaiTop} />
      <mesh geometry={GEO.straw} material={MAT.strawTeal} position={[-0.02, 0.18, 0]} rotation={[0, 0, 0.25]} />
      <mesh geometry={GEO.stick} material={MAT.white} position={[0.03, 0.19, 0]} rotation={[0, 0, -0.35]} />
      <mesh geometry={GEO.umbrella} material={MAT.umbrellaPink} position={[0.05, 0.24, 0]} rotation={[0, 0, -0.35]} />
    </group>
  );
}

const LEI_COLORS = [MAT.leiPink, MAT.leiWhite, MAT.leiCoral];
function Lei() {
  const n = 11;
  return (
    <group position={[0, 0.6, 0]}>
      <mesh geometry={GEO.leiRing} material={MAT.leaf} />
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const droop = Math.max(0, Math.cos(a)) * 0.05; // hangs a little lower in front
        return <mesh key={i} geometry={GEO.flower} material={LEI_COLORS[i % 3]} position={[Math.sin(a) * 0.165, -0.01 - droop, Math.cos(a) * 0.165]} />;
      })}
    </group>
  );
}

const easeSpin = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function hashPhase(id) {
  return ((botHash(id) % 1000) / 1000) * Math.PI * 2;
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function Bot({ bot, slot, isNight, selected, spotlight, onSelect, pulseKey, animate = true, clink = null }) {
  const outer = useRef();
  const pose = useRef();
  const head = useRef();
  const feet = [useRef(), useRef()];
  const eyes = [useRef(), useRef()];
  const labelRef = useRef();
  const ringRef = useRef();
  const pulseRef = useRef();
  const lanternRef = useRef();
  const handDrink = useRef();
  const restDrink = useRef();
  const tabletRef = useRef();
  const handRef = useRef();
  const zzzRef = useRef();
  const pulseStart = useRef(null);
  const cur = useRef(null);
  const curRaised = useRef(false);
  const phase = useMemo(() => hashPhase(bot.id), [bot.id]);

  const bodyMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: bot.color, flatShading: true, roughness: 0.55, emissive: bot.color, emissiveIntensity: 0.1 }),
    [bot.color]
  );
  const bulbMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: bot.color, emissive: bot.color, emissiveIntensity: 0.9, flatShading: true }),
    [bot.color]
  );
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: bot.color, transparent: true, opacity: 0.9, depthWrite: false }), [bot.color]);
  const pulseMat = useMemo(() => new THREE.MeshBasicMaterial({ color: bot.color, transparent: true, opacity: 0, depthWrite: false }), [bot.color]);
  useEffect(() => () => [bodyMat, bulbMat, ringMat, pulseMat].forEach((m) => m.dispose()), [bodyMat, bulbMat, ringMat, pulseMat]);

  useEffect(() => {
    if (!pulseKey) return;
    pulseStart.current = -1;
    botFx.sipHop.set(bot.id, fxNow()); // finished a task: happy sip-hop
  }, [pulseKey, bot.id]);

  useEffect(() => {
    const id = bot.id;
    return () => labelState.positions.delete(id);
  }, [bot.id]);

  const status = bot.status;
  const mode = slot.mode;
  const home = slot.home;
  const working = status === 'working';
  const sleeping = status === 'sleeping';
  const drinkType = ALWAYS_DRINK[bot.id] || (status === 'idle' ? DRINK_TYPES[botHash(bot.id) % 3] : null);
  const restPos = mode === 'lounge' ? [0.3, 0.42, 0.42] : [0.12, 0.6, 0.14];
  const isClaude = bot.id === 'claude';

  useFrame((state, delta) => {
    const g = outer.current;
    const p = pose.current;
    const h = head.current;
    if (!g || !p || !h) return;
    const clock = state.clock.elapsedTime;
    const t = animate ? clock + phase : 0;
    const dt = Math.min(delta, 0.1);
    const c = couriers.get(bot.id);

    if (!cur.current) {
      cur.current = new THREE.Vector3(home.x, home.y, home.z);
      curRaised.current = !!home.raised;
      g.rotation.y = home.rotY;
    }
    const pos = cur.current;

    // Cheers: two chillin' bots standing together clink drinks now and then.
    // Both bots read the same wall clock, so they raise their glasses together.
    const fx = fxNow();
    let clinkK = -1;
    if (clink && animate && mode === 'chill' && !c) {
      const k = (fx + clink.seed * CLINK_PERIOD) % CLINK_PERIOD;
      if (k < CLINK_LEN) clinkK = k / CLINK_LEN;
    }

    // Position: carrying a handoff, walking to a new spot, or settled.
    let walking = false;
    if (c) {
      pos.set(c.x, c.y, c.z);
      curRaised.current = false;
      g.rotation.y = lerpAngle(g.rotation.y, c.heading, Math.min(1, dt * 8));
      walking = !c.ride; // riding in a boat: sit still
    } else {
      const dx = home.x - pos.x;
      const dz = home.z - pos.z;
      const d = Math.hypot(dx, dz);
      const jump = !!home.raised !== curRaised.current; // up to a tower or lookout: no stairs, just pop over
      if (!animate || jump || d < 0.04 || d > 30) {
        pos.set(home.x, home.y, home.z);
        curRaised.current = !!home.raised;
        const faceTo = clinkK >= 0 ? Math.atan2(clink.x - pos.x, clink.z - pos.z) : home.rotY;
        g.rotation.y = animate && !jump ? lerpAngle(g.rotation.y, faceTo, Math.min(1, dt * 4)) : home.rotY;
      } else {
        const step = Math.min(d, WALK_SPEED * dt);
        pos.x += (dx / d) * step;
        pos.z += (dz / d) * step;
        const left = d - step;
        pos.y = left < 0.6 ? THREE.MathUtils.lerp(home.y, groundY(pos.x, pos.z), left / 0.6) : groundY(pos.x, pos.z);
        g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 8));
        walking = true;
      }
    }
    g.position.copy(pos);

    const lying = !walking && mode === 'hammock';
    const lounging = !walking && mode === 'lounge';
    labelState.positions.set(bot.id, { x: pos.x, y: pos.y, z: pos.z, labelY: (lying ? 0.95 : lounging ? 1.15 : 1.42) * BOT_SCALE, name: bot.name });

    // Pose
    let lift = 0;
    p.rotation.set(0, 0, 0);
    p.position.set(0, 0, 0);
    p.scale.set(1, 1, 1);
    h.rotation.set(0, 0, 0);
    feet[0].current.position.z = 0;
    feet[1].current.position.z = 0;
    const eyeScale = lying && sleeping ? 0.18 : 1;
    eyes[0].current.scale.y = eyeScale;
    eyes[1].current.scale.y = eyeScale;

    let sip = 0;
    if (walking) {
      const w = clock * 9;
      lift = Math.abs(Math.sin(w)) * 0.06;
      p.rotation.z = Math.sin(w) * 0.07;
      feet[0].current.position.z = Math.sin(w) * 0.09;
      feet[1].current.position.z = -Math.sin(w) * 0.09;
    } else if (lounging) {
      p.rotation.x = -1.0;
      p.position.set(0, 0.34, 0.35);
      h.rotation.y = Math.sin(t * 0.3) * 0.35;
      h.rotation.x = 0.35;
    } else if (lying) {
      p.rotation.z = Math.PI / 2;
      p.position.set(0.48, 0.42, 0);
      if (sleeping) {
        const breathe = 1 + Math.sin(t * 1.2) * 0.025;
        p.scale.set(breathe, 1, breathe);
      } else {
        h.rotation.x = -0.35 + Math.sin(t * 0.4) * 0.15; // idle: looking around from the hammock
      }
    } else if (working) {
      lift = Math.abs(Math.sin(t * 3)) * 0.015;
      h.rotation.x = 0.18 + Math.sin(t * 5) * 0.07;
      h.rotation.y = Math.sin(t * 0.7) * 0.12;
    } else {
      // chillin': slow sway, a sip every few seconds
      lift = (Math.sin(t * 1.5) + 1) * 0.008;
      p.rotation.z = Math.sin(t * 0.8) * 0.05;
      h.rotation.y = Math.sin(t * 0.45) * 0.5;
      const cyc = (t * 0.16) % 1;
      sip = cyc > 0.82 ? Math.sin(((cyc - 0.82) / 0.18) * Math.PI) : 0;
      h.rotation.x = -sip * 0.3;
    }

    // Little hop when a package arrives
    const got = receivedPulses.get(bot.id);
    if (got !== undefined && animate) {
      const k = (clock - got) / 0.7;
      if (k >= 0 && k < 1) lift += Math.sin(Math.PI * k) * 0.28;
    }
    // Happy sip-hop after finishing a task, and a spin-and-hop cheer after
    // earning minutes. Both are one-shot and come from real data changes.
    if (animate) {
      const sh = botFx.sipHop.get(bot.id);
      if (sh !== undefined) {
        const k = (fx - sh) / 1.6;
        if (k >= 0 && k < 1) {
          lift += Math.abs(Math.sin(k * Math.PI * 2)) * 0.22 * (1 - k * 0.4);
          sip = Math.max(sip, k > 0.5 ? Math.sin(((k - 0.5) / 0.5) * Math.PI) : 0);
        } else if (k >= 1) botFx.sipHop.delete(bot.id);
      }
      const ch = botFx.cheer.get(bot.id);
      if (ch !== undefined) {
        const k = (fx - ch) / 1.3;
        if (k >= 0 && k < 1) {
          lift += Math.sin(Math.PI * k) * 0.36;
          p.rotation.y = easeSpin(k) * Math.PI * 2;
          h.rotation.x = -0.3 * Math.sin(Math.PI * k);
        } else if (k >= 1) botFx.cheer.delete(bot.id);
      }
    }
    // Photo booth: wave at the camera with a little bounce.
    let waveK = -1;
    const wv = botFx.wave.get(bot.id);
    if (wv !== undefined) {
      const k = (fx - wv) / WAVE_SECONDS;
      if (k >= 0 && k < 1) {
        waveK = k;
        if (animate && !lying) {
          lift += Math.abs(Math.sin(k * Math.PI * 3)) * 0.06;
          h.rotation.z = Math.sin(k * Math.PI * 4) * 0.12;
        }
      } else if (k >= 1) botFx.wave.delete(bot.id);
    }
    if (handRef.current) {
      const show = waveK >= 0 && !lying && !lounging;
      handRef.current.visible = show;
      if (show) handRef.current.rotation.z = 0.5 + (animate ? Math.sin(waveK * Math.PI * 10) * 0.45 : 0);
    }
    p.position.y += lift;

    // Drink: in hand while standing or walking, resting on the bot when lying back.
    if (handDrink.current) {
      handDrink.current.visible = !lying && !lounging;
      if (clinkK >= 0) {
        // raise the glass out front, tap at the middle of the move
        const up = Math.sin(Math.PI * clinkK);
        const tap = clinkK > 0.42 && clinkK < 0.58 ? Math.sin(((clinkK - 0.42) / 0.16) * Math.PI) * 0.05 : 0;
        handDrink.current.position.set(0.18 - up * 0.1, 0.3 + up * 0.32, 0.1 + up * 0.22 + tap);
        handDrink.current.rotation.z = up * 0.15;
        h.rotation.x = -up * 0.15;
      } else {
        handDrink.current.position.set(0.25 - sip * 0.1, 0.3 + sip * 0.32, 0.1 + sip * 0.1);
        handDrink.current.rotation.z = sip * 0.5;
      }
    }
    if (restDrink.current) restDrink.current.visible = lying || lounging;
    if (tabletRef.current) tabletRef.current.visible = working;
    if (lanternRef.current) {
      lanternRef.current.parent.visible = working && isNight && !walking;
      if (animate) lanternRef.current.scale.setScalar(1 + Math.sin(clock * 7 + phase) * 0.06 + Math.sin(clock * 11.3) * 0.04);
    }
    if (zzzRef.current) {
      const show = lying && sleeping ? '' : 'none';
      if (zzzRef.current.style.display !== show) zzzRef.current.style.display = show;
    }

    // Selection / spotlight ring
    if (ringRef.current) {
      const on = selected || spotlight;
      ringRef.current.visible = on;
      if (on) ringRef.current.rotation.y += dt * 1.2;
    }

    // Data-change pulse ring
    if (pulseRef.current) {
      if (pulseStart.current === -1) pulseStart.current = clock;
      const k = pulseStart.current === null ? 1 : (clock - pulseStart.current) / 2.6;
      if (k >= 0 && k < 1 && animate) {
        pulseRef.current.visible = true;
        pulseRef.current.scale.setScalar(1 + k * 2.4);
        pulseMat.opacity = 0.75 * (1 - k);
      } else {
        pulseRef.current.visible = false;
      }
    }

    // Name tag: the label director decides (zoom level, hover, overlap).
    if (labelRef.current) {
      const op = labelState.visible.has(bot.id) ? '1' : '0';
      if (labelRef.current.style.opacity !== op) labelRef.current.style.opacity = op;
    }
  });

  const handleClick = (e) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    onSelect?.(bot.id);
  };

  const hammock = mode === 'hammock' ? slot.hammock : null;

  return (
    <>
      {hammock && (
        <group position={[hammock.x, hammock.y, hammock.z]} rotation={[0, hammock.rotY, 0]} scale={BOT_SCALE}>
          <mesh geometry={GEO.hammockPost} material={MAT.palm} position={[-0.78, 0.62, 0]} />
          <mesh geometry={GEO.hammockPost} material={MAT.palm} position={[0.78, 0.62, 0]} />
          <mesh geometry={GEO.tuft} material={MAT.tuft} position={[-0.78, 1.32, 0]} />
          <mesh geometry={GEO.tuft} material={MAT.tuft} position={[0.78, 1.32, 0]} />
          <mesh geometry={GEO.hammock} material={MAT.hammock} />
        </group>
      )}

      <group ref={outer} position={[home.x, home.y, home.z]} rotation={[0, home.rotY, 0]} scale={BOT_SCALE}>
        <mesh geometry={GEO.shadow} material={MAT.shadow} position={[0, 0.025, 0]} />
        <mesh ref={ringRef} geometry={GEO.ring} material={ringMat} position={[0, 0.04, 0]} visible={selected || spotlight} />
        <mesh ref={pulseRef} geometry={GEO.ring} material={pulseMat} position={[0, 0.05, 0]} visible={false} />

        <group ref={pose}>
          <mesh ref={feet[0]} geometry={GEO.foot} material={MAT.foot} position={[-0.08, 0.06, 0]} />
          <mesh ref={feet[1]} geometry={GEO.foot} material={MAT.foot} position={[0.08, 0.06, 0]} />
          <mesh geometry={GEO.body} material={bodyMat} position={[0, 0.38, 0]} />
          {isClaude && <Lei />}
          {/* waving arm, only shown in the photo booth */}
          <group ref={handRef} position={[-0.17, 0.48, 0.04]} visible={false}>
            <mesh geometry={GEO.arm} material={bodyMat} position={[0, 0.16, 0]} />
            <mesh geometry={GEO.hand} material={MAT.face} position={[0, 0.34, 0]} />
          </group>
          <group ref={head} position={[0, 0.74, 0]}>
            <mesh geometry={GEO.head} material={MAT.face} position={[0, 0.04, 0]} />
            <mesh ref={eyes[0]} geometry={GEO.eye} material={MAT.eye} position={[-0.07, 0.06, 0.165]} />
            <mesh ref={eyes[1]} geometry={GEO.eye} material={MAT.eye} position={[0.07, 0.06, 0.165]} />
            <mesh geometry={GEO.antenna} material={MAT.foot} position={[0, 0.29, 0]} />
            <mesh geometry={GEO.bulb} material={bulbMat} position={[0, 0.38, 0]} />
          </group>
          <group ref={tabletRef} position={[0, 0.44, 0.22]} rotation={[-0.6, 0, 0]} visible={working}>
            <mesh geometry={GEO.tablet} material={MAT.tablet} />
            <mesh geometry={GEO.screen} material={MAT.screen} position={[0, 0, 0.011]} />
          </group>
          {drinkType && (
            <group ref={handDrink} position={[0.25, 0.3, 0.1]}>
              <group scale={DRINK_SCALE}>
                <Drink type={drinkType} />
              </group>
            </group>
          )}
        </group>

        {drinkType && (
          <group ref={restDrink} position={restPos} visible={false} scale={DRINK_SCALE}>
            <Drink type={drinkType} />
          </group>
        )}

        <group position={[0.42, 0, 0.12]} visible={false}>
          <mesh geometry={GEO.post} material={MAT.post} position={[0, 0.31, 0]} />
          <group ref={lanternRef} position={[0, 0.66, 0]}>
            <mesh geometry={GEO.lantern} material={MAT.lantern} />
            <mesh geometry={GEO.glow} material={MAT.glow} />
          </group>
        </group>

        {/* Generous invisible tap target */}
        <mesh
          geometry={GEO.hit}
          material={MAT.hit}
          position={[0, 0.6, 0]}
          onClick={handleClick}
          onPointerOver={(e) => {
            e.stopPropagation();
            labelState.hovered = bot.id;
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            if (labelState.hovered === bot.id) labelState.hovered = null;
            document.body.style.cursor = '';
          }}
        />

        <Html position={[0, mode === 'hammock' ? 0.95 : mode === 'lounge' ? 1.15 : 1.42, 0]} center zIndexRange={[10, 0]} pointerEvents="none">
          <div ref={labelRef} className={`bot-tag${selected ? ' is-selected' : ''}`} style={{ opacity: 0, borderColor: bot.color }}>
            {bot.name}
          </div>
        </Html>
        {sleeping && mode === 'hammock' && (
          <Html position={[-0.2, 1.25, 0]} center zIndexRange={[9, 0]} pointerEvents="none">
            <div ref={zzzRef} className="zzz" aria-hidden="true" style={{ display: 'none' }}>
              <span>Z</span>
              <span>Z</span>
              <span>Z</span>
            </div>
          </Html>
        )}
      </group>
    </>
  );
}

export default memo(Bot);
