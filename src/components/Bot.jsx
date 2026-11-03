import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { couriers, receivedPulses } from './Handoff.jsx';

// One bot: a small rounded robot in its team color. It idles, works (with a
// tablet), sleeps (lying down, or in a hammock at night), walks handoffs, and
// carries a lantern at night when working. Status always comes from data.json.

const GEO = {
  body: new THREE.CapsuleGeometry(0.17, 0.2, 3, 8),
  head: new THREE.IcosahedronGeometry(0.19, 1),
  eye: new THREE.SphereGeometry(0.032, 6, 5),
  antenna: new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4),
  bulb: new THREE.IcosahedronGeometry(0.048, 0),
  foot: new THREE.SphereGeometry(0.065, 6, 5),
  shadow: new THREE.CircleGeometry(0.32, 16).rotateX(-Math.PI / 2),
  ring: new THREE.RingGeometry(0.36, 0.46, 32).rotateX(-Math.PI / 2),
  hit: new THREE.CylinderGeometry(0.45, 0.45, 1.25, 8),
  tablet: new THREE.BoxGeometry(0.24, 0.15, 0.02),
  screen: new THREE.PlaneGeometry(0.2, 0.11),
  post: new THREE.CylinderGeometry(0.018, 0.018, 0.62, 4),
  lantern: new THREE.IcosahedronGeometry(0.065, 0),
  glow: new THREE.SphereGeometry(0.2, 10, 8),
  hammockPost: new THREE.CylinderGeometry(0.05, 0.07, 1.25, 6),
  tuft: new THREE.ConeGeometry(0.22, 0.3, 5),
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

const MAT = {
  face: new THREE.MeshStandardMaterial({ color: '#fff8ec', flatShading: true, roughness: 0.5 }),
  eye: new THREE.MeshBasicMaterial({ color: '#1d2230' }),
  foot: new THREE.MeshStandardMaterial({ color: '#4a4f5c', flatShading: true }),
  shadow: new THREE.MeshBasicMaterial({ color: '#13261b', transparent: true, opacity: 0.22, depthWrite: false }),
  hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  tablet: new THREE.MeshStandardMaterial({ color: '#2a2f3a', flatShading: true }),
  screen: new THREE.MeshBasicMaterial({ color: '#9fe3ff' }),
  post: new THREE.MeshStandardMaterial({ color: '#7a5232', flatShading: true }),
  lantern: new THREE.MeshStandardMaterial({ color: '#ffcf6b', emissive: '#ffb340', emissiveIntensity: 1.8, flatShading: true }),
  glow: new THREE.MeshBasicMaterial({ color: '#ffc861', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }),
  hammock: new THREE.MeshStandardMaterial({ color: '#f2e2c4', flatShading: true, side: THREE.DoubleSide, roughness: 1 }),
  palm: new THREE.MeshStandardMaterial({ color: '#9a6b43', flatShading: true }),
  tuft: new THREE.MeshStandardMaterial({ color: '#4fb35a', flatShading: true }),
};

function hashPhase(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000 * Math.PI * 2;
}

const LABEL_DISTANCE = 15.5;
const tmpV = new THREE.Vector3();

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function Bot({ bot, slot, isNight, selected, onSelect, pulseKey, animate = true, labelsAlways = false, labelDistance = LABEL_DISTANCE }) {
  const outer = useRef();
  const pose = useRef();
  const head = useRef();
  const feet = [useRef(), useRef()];
  const eyes = [useRef(), useRef()];
  const labelRef = useRef();
  const ringRef = useRef();
  const pulseRef = useRef();
  const lanternRef = useRef();
  const pulseStart = useRef(null);
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
    if (pulseKey) pulseStart.current = -1;
  }, [pulseKey]);

  const status = bot.status;
  const inHammock = status === 'sleeping' && isNight && !slot.lounge;
  const working = status === 'working';
  const lounge = slot.lounge;

  useFrame((state, delta) => {
    const g = outer.current;
    const p = pose.current;
    const h = head.current;
    if (!g || !p || !h) return;
    const clock = state.clock.elapsedTime;
    const t = animate ? clock + phase : 0;
    const dt = Math.min(delta, 0.1);
    const c = couriers.get(bot.id);

    // Position and facing
    if (c) {
      g.position.set(c.x, c.y, c.z);
      g.rotation.y = lerpAngle(g.rotation.y, c.heading, Math.min(1, dt * 8));
    } else if (inHammock) {
      g.position.set(slot.hammock.x, slot.hammock.y, slot.hammock.z);
      g.rotation.y = slot.hammock.rotY;
    } else {
      g.position.set(slot.x, slot.y, slot.z);
      g.rotation.y = animate ? lerpAngle(g.rotation.y, slot.rotY, Math.min(1, dt * 4)) : slot.rotY;
    }

    // Pose
    let lift = 0;
    p.rotation.set(0, 0, 0);
    p.position.set(0, 0, 0);
    h.rotation.set(0, 0, 0);
    feet[0].current.position.z = 0;
    feet[1].current.position.z = 0;
    const eyeScale = status === 'sleeping' && !c ? 0.18 : 1;
    eyes[0].current.scale.y = eyeScale;
    eyes[1].current.scale.y = eyeScale;

    if (c) {
      const w = clock * 9;
      lift = Math.abs(Math.sin(w)) * 0.06;
      p.rotation.z = Math.sin(w) * 0.07;
      feet[0].current.position.z = Math.sin(w) * 0.09;
      feet[1].current.position.z = -Math.sin(w) * 0.09;
    } else if (lounge) {
      p.rotation.x = -1.0;
      p.position.set(0, 0.34, 0.35);
      h.rotation.y = Math.sin(t * 0.3) * 0.35;
      h.rotation.x = 0.35;
    } else if (status === 'sleeping') {
      p.rotation.z = Math.PI / 2;
      if (inHammock) p.position.set(0.48, 0.42, 0);
      else p.position.set(0.48, 0.14, 0);
      const breathe = 1 + Math.sin(t * 1.2) * 0.025;
      p.scale.set(breathe, 1, breathe);
    } else if (working) {
      lift = Math.abs(Math.sin(t * 3)) * 0.015;
      h.rotation.x = 0.18 + Math.sin(t * 5) * 0.07;
      h.rotation.y = Math.sin(t * 0.7) * 0.12;
    } else {
      lift = (Math.sin(t * 1.5) + 1) * 0.008;
      h.rotation.y = Math.sin(t * 0.45) * 0.5;
      h.rotation.z = Math.sin(t * 0.3) * 0.05;
    }
    if (status !== 'sleeping' || c) p.scale.set(1, 1, 1);

    // Little hop when a package arrives
    const got = receivedPulses.get(bot.id);
    if (got !== undefined && animate) {
      const k = (clock - got) / 0.7;
      if (k >= 0 && k < 1) lift += Math.sin(Math.PI * k) * 0.28;
    }
    p.position.y += lift;

    // Selection ring
    if (ringRef.current) {
      ringRef.current.visible = selected;
      if (selected) ringRef.current.rotation.y += dt * 1.2;
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

    // Lantern flicker
    if (lanternRef.current && animate) {
      const f = 1 + Math.sin(clock * 7 + phase) * 0.06 + Math.sin(clock * 11.3) * 0.04;
      lanternRef.current.scale.setScalar(f);
    }

    // Name tag: when close, selected, walking, or in reduced-motion view
    if (labelRef.current) {
      g.getWorldPosition(tmpV);
      const show = labelsAlways || selected || !!c || state.camera.position.distanceTo(tmpV) < labelDistance;
      const op = show ? '1' : '0';
      if (labelRef.current.style.opacity !== op) labelRef.current.style.opacity = op;
    }
  });

  const handleClick = (e) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    onSelect?.(bot.id);
  };

  return (
    <group ref={outer} position={[slot.x, slot.y, slot.z]} rotation={[0, slot.rotY, 0]}>
      {inHammock && (
        <group>
          <mesh geometry={GEO.hammockPost} material={MAT.palm} position={[-0.78, 0.62, 0]} />
          <mesh geometry={GEO.hammockPost} material={MAT.palm} position={[0.78, 0.62, 0]} />
          <mesh geometry={GEO.tuft} material={MAT.tuft} position={[-0.78, 1.32, 0]} />
          <mesh geometry={GEO.tuft} material={MAT.tuft} position={[0.78, 1.32, 0]} />
          <mesh geometry={GEO.hammock} material={MAT.hammock} />
        </group>
      )}

      <mesh geometry={GEO.shadow} material={MAT.shadow} position={[inHammock || (status === 'sleeping' && !lounge) ? 0.0 : 0, 0.025, 0]} />
      <mesh ref={ringRef} geometry={GEO.ring} material={ringMat} position={[0, 0.04, 0]} visible={selected} />
      <mesh ref={pulseRef} geometry={GEO.ring} material={pulseMat} position={[0, 0.05, 0]} visible={false} />

      <group ref={pose}>
        <mesh ref={feet[0]} geometry={GEO.foot} material={MAT.foot} position={[-0.08, 0.06, 0]} />
        <mesh ref={feet[1]} geometry={GEO.foot} material={MAT.foot} position={[0.08, 0.06, 0]} />
        <mesh geometry={GEO.body} material={bodyMat} position={[0, 0.38, 0]} />
        <group ref={head} position={[0, 0.74, 0]}>
          <mesh geometry={GEO.head} material={MAT.face} position={[0, 0.04, 0]} />
          <mesh ref={eyes[0]} geometry={GEO.eye} material={MAT.eye} position={[-0.07, 0.06, 0.165]} />
          <mesh ref={eyes[1]} geometry={GEO.eye} material={MAT.eye} position={[0.07, 0.06, 0.165]} />
          <mesh geometry={GEO.antenna} material={MAT.foot} position={[0, 0.29, 0]} />
          <mesh geometry={GEO.bulb} material={bulbMat} position={[0, 0.38, 0]} />
        </group>
        {working && (
          <group position={[0, 0.44, 0.22]} rotation={[-0.6, 0, 0]}>
            <mesh geometry={GEO.tablet} material={MAT.tablet} />
            <mesh geometry={GEO.screen} material={MAT.screen} position={[0, 0, 0.011]} />
          </group>
        )}
      </group>

      {working && isNight && (
        <group position={[0.42, 0, 0.12]}>
          <mesh geometry={GEO.post} material={MAT.post} position={[0, 0.31, 0]} />
          <group ref={lanternRef} position={[0, 0.66, 0]}>
            <mesh geometry={GEO.lantern} material={MAT.lantern} />
            <mesh geometry={GEO.glow} material={MAT.glow} />
          </group>
        </group>
      )}

      {/* Generous invisible tap target */}
      <mesh
        geometry={GEO.hit}
        material={MAT.hit}
        position={[0, 0.6, 0]}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      />

      <Html position={[0, status === 'sleeping' && !lounge ? 0.85 : 1.38, 0]} center zIndexRange={[10, 0]} pointerEvents="none">
        <div ref={labelRef} className={`bot-tag${selected ? ' is-selected' : ''}`} style={{ opacity: labelsAlways ? 1 : 0, borderColor: bot.color }}>
          {bot.name}
        </div>
      </Html>
      {status === 'sleeping' && !lounge && (
        <Html position={[-0.2, inHammock ? 1.15 : 0.75, 0]} center zIndexRange={[9, 0]} pointerEvents="none">
          <div className="zzz" aria-hidden="true">
            <span>z</span>
            <span>z</span>
            <span>z</span>
          </div>
        </Html>
      )}
    </group>
  );
}

export default memo(Bot);
