import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { aliveClock, claimTravel, releaseTravel, testOn } from '../../wild/director.js';
import { GLOW_GEO, HELIPAD, duskFactor, glowMaterial, helipadState, std } from './kit.jsx';

// Chief's helicopter: a little magenta chopper that drops by the helipad on
// top of Chief's Tower every few minutes. It flies in from the north-west,
// flares, hovers, settles on the pad, spools down for a while, then lifts
// off, turns and heads out to sea to the east. Built with its nose along +z
// and its skids at y 0. Only mounted while the island animates.
// ?test=heli: arrives in a few seconds, sits briefly, repeats.

const TEST = testOn('heli');
const HOVER_UP = 2.5;
const PAD_Y = HELIPAD.y;

// Flight legs (cubic bezier control points, world space).
const IN = [
  [-40, 17, -36],
  [-24, 14, -22],
  [-5, HELIPAD.y + HOVER_UP + 0.6, -6],
  [HELIPAD.x, HELIPAD.y + HOVER_UP, HELIPAD.z],
];
const OUT = [
  [HELIPAD.x, HELIPAD.y + HOVER_UP, HELIPAD.z],
  [HELIPAD.x + 3, HELIPAD.y + HOVER_UP + 0.4, HELIPAD.z],
  [18, 13, -12],
  [42, 17, -24],
];

const T = TEST
  ? { inbound: 6, hover: 1.5, descend: 2.2, spoolDown: 1.5, sit: 3, spoolUp: 1.5, lift: 1.8, turn: 1.4, outbound: 6, gone: () => 5, first: 3 }
  : { inbound: 15, hover: 2.5, descend: 3.5, spoolDown: 4, sit: 0, spoolUp: 4, lift: 2.6, turn: 2.2, outbound: 14, gone: () => 180 + Math.random() * 120, first: 50 + Math.random() * 60 };
const sitTime = () => (TEST ? T.sit : 20 + Math.random() * 10);

// --- geometry and materials (made once) --------------------------------------

const MAT = {
  body: std('#D63AF9', { roughness: 0.5 }),
  trim: std('#fdf8ee', { roughness: 0.6 }),
  dark: std('#2e2a33', { roughness: 0.7 }),
  metal: std('#b9bec4', { roughness: 0.4, metalness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({ color: '#8fd0f5', emissive: '#2a5a80', emissiveIntensity: 0.25, transparent: true, opacity: 0.72, roughness: 0.1, flatShading: true }),
  blade: std('#3b3430', { roughness: 0.6 }),
  blur: new THREE.MeshBasicMaterial({ color: '#e8e6f0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  beacon: new THREE.MeshStandardMaterial({ color: '#ff3030', emissive: '#ff2020', emissiveIntensity: 0.3, flatShading: true }),
  navRed: new THREE.MeshStandardMaterial({ color: '#ff4040', emissive: '#ff2020', emissiveIntensity: 0.4, flatShading: true }),
  navGreen: new THREE.MeshStandardMaterial({ color: '#40ff70', emissive: '#20ff60', emissiveIntensity: 0.4, flatShading: true }),
  halo: glowMaterial('#ff3a3a', 0),
};

const GEO = {
  body: new THREE.IcosahedronGeometry(1, 1),
  boom: new THREE.CylinderGeometry(0.05, 0.11, 1.0, 6).rotateX(Math.PI / 2),
  fin: new THREE.BoxGeometry(0.04, 0.34, 0.2),
  stab: new THREE.BoxGeometry(0.42, 0.03, 0.12),
  skid: new THREE.CylinderGeometry(0.025, 0.025, 1.05, 5).rotateX(Math.PI / 2),
  strut: new THREE.CylinderGeometry(0.02, 0.02, 0.32, 4),
  mast: new THREE.CylinderGeometry(0.035, 0.05, 0.16, 6),
  hub: new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8),
  blade: new THREE.BoxGeometry(0.09, 0.015, 1.0).translate(0, 0, 0.52),
  tailBlade: new THREE.BoxGeometry(0.012, 0.32, 0.05),
  disc: new THREE.CircleGeometry(1.05, 24).rotateX(-Math.PI / 2),
  tailDisc: new THREE.CircleGeometry(0.17, 12).rotateY(Math.PI / 2),
  light: new THREE.SphereGeometry(0.035, 6, 4),
};

// --- small math (no allocations) ---------------------------------------------

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const out = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
// Point and tangent on a cubic bezier given as four [x, y, z] points.
function bezier(P, u) {
  const a = 1 - u;
  const b0 = a * a * a;
  const b1 = 3 * a * a * u;
  const b2 = 3 * a * u * u;
  const b3 = u * u * u;
  const d0 = -3 * a * a;
  const d1 = 3 * a * a - 6 * a * u;
  const d2 = 6 * a * u - 3 * u * u;
  const d3 = 3 * u * u;
  out.x = P[0][0] * b0 + P[1][0] * b1 + P[2][0] * b2 + P[3][0] * b3;
  out.y = P[0][1] * b0 + P[1][1] * b1 + P[2][1] * b2 + P[3][1] * b3;
  out.z = P[0][2] * b0 + P[1][2] * b1 + P[2][2] * b2 + P[3][2] * b3;
  out.dx = P[0][0] * d0 + P[1][0] * d1 + P[2][0] * d2 + P[3][0] * d3;
  out.dy = P[0][1] * d0 + P[1][1] * d1 + P[2][1] * d2 + P[3][1] * d3;
  out.dz = P[0][2] * d0 + P[1][2] * d1 + P[2][2] * d2 + P[3][2] * d3;
  return out;
}
const angleLerp = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const IN_END_HEADING = Math.atan2(IN[3][0] - IN[2][0], IN[3][2] - IN[2][2]);
const OUT_START_HEADING = Math.atan2(OUT[1][0] - OUT[0][0], OUT[1][2] - OUT[0][2]);

// --- the model ------------------------------------------------------------------

function HeliModel({ rotor, tailRotor, beacon }) {
  return (
    <group>
      {/* cabin: a round magenta pod with a white belly stripe */}
      <mesh geometry={GEO.body} material={MAT.body} position={[0, 0.58, -0.1]} scale={[0.4, 0.38, 0.5]} />
      <mesh geometry={GEO.body} material={MAT.trim} position={[0, 0.44, -0.04]} scale={[0.41, 0.12, 0.5]} />
      {/* glass bubble over the front seats */}
      <mesh geometry={GEO.body} material={MAT.glass} position={[0, 0.66, 0.26]} scale={[0.34, 0.31, 0.38]} />
      {/* tail boom, fin, stabilizer */}
      <mesh geometry={GEO.boom} material={MAT.body} position={[0, 0.66, -0.88]} />
      <mesh geometry={GEO.fin} material={MAT.body} position={[0, 0.8, -1.33]} rotation={[-0.35, 0, 0]} />
      <mesh geometry={GEO.stab} material={MAT.trim} position={[0, 0.66, -1.2]} />
      {/* tail rotor (spins around x) */}
      <group ref={tailRotor} position={[0.05, 0.84, -1.38]}>
        <mesh geometry={GEO.tailBlade} material={MAT.blade} />
        <mesh geometry={GEO.tailBlade} material={MAT.blade} rotation={[Math.PI / 2, 0, 0]} />
      </group>
      <mesh geometry={GEO.tailDisc} material={MAT.blur} position={[0.06, 0.84, -1.38]} />
      {/* skids */}
      {[-0.32, 0.32].map((x) => (
        <group key={x}>
          <mesh geometry={GEO.skid} material={MAT.metal} position={[x, 0.03, 0.02]} />
          <mesh geometry={GEO.strut} material={MAT.metal} position={[x * 0.82, 0.18, 0.25]} rotation={[0, 0, x > 0 ? 0.35 : -0.35]} />
          <mesh geometry={GEO.strut} material={MAT.metal} position={[x * 0.82, 0.18, -0.22]} rotation={[0, 0, x > 0 ? 0.35 : -0.35]} />
        </group>
      ))}
      {/* mast and main rotor */}
      <mesh geometry={GEO.mast} material={MAT.dark} position={[0, 0.98, 0]} />
      <group ref={rotor} position={[0, 1.07, 0]}>
        <mesh geometry={GEO.hub} material={MAT.dark} />
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={GEO.blade} material={MAT.blade} rotation={[0, (i / 3) * Math.PI * 2, 0]} />
        ))}
      </group>
      <mesh geometry={GEO.disc} material={MAT.blur} position={[0, 1.08, 0]} />
      {/* beacon on the fin, nav lights on the cabin sides */}
      <mesh geometry={GEO.light} material={MAT.beacon} position={[0, 1.0, -1.4]} />
      <mesh ref={beacon} geometry={GLOW_GEO} material={MAT.halo} position={[0, 1.0, -1.4]} scale={0.22} />
      <mesh geometry={GEO.light} material={MAT.navRed} position={[-0.4, 0.55, 0.05]} />
      <mesh geometry={GEO.light} material={MAT.navGreen} position={[0.4, 0.55, 0.05]} />
    </group>
  );
}

export default function Helicopter({ ctx }) {
  const root = useRef();
  const tilt = useRef();
  const rotor = useRef();
  const tailRotor = useRef();
  const beacon = useRef();
  const night = duskFactor(ctx.sky);
  const nightRef = useRef(night);
  nightRef.current = night;

  const clock = useMemo(() => aliveClock(), []);
  const st = useRef({ phase: 'gone', t0: 0, next: T.first, sit: 0, rpm: 0, angle: 0, tailAngle: 0, heading: 0, lastHeading: 0, roll: 0 });

  useEffect(
    () => () => {
      releaseTravel('heli');
      helipadState.wash = 0;
      helipadState.onPad = false;
    },
    []
  );

  useFrame((_, delta) => {
    const g = root.current;
    if (!g) return;
    const t = clock.tick(delta);
    const dt = Math.min(delta, 0.1);
    const s = st.current;
    const go = (phase) => {
      s.phase = phase;
      s.t0 = t;
    };
    const e = t - s.t0;

    let x = HELIPAD.x;
    let y = PAD_Y;
    let z = HELIPAD.z;
    let pitch = 0;
    let rpmWant = 1;
    let heading = s.heading;

    switch (s.phase) {
      case 'gone':
        g.visible = false;
        helipadState.wash = 0;
        helipadState.onPad = false;
        if (t >= s.next && claimTravel('heli', T.inbound + 4)) {
          s.rpm = 1;
          go('inbound');
        }
        return;
      case 'inbound': {
        const p = clamp01(e / T.inbound);
        const u = 1 - (1 - p) * (1 - p); // slow down into the hover
        const b = bezier(IN, u);
        x = b.x;
        y = b.y;
        z = b.z;
        heading = Math.atan2(b.dx, b.dz);
        // nose down while cruising, nose up as it flares into the hover
        pitch = 0.28 * (1 - p) - 0.2 * Math.sin(Math.PI * clamp01((p - 0.7) / 0.3));
        if (p >= 1) go('hover');
        break;
      }
      case 'hover': {
        const p = clamp01(e / T.hover);
        y = PAD_Y + HOVER_UP + Math.sin(e * 2.4) * 0.06;
        heading = angleLerp(IN_END_HEADING, 0, smooth(p)); // turn to face the camera
        pitch = Math.sin(e * 1.7) * 0.02;
        if (p >= 1) go('descend');
        break;
      }
      case 'descend': {
        const p = clamp01(e / T.descend);
        y = PAD_Y + HOVER_UP * (1 - smooth(p));
        heading = 0;
        pitch = Math.sin(e * 1.7) * 0.02 * (1 - p);
        if (p >= 1) {
          s.sit = sitTime();
          releaseTravel('heli');
          go('sit');
        }
        break;
      }
      case 'sit': {
        heading = 0;
        // spool down, rest, then ask for the sky again before taking off
        rpmWant = e < T.spoolDown ? 1 - e / T.spoolDown : 0;
        if (e >= T.spoolDown + s.sit && claimTravel('heli', T.spoolUp + T.lift + T.turn + T.outbound + 4)) go('spoolUp');
        break;
      }
      case 'spoolUp': {
        heading = 0;
        rpmWant = clamp01(e / T.spoolUp);
        if (e >= T.spoolUp) go('lift');
        break;
      }
      case 'lift': {
        const p = clamp01(e / T.lift);
        y = PAD_Y + HOVER_UP * smooth(p);
        heading = 0;
        if (p >= 1) go('turn');
        break;
      }
      case 'turn': {
        const p = clamp01(e / T.turn);
        y = PAD_Y + HOVER_UP + Math.sin(e * 2.4) * 0.05;
        heading = angleLerp(0, OUT_START_HEADING, smooth(p));
        if (p >= 1) go('outbound');
        break;
      }
      case 'outbound': {
        const p = clamp01(e / T.outbound);
        const b = bezier(OUT, p * p); // speed up as it leaves
        x = b.x;
        y = b.y;
        z = b.z;
        heading = Math.atan2(b.dx, b.dz);
        pitch = 0.12 + 0.18 * Math.min(1, p * 3);
        if (p >= 1) {
          releaseTravel('heli');
          s.next = t + T.gone();
          go('gone');
        }
        break;
      }
      default:
        go('gone');
    }

    // keep the travel slot while airborne
    if (s.phase === 'inbound' || s.phase === 'hover' || s.phase === 'descend' || s.phase === 'spoolUp' || s.phase === 'lift' || s.phase === 'turn' || s.phase === 'outbound') claimTravel('heli', 4);

    // bank into turns (from how fast the heading changes)
    let dh = heading - s.lastHeading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const flying = s.phase === 'inbound' || s.phase === 'outbound';
    const rollWant = flying ? Math.max(-0.4, Math.min(0.4, (-dh / Math.max(dt, 0.001)) * 0.9)) : 0;
    s.roll += (rollWant - s.roll) * Math.min(1, dt * 3);
    s.lastHeading = heading;
    s.heading = heading;

    s.rpm += (rpmWant - s.rpm) * Math.min(1, dt * 2.5);
    if (rpmWant === 1 && s.phase !== 'sit') s.rpm = Math.max(s.rpm, 0.98);
    s.angle = (s.angle + s.rpm * 38 * dt) % (Math.PI * 2);
    s.tailAngle = (s.tailAngle + s.rpm * 55 * dt) % (Math.PI * 2);

    g.visible = true;
    g.position.set(x, y, z);
    g.rotation.y = heading;
    if (tilt.current) tilt.current.rotation.set(pitch, 0, s.roll);
    if (rotor.current) rotor.current.rotation.y = s.angle;
    if (tailRotor.current) tailRotor.current.rotation.x = s.tailAngle;
    MAT.blur.opacity = 0.32 * s.rpm * s.rpm;

    // lights: blinking beacon always, glowing more at dusk and night
    const n = nightRef.current;
    const blink = (t * 1.1) % 1 < 0.12 ? 1 : 0;
    MAT.beacon.emissiveIntensity = 0.3 + blink * (0.8 + n * 2.2);
    MAT.navRed.emissiveIntensity = 0.4 + n * 1.6;
    MAT.navGreen.emissiveIntensity = 0.4 + n * 1.6;
    MAT.halo.opacity = blink * (0.15 + n * 0.45);
    if (beacon.current) beacon.current.visible = blink > 0;

    // rotor downwash on the canopy thatch
    const near = Math.hypot(x - HELIPAD.x, z - HELIPAD.z);
    const low = clamp01(1 - (y - PAD_Y) / 4.5) * clamp01(1 - (near - 1.5) / 3);
    helipadState.wash = low * s.rpm;
    helipadState.onPad = s.phase === 'sit' || s.phase === 'spoolUp';
  });

  return (
    <group ref={root} visible={false}>
      <group ref={tilt}>
        <HeliModel rotor={rotor} tailRotor={tailRotor} beacon={beacon} />
      </group>
    </group>
  );
}
