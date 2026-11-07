import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { groundY, SITES } from '../../utils/paths.js';
import { testOn } from '../../wild/director.js';
import MiniBot from '../MiniBot.jsx';
import { fxBurst } from './Fx.jsx';
import { aimCrew, bump, ease, lerp, reachWorld, restArms, standCrew } from './rig.js';

// Arm-wrestling at the barrel: two crew bots lock hands, strain back and
// forth (sweat flying), one slams the win and celebrates while two friends
// cheer. Then a breather, a rematch. The crew goes to bed at night.

const S = SITES.armWrestle;
const GAP = 0.5; // each wrestler stands this far from the barrel's center
const MATCH = { grip: 1.4, strain: 7.5, slam: 0.5, party: 3.2 };
const MATCH_LEN = MATCH.grip + MATCH.strain + MATCH.slam + MATCH.party;

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, ...extra });

export default function ArmWrestle({ ctx }) {
  const wA = useRef({});
  const wB = useRef({});
  const fans = [useRef({}), useRef({})];
  const crew = useRef();
  const st = useRef({ t: 0, start: 2, winner: 1, rest: 6, n: 0, sweatAt: 0, slammed: false, partied: false });
  const g0 = useMemo(() => groundY(S.x, S.z), []);
  const mats = useMemo(() => ({ wood: std('#9a6b43'), band: std('#4a4f5c'), top: std('#b98856'), crate: std('#c8a070') }), []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const test = testOn('armwrestle');
  const day = !ctx.bedtime;

  useFrame((state, delta) => {
    if (crew.current) crew.current.visible = day;
    if (!day || !wA.current.root || !wB.current.root) return;
    const s = st.current;
    s.t += Math.min(delta, 0.1);
    const t = s.t;
    const clock = state.clock.elapsedTime;
    if (t > s.start + MATCH_LEN + s.rest) {
      s.start = t;
      s.n += 1;
      s.winner = (s.n * 7 + 3) % 5 < 2 ? -1 : 1; // B wins sometimes, A a bit more often
      s.rest = test ? 2.5 : 9 + ((s.n * 13) % 9);
      s.slammed = false;
      s.partied = false;
    }
    const k = t - s.start;
    const W = [wA.current, wB.current];
    W.forEach(standCrew);
    fans.forEach((f) => f.current.root && standCrew(f.current));

    // The balance of the match: -1 (A's hand pinned) .. +1 (B's hand pinned).
    let bal = 0;
    let strain = 0;
    let phase = 'rest';
    if (k < MATCH.grip) phase = 'grip';
    else if (k < MATCH.grip + MATCH.strain) {
      phase = 'strain';
      const u = k - MATCH.grip;
      strain = 1;
      bal = Math.sin(u * 0.9) * 0.45 + Math.sin(u * 2.3 + 1) * 0.15 + Math.sin(u * 13) * 0.03;
      bal *= Math.min(1, u / 1.2);
    } else if (k < MATCH.grip + MATCH.strain + MATCH.slam) {
      phase = 'slam';
      const u = (k - MATCH.grip - MATCH.strain) / MATCH.slam;
      const from = Math.sin(MATCH.strain * 0.9) * 0.45 + Math.sin(MATCH.strain * 2.3 + 1) * 0.15;
      bal = lerp(from, s.winner, ease(u));
      strain = 1;
    } else if (k < MATCH_LEN) {
      phase = 'party';
      bal = s.winner;
    }

    // Hands meet over the barrel; the pinned side drops toward the top.
    const hx = S.x;
    const hy = g0 + 0.84 - Math.abs(bal) * 0.17;
    const hz = S.z + bal * 0.24;
    if (phase === 'slam' && !s.slammed && k > MATCH.grip + MATCH.strain + MATCH.slam * 0.8) {
      s.slammed = true;
      fxBurst('dust', hx, g0 + 0.66, hz, { color: '#d9b98c' });
    }
    if (phase === 'party' && !s.partied) {
      s.partied = true;
      const wx = S.x - s.winner * GAP;
      fxBurst('confetti', wx, g0 + 1.4, S.z);
    }
    if (strain && t > s.sweatAt) {
      s.sweatAt = t + (test ? 0.35 : 0.55) + Math.random() * 0.4;
      const who = Math.random() < 0.5 ? -1 : 1;
      fxBurst('sweat', S.x + who * GAP, g0 + 1.15, S.z + (Math.random() - 0.5) * 0.2, { side: who });
    }

    W.forEach((P, i) => {
      const side = i === 0 ? -1 : 1; // A on the west, B on the east
      const won = phase === 'party' && s.winner === (i === 0 ? 1 : -1);
      const lost = phase === 'party' && !won;
      P.root.position.set(S.x + side * GAP, g0, S.z);
      P.root.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      const shake = strain ? Math.sin(clock * 38 + i * 2) * 0.025 : 0;
      if (phase === 'rest') {
        // step back, shake the arm out, chat
        P.root.position.x = S.x + side * (GAP + 0.25);
        restArms(P);
        aimCrew(P, 'R', 0.26 + Math.sin(clock * 9 + i) * 0.03, 0.2, 0.05);
        P.head.rotation.y = Math.sin(clock * 0.6 + i) * 0.3;
        P.pose.position.y = (Math.sin(clock * 1.5 + i) + 1) * 0.008;
        return;
      }
      if (won) {
        const hop = bump(((k - MATCH.grip - MATCH.strain - MATCH.slam) * 2.2) % 1, 0, 1);
        P.pose.position.y = hop * 0.18;
        aimCrew(P, 'L', -0.32, 0.9, 0.05);
        aimCrew(P, 'R', 0.32, 0.9, 0.05);
        P.head.rotation.x = -0.25;
        P.root.position.x = S.x + side * (GAP + 0.12);
        return;
      }
      if (lost) {
        P.pose.rotation.x = 0.18;
        P.head.rotation.x = 0.45;
        P.head.rotation.y = Math.sin(clock * 3) * 0.2; // sheepish head shake
        P.root.position.x = S.x + side * (GAP + 0.12);
        restArms(P);
        aimCrew(P, 'R', 0.2, 0.22, 0.12); // rubbing the sore arm
        return;
      }
      // grip / strain / slam: lean in, lock hands, other hand flat on the barrel
      const lean = phase === 'grip' ? ease(k / MATCH.grip) : 1;
      P.pose.rotation.x = 0.2 * lean + (strain ? Math.abs(Math.sin(clock * 3 + i)) * 0.05 : 0);
      P.pose.rotation.z = shake;
      P.head.rotation.x = strain ? -0.15 : 0;
      P.head.rotation.z = strain ? Math.sin(clock * 2.1 + i * 1.7) * 0.12 : 0;
      if (P.eyeL) {
        const squint = strain ? 0.35 : 1;
        P.eyeL.scale.y = squint;
        P.eyeR.scale.y = squint;
      }
      reachWorld(P, 'R', lerp(S.x + side * 0.3, hx, lean), lerp(g0 + 0.5, hy, lean), lerp(S.z, hz, lean), 0.5);
      reachWorld(P, 'L', S.x + side * 0.16, g0 + 0.68, S.z - side * 0.15, 0.5);
    });
    if (phase !== 'grip' && phase !== 'strain' && phase !== 'slam') W.forEach((P) => P.eyeL && (P.eyeL.scale.y = P.eyeR.scale.y = 1));

    // The fans: bob along, fist pump during the strain, go wild at the win.
    fans.forEach((f, i) => {
      const P = f.current;
      if (!P.root) return;
      const party = phase === 'party';
      const pump = strain ? Math.max(0, Math.sin(clock * 5 + i * 2)) : 0;
      P.pose.position.y = party ? bump(((clock * 2.4 + i * 0.5) % 1), 0, 1) * 0.2 : (Math.sin(clock * 2 + i) + 1) * 0.01;
      P.pose.rotation.z = Math.sin(clock * 1.3 + i) * 0.05;
      P.head.rotation.y = phase === 'rest' ? Math.sin(clock * 0.5 + i) * 0.4 : Math.sin(clock * 4 + i) * 0.12;
      if (party) {
        aimCrew(P, 'L', -0.32, 0.9, 0.06);
        aimCrew(P, 'R', 0.32, 0.9, 0.06);
      } else {
        aimCrew(P, 'L', -0.23, lerp(0.2, 0.85, pump), lerp(0.02, 0.1, pump));
        aimCrew(P, 'R', 0.26, 0.3, 0.12); // drink in hand
      }
    });
  });

  return (
    <group>
      {/* barrel table and two crates (always there, even at night) */}
      <group position={[S.x, g0, S.z]}>
        <mesh material={mats.wood} position={[0, 0.31, 0]}>
          <cylinderGeometry args={[0.27, 0.27, 0.62, 10]} />
        </mesh>
        {[0.12, 0.5].map((y) => (
          <mesh key={y} material={mats.band} position={[0, y, 0]}>
            <cylinderGeometry args={[0.285, 0.285, 0.04, 10]} />
          </mesh>
        ))}
        <mesh material={mats.top} position={[0, 0.63, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.03, 10]} />
        </mesh>
        <mesh material={mats.crate} position={[-0.95, 0.14, -0.75]} rotation={[0, 0.4, 0]}>
          <boxGeometry args={[0.32, 0.28, 0.32]} />
        </mesh>
      </group>
      <group ref={crew}>
        <MiniBot color="#ff8a5c" parts={wA} />
        <MiniBot color="#4aa8ff" parts={wB} />
        {/* fans on opposite corners, so the match shows from any side */}
        <MiniBot color="#ffb84d" parts={fans[0]} position={[S.x - 1.05, groundY(S.x - 1.05, S.z + 0.8), S.z + 0.8]} rotationY={Math.atan2(1.05, -0.8)} drink="coconut" />
        <MiniBot color="#9b7bff" parts={fans[1]} position={[S.x + 1.05, groundY(S.x + 1.05, S.z - 0.8), S.z - 0.8]} rotationY={Math.atan2(-1.05, 0.8)} drink="maitai" />
      </group>
    </group>
  );
}
