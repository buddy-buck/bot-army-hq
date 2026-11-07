import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { groundY, SITES } from '../../utils/paths.js';
import { testOn } from '../../wild/director.js';
import MiniBot from '../MiniBot.jsx';
import { fxBurst, fxCount } from './Fx.jsx';
import { PROP_GEO, PROP_MAT } from './props.js';
import { aimCrew, bump, ease, lerp, restArms, standCrew, toPose } from './rig.js';

// The fitness corner: a crew bot in a headband does sets of ten push-ups on
// a mat (a count pops up on each one), then hops up, flexes, wipes its brow,
// sips water and stretches before the next set.

const S = SITES.pushups;
const REPS = 10;
const DROP = 0.6;
const REP = 0.78;
const UP = 1.2;
const SET_LEN = DROP + REP * REPS + UP;
const PLANK = 1.15;

const v = { x: 0, y: 0, z: 0 };
const std = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 });

export default function Pushups({ ctx }) {
  const parts = useRef({});
  const botRef = useRef();
  const bottleRef = useRef();
  const st = useRef({ t: 0, start: 3, rest: 8, lastRep: 0, n: 0 });
  const g0 = useMemo(() => groundY(S.x, S.z), []);
  const mats = useMemo(() => ({ mat: std('#2ec4c8'), band: std('#ff4f5e') }), []);
  // sweatband, tied onto the head once the bot is built
  const band = useMemo(() => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.025, 4, 14), mats.band);
    m.position.y = 0.11;
    m.rotation.x = Math.PI / 2;
    return m;
  }, [mats]);
  useEffect(
    () => () => {
      band.removeFromParent();
      band.geometry.dispose();
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats, band]
  );
  const test = testOn('pushups');
  const day = !ctx.bedtime;
  // the bot faces east, side-on to the default camera
  const rotY = Math.PI / 2;
  const fwd = { x: Math.sin(rotY), z: Math.cos(rotY) };
  const bx = S.x - 0.45;
  const bz = S.z;

  useFrame((state, delta) => {
    if (botRef.current) botRef.current.visible = day;
    const P = parts.current;
    if (!day || !P.root) return;
    if (!band.parent) P.head.add(band);
    const s = st.current;
    s.t += Math.min(delta, 0.1);
    const t = s.t;
    const clock = state.clock.elapsedTime;
    if (t > s.start + SET_LEN + s.rest) {
      s.start = t;
      s.n += 1;
      s.rest = test ? 3 : 10 + ((s.n * 7) % 8);
      s.lastRep = 0;
    }
    const k = t - s.start;
    standCrew(P);
    P.root.position.set(bx, g0 + 0.03, bz);
    P.root.rotation.y = rotY;
    let bottle = false;

    if (k < SET_LEN) {
      const repsEnd = DROP + REP * REPS;
      let tilt;
      let py = 0.05;
      if (k < DROP) {
        tilt = PLANK * ease(k / DROP);
        py *= ease(k / DROP);
      } else if (k < repsEnd) {
        const r = (k - DROP) / REP;
        const rep = Math.floor(r);
        tilt = PLANK + 0.2 * (0.5 - 0.5 * Math.cos((r % 1) * Math.PI * 2));
        // count each one at the bottom
        if (r % 1 > 0.5 && s.lastRep <= rep) {
          s.lastRep = rep + 1;
          const hx = bx + fwd.x * 0.75;
          const hz = bz + fwd.z * 0.75;
          fxCount(rep + 1, hx, g0 + 0.95, hz, rep + 1 === REPS ? '#ffd23f' : '#ffffff');
          if (rep >= 6 && Math.random() < 0.6) fxBurst('sweat', hx, g0 + 0.45, hz);
        }
      } else {
        const u = (k - repsEnd) / UP;
        tilt = PLANK * (1 - ease(u / 0.3));
        py = 0.05 * (1 - ease(u / 0.3));
        P.pose.position.y = bump(u, 0.2, 0.55) * 0.3;
        if (u > 0.2 && s.lastRep === REPS) {
          s.lastRep = REPS + 1;
          fxBurst('sparks', bx, g0 + 1.6, bz);
        }
        if (u > 0.25) {
          const f = bump(u, 0.25, 1);
          aimCrew(P, 'L', -0.36, lerp(0.2, 0.78, Math.min(1, f * 2)), 0.02);
          aimCrew(P, 'R', 0.36, lerp(0.2, 0.78, Math.min(1, f * 2)), 0.02);
          P.head.rotation.x = -0.25 * f;
        }
      }
      P.pose.rotation.x = tilt;
      if (k < repsEnd + UP * 0.25) {
        P.pose.position.y = py;
        const sz = 0.5 * Math.sin(PLANK) + 0.02;
        toPose(v, -0.2, 0, sz, tilt, py);
        aimCrew(P, 'L', v.x, v.y, v.z, 0.5);
        toPose(v, 0.2, 0, sz, tilt, py);
        aimCrew(P, 'R', v.x, v.y, v.z, 0.5);
        P.head.rotation.x = -0.75 * Math.min(1, tilt / PLANK);
      }
    } else {
      // rest: wipe brow, sip water, stretch overhead, shake it out
      const r = k - SET_LEN;
      P.pose.position.y = (Math.sin(clock * 2) + 1) * 0.01;
      restArms(P);
      if (r < 1.6) {
        const w = Math.sin(r * 9);
        aimCrew(P, 'R', 0.08 + w * 0.06, 0.86, 0.2); // wipe the brow
        P.head.rotation.x = 0.1;
      } else if (r < 4) {
        bottle = true;
        const sipK = bump(r, 2.0, 3.6);
        aimCrew(P, 'R', lerp(0.24, 0.1, sipK), lerp(0.3, 0.68, sipK), lerp(0.12, 0.2, sipK));
        P.head.rotation.x = -0.35 * sipK;
      } else if (r < 6.5) {
        const st2 = bump(r, 4, 6.5);
        aimCrew(P, 'L', -0.12, lerp(0.2, 0.98, st2), 0.0);
        aimCrew(P, 'R', 0.12, lerp(0.2, 0.98, st2), 0.0);
        P.pose.rotation.z = Math.sin(r * 2.4) * 0.12 * st2; // side stretch
      } else {
        P.pose.rotation.z = Math.sin(clock * 6) * 0.04;
        P.head.rotation.y = Math.sin(clock * 0.7) * 0.4;
      }
    }
    if (bottleRef.current) {
      bottleRef.current.visible = bottle;
      if (bottle && P.handR) {
        P.handR.getWorldPosition(bottleRef.current.position);
        bottleRef.current.position.y -= 0.05;
      }
    }
  });

  return (
    <group>
      {/* mat, dumbbells and a water bottle (stay out at night) */}
      <group position={[S.x, g0, S.z]}>
        <mesh material={mats.mat} position={[0, 0.015, 0]}>
          <boxGeometry args={[1.5, 0.03, 0.55]} />
        </mesh>
        <group position={[0.5, 0.05, 0.55]} rotation={[0, 0.5, 0]}>
          <mesh geometry={PROP_GEO.dumbbellBar} material={PROP_MAT.iron} />
          <mesh geometry={PROP_GEO.dumbbellEnd} material={PROP_MAT.iron} position={[-0.1, 0, 0]} />
          <mesh geometry={PROP_GEO.dumbbellEnd} material={PROP_MAT.iron} position={[0.1, 0, 0]} />
        </group>
        <group position={[0.75, 0.05, 0.45]} rotation={[0, -0.3, 0]}>
          <mesh geometry={PROP_GEO.dumbbellBar} material={PROP_MAT.iron} />
          <mesh geometry={PROP_GEO.dumbbellEnd} material={PROP_MAT.iron} position={[-0.1, 0, 0]} />
          <mesh geometry={PROP_GEO.dumbbellEnd} material={PROP_MAT.iron} position={[0.1, 0, 0]} />
        </group>
      </group>
      <group ref={botRef}>
        <MiniBot color="#c2d94a" parts={parts} />
        <group ref={bottleRef} visible={false} scale={1.35}>
          <mesh geometry={PROP_GEO.bottle} material={PROP_MAT.bottle} />
          <mesh geometry={PROP_GEO.bottleCap} material={PROP_MAT.cap} />
        </group>
      </group>
    </group>
  );
}
