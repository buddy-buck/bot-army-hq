import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import StaticMerge from '../../utils/StaticMerge.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import { rareGap } from '../director.js';
import MiniBot, { extraColor } from '../MiniBot.jsx';
import { Beam, Box, Cyl, LM, angleLerp, easeInOut, easeInQuad, easeOutQuad, lerp, makeCanvasTexture, signTexture, smooth, std, useGlow, useSignMaterial } from './common.jsx';

// The little airstrip on the back (north) of the island: runway with
// markings and edge lights, a terminal shed, a windsock and a tiny control
// tower. Every few minutes a prop plane lands from the east, drops off new
// recruits, then takes off to the west.

const RW = SITES.runway;
const TERM = SITES.terminal;
export const RW_Y = 0.44; // runway surface height (a low embankment at the ends)
const RW_X0 = RW.x - RW.len / 2;
const RW_X1 = RW.x + RW.len / 2;
// The apron: a concrete pad between the runway's east end and the terminal.
const APRON = { x0: 4.9, x1: 7.9, z0: RW.z + RW.width / 2 + 0.15, z1: -10.25 };
const TERM_ROT = -0.9; // faces the apron and the camera
const WINDSOCK = { x: 3.4, z: -10.75 };
const CTRL = { x: 10.6, z: -9.3 };

const M = {
  termWall: std('#fdf8ee'),
  termTrim: std('#19469D'),
  termRoof: std('#8fa3b0'),
  sockA: std('#ff6a1a', { side: THREE.DoubleSide }),
  sockB: std('#fdf8ee', { side: THREE.DoubleSide }),
  planeWhite: std('#fdf8ee', { roughness: 0.5 }),
  planeRed: std('#e23b3b', { roughness: 0.5 }),
  planeYellow: std('#FFDE69', { roughness: 0.5 }),
  planeDark: std('#2b2a33', { roughness: 0.5 }),
  planeWin: std('#2c4a6e', { roughness: 0.25 }),
  prop: std('#3a3a40', { roughness: 0.4 }),
  lights: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
};

function runwayTexture(hi) {
  const W = hi ? 2048 : 1024;
  const H = Math.round((W * RW.width) / RW.len);
  return makeCanvasTexture(W, H, (x) => {
    const u = W / RW.len; // pixels per world unit
    x.fillStyle = '#44464c';
    x.fillRect(0, 0, W, H);
    // a little asphalt speckle
    for (let i = 0; i < W * 0.6; i++) {
      x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      x.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    x.fillStyle = '#f4f1e8';
    // side stripes
    x.fillRect(0.15 * u, 0.08 * u, W - 0.3 * u, 0.05 * u);
    x.fillRect(0.15 * u, H - 0.13 * u, W - 0.3 * u, 0.05 * u);
    // threshold "piano keys" at both ends
    const keys = 6;
    for (const end of [0, 1]) {
      const x0 = end ? W - 0.75 * u : 0.25 * u;
      for (let k = 0; k < keys; k++) {
        const zz = 0.25 * u + ((H - 0.5 * u) * k) / keys;
        x.fillRect(x0, zz + 0.03 * u, 0.5 * u, (H - 0.5 * u) / keys - 0.08 * u);
      }
    }
    // centerline dashes
    for (let d = 2.8 * u; d < W - 2.8 * u; d += 0.9 * u) x.fillRect(d, H / 2 - 0.03 * u, 0.5 * u, 0.06 * u);
    // numbers, readable from each approach
    x.font = `900 ${Math.round(0.62 * u)}px "Arial Black", Arial, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (const [label, cx, rot] of [
      ['09', 1.4 * u, Math.PI / 2],
      ['27', W - 1.4 * u, -Math.PI / 2],
    ]) {
      x.save();
      x.translate(cx, H / 2);
      x.rotate(rot);
      x.fillText(label, 0, 0);
      x.restore();
    }
  });
}

// --- Runway, edge lights ---------------------------------------------------------

const LIGHT_GEO = new THREE.IcosahedronGeometry(0.06, 0);
function EdgeLights({ night }) {
  const ref = useRef();
  const list = useMemo(() => {
    const out = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x = RW_X0 + 0.3 + ((RW.len - 0.6) * i) / (n - 1);
      for (const s of [-1, 1]) out.push([x, RW.z + s * (RW.width / 2 + 0.12), '#ffe9a8']);
    }
    for (let k = 0; k < 4; k++) {
      const z = RW.z - 0.65 + (k * 1.3) / 3;
      out.push([RW_X0 - 0.15, z, '#5dff8a']);
      out.push([RW_X1 + 0.15, z, '#5dff8a']);
    }
    return out;
  }, []);
  useEffect(() => {
    const mesh = ref.current;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    list.forEach(([x, z, col], i) => {
      m.makeTranslation(x, RW_Y + 0.05, z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(col));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [list]);
  useEffect(() => {
    M.lights.color.setScalar(0.45 + night * 1.4);
  }, [night]);
  return <instancedMesh ref={ref} args={[LIGHT_GEO, M.lights, list.length]} />;
}

function Runway({ night, lowPower }) {
  const top = useMemo(() => {
    const map = runwayTexture(!lowPower);
    return new THREE.MeshStandardMaterial({
      map,
      roughness: 0.95,
      flatShading: true,
    });
  }, [lowPower]);
  useEffect(() => () => (top.map.dispose(), top.dispose()), [top]);
  return (
    <StaticMerge>
      {/* embankment so the ends sit level over the falling beach */}
      <Box p={[RW.x, RW_Y - 0.3, RW.z]} s={[RW.len + 0.3, 0.58, RW.width + 0.3]} m={LM.asphalt} />
      <mesh position={[RW.x, RW_Y + 0.003, RW.z]} rotation={[-Math.PI / 2, 0, 0]} material={top}>
        <planeGeometry args={[RW.len, RW.width]} />
      </mesh>
      {/* apron */}
      <Box p={[(APRON.x0 + APRON.x1) / 2, RW_Y - 0.26, (APRON.z0 + APRON.z1) / 2]} s={[APRON.x1 - APRON.x0, 0.5, APRON.z1 - APRON.z0]} m={LM.concrete} />
      <EdgeLights night={night} />
    </StaticMerge>
  );
}

// --- Terminal, windsock, control tower --------------------------------------------

function Terminal({ night }) {
  const sign = useSignMaterial(
    () =>
      signTexture({
        text: 'BOT AIR',
        bg: '#19469D',
        fg: '#FFDE69',
        border: '#FFDE69',
      }),
    night
  );
  const win = useGlow('#ffcf6a', night, 0.05, 1.1);
  const y = groundY(TERM.x, TERM.z);
  return (
    <group position={[TERM.x, y, TERM.z]} rotation={[0, TERM_ROT, 0]}>
      <StaticMerge>
        <Box p={[0, -0.05, 0]} s={[2.7, 0.3, 1.7]} m={LM.concrete} />
        <Box p={[0, 0.6, 0]} s={[2.4, 1.0, 1.3]} m={M.termWall} />
        <Box p={[0, 0.16, 0]} s={[2.42, 0.14, 1.32]} m={M.termTrim} />
        {/* gently sloped roof with an overhang over the front */}
        <Box p={[0, 1.17, 0.1]} s={[2.7, 0.1, 1.75]} m={M.termRoof} r={[0.08, 0, 0]} />
        {/* doors and windows on the front */}
        <Box p={[-0.45, 0.48, 0.66]} s={[0.46, 0.74, 0.04]} m={LM.glass} />
        <Box p={[-0.45, 0.86, 0.67]} s={[0.52, 0.05, 0.04]} m={M.termTrim} />
        <Box p={[0.45, 0.68, 0.66]} s={[0.36, 0.3, 0.04]} m={win} />
        <Box p={[0.92, 0.68, 0.66]} s={[0.36, 0.3, 0.04]} m={win} />
        <mesh position={[0.68, 0.97, 0.68]} material={sign}>
          <planeGeometry args={[0.9, 0.22]} />
        </mesh>
        {/* bench out front */}
        <Box p={[0.7, 0.24, 0.95]} s={[0.8, 0.05, 0.22]} m={LM.plank} />
        <Box p={[0.4, 0.12, 0.95]} s={[0.05, 0.22, 0.2]} m={LM.darkWood} />
        <Box p={[1.0, 0.12, 0.95]} s={[0.05, 0.22, 0.2]} m={LM.darkWood} />
      </StaticMerge>
    </group>
  );
}

function Windsock({ animate }) {
  const root = useRef();
  const segs = useRef([]);
  const y = groundY(WINDSOCK.x, WINDSOCK.z);
  const N = 4;
  const L = 0.2;
  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    if (root.current) root.current.rotation.y = 1.4 + 0.35 * Math.sin(t * 0.43) + 0.12 * Math.sin(t * 1.7);
    for (let i = 0; i < N; i++) {
      const g = segs.current[i];
      if (g) {
        g.rotation.x = 0.07 + 0.05 * Math.sin(t * 2.6 + i * 0.9) * (i / N + 0.3);
        g.rotation.y = 0.06 * Math.sin(t * 3.1 + i * 1.3);
      }
    }
  });
  // nested segments: each one hangs off the end of the last
  let chain = null;
  for (let i = N - 1; i >= 0; i--) {
    const r0 = 0.12 - i * 0.014;
    const r1 = 0.12 - (i + 1) * 0.014;
    chain = (
      <group ref={(g) => (segs.current[i] = g)} position={[0, 0, i === 0 ? 0 : L]}>
        <mesh position={[0, 0, L / 2]} rotation={[Math.PI / 2, 0, 0]} material={i % 2 ? M.sockB : M.sockA}>
          <cylinderGeometry args={[r1, r0, L, 8, 1, true]} />
        </mesh>
        {chain}
      </group>
    );
  }
  return (
    <group position={[WINDSOCK.x, y, WINDSOCK.z]}>
      <Cyl p={[0, 0.85, 0]} rt={0.03} rb={0.04} h={1.7} m={LM.white} seg={5} />
      <group ref={root} position={[0, 1.62, 0]}>
        <mesh material={LM.iron}>
          <torusGeometry args={[0.125, 0.012, 4, 10]} />
        </mesh>
        {chain}
      </group>
    </group>
  );
}

function ControlTower({ night, animate }) {
  const beacon = useRef();
  const y = groundY(CTRL.x, CTRL.z);
  const win = useGlow('#9fe0ff', night, 0.08, 0.9);
  const lamp = useGlow('#5dff8a', night, 0.3, 2.0);
  useFrame((state) => {
    if (beacon.current && animate) beacon.current.rotation.y = state.clock.elapsedTime * 2.2;
  });
  const H = 1.5;
  return (
    <group position={[CTRL.x, y, CTRL.z]} rotation={[0, -0.6, 0]}>
      <StaticMerge>
        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Beam key={`${sx}${sz}`} a={[sx * 0.42, -0.2, sz * 0.42]} b={[sx * 0.32, H, sz * 0.32]} r={0.045} m={LM.white} />))}
        <Beam a={[-0.4, 0.2, 0.4]} b={[0.34, H * 0.75, 0.34]} r={0.025} m={M.termTrim} />
        <Beam a={[0.4, 0.2, 0.4]} b={[-0.34, H * 0.75, 0.34]} r={0.025} m={M.termTrim} />
        <Box p={[0, H + 0.04, 0]} s={[0.95, 0.08, 0.95]} m={M.termTrim} />
        <Box p={[0, H + 0.36, 0]} s={[0.85, 0.56, 0.85]} m={win} />
        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`p${sx}${sz}`} p={[sx * 0.42, H + 0.36, sz * 0.42]} s={[0.06, 0.58, 0.06]} m={LM.white} />))}
        <Box p={[0, H + 0.7, 0]} s={[1.05, 0.1, 1.05]} m={LM.white} />
        <Cyl p={[0.3, H + 1.0, -0.3]} rt={0.015} h={0.5} m={LM.iron} seg={4} />
        <group ref={beacon} position={[0, H + 0.82, 0]} userData={{ noMerge: true }}>
          <Box p={[0, 0, 0]} s={[0.24, 0.12, 0.12]} m={lamp} />
        </group>
      </StaticMerge>
    </group>
  );
}

// --- The prop plane ---------------------------------------------------------------

const PS = 1.6; // plane scale
const GY = RW_Y + 0.23 * PS; // plane origin height when its wheels touch the runway
const CRUISE_Y = 7.5;

function Plane({ propRef }) {
  // Built nose along +z, like a bot.
  return (
    <StaticMerge>
      <group scale={PS}>
        <mesh material={M.planeWhite} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.13, 0.75, 3, 8]} />
        </mesh>
        <Box p={[0, 0.0, 0.0]} s={[0.27, 0.06, 0.6]} m={M.planeRed} />
        <Cyl p={[0, 0, 0.5]} rt={0.12} rb={0.14} h={0.1} m={M.planeRed} seg={8} r={[Math.PI / 2, 0, 0]} />
        <Box p={[0, 0.08, 0.2]} s={[0.25, 0.08, 0.16]} m={M.planeWin} />
        <Box p={[0, 0.06, -0.02]} s={[0.265, 0.07, 0.22]} m={M.planeWin} />
        {/* high wing with yellow tips */}
        <Box p={[0, 0.15, 0.1]} s={[1.5, 0.04, 0.3]} m={M.planeWhite} />
        <Box p={[0.7, 0.152, 0.1]} s={[0.12, 0.045, 0.31]} m={M.planeYellow} />
        <Box p={[-0.7, 0.152, 0.1]} s={[0.12, 0.045, 0.31]} m={M.planeYellow} />
        <Beam a={[0.12, -0.04, 0.1]} b={[0.45, 0.14, 0.1]} r={0.012} m={M.planeDark} seg={4} />
        <Beam a={[-0.12, -0.04, 0.1]} b={[-0.45, 0.14, 0.1]} r={0.012} m={M.planeDark} seg={4} />
        {/* tail */}
        <Box p={[0, 0.04, -0.5]} s={[0.56, 0.03, 0.17]} m={M.planeWhite} />
        <Box p={[0, 0.16, -0.52]} s={[0.03, 0.24, 0.19]} m={M.planeRed} />
        {/* gear */}
        <Beam a={[0.08, -0.08, 0.2]} b={[0.17, -0.18, 0.2]} r={0.012} m={M.planeDark} seg={4} />
        <Beam a={[-0.08, -0.08, 0.2]} b={[-0.17, -0.18, 0.2]} r={0.012} m={M.planeDark} seg={4} />
        <Cyl p={[0.18, -0.18, 0.2]} rt={0.05} h={0.04} m={M.planeDark} seg={8} r={[0, 0, Math.PI / 2]} />
        <Cyl p={[-0.18, -0.18, 0.2]} rt={0.05} h={0.04} m={M.planeDark} seg={8} r={[0, 0, Math.PI / 2]} />
        <Cyl p={[0, -0.13, -0.46]} rt={0.03} h={0.03} m={M.planeDark} seg={6} r={[0, 0, Math.PI / 2]} />
        {/* propeller */}
        <group ref={propRef} position={[0, 0, 0.57]} userData={{ noMerge: true }}>
          <mesh material={M.planeDark} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.045, 0.1, 6]} />
          </mesh>
          <Box p={[0, 0, 0]} s={[0.05, 0.56, 0.015]} m={M.prop} />
        </group>
      </group>
    </StaticMerge>
  );
}

// The flight as a list of segments. `to`: where the segment ends; `face`: a
// turn in place to this heading. Heading = rotation.y (nose along local +z).
const W = -Math.PI / 2; // heading west
const E = Math.PI / 2; // heading east
const PARK = { x: 6.35, z: -11.05 };
const PARK_HEAD = Math.atan2(-PARK.x, -PARK.z) + 0.15; // nose toward the island center
const LINEUP = { x: 5.3, z: RW.z };
const toLineup = Math.atan2(LINEUP.x - PARK.x, LINEUP.z - PARK.z);
const SEGS_SRC = [
  {
    to: [6.0, GY, RW.z],
    dur: 11,
    ease: (t) => t,
    yEase: (t) => 1 - (1 - t) ** 1.6,
    prop: 1,
    phase: 'approach',
  },
  {
    to: [-3, GY, RW.z],
    dur: 6,
    ease: easeOutQuad,
    prop: 0.6,
    phase: 'rollout',
  },
  { face: E, dur: 2.6, arc: 0.45, prop: 0.45 },
  { to: [5.0, GY, RW.z], dur: 6.5, ease: easeInOut, prop: 0.5 },
  { to: [PARK.x, GY, PARK.z], dur: 2.4, ease: easeInOut, prop: 0.45 },
  { face: PARK_HEAD, dur: 1.8, prop: 0.4 },
  { hold: true, dur: 10.5, prop: 0.08, phase: 'park' },
  { face: toLineup, dur: 2.0, prop: 0.45 },
  { to: [LINEUP.x, GY, LINEUP.z], dur: 2.0, ease: easeInOut, prop: 0.5 },
  { face: W, dur: 1.4, prop: 0.6 },
  { to: [-2.6, GY, RW.z], dur: 5, ease: easeInQuad, prop: 1, phase: 'takeoff' },
  {
    to: [-42, 9, RW.z],
    dur: 12.5,
    ease: (t) => t,
    yEase: (t) => t ** 1.7,
    prop: 1,
    phase: 'climb',
  },
];
const START = [40, CRUISE_Y, RW.z];
const SEGS = (() => {
  let p = START;
  let h = W;
  let t = 0;
  return SEGS_SRC.map((s) => {
    const seg = { ...s, from: p, h0: h, t0: t };
    if (s.to) {
      const dx = s.to[0] - p[0];
      const dz = s.to[2] - p[2];
      seg.h1 = Math.hypot(dx, dz) > 0.05 ? Math.atan2(dx, dz) : h;
      p = s.to;
    } else if (s.face !== undefined) {
      seg.h1 = s.face;
    } else seg.h1 = h;
    h = seg.h1;
    t += s.dur;
    return seg;
  });
})();
const FLIGHT = SEGS[SEGS.length - 1].t0 + SEGS[SEGS.length - 1].dur;
const PARK_SEG = SEGS.find((s) => s.phase === 'park');

// Writes the plane's pose at flight time `ft` into out = { x, y, z, h, pitch, prop }.
function flightPose(ft, out) {
  let s = SEGS[SEGS.length - 1];
  for (const c of SEGS) {
    if (ft < c.t0 + c.dur) {
      s = c;
      break;
    }
  }
  const u = Math.min(1, Math.max(0, (ft - s.t0) / s.dur));
  const [x0, y0, z0] = s.from;
  out.prop = s.prop;
  out.pitch = 0;
  if (s.to) {
    const k = s.ease(u);
    const ky = s.yEase ? s.yEase(u) : k;
    out.x = lerp(x0, s.to[0], k);
    out.z = lerp(z0, s.to[2], k);
    out.y = lerp(y0, s.to[1], ky);
    // ease the nose round onto the new direction early in the segment
    out.h = angleLerp(s.h0, s.h1, smooth(u / 0.4));
  } else {
    out.x = x0;
    out.y = y0;
    out.z = z0;
    // explicit turn: plain lerp (not shortest) so the U-turn swings south
    out.h = s.face !== undefined ? lerp(s.h0, s.h1, easeInOut(u)) : s.h1;
    if (s.arc) out.z += s.arc * Math.sin(Math.PI * u);
  }
  if (s.phase === 'approach') out.pitch = u < 0.8 ? 0.06 : lerp(0.06, -0.14, (u - 0.8) / 0.2);
  if (s.phase === 'rollout') {
    // touchdown bounce: two little hops
    const b = ft - s.t0;
    if (b < 1.1) out.y += 0.22 * Math.abs(Math.sin((b / 0.55) * Math.PI)) * (1 - b / 1.1);
    out.pitch = b < 1.1 ? -0.06 * (1 - b / 1.1) : 0;
  }
  if (s.phase === 'takeoff') out.pitch = -0.16 * smooth((u - 0.75) / 0.25);
  if (s.phase === 'climb') out.pitch = -0.2 * (1 - u * 0.6);
}

// Recruits: climb out of the door, walk a few steps toward the island center
// waving, then fade away (they've gone off to find their zone).
const RECRUITS = 3;
const R_SCALE = 0.75; // new recruits are little
const R_START = 0.9;
const R_STAGGER = 0.95;
const R_HOP = 0.6;
const R_WALK = 3.0;
const R_WAVE = 1.7;
const R_FADE = 0.6;
const R_STEPS = 2.4;

function recruitGround(x, z) {
  if (x > APRON.x0 && x < APRON.x1 && z > APRON.z0 && z < APRON.z1) return RW_Y;
  return groundY(x, z);
}

function FlyIn({ lowPower }) {
  const plane = useRef();
  const prop = useRef();
  const bots = useRef([]);
  const clock = useRef({
    t: 0,
    next: rareGap(120, 240) * 0.5,
    flying: false,
    start: 0,
  });
  const pose = useMemo(() => ({ x: 0, y: 0, z: 0, h: 0, pitch: 0, prop: 0 }), []);
  const colors = useMemo(() => [0, 1, 2].map((i) => extraColor(Math.floor(Math.random() * 12) + i * 5)), []);

  useFrame((_, delta) => {
    const c = clock.current;
    const dt = Math.min(delta, 0.1);
    c.t += dt;
    if (!c.flying) {
      if (c.t < c.next) return;
      c.flying = true;
      c.start = c.t;
      plane.current.visible = true;
    }
    const ft = c.t - c.start;
    if (ft >= FLIGHT) {
      c.flying = false;
      c.next = c.t + rareGap(120, 240);
      plane.current.visible = false;
      return;
    }
    flightPose(ft, pose);
    const p = plane.current;
    p.position.set(pose.x, pose.y, pose.z);
    p.rotation.set(pose.pitch, pose.h, 0, 'YXZ');
    if (prop.current) prop.current.rotation.z += dt * (6 + pose.prop * 50);

    // recruits during the park
    const pt = ft - PARK_SEG.t0;
    const sh = Math.sin(PARK_SEG.h1);
    const ch = Math.cos(PARK_SEG.h1);
    // plane's left side (local +x) and back (local -z) in world space
    const rx = ch;
    const rz = -sh;
    for (let i = 0; i < RECRUITS; i++) {
      const b = bots.current[i];
      if (!b?.root) continue;
      const lt = pt - R_START - i * R_STAGGER;
      const total = R_HOP + R_WALK + R_WAVE + R_FADE;
      if (pt < 0 || lt < 0 || lt > total) {
        b.root.visible = false;
        continue;
      }
      const root = b.root;
      if (!root.visible) {
        b.reset();
        b.head.rotation.z = 0;
        root.visible = true;
      }
      // door: just behind the wing on the left side
      const dx = PARK.x + rx * 0.2 * PS - sh * 0.3 * PS;
      const dz = PARK.z + rz * 0.2 * PS - ch * 0.3 * PS;
      const ox = dx + rx * 0.55;
      const oz = dz + rz * 0.55;
      // walk direction: toward the island center, fanned out a little
      const base = Math.atan2(-ox, -oz) + (i - 1) * 0.38;
      const wx = Math.sin(base);
      const wz = Math.cos(base);
      let x;
      let z;
      let y;
      let s = R_SCALE;
      root.rotation.y = base;
      if (lt < R_HOP) {
        const k = lt / R_HOP;
        x = lerp(dx, ox, k);
        z = lerp(dz, oz, k);
        y = lerp(GY - 0.25, RW_Y, k) + Math.sin(k * Math.PI) * 0.35;
        root.rotation.y = Math.atan2(rx, rz);
        s = R_SCALE * (0.6 + 0.4 * k);
      } else if (lt < R_HOP + R_WALK) {
        const k = (lt - R_HOP) / R_WALK;
        const e = easeInOut(k);
        x = ox + wx * R_STEPS * e;
        z = oz + wz * R_STEPS * e;
        y = recruitGround(x, z);
        const w = (lt - R_HOP) * 9;
        const amp = Math.sin(k * Math.PI);
        b.pose.position.y = Math.abs(Math.sin(w)) * 0.05 * amp;
        b.footL.position.z = Math.sin(w) * 0.08 * amp;
        b.footR.position.z = -Math.sin(w) * 0.08 * amp;
        b.armL.rotation.x = -Math.sin(w) * 0.5 * amp;
        // the right arm waves the whole way
        b.armR.rotation.set(0, 0, 2.5 + Math.sin(lt * 9) * 0.35);
      } else {
        x = ox + wx * R_STEPS;
        z = oz + wz * R_STEPS;
        y = recruitGround(x, z);
        const k = lt - R_HOP - R_WALK;
        b.pose.position.y = 0;
        b.footL.position.z = 0;
        b.footR.position.z = 0;
        b.armL.rotation.set(0, 0, -0.12);
        b.armR.rotation.set(0, 0, 2.6 + Math.sin(lt * 10) * 0.4);
        b.head.rotation.z = Math.sin(lt * 3) * 0.1;
        // turn back to the camera to say hi
        root.rotation.y = angleLerp(base, 0, smooth(k / 0.5));
        if (k > R_WAVE) {
          const f = (k - R_WAVE) / R_FADE;
          s = R_SCALE * (1 - smooth(f));
          y += f * 0.5;
        }
      }
      root.position.set(x, y, z);
      root.scale.setScalar(Math.max(0.001, s * 1.35));
    }
  });

  return (
    <>
      <group ref={plane} visible={false}>
        <Plane propRef={prop} />
      </group>
      {colors.map((col, i) => (
        <MiniBot key={i} ref={(r) => (bots.current[i] = r)} color={col} shadow={!lowPower} visible={false} />
      ))}
    </>
  );
}

export default function Airport({ sky, animate, lowPower }) {
  const night = sky.stars;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [night, invalidate]);
  return (
    <group>
      <Runway night={night} lowPower={lowPower} />
      <Terminal night={night} />
      <Windsock animate={animate} />
      <ControlTower night={night} animate={animate} />
      {animate && <FlyIn lowPower={lowPower} />}
    </group>
  );
}
