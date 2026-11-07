import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot, { extraColor } from '../MiniBot.jsx';
import { BOT_SCALE, GEO, MAT } from '../../components/Bot.jsx';
import { addRipple } from '../../components/Water.jsx';
import { DOCK, SITES } from '../../utils/paths.js';
import { rareGap } from '../director.js';
import { world } from '../world.js';
import { puff } from './fx.jsx';
import { AMAT, aimArm, ease, ramp, std } from './common.jsx';

// An extra fishing off the end of Launch's Pier: sitting on the edge, legs
// dangling, line and bobber out on the water. Every so often the bobber
// dips, the rod bends, and it reels in a fish (sometimes an old boot, once
// in a while a tiny treasure chest), holds it up proudly, and tosses it back.
// It stays out at night with a lantern, and the night water glows around
// the bobber.

const SITE = SITES.fishing;
const ROOT = { x: SITE.x, y: DOCK.y, z: Math.min(SITE.z, DOCK.z1 - 0.22) };
const BOB = { x: ROOT.x + 0.25, z: ROOT.z + 1.9 };
const ROD_BASE = new THREE.Vector3(0.02, 0.33, 0.2); // pose frame (bot units)
const ROD_PITCH = 0.55;
const SEG1 = 0.8;
const SEG2 = 0.6;
const LINE_PTS = 10;

const rodGeo1 = new THREE.CylinderGeometry(0.012, 0.018, SEG1, 5).rotateX(Math.PI / 2).translate(0, 0, SEG1 / 2 - 0.12);
const rodGeo2 = new THREE.CylinderGeometry(0.006, 0.011, SEG2, 4).rotateX(Math.PI / 2).translate(0, 0, SEG2 / 2);
const reelGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 8).rotateZ(Math.PI / 2);
const bobTop = new THREE.SphereGeometry(0.05, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
const bobBot = new THREE.SphereGeometry(0.05, 8, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
const MATS = {
  rod: std('#5b3b22'),
  bobRed: std('#e2543e'),
  fish: [std('#5aa9e6', { roughness: 0.4 }), std('#f09024', { roughness: 0.4 }), std('#2ec4c8', { roughness: 0.4 }), std('#ff7a59', { roughness: 0.4 })],
  boot: std('#5e4a3a'),
  sole: std('#2b2a33'),
};
// Catches hang from the hook at their origin (they extend down, -y).
const fishBody = new THREE.IcosahedronGeometry(0.1, 0).scale(0.55, 1.4, 0.35).translate(0, -0.16, 0);
const fishTail = new THREE.ConeGeometry(0.07, 0.1, 4).rotateX(Math.PI).scale(1, 1, 0.3).translate(0, -0.33, 0);
const bootLeg = new THREE.BoxGeometry(0.09, 0.16, 0.09).translate(0, -0.1, 0);
const bootFoot = new THREE.BoxGeometry(0.09, 0.07, 0.17).translate(0, -0.2, 0.04);
const chestBox = new THREE.BoxGeometry(0.16, 0.1, 0.11).translate(0, -0.1, 0);
const chestLid = new THREE.CylinderGeometry(0.055, 0.055, 0.16, 6, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, -0.05, 0);

const tmp = new THREE.Vector3();
const tip = new THREE.Vector3();
const hand = new THREE.Vector3();
const from = new THREE.Vector3();
const catchAt = new THREE.Vector3();
const bobAt = new THREE.Vector3();

export default function Fishing({ animate = true, night = false }) {
  const bot = useRef();
  const rod = useRef();
  const rodTip = useRef();
  const tipMark = useRef();
  const handMark = useRef();
  const bobber = useRef();
  const caught = useRef();
  const kinds = [useRef(), useRef(), useRef()];
  const fishMesh = useRef();
  const fishTailMesh = useRef();
  const st = useRef({ t: 0, mode: 'wait', modeT: 0, next: rareGap(40, 90), kind: 0, splashed: false });

  const line = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_PTS * 3), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.75 }));
    l.frustumCulled = false;
    return l;
  }, []);
  useEffect(() => () => {
    line.geometry.dispose();
    line.material.dispose();
  }, [line]);

  useEffect(() => {
    const g = { x: BOB.x, z: BOB.z, strength: 0.8 };
    world.glow.set('antics-fishing', g);
    return () => world.glow.delete('antics-fishing');
  }, []);

  useFrame((state, delta) => {
    const b = bot.current;
    if (!b?.root || !rod.current || !tipMark.current) return;
    const s = st.current;
    const dt = animate ? Math.min(delta, 0.1) : 0;
    s.t += dt;
    s.modeT += dt;
    const t = s.t;
    const go = (mode) => {
      s.mode = mode;
      s.modeT = 0;
      s.splashed = false;
    };

    // --- sitting on the edge, legs dangling
    b.reset();
    b.pose.position.y = -0.09;
    b.pose.rotation.x = 0.08;
    const swing = animate ? Math.sin(t * 1.3) * 0.04 : 0;
    b.footL.position.set(-0.08, -0.12, 0.24 + swing);
    b.footR.position.set(0.08, -0.12, 0.24 - swing);
    b.head.rotation.x = 0.12 + (animate ? Math.sin(t * 0.4) * 0.05 : 0);
    if (animate && s.mode === 'wait') b.head.rotation.y = Math.sin(t * 0.23) * 0.3;

    let bend = 0;
    let pitch = ROD_PITCH;
    let raiseL = 0; // left arm leaves the rod to hold up the catch
    const k = s.modeT;
    if (s.mode === 'wait') {
      if (animate && t > s.next) {
        go('bite');
        s.kind = Math.random() < 0.7 ? 0 : Math.random() < 0.67 ? 1 : 2;
        const fm = MATS.fish[Math.floor(Math.random() * MATS.fish.length)];
        if (fishMesh.current) fishMesh.current.material = fm;
        if (fishTailMesh.current) fishTailMesh.current.material = fm;
      }
    } else if (s.mode === 'bite') {
      bend = 0.12 * Math.abs(Math.sin(k * 12));
      b.head.rotation.x = 0.25;
      b.pose.rotation.x = 0.16;
      if (k > 1.6) {
        go('reel');
        puff('splash', BOB.x, 0.05, BOB.z, 8);
        addRipple(BOB.x, BOB.z, 1.2, 1);
      }
    } else if (s.mode === 'reel') {
      bend = 0.5 + Math.sin(k * 14) * 0.08;
      pitch = ROD_PITCH + 0.25 * ease(ramp(k, 0, 0.6));
      b.pose.rotation.x = -0.05;
      if (k > 2.4) go('show');
    } else if (s.mode === 'show') {
      pitch = ROD_PITCH + 0.25;
      raiseL = ease(ramp(k, 0, 0.5));
      b.head.rotation.x = -0.1;
      b.head.rotation.y = 0.25;
      b.pose.position.y += Math.abs(Math.sin(k * 6)) * 0.03 * raiseL;
      if (s.kind === 2 && !s.splashed && k > 0.6) {
        s.splashed = true;
        caught.current.getWorldPosition(tmp);
        puff('star', tmp.x, tmp.y, tmp.z, 10);
      }
      if (k > 2.8) go('toss');
    } else if (s.mode === 'toss') {
      raiseL = 1 - ease(ramp(k, 0.3, 0.8));
      if (k > 1.2) go('cast');
    } else if (s.mode === 'cast') {
      // rod back over the shoulder, then flick forward
      pitch = ROD_PITCH + 0.25 * (1 - ramp(k, 0, 0.3)) + 0.45 * Math.sin(ramp(k, 0, 0.35) * Math.PI * 0.5) * (1 - ramp(k, 0.35, 0.55)) - 0.2 * Math.sin(ramp(k, 0.35, 0.9) * Math.PI);
      if (k > 1.0) {
        go('wait');
        s.next = t + rareGap(40, 90);
        puff('splash', BOB.x, 0.05, BOB.z, 3);
        addRipple(BOB.x, BOB.z, 0.6, 0.6);
      }
    }

    // rod
    rod.current.rotation.x = -pitch;
    rodTip.current.rotation.x = bend;
    // hands on the rod (pose frame)
    const dy = Math.sin(pitch);
    const dz = Math.cos(pitch);
    aimArm(b.armR, 0.19, 0.5, 0, ROD_BASE.x + 0.04, ROD_BASE.y + dy * 0.02, ROD_BASE.z + dz * 0.02, 0);
    if (raiseL > 0) {
      const gx = ROD_BASE.x - 0.06;
      const gy = ROD_BASE.y + dy * 0.22;
      const gz = ROD_BASE.z + dz * 0.22;
      aimArm(b.armL, -0.19, 0.5, 0, gx + (-0.32 - gx) * raiseL, gy + (0.95 - gy) * raiseL, gz + (0.22 - gz) * raiseL, 0);
    } else {
      aimArm(b.armL, -0.19, 0.5, 0, ROD_BASE.x - 0.06, ROD_BASE.y + dy * 0.22, ROD_BASE.z + dz * 0.22, 0);
    }
    if (s.mode === 'reel' && animate) b.armR.rotation.z += Math.sin(k * 14) * 0.15; // cranking

    // --- bobber, catch, line (world space)
    tipMark.current.getWorldPosition(tip);
    const bob = animate ? Math.sin(t * 2.1) * 0.025 + Math.sin(t * 3.7) * 0.01 : 0;
    let showCatch = false;
    let hooked = true; // line runs to the catch instead of the bobber
    if (s.mode === 'wait') {
      bobAt.set(BOB.x, 0.02 + bob, BOB.z);
      hooked = false;
    } else if (s.mode === 'bite') {
      bobAt.set(BOB.x, 0.02 - 0.09 * Math.abs(Math.sin(k * 9)) * (Math.sin(k * 2.3) > -0.3 ? 1 : 0), BOB.z);
      hooked = false;
    } else if (s.mode === 'reel') {
      const r = ease(ramp(k, 0, 2.4));
      catchAt.set(BOB.x + (tip.x - BOB.x) * r, -0.1 + (tip.y - 0.25 + 0.1) * r + Math.sin(r * Math.PI) * 0.4, BOB.z + (tip.z - BOB.z) * r);
      showCatch = true;
    } else if (s.mode === 'show') {
      handMark.current.getWorldPosition(hand);
      from.set(tip.x, tip.y - 0.25, tip.z);
      catchAt.copy(from).lerp(hand, raiseL);
      showCatch = true;
    } else if (s.mode === 'toss') {
      handMark.current.getWorldPosition(hand);
      const r = ramp(k, 0.3, 1.1);
      if (r <= 0) catchAt.copy(hand);
      else {
        const tx = BOB.x - 0.5;
        const tz = BOB.z + 0.4;
        catchAt.set(hand.x + (tx - hand.x) * r, hand.y + (0 - hand.y) * r + Math.sin(r * Math.PI) * 0.9, hand.z + (tz - hand.z) * r);
      }
      showCatch = r < 1;
      hooked = false;
      bobAt.set(tip.x, tip.y - 0.3, tip.z);
      if (r >= 1 && !s.splashed) {
        s.splashed = true;
        puff('splash', BOB.x - 0.5, 0.05, BOB.z + 0.4, 10);
        addRipple(BOB.x - 0.5, BOB.z + 0.4, 1.0, 1);
      }
    } else {
      // cast: the bobber arcs back out
      const r = ease(ramp(k, 0.35, 1.0));
      bobAt.set(tip.x + (BOB.x - tip.x) * r, tip.y - 0.3 + (0.02 - tip.y + 0.3) * r + Math.sin(r * Math.PI) * 0.5, tip.z + (BOB.z - tip.z) * r);
      hooked = false;
    }
    if (showCatch) {
      caught.current.position.copy(catchAt);
      caught.current.rotation.set(0, t * 0.7, animate ? Math.sin(t * 13) * 0.35 : 0);
      bobAt.set(catchAt.x, catchAt.y + 0.08, catchAt.z);
    }
    caught.current.visible = showCatch;
    for (let i = 0; i < 3; i++) if (kinds[i].current) kinds[i].current.visible = s.kind === i;
    bobber.current.position.copy(bobAt);
    bobber.current.rotation.z = s.mode === 'bite' ? Math.sin(k * 20) * 0.3 : 0;

    // line: tip -> end with a little sag
    const end = hooked && showCatch ? catchAt : bobAt;
    const arr = line.geometry.attributes.position.array;
    const slack = s.mode === 'wait' ? 0.25 : s.mode === 'cast' ? 0.1 : 0.03;
    for (let i = 0; i < LINE_PTS; i++) {
      const u = i / (LINE_PTS - 1);
      arr[i * 3] = tip.x + (end.x - tip.x) * u;
      arr[i * 3 + 1] = tip.y + (end.y + 0.04 - tip.y) * u - Math.sin(u * Math.PI) * slack;
      arr[i * 3 + 2] = tip.z + (end.z - tip.z) * u;
    }
    line.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <>
      <group position={[ROOT.x, ROOT.y, ROOT.z]}>
        <MiniBot ref={bot} color={extraColor(0)} shadow={false} left={<group ref={handMark} />}>
          <group ref={rod} position={ROD_BASE.toArray()} rotation={[-ROD_PITCH, 0, 0]}>
            <mesh geometry={rodGeo1} material={MATS.rod} />
            <mesh geometry={reelGeo} material={AMAT.steel} position={[0.04, -0.03, 0.06]} />
            <group ref={rodTip} position={[0, 0, SEG1 - 0.12]}>
              <mesh geometry={rodGeo2} material={MATS.rod} />
              <group ref={tipMark} position={[0, 0, SEG2]} />
            </group>
          </group>
        </MiniBot>
        {night && (
          <group position={[-0.5, 0, -0.05]} scale={BOT_SCALE}>
            <mesh geometry={GEO.post} material={MAT.post} position={[0, 0.31, 0]} />
            <group position={[0, 0.66, 0]}>
              <mesh geometry={GEO.lantern} material={MAT.lantern} />
              <mesh geometry={GEO.glow} material={MAT.glow} />
            </group>
          </group>
        )}
      </group>
      <primitive object={line} />
      <group ref={bobber}>
        <mesh geometry={bobTop} material={MATS.bobRed} />
        <mesh geometry={bobBot} material={AMAT.white} />
      </group>
      <group ref={caught} visible={false}>
        <group ref={kinds[0]}>
          <mesh ref={fishMesh} geometry={fishBody} material={MATS.fish[0]} />
          <mesh ref={fishTailMesh} geometry={fishTail} material={MATS.fish[0]} />
        </group>
        <group ref={kinds[1]} visible={false}>
          <mesh geometry={bootLeg} material={MATS.boot} />
          <mesh geometry={bootFoot} material={MATS.sole} />
        </group>
        <group ref={kinds[2]} visible={false}>
          <mesh geometry={chestBox} material={AMAT.woodDark} />
          <mesh geometry={chestLid} material={AMAT.gold} />
        </group>
      </group>
    </>
  );
}
