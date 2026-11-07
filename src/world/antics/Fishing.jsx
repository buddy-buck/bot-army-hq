import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { antics, fxNow } from '../../components/labels.js';
import { DOCK } from '../../utils/paths.js';
import { testOn } from '../../wild/director.js';
import MiniBot from '../MiniBot.jsx';
import { world } from '../state.js';
import { fxBurst } from './Fx.jsx';
import { PROP_GEO, PROP_MAT, seaY } from './props.js';
import { aimCrew, bump, ease, lerp, standCrew } from './rig.js';

// Fishing off the south edge of Launch's Pier: a bot sits on the edge, feet
// over the water, rod out, bobber bobbing. Now and then something bites:
// the rod jerks up, a fish flops on the line, gets a good look, and goes
// back in with a splash. Then a fresh cast.
//
// If Launch is chillin' at the pier, Launch fishes here (Bot.jsx sits it
// down with a rod and reports the rod tip); otherwise a crew bot does,
// day and night (by lantern light after dark). At night the bobber is
// registered in world.glow so the water can glow around it.

// On the south edge, between the dock office (west) and the ramp (east).
export const FISH_SPOT = { x: -18.9, z: DOCK.z1 - 0.2, y: DOCK.y, faceY: 0.42 };
const OUT = 2.7; // bobber distance from the bot
const ANCHOR = { x: FISH_SPOT.x + Math.sin(FISH_SPOT.faceY) * OUT, z: FISH_SPOT.z + Math.cos(FISH_SPOT.faceY) * OUT };
const SIDE = { x: Math.cos(FISH_SPOT.faceY), z: -Math.sin(FISH_SPOT.faceY) }; // the bot's local +x, in world
const LINE_PTS = 12;
const PHASES = { bite: 1.5, hook: 0.55, dangle: 2.4, toss: 1.0, cast: 1.2 };

const tip = new THREE.Vector3();
const fishAt = new THREE.Vector3();

export default function Fishing({ ctx }) {
  const crew = useRef({});
  const crewRoot = useRef();
  const rod = useRef();
  const rodTip = useRef();
  const lantern = useRef();
  const bob = useRef();
  const fish = useRef();
  const st = useRef({ phase: 'wait', t0: 0, wait: 6, t: 0, splashed: false });
  const test = testOn('fishing');
  const night = ctx.sky?.stars || 0;
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_PTS * 3), 3));
    const l = new THREE.Line(g, PROP_MAT.line);
    l.frustumCulled = false;
    return l;
  }, []);
  // a bucket hat for the angler, put on its head once it's built
  const hat = useMemo(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.1, 8), PROP_MAT.bucketBlue);
    m.position.y = 0.22;
    return m;
  }, []);
  useEffect(
    () => () => {
      hat.removeFromParent();
      hat.geometry.dispose();
      line.geometry.dispose();
      world.glow.delete('antics-bobber');
    },
    [line, hat]
  );

  useFrame((state, delta) => {
    const s = st.current;
    s.t += Math.min(delta, 0.1);
    const t = s.t;
    const clock = state.clock.elapsedTime;

    // Who's fishing: Launch (when chillin' here) or the crew bot.
    const an = antics.get('launch');
    const team = !!an && an.kind === 'fish' && fxNow() < an.end;
    const teamReady = team && !!an.tip;
    if (crewRoot.current) crewRoot.current.visible = !team;
    const P = crew.current;

    // --- the catch cycle -------------------------------------------------------
    let k = t - s.t0;
    const next = (phase, dur) => {
      s.phase = phase;
      s.t0 = t;
      s.splashed = false;
      if (dur !== undefined) s.wait = dur;
      k = 0;
    };
    if (s.phase === 'wait' && k > s.wait) next('bite');
    else if (s.phase === 'bite' && k > PHASES.bite) next('hook');
    else if (s.phase === 'hook' && k > PHASES.hook) next('dangle');
    else if (s.phase === 'dangle' && k > PHASES.dangle) next('toss');
    else if (s.phase === 'toss' && k > PHASES.toss) next('cast');
    else if (s.phase === 'cast' && k > PHASES.cast) next('wait', test ? 4 + Math.random() * 2 : 16 + Math.random() * 26);

    let lift = 0;
    switch (s.phase) {
      case 'bite':
        lift = 0.06 * Math.abs(Math.sin(k * 9));
        break;
      case 'hook':
        lift = ease(k / 0.25);
        break;
      case 'dangle':
        lift = 1 - 0.1 * Math.sin(k * 3);
        break;
      case 'toss':
        lift = lerp(1, 0.35, ease(k / 0.5));
        break;
      case 'cast':
        lift = k < 0.35 ? lerp(0.35, 0.8, k / 0.35) : lerp(0.8, 0, ease((k - 0.35) / 0.5));
        break;
      default:
        lift = Math.sin(clock * 0.7) * 0.03 + 0.03;
    }
    if (team) an.rodLift = lift;

    // --- crew fisher pose (same as Launch's in botPose.js) ----------------------
    if (!team && P.root) {
      if (!hat.parent) P.head.add(hat);
      standCrew(P);
      P.root.position.set(FISH_SPOT.x, FISH_SPOT.y, FISH_SPOT.z);
      P.root.rotation.y = FISH_SPOT.faceY;
      P.pose.position.y = -0.17;
      P.pose.rotation.x = -0.12;
      const dangle = Math.sin(clock * 1.3) * 0.02;
      P.footL.position.set(-0.08, dangle, 0.2);
      P.footR.position.set(0.08, -dangle, 0.2);
      aimCrew(P, 'L', -0.04, 0.38 + lift * 0.12, 0.24, 0.5);
      aimCrew(P, 'R', 0.05, 0.4 + lift * 0.14, 0.3, 0.5);
      P.head.rotation.x = 0.2 - lift * 0.35 + Math.sin(clock * 0.5) * 0.04;
      P.head.rotation.y = Math.sin(clock * 0.23) * 0.2;
      if (s.phase === 'dangle') P.head.rotation.y = 0.15 * Math.sin(k * 2); // a good look at it
      if (rod.current) rod.current.rotation.x = 1.0 - lift * 0.55;
    }
    if (lantern.current) {
      lantern.current.visible = !team && night > 0.3;
      if (lantern.current.visible) lantern.current.children[1].scale.setScalar(1 + Math.sin(clock * 7) * 0.06 + Math.sin(clock * 11.3) * 0.04);
    }

    // rod tip, in world space
    let haveTip = false;
    if (team && teamReady) {
      tip.set(an.tip.x, an.tip.y, an.tip.z);
      haveTip = true;
    } else if (!team && rodTip.current) {
      rodTip.current.getWorldPosition(tip);
      haveTip = true;
    }

    // --- bobber and fish ----------------------------------------------------------
    const b = bob.current;
    const f = fish.current;
    const water = seaY(ANCHOR.x, ANCHOR.z, clock);
    const bx = ANCHOR.x;
    const bz = ANCHOR.z;
    let by = water + 0.02 + Math.sin(clock * 2.1) * 0.015;
    let showFish = false;
    let lineTo = b ? b.position : fishAt;
    if (b) {
      b.visible = haveTip;
      b.position.set(bx, by, bz);
      b.rotation.z = Math.sin(clock * 1.7) * 0.15;
      if (s.phase === 'bite') {
        by -= 0.1 * Math.max(0, Math.sin(k * 9));
        b.position.y = by;
        if (!s.splashed && k > 0.2) {
          s.splashed = true;
          fxBurst('splash', bx, water, bz, { scale: 0.25 });
        }
      } else if (s.phase === 'hook') {
        // fish and bobber leap up toward the rod tip
        const u = ease(k / PHASES.hook);
        fishAt.set(lerp(bx, tip.x, u * 0.85), lerp(water, tip.y - 0.5, u) + Math.sin(u * Math.PI) * 0.5, lerp(bz, tip.z, u * 0.85));
        b.position.copy(fishAt).y += 0.25;
        showFish = true;
        lineTo = b.position;
        if (!s.splashed) {
          s.splashed = true;
          fxBurst('splash', bx, water, bz, { scale: 0.6 });
        }
      } else if (s.phase === 'dangle') {
        fishAt.set(tip.x, tip.y - 0.55, tip.z);
        b.position.set(tip.x, tip.y - 0.3, tip.z);
        showFish = true;
        lineTo = b.position;
      } else if (s.phase === 'toss') {
        // off the hook and back in, with a spin
        const u = Math.min(1, k / 0.8);
        const lx = bx + SIDE.x * 0.7;
        const lz = bz + SIDE.z * 0.7;
        fishAt.set(lerp(tip.x, lx, u), lerp(tip.y - 0.55, water, u) + Math.sin(u * Math.PI) * 0.7, lerp(tip.z, lz, u));
        showFish = u < 1;
        b.position.set(tip.x, tip.y - 0.3, tip.z);
        lineTo = b.position;
        if (u >= 1 && !s.splashed) {
          s.splashed = true;
          fxBurst('splash', lx, water, lz, { scale: 0.75 });
        }
      } else if (s.phase === 'cast') {
        const u = ease(Math.max(0, (k - 0.3) / 0.8));
        b.position.set(lerp(tip.x, bx, u), lerp(tip.y - 0.3, by, u) + Math.sin(u * Math.PI) * 0.6, lerp(tip.z, bz, u));
        lineTo = b.position;
        if (u >= 1 && !s.splashed) {
          s.splashed = true;
          fxBurst('splash', bx, water, bz, { scale: 0.3 });
        }
      }
    }
    if (f) {
      f.visible = showFish && haveTip;
      if (f.visible) {
        f.position.copy(fishAt);
        const flop = s.phase === 'dangle' ? Math.sin(k * 16) : Math.sin(k * 10);
        f.rotation.set(s.phase === 'toss' ? k * 12 : -1.3 + flop * 0.25, FISH_SPOT.faceY + flop * 0.5, flop * 0.3);
      }
    }

    // --- the line: rod tip to bobber, with a little sag ---------------------------
    line.visible = haveTip;
    if (haveTip) {
      const pos = line.geometry.attributes.position;
      const taut = s.phase === 'hook' || s.phase === 'dangle' ? 0.02 : 0.25;
      for (let i = 0; i < LINE_PTS; i++) {
        const u = i / (LINE_PTS - 1);
        pos.setXYZ(i, lerp(tip.x, lineTo.x, u), lerp(tip.y, lineTo.y, u) - Math.sin(u * Math.PI) * taut, lerp(tip.z, lineTo.z, u));
      }
      pos.needsUpdate = true;
    }

    // night: let the water glow around the bobber
    if (night > 0.2 && haveTip) world.glow.set('antics-bobber', { x: b ? b.position.x : bx, z: b ? b.position.z : bz, strength: night * (s.phase === 'bite' ? 1 : 0.6) });
    else world.glow.delete('antics-bobber');
  });

  return (
    <group>
      <group ref={crewRoot}>
        <MiniBot color="#4aa8ff" parts={crew}>
          <group ref={rod} position={[0.01, 0.4, 0.27]} rotation={[1, 0, 0]}>
            <mesh geometry={PROP_GEO.rod} material={PROP_MAT.rod} />
            <mesh geometry={PROP_GEO.reel} material={PROP_MAT.reel} />
            <object3D ref={rodTip} position={[0, 1.3, 0]} />
          </group>
        </MiniBot>
        <group ref={lantern} position={[FISH_SPOT.x - SIDE.x * 0.55, FISH_SPOT.y, FISH_SPOT.z - SIDE.z * 0.55 - 0.1]} scale={1.35} visible={false}>
          <mesh geometry={PROP_GEO.post} material={PROP_MAT.post} />
          <group position={[0, 0.66, 0]}>
            <mesh geometry={PROP_GEO.lantern} material={PROP_MAT.lantern} />
            <mesh geometry={PROP_GEO.glow} material={PROP_MAT.glow} />
          </group>
        </group>
      </group>
      <primitive object={line} />
      <group ref={bob} scale={1.35}>
        <mesh geometry={PROP_GEO.bobber} material={PROP_MAT.bobberRed} />
        <mesh geometry={PROP_GEO.bobberTop} material={PROP_MAT.bobberWhite} />
      </group>
      <group ref={fish} scale={1.6} visible={false}>
        <mesh geometry={PROP_GEO.fishBody} material={PROP_MAT.fish} />
        <mesh geometry={PROP_GEO.fishTail} material={PROP_MAT.fishTail} />
      </group>
    </group>
  );
}
