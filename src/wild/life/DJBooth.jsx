import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot from '../MiniBot.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import { Box, Cyl, L, frame, std } from './kit.jsx';
import StaticMerge from '../../utils/StaticMerge.jsx';

// DJ booth by the Cabana Patio: a deck with two turntables and a mixer,
// pulsing speakers, a truss of color-cycling lights and a DJ bot in
// headphones bobbing and scratching. Music notes float up and fade.
// Plays day and night (the lights really pop after dark).

const S = SITES.dj;
const F = frame(S.x, S.z, S.rotY);
const BPM = 118;
const DECK_Y = 0.12;
const TABLE_TOP = DECK_Y + 0.78;
const NOTES = 7;
const LAMP_XS = [-0.75, -0.25, 0.25, 0.75];
const EQ_BARS = 9;

const SPEAKER = std('#22252c');
const CONE = std('#555b66', { roughness: 0.5 });
const VINYL = std('#15161a', { roughness: 0.3 });
const PANEL = std('#2b2f3a');
const PHONES = std('#22252c');
const PAD = std('#ff04a0');

// Note shapes (single and beamed): head, stem, flag, flattened facing +z.
const HEAD_GEO = new THREE.SphereGeometry(0.075, 8, 6).scale(1.3, 0.95, 0.55);
const STEM_GEO = new THREE.BoxGeometry(0.025, 0.3, 0.025);
const FLAG_GEO = new THREE.BoxGeometry(0.13, 0.04, 0.025);
const NOTE_COLORS = ['#ff4fa3', '#7fe3d8', '#ffde69', '#a78bfa', '#ff7a59', '#2ec4c8', '#b9ec6f'];
const noteMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false });
const NOTE_MATS = NOTE_COLORS.map(noteMat);
const LAMP_COLORS = NOTE_COLORS.map((c) => new THREE.Color(c));
const LAMP_MATS = LAMP_XS.map(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }));
const BEAM_MATS = LAMP_XS.map(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
const EQ_MATS = [std('#7fe3d8', { emissive: '#7fe3d8', emissiveIntensity: 0.8 }), std('#ff4fa3', { emissive: '#ff4fa3', emissiveIntensity: 0.8 })];
const EQ_GEO = new THREE.BoxGeometry(0.08, 0.5, 0.02).translate(0, 0.25, 0);
const BEAM_GEO = new THREE.ConeGeometry(0.42, 1.7, 10, 1, true).translate(0, -0.85, 0);

function Note({ beamed, mat }) {
  if (beamed) {
    return (
      <group>
        <mesh geometry={HEAD_GEO} material={mat} position={[-0.09, 0, 0]} />
        <mesh geometry={HEAD_GEO} material={mat} position={[0.11, 0.04, 0]} />
        <mesh geometry={STEM_GEO} material={mat} position={[-0.0, 0.15, 0]} />
        <mesh geometry={STEM_GEO} material={mat} position={[0.2, 0.19, 0]} />
        <mesh geometry={FLAG_GEO} material={mat} position={[0.1, 0.31, 0]} scale={[1.7, 1, 1]} rotation={[0, 0, 0.18]} />
      </group>
    );
  }
  return (
    <group>
      <mesh geometry={HEAD_GEO} material={mat} />
      <mesh geometry={STEM_GEO} material={mat} position={[0.085, 0.15, 0]} />
      <mesh geometry={FLAG_GEO} material={mat} position={[0.14, 0.27, 0]} rotation={[0, 0, -0.5]} />
    </group>
  );
}

function Speaker({ x, coneRefs }) {
  return (
    <group position={[x, DECK_Y, 0.2]}>
      <Box p={[0, 0.55, 0]} s={[0.5, 1.1, 0.45]} m={SPEAKER} />
      <Box p={[0, 1.27, 0]} s={[0.36, 0.34, 0.36]} m={SPEAKER} />
      {[0.33, 0.78].map((y, i) => (
        <group key={y} ref={(r) => (coneRefs.current[(x > 0 ? 2 : 0) + i] = r)} userData={{ noMerge: true }} position={[0, y, 0.23]} rotation={[Math.PI / 2, 0, 0]}>
          <Cyl p={[0, 0, 0]} rt={0.17} rb={0.17} h={0.03} seg={12} m={CONE} />
          <Cyl p={[0, 0.03, 0]} rt={0.05} h={0.04} seg={8} m={L.black} />
        </group>
      ))}
      <Cyl p={[0, 1.27, 0.19]} rt={0.08} h={0.03} seg={10} m={CONE} r={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

export default function DJBooth({ glow, animate, lowPower }) {
  const g0 = groundY(S.x, S.z);
  const dj = useRef();
  const phones = useRef();
  const platters = [useRef(), useRef()];
  const cones = useRef([]);
  const eq = useRef([]);
  const beams = useRef([]);
  const notes = useRef([]);
  const nNotes = lowPower ? 4 : NOTES;
  const noteSeeds = useMemo(() => Array.from({ length: nNotes }, (_, i) => ({ side: i % 2 ? 1 : -1, phase: i / nNotes, sway: 0.6 + (i % 3) * 0.25, beamed: i % 3 === 1 })), [nNotes]);
  const tmpCol = useMemo(() => new THREE.Color(), []);
  // speaker tops in world space (notes float up from there)
  const spk = useMemo(() => [-1.05, 1.05].map((x) => ({ x: F.wx(x, 0.2), z: F.wz(x, 0.2), y: g0 + DECK_Y + 1.5 })), [g0]);

  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0.3;
    const beat = (t * BPM) / 60;
    const ph = beat % 1;
    const pulse = animate ? (1 - ph) ** 3 : 0;
    // DJ: head bob on the beat, scratching with the left hand, right hand on
    // the mixer and a fist pump every few bars.
    const b = dj.current;
    if (b) {
      b.pose.position.y = (animate ? Math.abs(Math.sin(beat * Math.PI)) : 0) * 0.04;
      b.head.rotation.set(0.15 + (animate ? Math.sin(beat * Math.PI * 2) * 0.16 : 0), Math.sin(t * 0.5) * 0.25, 0);
      b.armL.rotation.set(-1.05, animate ? Math.sin(t * 9) * 0.35 : 0, -0.35);
      const bar = (beat / 4) % 4;
      const pump = animate && bar > 3.4 ? Math.sin(((bar - 3.4) / 0.6) * Math.PI) : 0;
      b.armR.rotation.set(-1.0 - pump * 2.0 - (animate ? Math.sin(beat * Math.PI) * 0.08 : 0), 0, 0.35 + pump * 0.3);
      if (phones.current) {
        phones.current.position.y = 0.74;
        phones.current.rotation.copy(b.head.rotation);
      }
    }
    if (animate && platters[0].current && platters[1].current) {
      platters[0].current.rotation.y = t * 3.5 + Math.sin(t * 9) * 0.6; // being scratched
      platters[1].current.rotation.y = t * 3.5;
    }
    for (let i = 0; i < 4; i++) {
      const c = cones.current[i];
      if (c) c.scale.set(1 + pulse * 0.12, 1 + pulse * 1.5, 1 + pulse * 0.12);
    }
    for (let i = 0; i < EQ_BARS; i++) {
      const e = eq.current[i];
      if (e) e.scale.y = animate ? 0.25 + Math.abs(Math.sin(t * (3 + i * 0.7) + i)) * 0.75 * (0.6 + pulse * 0.4) : 0.4 + 0.5 * Math.abs(Math.sin(i));
    }
    // Lights: each lamp walks through the colors, a step every beat.
    const night = glow;
    for (let i = 0; i < LAMP_XS.length; i++) {
      const k = (Math.floor(beat) + i * 2) % LAMP_COLORS.length;
      tmpCol.copy(LAMP_COLORS[k]);
      LAMP_MATS[i].color.copy(tmpCol);
      BEAM_MATS[i].color.copy(tmpCol);
      BEAM_MATS[i].opacity = (0.04 + night * 0.2) * (0.7 + pulse * 0.3);
      const bm = beams.current[i];
      if (bm) bm.rotation.z = animate ? Math.sin(t * 0.8 + i * 1.3) * 0.35 : (i - 1.5) * 0.15;
    }
    // Notes: drift up from the speakers, sway, fade out.
    for (let i = 0; i < noteSeeds.length; i++) {
      const n = notes.current[i];
      if (!n) continue;
      n.visible = animate;
      if (!animate) continue;
      const sd = noteSeeds[i];
      const u = (t / 3.2 + sd.phase) % 1;
      const src = spk[sd.side > 0 ? 1 : 0];
      n.position.set(src.x + Math.sin(u * 6 + i) * 0.25 * sd.sway, src.y + u * 1.9, src.z + Math.cos(u * 5 + i) * 0.15);
      n.quaternion.copy(state.camera.quaternion);
      n.rotateZ(Math.sin(u * 8 + i) * 0.3);
      n.scale.setScalar(0.8 + Math.min(1, u * 4) * 0.5);
      NOTE_MATS[i % NOTE_MATS.length].opacity = Math.min(1, u * 6) * (1 - u) ** 1.2;
    }
  });

  return (
    <group>
      <group position={[S.x, g0, S.z]} rotation={[0, S.rotY, 0]}>
        <StaticMerge>
        {/* deck */}
        <Box p={[0, DECK_Y / 2, 0]} s={[2.9, DECK_Y, 1.7]} m={L.plank} />
        {/* DJ table: front faces local +z */}
        <Box p={[0, (DECK_Y + TABLE_TOP) / 2, 0.4]} s={[1.5, TABLE_TOP - DECK_Y, 0.55]} m={PANEL} />
        <Box p={[0, TABLE_TOP + 0.02, 0.38]} s={[1.6, 0.04, 0.62]} m={L.black} />
        {Array.from({ length: EQ_BARS }, (_, i) => (
          <mesh key={i} ref={(r) => (eq.current[i] = r)} userData={{ noMerge: true }} geometry={EQ_GEO} position={[-0.6 + i * 0.15, DECK_Y + 0.1, 0.68]} material={EQ_MATS[i % 2]} />
        ))}
        {[-0.45, 0.45].map((x, i) => (
          <group key={x} position={[x, TABLE_TOP + 0.05, 0.36]}>
            <Box p={[0, 0, 0]} s={[0.5, 0.04, 0.46]} m={L.dark} />
            <group ref={platters[i]} position={[0, 0.04, 0]} userData={{ noMerge: true }}>
              <Cyl p={[0, 0, 0]} rt={0.19} h={0.025} seg={14} m={VINYL} />
              <Cyl p={[0, 0.015, 0]} rt={0.06} h={0.01} seg={10} m={i ? PAD : EQ_MATS[0]} />
              <Box p={[0.12, 0.016, 0]} s={[0.05, 0.008, 0.02]} m={L.white} />
            </group>
            <Cyl p={[0.2, 0.08, -0.15]} rt={0.015} h={0.12} m={L.metal} />
          </group>
        ))}
        <Box p={[0, TABLE_TOP + 0.07, 0.36]} s={[0.3, 0.1, 0.4]} m={L.dark} />
        {[-0.08, 0, 0.08].map((x, i) => (
          <mesh key={x} position={[x, TABLE_TOP + 0.13, 0.42]} material={EQ_MATS[i % 2]}>
            <icosahedronGeometry args={[0.025, 0]} />
          </mesh>
        ))}
        <Speaker x={-1.05} coneRefs={cones} />
        <Speaker x={1.05} coneRefs={cones} />
        {/* light truss */}
        {[-1.3, 1.3].map((x) => (
          <Cyl key={x} p={[x, DECK_Y + 1.15, -0.6]} rt={0.04} h={2.3} m={L.metal} />
        ))}
        <Box p={[0, DECK_Y + 2.28, -0.6]} s={[2.7, 0.07, 0.07]} m={L.metal} />
        {LAMP_XS.map((x, i) => (
          <group key={x} position={[x, DECK_Y + 2.2, -0.55]} ref={(r) => (beams.current[i] = r)} userData={{ noMerge: true }}>
            <mesh material={LAMP_MATS[i]} rotation={[0.5, 0, 0]}>
              <cylinderGeometry args={[0.08, 0.06, 0.16, 8]} />
            </mesh>
            <mesh geometry={BEAM_GEO} material={BEAM_MATS[i]} rotation={[0.5, 0, 0]} />
          </group>
        ))}
        </StaticMerge>
        <MiniBot ref={dj} color="#D63AF9" position={[0, DECK_Y, -0.15]}>
          <group ref={phones} position={[0, 0.74, 0]}>
            <mesh position={[0, 0.06, 0]} rotation={[0, Math.PI / 2, 0]} material={PHONES}>
              <torusGeometry args={[0.2, 0.025, 4, 12, Math.PI]} />
            </mesh>
            {[-0.2, 0.2].map((x) => (
              <mesh key={x} position={[x, 0.03, 0]} rotation={[0, 0, Math.PI / 2]} material={x < 0 ? PHONES : PAD}>
                <cylinderGeometry args={[0.075, 0.075, 0.06, 10]} />
              </mesh>
            ))}
          </group>
        </MiniBot>
      </group>
      {noteSeeds.map((sd, i) => (
        <group key={i} ref={(r) => (notes.current[i] = r)} visible={false}>
          <Note beamed={sd.beamed} mat={NOTE_MATS[i % NOTE_MATS.length]} />
        </group>
      ))}
    </group>
  );
}
