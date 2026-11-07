import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot from '../MiniBot.jsx';
import StaticMerge from '../../utils/StaticMerge.jsx';
import { botLogoTexture, clamp01, isDaylight, rand, smooth } from './common.js';

// Hot air balloons: striped envelopes in team colors with the bot face logo,
// a wicker basket and a MiniBot passenger who waves now and then. They drift
// slowly on the breeze across the island's sky and wrap around, by day and
// golden hour. After dark the ones still up finish their crossing and don't
// come back. The burner puffs now and then; at dusk it glows.

const WIND = new THREE.Vector3(1, 0, 0.35).normalize();
const SIDE = new THREE.Vector3(-WIND.z, 0, WIND.x);
const R_MAX = 58;
const AVOID = 15; // keep this far from the camera

const TEAMS = [
  { a: '#2E86DE', b: '#fff8ec', c: '#FFDE69', bulb: '#FFDE69', bot: '#D63AF9' },
  { a: '#FF04A0', b: '#FFDE69', c: '#19469D', bulb: '#2ec4c8', bot: '#2BA84A' },
  { a: '#2BA84A', b: '#fff8ec', c: '#F09024', bulb: '#ff7a59', bot: '#2E86DE' },
];

// Envelope profile (radius, height), bottom mouth to crown.
const PROFILE = [
  [0.42, 0], [0.62, 0.45], [1.25, 1.3], [1.95, 2.35], [2.3, 3.25], [2.3, 4.05], [1.98, 4.8], [1.3, 5.4], [0.01, 5.7],
].map(([r, y]) => new THREE.Vector2(r, y));
const GORES = 12;

const envCache = new Map();
function envelopeGeometry(team) {
  let g = envCache.get(team.a);
  if (g) return g;
  g = new THREE.LatheGeometry(PROFILE, GORES).toNonIndexed();
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const ca = new THREE.Color(team.a);
  const cb = new THREE.Color(team.b);
  const cc = new THREE.Color(team.c);
  for (let i = 0; i < pos.count; i += 3) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += pos.getX(i + k);
      cy += pos.getY(i + k);
      cz += pos.getZ(i + k);
    }
    const ang = Math.atan2(cx, cz) + Math.PI;
    const gore = Math.floor((ang / (Math.PI * 2)) * GORES) % GORES;
    const y = cy / 3;
    const c = y > 4.9 || (y > 0.2 && y < 0.9) ? cc : gore % 2 ? ca : cb;
    for (let k = 0; k < 3; k++) c.toArray(col, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  envCache.set(team.a, g);
  return g;
}

const GEO = {
  basket: new THREE.BoxGeometry(0.8, 0.5, 0.8),
  rim: new THREE.BoxGeometry(0.88, 0.08, 0.88),
  rope: new THREE.CylinderGeometry(0.018, 0.018, 1.2, 3),
  burner: new THREE.CylinderGeometry(0.12, 0.16, 0.22, 6),
  flame: new THREE.ConeGeometry(0.16, 0.7, 6),
  logo: new THREE.PlaneGeometry(2.1, 2.1),
  glow: new THREE.SphereGeometry(1, 10, 8),
};
const MAT = {
  basket: new THREE.MeshLambertMaterial({ color: '#a8743f', flatShading: true }),
  rim: new THREE.MeshLambertMaterial({ color: '#7a5028', flatShading: true }),
  rope: new THREE.MeshBasicMaterial({ color: '#5a4a3a' }),
  burner: new THREE.MeshLambertMaterial({ color: '#4a4f5c', flatShading: true }),
};

const ROPES = [
  [0.36, 0.36], [-0.36, 0.36], [0.36, -0.36], [-0.36, -0.36],
];

function Balloon({ team, setRef }) {
  const env = envelopeGeometry(team);
  const mats = useMemo(() => {
    const logo = botLogoTexture(team.bulb, team.a);
    return {
      env: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: team.c, emissiveIntensity: 0.06 }),
      logo: new THREE.MeshLambertMaterial({ map: logo, transparent: true, alphaTest: 0.2, emissive: '#ffffff', emissiveIntensity: 0.12, emissiveMap: logo }),
      flame: new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      glow: new THREE.MeshBasicMaterial({ color: '#ff9a40', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    };
  }, [team]);
  const root = useRef();
  const bot = useRef();
  const flame = useRef();
  if (setRef) setRef({ root, bot, flame, mats });
  return (
    <group ref={root} visible={false}>
      {/* rigid parts: logos and ropes bake into one draw each */}
      <StaticMerge>
        <mesh geometry={env} material={mats.env} position={[0, 0.2, 0]} />
        <mesh geometry={GEO.logo} material={mats.logo} position={[0, 3.75, 2.33]} />
        <mesh geometry={GEO.logo} material={mats.logo} position={[0, 3.75, -2.33]} rotation={[0, Math.PI, 0]} />
        {ROPES.map(([x, z], i) => (
          <mesh key={i} geometry={GEO.rope} material={MAT.rope} position={[x * 1.15, -0.5, z * 1.15]} rotation={[z * 0.25, 0, -x * 0.25]} />
        ))}
        <mesh geometry={GEO.burner} material={MAT.burner} position={[0, -0.85, 0]} />
        <mesh geometry={GEO.basket} material={MAT.basket} position={[0, -1.5, 0]} />
        <mesh geometry={GEO.rim} material={MAT.rim} position={[0, -1.24, 0]} />
      </StaticMerge>
      <mesh ref={flame} geometry={GEO.flame} material={mats.flame} position={[0, -0.45, 0]} />
      <mesh geometry={GEO.glow} material={mats.glow} position={[0, 1.6, 0]} scale={[2.1, 2.4, 2.1]} />
      <MiniBot ref={bot} color={team.bot} shadow={false} scale={0.85} position={[0, -1.72, 0.05]} />
    </group>
  );
}

export default function Balloons({ sky, lowPower }) {
  const { camera } = useThree();
  const count = lowPower ? 2 : 3;
  const teams = TEAMS.slice(0, count);
  const parts = useRef([]);
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const state = useMemo(() => {
    const day = isDaylight(sky);
    return teams.map((_, i) => {
      const s = {
        off: 0, along: 0, y: 0, speed: 0, bob: rand(0, 6), up: false,
        burn: 0, burnAt: rand(3, 10), wave: 0, waveAt: rand(6, 20), pos: new THREE.Vector3(),
      };
      respawn(s, i);
      if (day) {
        s.up = true;
        const lim = Math.sqrt(R_MAX * R_MAX - s.off * s.off);
        s.along = -lim + ((i + 0.3 + Math.random() * 0.4) / teams.length) * 2 * lim;
      }
      return s;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const t = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    t.current += dt;
    const sk = skyRef.current;
    const day = isDaylight(sk);
    const dusk = clamp01(sk.stars * 2.2 + (sk.phase === 'golden' || sk.phase === 'sunrise' ? 0.35 : 0));
    for (let i = 0; i < state.length; i++) {
      const s = state[i];
      const p = parts.current[i];
      if (!p || !p.root.current) continue;
      const lim = Math.sqrt(R_MAX * R_MAX - s.off * s.off);
      if (!s.up) {
        p.root.current.visible = false;
        if (day) {
          respawn(s, i);
          s.along = -lim;
          s.up = true;
        }
        continue;
      }
      s.along += s.speed * dt;
      if (s.along > lim) {
        s.up = false;
        p.root.current.visible = false;
        continue;
      }
      s.bob += dt * 0.35;
      const x = WIND.x * s.along + SIDE.x * s.off;
      const z = WIND.z * s.along + SIDE.z * s.off;
      s.pos.set(x, s.y + Math.sin(s.bob) * 0.6, z);
      // Ease away from the camera if the breeze carries us too close.
      const dx = s.pos.x - camera.position.x;
      const dy = s.pos.y - camera.position.y;
      const dz = s.pos.z - camera.position.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      if (d < AVOID) {
        const k = (AVOID - d) / d;
        s.pos.x += dx * k;
        s.pos.y += dy * k * 0.5;
        s.pos.z += dz * k;
      }
      const root = p.root.current;
      root.visible = true;
      root.position.copy(s.pos);
      root.rotation.y = Math.atan2(-x, -z) + Math.sin(s.bob * 0.7) * 0.15; // basket faces the island
      root.rotation.z = Math.sin(s.bob * 1.3) * 0.025;

      // Burner: short puffs, glowing at dusk.
      s.burnAt -= dt;
      if (s.burnAt <= 0) {
        s.burn = rand(1.2, 2.2);
        s.burnAt = s.burn + rand(5, 14);
      }
      s.burn = Math.max(0, s.burn - dt);
      const on = s.burn > 0 ? smooth(Math.min(s.burn, 0.3) / 0.3) : 0;
      const flick = 0.85 + 0.15 * Math.sin(t.current * 31 + i * 7);
      p.mats.flame.opacity = on * (0.55 + 0.45 * dusk) * flick;
      if (p.flame.current) p.flame.current.scale.set(1, 0.6 + on * 0.6 * flick, 1);
      p.mats.glow.opacity = on * dusk * 0.22 * flick;
      p.mats.env.emissiveIntensity = 0.06 + on * dusk * 0.35;

      // The passenger waves now and then.
      const b = p.bot.current;
      if (b && b.armR) {
        s.waveAt -= dt;
        if (s.waveAt <= 0) {
          s.wave = 2.6;
          s.waveAt = rand(10, 22);
        }
        if (s.wave > 0) {
          s.wave -= dt;
          const w = smooth(Math.min(s.wave, 2.6 - s.wave, 0.35) / 0.35);
          b.armR.rotation.z = -0.12 - w * (2.3 + Math.sin(t.current * 11) * 0.35);
          b.head.rotation.z = Math.sin(t.current * 5.5) * 0.08 * w;
        } else {
          b.armR.rotation.z = -0.12;
          b.head.rotation.y = Math.sin(t.current * 0.4 + i) * 0.5;
          b.head.rotation.z = 0;
        }
      }
    }
  });

  return (
    <group>
      {teams.map((team, i) => (
        <Balloon key={team.a} team={team} setRef={(r) => (parts.current[i] = r)} />
      ))}
    </group>
  );
}

function respawn(s, i) {
  const sign = i % 2 ? -1 : 1;
  s.off = sign * rand(32, 46);
  s.y = rand(11, 19);
  s.speed = rand(0.45, 0.7);
}
