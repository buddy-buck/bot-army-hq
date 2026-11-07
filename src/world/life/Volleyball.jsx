import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import MiniBot from '../MiniBot.jsx';
import { SITES, groundY, islandE } from '../../utils/paths.js';
import { aliveClock } from '../../wild/director.js';
import { Beam, Box, Cyl, LM, canvasTexture, resetBot, seeded, smooth, std, usePoseOnce, walkPose } from './common.jsx';

// Beach volleyball, 2 v 2, on the court north of the lanai. The whole game
// is a deterministic schedule (rallies made once from a seeded random), so
// every frame just looks up where the ball and the players are: no physics,
// no allocations. Each rally: a serve, then bump, set and hit over the net a
// few times, until someone spikes it into the sand. The scoring pair hops
// with their arms up, then they serve again.
// At bedtime the court is empty: the net stands, the ball rests in the sand.

const C = SITES.volleyball; // net runs north-south through C.x
const NET_HALF = 1.65; // posts just outside the court's long sides
const NET_TOP = 1.15; // above the sand
const NET_DROP = 0.5; // height of the mesh band
const BALL_R = 0.11;
const TEAM_COLORS = [
  ['#ff8a5c', '#ffb84d'], // west pair (warm)
  ['#4aa8ff', '#7ad0ff'], // east pair (cool)
];
// player index = team * 2 + k
const BASE = [
  [12.0, -6.1],
  [12.6, -5.0],
  [14.75, -5.1],
  [14.2, -6.15],
];
const SIDE = (team) => (team === 0 ? -1 : 1); // -1 west of the net, +1 east

// Contact heights above the sand.
const H = { bump: 0.5, set: 1.2, hit: 1.4, serve: 1.45, hold: 0.75 };

const onCourt = (x, z) => islandE(x, z) < 0.79;

// A random spot on a team's side: depth = distance from the net.
function spot(rand, team, d0, d1) {
  for (let k = 0; k < 12; k++) {
    const x = C.x + SIDE(team) * (d0 + rand() * (d1 - d0));
    const z = C.z + (rand() * 2 - 1) * (C.hz - 0.3);
    if (onCourt(x, z)) return [x, z];
  }
  return [C.x + SIDE(team) * d0, C.z];
}

// Build a loop of rallies. Times are seconds from the rally's start.
function buildGame(count = 36) {
  const rand = seeded(2024);
  const rallies = [];
  let pos = BASE.map((b) => [...b]);
  let server = 0; // player index
  let start = 0;
  for (let n = 0; n < count; n++) {
    const segs = [];
    const touches = [];
    const kf = [0, 1, 2, 3].map((i) => [{ t: 0, x: pos[i][0], z: pos[i][1] }]);
    const sTeam = server >> 1;
    const serveSpot = [C.x + SIDE(sTeam) * (C.hx - (sTeam ? 0.8 : 0.55)), C.z + (rand() - 0.5) * 0.9];
    kf[server].push({ t: 1.2, x: serveSpot[0], z: serveSpot[1] });
    for (let i = 0; i < 4; i++) if (i !== server) kf[i].push({ t: 1.2, x: BASE[i][0], z: BASE[i][1] });
    const g = (x, z) => groundY(x, z);
    const pt = (x, z, h) => [x, g(x, z) + h, z];
    // a flight from a to b; lift the arc so it clears the net if it crosses
    const fly = (t0, dur, a, b, apex) => {
      let h = apex;
      if (Math.sign(a[0] - C.x) !== Math.sign(b[0] - C.x)) {
        const u = Math.abs(a[0] - C.x) / Math.abs(a[0] - b[0]);
        const zn = a[2] + (b[2] - a[2]) * u;
        const need = g(C.x, zn) + NET_TOP + BALL_R + 0.12;
        const lin = a[1] + (b[1] - a[1]) * u;
        h = Math.max(h, (need - lin) / (4 * u * (1 - u)));
      }
      segs.push({ t0, t1: t0 + dur, a, b, h });
      return t0 + dur;
    };
    // toss
    const ts = 2.4;
    const hold = pt(serveSpot[0], serveSpot[1], H.hold);
    const contact = pt(serveSpot[0], serveSpot[1], H.serve);
    segs.push({ t0: 0, t1: ts - 0.7, a: hold, b: hold, h: 0 });
    fly(ts - 0.7, 0.7, hold, contact, 0.55);
    touches.push({ t: ts, p: server, kind: 'serve' });
    kf[server].push({ t: ts + 1.0, x: BASE[server][0], z: BASE[server][1] });
    // rally
    let team = 1 - sTeam;
    let crossings = 1 + Math.floor(rand() * 4);
    let receiver = team * 2 + (rand() < 0.5 ? 0 : 1);
    let at = spot(rand, team, 1.0, C.hx - 0.4);
    let t = fly(ts, 1.35, contact, pt(at[0], at[1], H.bump), 0.9);
    let killed = null;
    for (;;) {
      const setter = receiver ^ 1;
      kf[receiver].push({ t, x: at[0], z: at[1] });
      touches.push({ t, p: receiver, kind: 'bump' });
      const setAt = spot(rand, team, 0.55, 1.0);
      const tSet = fly(t, 1.05, pt(at[0], at[1], H.bump), pt(setAt[0], setAt[1], H.set), 1.0);
      kf[setter].push({ t: tSet, x: setAt[0], z: setAt[1] });
      touches.push({ t: tSet, p: setter, kind: 'set' });
      kf[setter].push({ t: tSet + 1.0, x: BASE[setter][0], z: BASE[setter][1] });
      const hitAt = spot(rand, team, 0.35, 0.7);
      const tHit = fly(tSet, 0.95, pt(setAt[0], setAt[1], H.set), pt(hitAt[0], hitAt[1], H.hit), 0.8);
      kf[receiver].push({ t: tHit, x: hitAt[0], z: hitAt[1] });
      crossings -= 1;
      const other = 1 - team;
      if (crossings <= 0) {
        // spike into the sand, deep on the other side
        touches.push({ t: tHit, p: receiver, kind: 'spike' });
        const land = spot(rand, other, 1.4, C.hx - 0.3);
        const tLand = fly(tHit, 0.5, pt(hitAt[0], hitAt[1], H.hit), pt(land[0], land[1], BALL_R), 0.05);
        killed = { t: tLand, x: land[0], z: land[1], winner: team };
        break;
      }
      touches.push({ t: tHit, p: receiver, kind: 'hit' });
      kf[receiver].push({ t: tHit + 1.2, x: BASE[receiver][0], z: BASE[receiver][1] });
      receiver = other * 2 + (rand() < 0.5 ? 0 : 1);
      at = spot(rand, other, 1.0, C.hx - 0.4);
      t = fly(tHit, 1.1, pt(hitAt[0], hitAt[1], H.hit), pt(at[0], at[1], H.bump), 0.7);
      team = other;
    }
    // ball hops twice and rests while the winners celebrate
    const restAt = pt(killed.x + SIDE(1 - killed.winner) * 0.35, killed.z + 0.1, BALL_R);
    const b1 = fly(killed.t, 0.42, pt(killed.x, killed.z, BALL_R), restAt, 0.3);
    segs.push({ t0: b1, t1: b1 + 2.6, a: restAt, b: restAt, h: 0 });
    const dur = b1 + 2.6;
    rallies.push({ start, dur, segs, touches, kf, win: killed.winner, tWin: killed.t, rest: restAt });
    for (let i = 0; i < 4; i++) {
      const last = kf[i][kf[i].length - 1];
      pos[i] = [last.x, last.z];
    }
    server = killed.winner * 2 + (n % 2);
    start += dur;
  }
  return { rallies, total: start };
}

const GAME = buildGame();

// Where a player is at time t (seconds into the rally): stay put, then move
// to the next keyframe just in time.
function playerAt(list, t, out) {
  let k = 0;
  while (k < list.length - 1 && list[k + 1].t <= t) k++;
  const a = list[k];
  const b = list[k + 1];
  out.moving = false;
  if (!b) {
    out.x = a.x;
    out.z = a.z;
    return out;
  }
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const win = Math.min(b.t - a.t, Math.max(0.45, d / 1.7 + 0.15));
  const u = (t - (b.t - win)) / win;
  if (u <= 0) {
    out.x = a.x;
    out.z = a.z;
  } else {
    const s = smooth(u);
    out.x = a.x + (b.x - a.x) * s;
    out.z = a.z + (b.z - a.z) * s;
    out.moving = u < 1 && d > 0.05;
  }
  return out;
}

// Sand lines: thin ribbons that follow the bumpy sand.
function lineGeometry() {
  const pos = [];
  const idx = [];
  const w = 0.045;
  const add = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 0.2));
    const nx = (-(bz - az) / len) * w;
    const nz = ((bx - ax) / len) * w;
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n;
      const z = az + ((bz - az) * i) / n;
      pos.push(x + nx, groundY(x + nx, z + nz) + 0.018, z + nz, x - nx, groundY(x - nx, z - nz) + 0.018, z - nz);
      if (i < n) {
        const k = base + i * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  };
  const x0 = C.x - C.hx;
  const x1 = C.x + C.hx;
  const z0 = C.z - C.hz;
  const z1 = C.z + C.hz;
  add(x0 - w, z0, x1 + w, z0);
  add(x0 - w, z1, x1 + w, z1);
  add(x0, z0, x0, z1);
  add(x1, z0, x1, z1);
  add(C.x, z0, C.x, z1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const netTexture = () =>
  canvasTexture('volley-net', 256, 40, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,40,48,0.9)';
    g.lineWidth = 2;
    for (let x = 0; x <= w; x += 10) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 1; y <= h; y += 10) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  });

const BALL_MAT = [std('#ffffff', { roughness: 0.6 }), std('#ffd23f', { roughness: 0.6 }), std('#3d7be5', { roughness: 0.6 })];
const BALL_GEO = new THREE.IcosahedronGeometry(BALL_R, 1);
const STRIPE_GEO = new THREE.TorusGeometry(BALL_R * 0.98, 0.022, 4, 12);
const SHADOW_GEO = new THREE.CircleGeometry(0.13, 12).rotateX(-Math.PI / 2);

function Ball({ innerRef, shadowRef }) {
  return (
    <>
      <group ref={innerRef}>
        <mesh geometry={BALL_GEO} material={BALL_MAT[0]} />
        <mesh geometry={STRIPE_GEO} material={BALL_MAT[1]} />
        <mesh geometry={STRIPE_GEO} material={BALL_MAT[2]} rotation={[Math.PI / 2, 0, 0]} />
      </group>
      <mesh ref={shadowRef} geometry={SHADOW_GEO} material={LM.shadow} />
    </>
  );
}

function Net() {
  const tex = useMemo(() => netTexture(), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05 }), [tex]);
  useEffect(() => () => mat.dispose(), [mat]);
  const gN = groundY(C.x, C.z - NET_HALF);
  const gS = groundY(C.x, C.z + NET_HALF);
  const gm = Math.max(gN, gS, groundY(C.x, C.z));
  const top = gm + NET_TOP;
  return (
    <group>
      {[[C.z - NET_HALF, gN], [C.z + NET_HALF, gS]].map(([z, g]) => (
        <group key={z}>
          <Cyl p={[C.x, (g - 0.15 + top + 0.08) / 2, z]} rt={0.045} rb={0.055} h={top + 0.08 - g + 0.15} m={LM.white} seg={7} />
          <Cyl p={[C.x, top + 0.1, z]} rt={0.06} h={0.04} m={LM.red} seg={7} />
          {/* guy rope, staked in the sand */}
          <Beam a={[C.x, top + 0.04, z]} b={[C.x, groundY(C.x, z + Math.sign(z - C.z) * 0.6) + 0.02, z + Math.sign(z - C.z) * 0.6]} r={0.008} m={LM.rope} seg={3} />
          <Cyl p={[C.x, groundY(C.x, z + Math.sign(z - C.z) * 0.6) + 0.04, z + Math.sign(z - C.z) * 0.6]} rt={0.02} rb={0.012} h={0.1} m={LM.darkWood} seg={4} />
        </group>
      ))}
      <mesh position={[C.x, top - NET_DROP / 2, C.z]} rotation={[0, Math.PI / 2, 0]} material={mat}>
        <planeGeometry args={[NET_HALF * 2, NET_DROP]} />
      </mesh>
      <Box p={[C.x, top - 0.02, C.z]} s={[0.03, 0.06, NET_HALF * 2]} m={LM.white} />
      <Box p={[C.x, top - NET_DROP, C.z]} s={[0.02, 0.025, NET_HALF * 2]} m={LM.white} />
    </group>
  );
}

// A towel, a cooler and a spare ball by the north sideline.
function Sideline() {
  const tx = C.x - 1.3;
  const tz = C.z - C.hz - 0.75;
  const cx = C.x + 0.6;
  const cz = C.z - C.hz - 0.7;
  return (
    <group>
      <group position={[tx, groundY(tx, tz) + 0.012, tz]} rotation={[0, 0.25, 0]}>
        <Box p={[0, 0, 0]} s={[0.9, 0.012, 0.45]} m={LM.teal} />
        <Box p={[0, 0.002, 0]} s={[0.9, 0.013, 0.1]} m={LM.white} />
      </group>
      <group position={[cx, groundY(cx, cz), cz]} rotation={[0, -0.3, 0]}>
        <Box p={[0, 0.14, 0]} s={[0.42, 0.28, 0.3]} m={LM.white} />
        <Box p={[0, 0.3, 0]} s={[0.44, 0.05, 0.32]} m={LM.blue} />
      </group>
    </group>
  );
}

// lit, so the lines dim with the island at night
const lineMat = new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 1, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2 });

export default function Volleyball({ animate, bedtime }) {
  const lines = useMemo(() => lineGeometry(), []);
  useEffect(() => () => lines.dispose(), [lines]);
  const bots = [useRef({}), useRef({}), useRef({}), useRef({})];
  const ball = useRef();
  const shadow = useRef();
  const clock = useMemo(() => aliveClock(), []);
  const tmp = useMemo(() => ({ x: 0, z: 0, moving: false }), []);
  usePoseOnce(animate, bedtime);

  // Resting ball for bedtime: by the north-west post.
  const restX = C.x - 0.45;
  const restZ = C.z - C.hz - 0.35;

  useFrame((_, delta) => {
    const b = ball.current;
    const sh = shadow.current;
    if (!b || !sh) return;
    if (bedtime) {
      b.position.set(restX, groundY(restX, restZ) + BALL_R - 0.02, restZ);
      b.rotation.set(0.3, 0.8, 0);
      sh.position.set(restX, groundY(restX, restZ) + 0.015, restZ);
      return;
    }
    // reduced motion: a frozen moment mid-rally (the setter's touch)
    const tt = animate ? clock.tick(delta) % GAME.total : GAME.rallies[0].start + GAME.rallies[0].touches[2].t - 0.35;
    let r = GAME.rallies[0];
    for (const q of GAME.rallies) {
      if (tt >= q.start && tt < q.start + q.dur) {
        r = q;
        break;
      }
    }
    const t = tt - r.start;

    // Ball
    let seg = r.segs[r.segs.length - 1];
    for (const s of r.segs) {
      if (t < s.t1) {
        seg = s;
        break;
      }
    }
    const u = Math.min(1, Math.max(0, (t - seg.t0) / (seg.t1 - seg.t0)));
    const bx = seg.a[0] + (seg.b[0] - seg.a[0]) * u;
    const bz = seg.a[2] + (seg.b[2] - seg.a[2]) * u;
    const by = seg.a[1] + (seg.b[1] - seg.a[1]) * u + 4 * seg.h * u * (1 - u);
    b.position.set(bx, by, bz);
    if (seg.a !== seg.b) {
      b.rotation.x += Math.min(delta, 0.1) * 7;
      b.rotation.z += Math.min(delta, 0.1) * 4;
    }
    const gy = groundY(bx, bz);
    sh.position.set(bx, gy + 0.015, bz);
    const k = Math.max(0.35, 1 - (by - gy) / 3);
    sh.scale.set(k, 1, k);

    // Players
    const celebrating = t >= r.tWin;
    for (let i = 0; i < 4; i++) {
      const p = bots[i].current;
      if (!resetBot(p)) continue;
      playerAt(r.kf[i], t, tmp);
      const team = i >> 1;
      let y = groundY(tmp.x, tmp.z);
      p.root.rotation.y = team === 0 ? Math.PI / 2 : -Math.PI / 2;
      const w = (animate ? tt : 0) * 9 + i;
      // ready stance: arms a little forward, a small bounce
      p.armL.rotation.x = -0.45;
      p.armR.rotation.x = -0.45;
      p.pose.position.y = Math.abs(Math.sin(w * 0.35)) * 0.015;
      if (tmp.moving) {
        walkPose(p, w, false);
        p.footL.position.x = -0.08 + Math.sin(w) * 0.03;
        p.footR.position.x = 0.08 + Math.sin(w) * 0.03;
      } else if (!celebrating) {
        // the player's own ball still coming: watch it
        p.head.rotation.y = Math.max(-0.6, Math.min(0.6, (bz - tmp.z) * (team === 0 ? -0.3 : 0.3)));
        p.head.rotation.x = -Math.min(0.5, Math.max(0, (by - y - 1.2) * 0.25));
      }
      // touches near now
      for (const tc of r.touches) {
        if (tc.p !== i) continue;
        const d = t - tc.t;
        if (d < -0.5 || d > 0.45) continue;
        const wgt = 1 - smooth(Math.abs(d) / (d < 0 ? 0.5 : 0.45));
        if (tc.kind === 'bump') {
          p.armL.rotation.x = -0.45 - 0.55 * wgt;
          p.armR.rotation.x = -0.45 - 0.55 * wgt;
          p.armL.rotation.z = 0.35 * wgt;
          p.armR.rotation.z = -0.35 * wgt;
          p.pose.rotation.x = 0.18 * wgt;
          p.pose.position.y -= 0.04 * wgt;
        } else if (tc.kind === 'set') {
          p.armL.rotation.x = -0.45 - 2.35 * wgt;
          p.armR.rotation.x = -0.45 - 2.35 * wgt;
          p.armL.rotation.z = 0.2 * wgt;
          p.armR.rotation.z = -0.2 * wgt;
          p.head.rotation.x = -0.45 * wgt;
        } else if (tc.kind === 'serve') {
          // toss with the left, swing with the right
          p.armL.rotation.x = -0.45 - 2.1 * wgt;
          const sw = d < 0 ? -3.0 : -3.0 + Math.min(1, d / 0.25) * 2.3;
          p.armR.rotation.x = -0.45 + (sw + 0.45) * wgt;
          p.head.rotation.x = -0.4 * wgt;
        } else {
          // hit / spike: jump, wind up, swing through
          const jump = tc.kind === 'spike' ? 0.42 : 0.24;
          if (d > -0.42 && d < 0.4) y += Math.sin(((d + 0.42) / 0.82) * Math.PI) * jump;
          const sw = d < 0 ? -3.0 : -3.0 + Math.min(1, d / 0.18) * 2.5;
          p.armR.rotation.x = -0.45 + (sw + 0.45) * wgt;
          p.armL.rotation.x = -0.45 - 1.4 * wgt;
          p.pose.rotation.x = (d > 0 ? 0.2 : -0.15) * wgt;
        }
      }
      if (celebrating) {
        const k2 = t - r.tWin;
        if (team === r.win) {
          // hop, arms up, a little spin for one of them
          const hop = Math.abs(Math.sin(k2 * 7 + i));
          y += hop * 0.18 * Math.max(0, 1 - k2 / 3.2);
          p.armL.rotation.x = -2.9 + Math.sin(k2 * 7 + i) * 0.2;
          p.armR.rotation.x = -2.9 - Math.sin(k2 * 7 + i) * 0.2;
          p.armL.rotation.z = -0.35;
          p.armR.rotation.z = 0.35;
          if (i % 2 === 0 && k2 < 1.0) p.pose.rotation.y = smooth(k2) * Math.PI * 2;
        } else {
          // shrug and look down
          p.head.rotation.x = 0.35;
          p.armL.rotation.z = -0.35 * Math.min(1, k2 * 2);
          p.armR.rotation.z = 0.35 * Math.min(1, k2 * 2);
          p.armL.rotation.x = -0.6;
          p.armR.rotation.x = -0.6;
        }
      }
      p.root.position.set(tmp.x, y, tmp.z);
    }
  });

  return (
    <group>
      <mesh geometry={lines} material={lineMat} renderOrder={1} />
      <Net />
      <Sideline />
      <Ball innerRef={ball} shadowRef={shadow} />
      {!bedtime &&
        BASE.map((b, i) => (
          <MiniBot key={i} color={TEAM_COLORS[i >> 1][i % 2]} parts={bots[i]} position={[b[0], groundY(b[0], b[1]), b[1]]} rotationY={i < 2 ? Math.PI / 2 : -Math.PI / 2} />
        ))}
    </group>
  );
}
