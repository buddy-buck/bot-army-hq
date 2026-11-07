import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SEA_LANES } from '../../utils/paths.js';
import { world } from '../state.js';
import { angDiff, clamp, giveWay, hullGeometry, registerBoat, ridePose, setNightLights, Spray, std, wakeSpray } from './kit.js';
import { Beam, Box, Light, SideLights } from './parts.jsx';

// A low-poly sloop cruising the sail lane out near the horizon. It really
// sails: a steady breeze blows from the north-west, the boat beats upwind in
// gentle zig-zag tacks, the boom swings across on every tack and gybe, the
// sails billow to leeward and the hull heels away from the wind.

// The heading that points straight into the wind (wind comes FROM here).
const UPWIND = 3.6;
const WX = Math.sin(UPWIND);
const WZ = Math.cos(UPWIND);
const CLOSE = 0.8; // can't point higher than this off the wind
const TACK = 0.88; // heading off the wind while beating

const LEN = 4.2;
const BEAM = 1.5;
const DECK = 0.34;
const MAST_Z = 0.55;
const MAST_H = 5.3;
const BOOM_Y = DECK + 0.55;
const BOOM_LEN = 2.35;

const HULL_GEO = hullGeometry(LEN, BEAM, 0.62, { bow: 0.42, stern: 0.72, taper: 0.4, sheer: 0.16 });
const STRIPE_GEO = hullGeometry(LEN * 1.005, BEAM * 1.01, 0.09, { bow: 0.42, stern: 0.72, taper: 1, sheer: 0.16 });
const DECK_GEO = hullGeometry(LEN * 0.94, BEAM * 0.9, 0.04, { bow: 0.42, stern: 0.72, taper: 1, sheer: 0.16 });

// A triangular sail in the local y-z plane with a belly along +x. Flip
// mesh.scale.x to billow the other way; scale.x near 0 is a luffing sail.
function sailGeometry(a, b, c, n = 5, belly = 0.28) {
  const pos = [];
  const idx = [];
  const row = [];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    row[i] = k;
    for (let j = 0; j <= n - i; j++) {
      const u = i / n;
      const v = j / n;
      const w = n - i > 0 ? j / (n - i) : 0;
      const x = a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v;
      const y = a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v;
      const z = a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v;
      pos.push(x + belly * Math.sin(Math.PI * w) * (1 - u * 0.75), y, z);
      k++;
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      const p0 = row[i] + j;
      const p1 = row[i] + j + 1;
      const p2 = row[i + 1] + j;
      idx.push(p0, p2, p1);
      if (j < n - i - 1) idx.push(p1, p2, row[i + 1] + j + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const MAIN_GEO = sailGeometry([0, 0.06, -0.06], [0, MAST_H - 0.75, -0.03], [0, 0.06, -BOOM_LEN + 0.05], 5, 0.3);
// The jib hangs on the forestay; its group is tilted so local +y runs up the stay.
const STAY_FOOT = new THREE.Vector3(0, DECK + 0.08, LEN * 0.47);
const STAY_HEAD = new THREE.Vector3(0, DECK + MAST_H - 1.0, MAST_Z);
const STAY = STAY_HEAD.clone().sub(STAY_FOOT);
const STAY_TILT = Math.atan2(STAY.z, STAY.y); // rotation.x of the jib frame
const JIB_CLEW = new THREE.Vector3(0, 0.3, -1.85).applyAxisAngle(new THREE.Vector3(1, 0, 0), -STAY_TILT);
const JIB_GEO = sailGeometry([0, 0.05, 0], [0, STAY.length() - 0.1, 0], [0, JIB_CLEW.y, JIB_CLEW.z], 4, 0.22);

const BOOM_GEO = new THREE.CylinderGeometry(0.035, 0.03, BOOM_LEN, 5).rotateX(Math.PI / 2).translate(0, 0, -BOOM_LEN / 2);
const MAST_GEO = new THREE.CylinderGeometry(0.035, 0.05, MAST_H, 6).translate(0, MAST_H / 2, 0);

const SHARED = {
  deck: std('#c08a57'),
  mast: std('#e9e4da', { roughness: 0.4 }),
  rig: std('#6b6f78'),
  cabin: std('#fdf8ee'),
  window: std('#2b3a55', { emissive: '#ffcf7a', emissiveIntensity: 0 }),
};

export default function Sailboat({ id, ctx, laneScale = 1, dir = 1, speed = 1.5, scale = 1, phase = 0, hull = '#fdf8ee', stripe = '#19469D', sail = '#fffaf0', jib = '#fffaf0' }) {
  const group = useRef();
  const boom = useRef();
  const main = useRef();
  const jibPivot = useRef();
  const jibSail = useRef();
  const night = useRef(0);
  night.current = ctx.sky?.stars ?? 0;

  const mats = useMemo(
    () => ({
      hull: std(hull),
      stripe: std(stripe),
      sail: std(sail, { side: THREE.DoubleSide, roughness: 0.85 }),
      jib: std(jib, { side: THREE.DoubleSide, roughness: 0.85 }),
    }),
    [hull, stripe, sail, jib]
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const spray = useMemo(() => new Spray(ctx.lowPower ? 24 : 48, { gravity: 7, drag: 1.2 }), [ctx.lowPower]);
  useEffect(() => () => spray.dispose(), [spray]);
  useEffect(() => () => world.boats.delete(id), [id]);

  // Where we are on the lane, and the sail trim.
  const st = useMemo(() => {
    const rx = SEA_LANES.sail.rx * laneScale;
    const rz = SEA_LANES.sail.rz * laneScale;
    const a = phase;
    const x = rx * Math.cos(a);
    const z = rz * Math.sin(a);
    // tangent of the ellipse in the travel direction
    const h = Math.atan2(-rx * Math.sin(a) * dir, rz * Math.cos(a) * dir);
    return { rx, rz, x, z, h, v: speed * 0.6, tack: 1, boom: 0.6, heel: 0, belly: 1 };
  }, [laneScale, dir, phase, speed]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;
    const s = st;
    setNightLights(night.current);
    SHARED.window.emissiveIntensity = night.current * 1.6;

    // Steer for a point a little way ahead on the lane.
    const phi = Math.atan2(s.z / s.rz, s.x / s.rx);
    const ta = phi + dir * 0.32;
    const want = Math.atan2(s.rx * Math.cos(ta) - s.x, s.rz * Math.sin(ta) - s.z);
    const off = angDiff(want, UPWIND);
    let cmd = want;
    if (Math.abs(off) < CLOSE) {
      // beating: hold a close-hauled tack, come about when the lane drifts to the other side
      cmd = UPWIND + s.tack * TACK;
      if (Math.abs(angDiff(want, cmd)) > 1.2) {
        s.tack = -s.tack;
        cmd = UPWIND + s.tack * TACK;
      }
    } else {
      s.tack = Math.sign(off) || 1;
    }
    const turn = clamp(angDiff(cmd, s.h), -0.24 * dt, 0.24 * dt);
    s.h += turn;

    // Speed from the point of sail: slow head to wind, quickest on a reach.
    const wx = WX * Math.cos(s.h) - WZ * Math.sin(s.h); // wind from +x side when > 0
    const offWind = Math.abs(angDiff(s.h, UPWIND));
    const polar = offWind < 0.6 ? 0.25 : 0.62 + 0.38 * Math.sin(Math.min(offWind, Math.PI));
    const target = speed * polar * giveWay(id, s.x, s.z, s.h, 1, 10, 2.4 * scale);
    s.v += (target - s.v) * Math.min(1, dt * 0.5);
    s.x += Math.sin(s.h) * s.v * dt;
    s.z += Math.cos(s.h) * s.v * dt;

    // Trim: boom out to leeward, more eased the further off the wind.
    const side = wx >= 0 ? 1 : -1;
    const ease = clamp((offWind - 0.55) * 0.6, 0.12, 1.15);
    const k = Math.min(1, dt * 0.9);
    s.boom += (side * ease - s.boom) * k;
    const power = offWind < 0.6 ? 0.15 : Math.sin(Math.min(offWind, 2.2)) * (offWind > 2.5 ? 0.5 : 1);
    s.heel += (side * 0.16 * power - s.heel) * Math.min(1, dt * 0.6);
    s.belly += (-side - s.belly) * Math.min(1, dt * 1.4);

    ridePose(g, s.x, s.z, s.h, t, LEN * scale, BEAM * scale, 1.8);
    g.rotation.z += s.heel;
    g.position.y += Math.sin(t * 1.1 + phase) * 0.03;
    if (boom.current) boom.current.rotation.y = s.boom;
    const flutter = 1 + Math.sin(t * 6.3 + phase) * 0.04;
    if (main.current) main.current.scale.x = s.belly * flutter;
    if (jibPivot.current) jibPivot.current.rotation.y = s.boom * 0.75;
    if (jibSail.current) jibSail.current.scale.x = s.belly * (1 + Math.sin(t * 7.1) * 0.05);

    registerBoat(id, s.x, s.z, s.h, s.v, LEN * scale, 1);
    wakeSpray(spray, s.x, s.z, s.h, s.v * 1.4, LEN * scale, BEAM * scale, t, { wash: 0.4 });
    spray.update(dt);
  });

  return (
    <>
      <group ref={group}>
        <group scale={scale}>
          {/* hull with a stripe and a teak deck */}
          <mesh geometry={HULL_GEO} material={mats.hull} position={[0, DECK, 0]} />
          <mesh geometry={STRIPE_GEO} material={mats.stripe} position={[0, DECK - 0.14, 0]} />
          <mesh geometry={DECK_GEO} material={SHARED.deck} position={[0, DECK + 0.03, 0]} />
          {/* little cabin with portholes */}
          <Box p={[0, DECK + 0.2, -0.15]} s={[0.85, 0.32, 1.3]} m={SHARED.cabin} />
          <Box p={[0, DECK + 0.38, -0.15]} s={[0.8, 0.05, 1.25]} m={SHARED.deck} />
          {[-0.45, 0.15].map((z) => (
            <group key={z}>
              <Box p={[0.43, DECK + 0.24, z]} s={[0.02, 0.1, 0.24]} m={SHARED.window} />
              <Box p={[-0.43, DECK + 0.24, z]} s={[0.02, 0.1, 0.24]} m={SHARED.window} />
            </group>
          ))}
          {/* mast, stays and the boom */}
          <mesh geometry={MAST_GEO} material={SHARED.mast} position={[0, DECK, MAST_Z]} />
          <Beam a={STAY_FOOT.toArray()} b={[0, DECK + MAST_H - 0.95, MAST_Z]} r={0.008} m={SHARED.rig} />
          <Beam a={[0, DECK + 0.1, -LEN * 0.48]} b={[0, DECK + MAST_H, MAST_Z]} r={0.008} m={SHARED.rig} />
          <Beam a={[0.6, DECK + 0.05, MAST_Z - 0.1]} b={[0, DECK + MAST_H - 1.4, MAST_Z]} r={0.006} m={SHARED.rig} />
          <Beam a={[-0.6, DECK + 0.05, MAST_Z - 0.1]} b={[0, DECK + MAST_H - 1.4, MAST_Z]} r={0.006} m={SHARED.rig} />
          <group ref={boom} position={[0, BOOM_Y, MAST_Z - 0.04]}>
            <mesh geometry={BOOM_GEO} material={SHARED.mast} />
            <mesh ref={main} geometry={MAIN_GEO} material={mats.sail} />
          </group>
          <group position={STAY_FOOT.toArray()} rotation={[STAY_TILT, 0, 0]}>
            <group ref={jibPivot}>
              <mesh ref={jibSail} geometry={JIB_GEO} material={mats.jib} />
            </group>
          </group>
          {/* running lights: masthead, sides, stern */}
          <Light p={[0, DECK + MAST_H + 0.05, MAST_Z]} kind="white" s={1.2} />
          <SideLights x={0.5} y={DECK + 0.12} z={LEN * 0.32} s={0.9} />
          <Light p={[0, DECK + 0.1, -LEN * 0.5]} kind="white" s={0.8} />
        </group>
      </group>
      <primitive object={spray.mesh} />
    </>
  );
}
