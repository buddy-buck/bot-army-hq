import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot from '../MiniBot.jsx';
import { SITES } from '../../utils/paths.js';
import { Cyl, L, canvasTexture, ease, frame, lerpAngle, std, walkCycle } from './kit.jsx';
import StaticMerge from '../../utils/StaticMerge.jsx';

// Beach volleyball, two bots a side. The ball flies in arcs: serve, bump,
// set, spike. The receiving bot runs under it, bumps (arms forward) or sets
// (arms up); the spiker jumps. Now and then a spike lands: the scoring team
// hops, the ball gets tossed back and the other side serves.

const SV = SITES.volleyball;
const F = frame(SV.x, SV.z, SV.rotY);
const HX = 2.1; // court half length (local x; net at x = 0)
const HZ = 1.05;
const NET_H = 1.3;
const NET_LOW = 0.82;
const BALL_R = 0.11;

// Bots 0, 1: team A (x < 0); bots 2, 3: team B (x > 0).
const HOME = [[-1.3, 0.5], [-0.8, -0.5], [1.3, -0.5], [0.8, 0.5]];
const SERVE = [[-2.0, 0.3], [2.0, -0.3]];
const COLORS = ['#2E86DE', '#16a085', '#e74c3c', '#ff7a59'];
const HIT_Y = { serve: 1.25, bump: 0.62, set: 1.4, spike: 1.75, over: 0.62, toss: 0.9 };
const DUR = { serve: 1.7, bump: 1.15, set: 1.1, spike: 0.7, over: 1.4, toss: 2.0 };
const ARC = { serve: 1.4, bump: 1.0, set: 1.0, spike: 0.05, over: 1.1, toss: 0.6 };
// h: hitter, r: next to touch it (null: it lands), to: where r will be.
const RAW = [
  { h: 0, t: 'serve', r: 2, to: [1.3, -0.45] },
  { h: 2, t: 'bump', r: 3, to: [0.7, 0.35] },
  { h: 3, t: 'set', r: 2, to: [0.55, -0.35] },
  { h: 2, t: 'spike', r: 1, to: [-1.2, -0.45] },
  { h: 1, t: 'bump', r: 0, to: [-0.7, 0.4] },
  { h: 0, t: 'set', r: 1, to: [-0.55, -0.3] },
  { h: 1, t: 'spike', r: null, to: [1.5, 0.7] },
  { h: null, t: 'toss', r: 2, to: SERVE[1] },
  { h: 2, t: 'serve', r: 0, to: [-1.35, 0.45] },
  { h: 0, t: 'bump', r: 1, to: [-0.6, -0.4] },
  { h: 1, t: 'over', r: 3, to: [1.0, 0.5] },
  { h: 3, t: 'bump', r: 2, to: [0.6, -0.4] },
  { h: 2, t: 'set', r: 3, to: [0.5, 0.35] },
  { h: 3, t: 'spike', r: null, to: [-1.6, -0.65] },
  { h: null, t: 'toss', r: 0, to: SERVE[0] },
];

// Precompute every segment: bot start/end spots and the ball's flight.
const SEQ = (() => {
  const jitter = (k, i) => [Math.sin(k * 7.1 + i * 3.3) * 0.22, Math.cos(k * 5.3 + i * 2.1) * 0.2];
  const ends = RAW.map((s, k) => [0, 1, 2, 3].map((i) => (i === s.r ? s.to : [HOME[i][0] + jitter(k, i)[0], HOME[i][1] + jitter(k, i)[1]])));
  const out = [];
  let t0 = 0;
  RAW.forEach((s, k) => {
    const prev = ends[(k - 1 + RAW.length) % RAW.length];
    const next = RAW[(k + 1) % RAW.length];
    const dir = s.r === null ? 0 : s.r < 2 ? 1 : -1; // ball sits a bit in front of the receiver
    const to = s.r === null ? [s.to[0], BALL_R, s.to[1]] : [s.to[0] + dir * 0.18, HIT_Y[next.t], s.to[1]];
    out.push({ ...s, t0, dur: DUR[s.t], start: prev, end: ends[k], ballTo: to, next: next.t });
    t0 += DUR[s.t];
  });
  out.forEach((s, k) => {
    s.ballFrom = out[(k - 1 + out.length) % out.length].ballTo;
  });
  return { list: out, total: t0 };
})();

const BALL_GEO = new THREE.IcosahedronGeometry(BALL_R, 1);
const BALL_MAT = std('#fff6dc', { roughness: 0.5 });
const BAND_GEO = new THREE.TorusGeometry(BALL_R * 0.98, 0.02, 4, 14);
const BAND_MAT = std('#2E86DE');
const BAND2_MAT = std('#ffde69');
const SHADOW_GEO = new THREE.CircleGeometry(0.16, 12).rotateX(-Math.PI / 2);
const POST_MAT = std('#e8e2d4');

let netTex = null;
function netTexture() {
  if (netTex) return netTex;
  netTex = canvasTexture(256, 48, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#1e2430';
    g.lineWidth = 2;
    for (let x = 0; x <= w; x += 10) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 0; y <= h; y += 10) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  });
  return netTex;
}

// Court lines draped over the sand (local coordinates, world heights).
function courtLines() {
  const pos = [];
  const idx = [];
  const W = 0.05;
  const seg = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 0.3));
    const nx = (-(bz - az) / len) * W;
    const nz = ((bx - ax) / len) * W;
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n;
      const z = az + ((bz - az) * i) / n;
      pos.push(x - nx, F.gy(x - nx, z - nz) + 0.025, z - nz, x + nx, F.gy(x + nx, z + nz) + 0.025, z + nz);
      if (i < n) {
        const k = base + i * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  };
  seg(-HX, -HZ, HX, -HZ);
  seg(HX, -HZ, HX, HZ);
  seg(HX, HZ, -HX, HZ);
  seg(-HX, HZ, -HX, -HZ);
  seg(0, -HZ, 0, HZ);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function findSeg(t) {
  const list = SEQ.list;
  for (let k = list.length - 1; k >= 0; k--) if (t >= list[k].t0) return list[k];
  return list[0];
}

export default function Volleyball({ night, animate }) {
  const bots = useRef([]);
  const ball = useRef();
  const shadow = useRef();
  const lineGeo = useMemo(courtLines, []);
  useEffect(() => () => lineGeo.dispose(), [lineGeo]);
  const shadowMat = useMemo(() => L.shadow.clone(), []);
  const netMat = useMemo(() => new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }), []);
  const rot = useRef([Math.PI / 2, Math.PI / 2, -Math.PI / 2, -Math.PI / 2]);
  const bp = useMemo(() => new THREE.Vector3(), []);
  const netY = F.gy(0, 0);

  useFrame((state, delta) => {
    if (night) return;
    const clock = animate ? state.clock.elapsedTime : 0.5;
    const dt = animate ? Math.min(delta, 0.1) : 1;
    const t = clock % SEQ.total;
    const s = findSeg(t);
    const f = Math.min(1, (t - s.t0) / s.dur);

    // Ball
    const [ax, ay, az] = s.ballFrom;
    const [bx, by, bz] = s.ballTo;
    if (s.t === 'toss') {
      if (f < 0.3) {
        const k = f / 0.3;
        bp.set(ax, ay + Math.abs(Math.sin(k * Math.PI * 2)) * 0.28 * (1 - k), az);
      } else {
        const k = (f - 0.3) / 0.7;
        bp.set(ax + (bx - ax) * k, ay + (by - ay) * k + 4 * ARC.toss * k * (1 - k), az + (bz - az) * k);
      }
    } else {
      const top = ARC[s.t] + Math.max(0, (Math.max(ay, by) - (ay + by) / 2));
      bp.set(ax + (bx - ax) * f, ay + (by - ay) * f + 4 * top * f * (1 - f), az + (bz - az) * f);
    }
    const ballGround = F.gy(bp.x, bp.z);
    if (ball.current) {
      ball.current.position.set(F.wx(bp.x, bp.z), ballGround + bp.y, F.wz(bp.x, bp.z));
      if (animate) ball.current.rotation.set(clock * 7, clock * 4, 0);
    }
    if (shadow.current) {
      shadow.current.position.set(F.wx(bp.x, bp.z), ballGround + 0.03, F.wz(bp.x, bp.z));
      const k = Math.min(1, bp.y / 3);
      shadow.current.scale.setScalar(1 - k * 0.45);
      shadowMat.opacity = 0.28 * (1 - k * 0.6);
    }

    // Bots
    const scored = s.t === 'toss' ? (s.ballFrom[0] > 0 ? 0 : 1) : -1; // team that won the point
    for (let i = 0; i < 4; i++) {
      const b = bots.current[i];
      if (!b) continue;
      b.reset();
      const team = i < 2 ? 0 : 1;
      const [sx, sz] = s.start[i];
      const [ex, ez] = s.end[i];
      const m = ease(Math.min(1, f / 0.8));
      const x = sx + (ex - sx) * m;
      const z = sz + (ez - sz) * m;
      const moving = animate && Math.hypot(ex - sx, ez - sz) > 0.08 && f < 0.8;
      let lift = 0;
      // face the ball (or the net when it's right overhead)
      const dx = bp.x - x;
      const dz = bp.z - z;
      const want = Math.hypot(dx, dz) > 0.5 ? Math.atan2(dx, dz) : team === 0 ? Math.PI / 2 : -Math.PI / 2;
      rot.current[i] = lerpAngle(rot.current[i], want, Math.min(1, dt * 7));
      if (moving) walkCycle(b, clock * 1.15 + i);
      else b.pose.rotation.x = 0.12; // ready stance, leaning in
      b.head.rotation.x = -Math.min(0.6, Math.max(0, Math.atan2(bp.y - 1.1, Math.hypot(dx, dz) + 0.3)) * 0.8);

      // follow-through right after hitting
      if (s.h === i && f < 0.3) {
        const k = 1 - f / 0.3;
        if (s.t === 'serve') b.armR.rotation.set(-2.6 * k - 0.3, 0, 0.1);
        else if (s.t === 'set') {
          b.armL.rotation.set(-2.8 * k, 0, 0.2);
          b.armR.rotation.set(-2.8 * k, 0, -0.2);
        } else if (s.t === 'spike') {
          b.armR.rotation.set(-3.0 + (f / 0.3) * 2.0, 0, 0.1);
          lift = 0.42 * (1 - f / 0.3) ** 2;
        } else {
          b.armL.rotation.set(-1.0 * k, 0, 0.3 * k);
          b.armR.rotation.set(-1.0 * k, 0, -0.3 * k);
        }
      }
      // getting ready for the ball
      if (s.r === i && f > 0.55) {
        const k = (f - 0.55) / 0.45;
        if (s.next === 'set') {
          b.armL.rotation.set(-2.8 * k, 0, 0.2 * k);
          b.armR.rotation.set(-2.8 * k, 0, -0.2 * k);
        } else if (s.next === 'spike') {
          b.armR.rotation.set(-3.0 * k, 0, 0.1);
          b.armL.rotation.set(-1.6 * k, 0, -0.2 * k);
          lift = Math.max(0, (f - 0.65) / 0.35) ** 0.7 * 0.42;
        } else if (s.next === 'serve') {
          b.armL.rotation.set(-1.2 * k, 0, 0); // catch the toss, ready to serve
        } else {
          b.armL.rotation.set(-1.0 * k, 0, 0.3 * k);
          b.armR.rotation.set(-1.0 * k, 0, -0.3 * k);
        }
      }
      // point! the winners hop with their arms up
      if (scored === team && animate && f < 0.6) {
        lift = Math.abs(Math.sin(f * Math.PI * 5)) * 0.15;
        b.armL.rotation.set(-2.9, 0, -0.3);
        b.armR.rotation.set(-2.9, 0, 0.3);
      } else if (scored >= 0 && scored !== team && f < 0.5 && s.r !== i) {
        b.head.rotation.x = 0.35;
      }
      b.root.position.set(F.wx(x, z), F.gy(x, z) + lift * 1.35, F.wz(x, z));
      b.root.rotation.y = F.rotY + rot.current[i];
    }
  });

  return (
    <group>
      <StaticMerge>
      <group position={[F.x, 0, F.z]} rotation={[0, F.rotY, 0]}>
        <mesh geometry={lineGeo} material={L.courtLine} />
        {[-HZ - 0.35, HZ + 0.35].map((z) => (
          <Cyl key={z} p={[0, F.gy(0, z) + NET_H / 2, z]} rt={0.04} h={NET_H + 0.1} m={POST_MAT} />
        ))}
        <mesh position={[0, netY + (NET_H + NET_LOW) / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={netMat}>
          <planeGeometry args={[2 * HZ + 0.7, NET_H - NET_LOW]} />
        </mesh>
        <mesh position={[0, netY + NET_H, 0]} material={L.white}>
          <boxGeometry args={[0.03, 0.05, 2 * HZ + 0.7]} />
        </mesh>
      </group>
      </StaticMerge>
      {!night && (
        <>
          {COLORS.map((c, i) => (
            <MiniBot key={i} ref={(r) => (bots.current[i] = r)} color={c} />
          ))}
          <group ref={ball}>
            <mesh geometry={BALL_GEO} material={BALL_MAT} />
            <mesh geometry={BAND_GEO} material={BAND_MAT} />
            <mesh geometry={BAND_GEO} material={BAND2_MAT} rotation={[Math.PI / 2, 0, 0]} />
          </group>
          <mesh ref={shadow} geometry={SHADOW_GEO} material={shadowMat} />
        </>
      )}
    </group>
  );
}
