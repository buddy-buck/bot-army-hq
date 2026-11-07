import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DOCK } from '../../utils/paths.js';
import { aliveClock, claimSlot, releaseSlot, slotBusy, testOn, travelBusy } from '../../wild/director.js';
import { isDaytime } from '../sky/common.js';
import { audioCtx, world } from '../state.js';
import JetBoatModel, { JET_BEAM, JET_DECK, JET_LEN, PALETTES } from './JetBoat.jsx';
import { clamp, lerp, registerBoat, ridePose, setNightLights, smooth, Spray, std, waveY, wakeSpray } from './kit.js';
import { GRID_D, JET_HOME, JET_TO_GRID, LANE, LAP_PATH, OFFSET, PUSH_OFF, RIVAL_IN, RIVAL_OUT, SLIP, lanePt, raceDist, racePlan } from './jet.js';
import { Beam } from './parts.jsx';
import RaceCrowd, { CROWD_STAGGER, CROWD_WALK, raceShow } from './RaceCrowd.jsx';

// Launch's jet boat and the boat races.
//
// The jet boat: a red, white and blue cigarette boat moored on the south side
// of Launch's Pier (Buddy's cruiser has the north side). Tap it and it roars
// off for a quick lap of the island on the race lane, then glides back into
// its slip. One lap at a time, a short cooldown after.
//
// Boat races: every 6 to 10 minutes of daylight, Launch's #1 lines up off
// the south beach against the gold #2, who comes in over the horizon. One
// full lap of the race lane, neck and neck with a few lead changes, over a
// checkered float line between two flag buoys. Fans gather on the south
// beach to cheer. The winner gets a toast, #1 goes home to its slip, #2
// heads back out to sea.
//
// Slots: a race holds the 'sea' slot (claimSlot) for its whole run and only
// starts when no travel run (jet ski, planes, drone) or rare event is on and
// the prompt tug isn't out, so it doesn't pile onto another big sea moment.
//
// ?test=race   : a race within a few seconds, another ~20 s after each one.
// ?test=jetboat: the jet boat takes a lap by itself every ~25 s.

const OWNER = 'boatrace';
const JET = 'jetboat';
const RIVAL = 'racer2';
const TEST_RACE = testOn('race');
const TEST_LAP = testOn('jetboat');
const raceGap = () => (TEST_RACE ? 20 : 360 + Math.random() * 240);
const LAP_COOLDOWN = 6;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const LAP_LINES = [
  "Launch's jet boat: zero to 60 in 'just one more feature'.",
  "VROOOM! Launch's jet boat takes a lap. Nobody asked. Nobody needed to.",
  "Launch's jet boat: shipped fast, tested in production.",
  "Launch's jet boat: twice the horsepower, none of the documentation.",
  'Launch calls this a "quick sync" around the island.',
];
const START_LINES = [
  "🏁 Boat race! Launch's #1 vs the gold #2, one lap of the island. Fans to the south beach!",
  "🏁 Race day: Launch's #1 'Ship It' takes on the gold #2 'Hotfix'. One lap, no refunds.",
  "🏁 Boat race lining up off the south beach! Launch says his boat has zero known bugs.",
];
const WIN_LINES = [
  [
    "🏁 Launch's #1 wins by a bow! He's calling it a successful deployment.",
    "🏁 'Ship It' takes the checkered flag! Launch: 'Told you it was production ready.'",
    '🏁 #1 by a nose! The south beach goes wild.',
  ],
  [
    "🏁 The gold #2 'Hotfix' takes it! Launch is requesting a re-run.",
    '🏁 Hotfix wins by a whisker! Launch blames a merge conflict.',
    '🏁 Gold #2 snatches it at the line! Launch is filing a feature request for more horsepower.',
  ],
];
const BUSY_LINE = "Launch's jet boat is mid-race! Cheer from the south beach.";

// --- Boats as a list of legs ----------------------------------------------------------
// hold : sit at a pose (until `until()` says go)
// slide: ease sideways between two spots (pushing off / pulling into the slip)
// path : drive a Path, speeding up to vmax and slowing to vEnd at its end
// race : follow the race plan on the lane
const _o = { x: 0, z: 0, h: 0, k: 0 };
const endPose = (P) => {
  P.at(P.len, _o);
  return { x: _o.x, z: _o.z, h: _o.h };
};
const MOORED = { k: 'hold', x: SLIP.x, z: SLIP.z, h: SLIP.h };
const slideOut = (dur) => ({ k: 'slide', a: [SLIP.x, SLIP.z], b: [PUSH_OFF.x, PUSH_OFF.z], h: SLIP.h, dur });
const slideIn = (dur) => ({ k: 'slide', a: [PUSH_OFF.x, PUSH_OFF.z], b: [SLIP.x, SLIP.z], h: SLIP.h, dur });

function makeBoat(id) {
  return { id, legs: [MOORED], li: 0, d: 0, v: 0, t: 0, x: SLIP.x, z: SLIP.z, h: SLIP.h, k: 0, far: 1, roll: 0, pitch: 0, done: null, mode: 'moored' };
}
function setLegs(b, legs, done) {
  b.legs = legs;
  b.li = 0;
  b.d = 0;
  b.t = 0;
  b.done = done;
}
function nextLeg(b) {
  b.li++;
  b.d = 0;
  b.t = 0;
  if (b.li >= b.legs.length) {
    const f = b.done;
    b.legs = [];
    b.li = 0;
    b.done = null;
    f?.();
  }
}

function stepBoat(b, dt, race, now) {
  const leg = b.legs[b.li];
  if (!leg) return false;
  b.t += dt;
  if (leg.k === 'hold') {
    b.x = leg.x;
    b.z = leg.z;
    b.h = leg.h;
    b.v = 0;
    b.k = 0;
    if (leg.until?.()) nextLeg(b);
  } else if (leg.k === 'slide') {
    const u = Math.min(1, b.t / leg.dur);
    const e = smooth(u);
    b.x = lerp(leg.a[0], leg.b[0], e);
    b.z = lerp(leg.a[1], leg.b[1], e);
    b.h = leg.h;
    b.v = 0;
    b.k = 0;
    if (u >= 1) nextLeg(b);
  } else if (leg.k === 'path') {
    const P = leg.path;
    const rem = P.len - b.d;
    const target = Math.min(leg.vmax, Math.sqrt(leg.vEnd * leg.vEnd + 2 * leg.dec * Math.max(0, rem)));
    b.v += clamp(target - b.v, -leg.dec * 1.6 * dt, leg.acc * dt);
    b.v = Math.max(b.v, 0.35);
    b.d += b.v * dt;
    P.at(b.d, _o);
    b.x = _o.x;
    b.z = _o.z;
    b.h = _o.h;
    b.k = _o.k;
    b.far = leg.fadeIn ? Math.min(1, b.d / 16) : leg.fadeOut ? Math.min(1, (P.len - b.d) / 16) : 1;
    if (b.d >= P.len) {
      const v = b.v;
      nextLeg(b);
      b.v = v;
    }
  } else if (leg.k === 'race') {
    const tr = Math.max(0, now - race.goAt);
    const d = raceDist(race.plan, leg.i, tr);
    if (dt > 0) b.v = lerp(b.v, Math.max(0, (d - b.d) / dt), Math.min(1, dt * 10));
    b.d = d;
    const off = leg.off + 0.22 * Math.sin(now * 0.6 + leg.i * 2.3) * clamp(Math.min(tr / 4, (race.plan.T[leg.i] - tr) / 3), 0, 1);
    LANE.at(GRID_D + d, _o, off);
    b.x = _o.x;
    b.z = _o.z;
    b.h = _o.h;
    b.k = _o.k;
    if (tr >= race.plan.T[leg.i]) {
      const v = b.v;
      leg.onFinish?.();
      nextLeg(b);
      b.v = v;
    }
  }
  return true;
}

// --- Sound: a short engine roar when you tap the boat (never on its own) -----------
function playRoar() {
  const ac = audioCtx();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  const t0 = ac.currentTime + 0.02;
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.16, t0 + 0.25);
  out.gain.setValueAtTime(0.16, t0 + 1.1);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(260, t0);
  lp.frequency.linearRampToValueAtTime(900, t0 + 1.0);
  lp.frequency.linearRampToValueAtTime(400, t0 + 3.2);
  lp.Q.value = 3;
  lp.connect(out);
  out.connect(ac.destination);
  for (const [type, f, g] of [
    ['sawtooth', 55, 0.5],
    ['sawtooth', 55 * 1.02, 0.4],
    ['square', 27.5, 0.3],
  ]) {
    const o = ac.createOscillator();
    const og = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    o.frequency.exponentialRampToValueAtTime(f * 2.6, t0 + 1.0);
    o.frequency.exponentialRampToValueAtTime(f * 2.0, t0 + 3.2);
    og.gain.value = g;
    o.connect(og);
    og.connect(lp);
    o.start(t0);
    o.stop(t0 + 3.3);
  }
}

// --- The start / finish line: two flag buoys and a checkered float line ---------------
const CHECKER = (() => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 48;
  const g = c.getContext('2d');
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = (x + y) % 2 ? '#1d1d22' : '#ffffff';
    g.fillRect(x * 16, y * 16, 16, 16);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
})();
const LINE_M = {
  buoy: std('#ff7a2e'),
  band: std('#fdf8ee'),
  pole: std('#cfd6de', { metalness: 0.3, roughness: 0.4 }),
  flag: new THREE.MeshStandardMaterial({ map: CHECKER, side: THREE.DoubleSide, roughness: 0.7, flatShading: true }),
  float: new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.6 }),
};
const BUOY_GEO = new THREE.CylinderGeometry(0.28, 0.36, 0.55, 8);
const BUOY_TOP_GEO = new THREE.ConeGeometry(0.28, 0.32, 8);
const BAND_GEO = new THREE.CylinderGeometry(0.33, 0.33, 0.1, 8);
const FLAG_GEO = new THREE.PlaneGeometry(0.75, 0.5, 4, 1).translate(0.375, 0, 0);
const FLOAT_GEO = new THREE.BoxGeometry(0.26, 0.12, 0.26);
const MARK = 3.0; // flag buoys this far either side of the lane line
const FLOATS = 13;
const FLOAT_PTS = Array.from({ length: FLOATS }, (_, i) => lanePt(0, -MARK + 0.45 + ((2 * MARK - 0.9) * i) / (FLOATS - 1)));
const MARKS = [lanePt(0, MARK), lanePt(0, -MARK)];

function FinishLine({ show }) {
  const group = useRef();
  const buoys = [useRef(), useRef()];
  const flags = [useRef(), useRef()];
  const floats = useMemo(() => {
    const m = new THREE.InstancedMesh(FLOAT_GEO, LINE_M.float, FLOATS);
    const c = new THREE.Color();
    for (let i = 0; i < FLOATS; i++) m.setColorAt(i, c.set(i % 2 ? '#1d1d22' : '#ffffff'));
    m.frustumCulled = false;
    return m;
  }, []);
  useEffect(() => () => floats.dispose(), [floats]);
  const o = useMemo(() => new THREE.Object3D(), []);
  const st = useMemo(() => ({ k: 0 }), []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;
    st.k = clamp(st.k + (show.current ? dt : -dt) / 1.5, 0, 1);
    const k = smooth(st.k);
    if (group.current) group.current.visible = st.k > 0;
    if (st.k <= 0) return;
    const sink = (1 - k) * 0.9;
    for (let i = 0; i < 2; i++) {
      const b = buoys[i].current;
      if (!b) continue;
      const [x, z] = MARKS[i];
      b.position.set(x, waveY(x, z, t) - sink, z);
      b.rotation.set(Math.sin(t * 1.1 + i) * 0.06, 0, Math.cos(t * 0.9 + i) * 0.06);
      const f = flags[i].current;
      if (f) {
        f.rotation.y = Math.PI / 2 + Math.sin(t * 2.6 + i) * 0.35 + (raceShow.racing ? Math.sin(t * 9 + i) * 0.15 : 0);
        f.scale.y = 1 + Math.sin(t * 5 + i) * 0.05;
      }
    }
    for (let i = 0; i < FLOATS; i++) {
      const [x, z] = FLOAT_PTS[i];
      o.position.set(x, waveY(x, z, t) + 0.02 - sink, z);
      o.rotation.set(Math.sin(t * 1.3 + i) * 0.12, 0.3 * i, Math.cos(t * 1.1 + i * 0.7) * 0.12);
      o.scale.setScalar(Math.max(0.001, k));
      o.updateMatrix();
      floats.setMatrixAt(i, o.matrix);
    }
    floats.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group} visible={false}>
      {[0, 1].map((i) => (
        <group key={i} ref={buoys[i]}>
          <mesh geometry={BUOY_GEO} material={LINE_M.buoy} position={[0, 0.12, 0]} />
          <mesh geometry={BAND_GEO} material={LINE_M.band} position={[0, 0.2, 0]} />
          <mesh geometry={BUOY_TOP_GEO} material={LINE_M.buoy} position={[0, 0.55, 0]} />
          <Beam a={[0, 0.5, 0]} b={[0, 2.2, 0]} r={0.03} m={LINE_M.pole} />
          <mesh ref={flags[i]} geometry={FLAG_GEO} material={LINE_M.flag} position={[0, 1.92, 0]} />
        </group>
      ))}
      <primitive object={floats} />
    </group>
  );
}

// --- Mooring lines (only while the jet boat sits in its slip) --------------------------
const ROPE = std('#d9c49a', { roughness: 0.9 });
const BOW = [SLIP.x + Math.sin(SLIP.h) * 1.3, SLIP.z + Math.cos(SLIP.h) * 1.3];
const STERN = [SLIP.x - Math.sin(SLIP.h) * 1.35, SLIP.z - Math.cos(SLIP.h) * 1.35];
const BOLLARD_Z = DOCK.z1 - 0.13;
const ROPE_Y = DOCK.y + 0.26;

export default function BoatRace({ ctx }) {
  const jetG = useRef();
  const rivalG = useRef();
  const lines = useRef();
  const jetDriver = useRef({});
  const rivalDriver = useRef({});
  const showLine = useRef(false);
  const night = useRef(0);
  night.current = ctx.sky?.stars ?? 0;
  const skyRef = useRef(ctx.sky);
  skyRef.current = ctx.sky;
  const toast = useRef(ctx.onToast);
  toast.current = ctx.onToast;
  const clock = useMemo(() => aliveClock(), []);

  const spray = useMemo(() => new Spray(ctx.lowPower ? 50 : 100, { gravity: 8, drag: 1.2 }), [ctx.lowPower]);
  useEffect(() => () => spray.dispose(), [spray]);
  useEffect(
    () => () => {
      world.boats.delete(JET);
      world.boats.delete(RIVAL);
      releaseSlot('sea', OWNER);
      raceShow.crowd = 'off';
      raceShow.racing = false;
    },
    []
  );

  const st = useMemo(
    () => ({
      now: 0,
      jet: makeBoat(JET),
      rival: { ...makeBoat(RIVAL), legs: [], mode: 'away' },
      race: null,
      nextRace: TEST_RACE ? 4 : 240 + Math.random() * 240,
      lapReady: 0,
      nextTestLap: 6,
      busyToastAt: -99,
    }),
    []
  );

  const startLap = () => {
    const j = st.jet;
    j.mode = 'lap';
    setLegs(j, [slideOut(1.4), { k: 'path', path: LAP_PATH, vmax: 10.5, vEnd: 0, acc: 4.5, dec: 2.2 }, slideIn(2.4)], () => {
      j.mode = 'moored';
      setLegs(j, [MOORED]);
      st.lapReady = st.now + LAP_COOLDOWN;
    });
  };

  const onTap = (e) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    const j = st.jet;
    if (j.mode === 'race') {
      if (st.now - st.busyToastAt > 6) {
        st.busyToastAt = st.now;
        toast.current?.(BUSY_LINE);
      }
      return;
    }
    if (j.mode !== 'moored' || st.now < st.lapReady) return;
    startLap();
    playRoar();
    toast.current?.(pick(LAP_LINES));
  };
  const pointer = useMemo(
    () => ({
      onPointerOver: (e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      },
      onPointerOut: () => {
        document.body.style.cursor = '';
      },
    }),
    []
  );

  const startRace = (now) => {
    const R = { t0: now, plan: racePlan(), goAt: null, first: -1, done: [false, false] };
    st.race = R;
    const go = () => R.goAt !== null && st.now >= R.goAt;
    const finish = (i) => () => {
      R.done[i] = true;
      if (R.first < 0) {
        R.first = i;
        raceShow.crowd = 'party';
        raceShow.t0 = st.now;
        toast.current?.(pick(WIN_LINES[i]));
      }
    };
    const j = st.jet;
    j.mode = 'race';
    setLegs(
      j,
      [
        slideOut(2.0),
        { k: 'path', path: JET_TO_GRID, vmax: 5.5, vEnd: 0, acc: 2.4, dec: 1.4 },
        { k: 'hold', grid: true, ...endPose(JET_TO_GRID), until: go },
        { k: 'race', i: 0, off: OFFSET, onFinish: finish(0) },
        { k: 'path', path: JET_HOME, vmax: 6.5, vEnd: 0, acc: 2, dec: 1.3 },
        slideIn(2.6),
      ],
      () => {
        j.mode = 'moored';
        setLegs(j, [MOORED]);
      }
    );
    const r = st.rival;
    r.mode = 'race';
    r.far = 0;
    setLegs(
      r,
      [
        { k: 'path', path: RIVAL_IN, vmax: 8, vEnd: 0, acc: 3, dec: 1.6, fadeIn: true },
        { k: 'hold', grid: true, ...endPose(RIVAL_IN), until: go },
        { k: 'race', i: 1, off: -OFFSET, onFinish: finish(1) },
        { k: 'path', path: RIVAL_OUT, vmax: 9, vEnd: 9, acc: 2, dec: 2, fadeOut: true },
      ],
      () => {
        r.mode = 'away';
      }
    );
    showLine.current = true;
    raceShow.crowd = 'in';
    raceShow.t0 = now;
    raceShow.leader = -1;
    toast.current?.(pick(START_LINES));
  };

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const now = clock.tick(delta);
    st.now = now;
    raceShow.now = now;
    const t = state.clock.elapsedTime;
    setNightLights(night.current);
    spray.update(dt);
    const j = st.jet;
    const r = st.rival;

    // --- race director ---
    const R = st.race;
    if (!R) {
      if (TEST_LAP && j.mode === 'moored' && now >= st.nextTestLap) {
        st.nextTestLap = now + 25;
        startLap();
      }
      if (now >= st.nextRace) {
        const ok =
          j.mode === 'moored' &&
          (TEST_RACE || (isDaytime(skyRef.current || {}) && !world.boats.has('tug') && !travelBusy() && !slotBusy('rare'))) &&
          claimSlot('sea', OWNER, 30);
        if (ok) startRace(now);
        else st.nextRace = now + (TEST_RACE ? 2 : 20);
      }
    } else {
      claimSlot('sea', OWNER, 30);
      const gridded = (b) => b.legs[b.li]?.grid;
      if (R.goAt === null && ((gridded(j) && gridded(r)) || now - R.t0 > 70)) R.goAt = now + 2.5;
      raceShow.racing = R.goAt !== null && now >= R.goAt && R.first < 0;
      if (raceShow.racing) raceShow.leader = j.d >= r.d ? 0 : 1;
      if (raceShow.crowd === 'party' && now - raceShow.t0 > 5) {
        raceShow.crowd = 'out';
        raceShow.t0 = now;
        showLine.current = false;
      }
      if (raceShow.crowd === 'out' && now - raceShow.t0 > CROWD_WALK + CROWD_STAGGER * 5 + 0.5) raceShow.crowd = 'off';
      if (r.mode === 'away' && j.mode !== 'race' && raceShow.crowd === 'off') {
        st.race = null;
        releaseSlot('sea', OWNER);
        st.nextRace = now + raceGap();
      }
    }

    // --- drive and draw both boats ---
    stepBoat(j, dt, R, now);
    stepBoat(r, dt, R, now);
    drawBoat(jetG.current, j, t, dt, R);
    drawBoat(rivalG.current, r, t, dt, R);
    raceShow.boats[0].x = j.x;
    raceShow.boats[0].z = j.z;
    raceShow.boats[0].on = j.mode === 'race';
    raceShow.boats[1].x = r.x;
    raceShow.boats[1].z = r.z;
    raceShow.boats[1].on = r.mode === 'race';
    if (lines.current) lines.current.visible = j.mode === 'moored';

    // drivers: hands on the wheel, a wave on the way out, a fist pump for the winner
    driverPose(jetDriver.current, j, t, R, 0);
    driverPose(rivalDriver.current, r, t, R, 1);
  });

  function drawBoat(g, b, t, dt, R) {
    if (!g) return;
    const moving = b.mode !== 'moored' && b.mode !== 'away';
    if (b.mode === 'away') {
      g.visible = false;
      world.boats.delete(b.id);
      return;
    }
    g.visible = true;
    const v = b.v;
    const plane = Math.min(1, v / 6);
    ridePose(g, b.x, b.z, b.h, t, JET_LEN, JET_BEAM, moving ? 1.2 : 1.7, 0.07 * plane);
    b.pitch = lerp(b.pitch, -0.085 * plane, Math.min(1, dt * 3));
    b.roll = lerp(b.roll, -clamp(0.035 * v * v * b.k, -0.38, 0.38), Math.min(1, dt * 4));
    g.rotation.x += b.pitch;
    g.rotation.z += b.roll;
    if (!moving) g.position.y += Math.sin(t * 1.1) * 0.015;
    g.position.y -= (1 - b.far) * 1.4;
    registerBoat(b.id, b.x, b.z, b.h, moving ? v : 0, JET_LEN + 0.3, 1);
    if (!moving) return;
    if (b.far < 0.6) return;
    wakeSpray(spray, b.x, b.z, b.h, v, JET_LEN, JET_BEAM, t, { bow: 1.3, wash: 1.5 });
    // rooster tail off the outboards at speed
    if (v > 3 && Math.random() < 0.9 * Math.min(1, (v - 3) / 5)) {
      const sh = Math.sin(b.h);
      const ch = Math.cos(b.h);
      const sx = b.x - sh * (JET_LEN / 2 + 0.25) + ch * (Math.random() - 0.5) * 0.3;
      const sz = b.z - ch * (JET_LEN / 2 + 0.25) - sh * (Math.random() - 0.5) * 0.3;
      spray.emit(sx, waveY(sx, sz, t) + 0.1, sz, -sh * v * 0.4 + (Math.random() - 0.5) * 0.5, 2.0 + Math.random() * 1.4, -ch * v * 0.4 + (Math.random() - 0.5) * 0.5, 0.85, 0.08 + Math.random() * 0.05);
    }
  }

  function driverPose(p, b, t, R, i) {
    if (!p?.armR) return;
    const wonNow = R && R.first === i && raceShow.crowd === 'party';
    const leg = b.legs[b.li];
    const waving = wonNow || (b.mode === 'lap' && b.li === 0) || (b.mode === 'race' && leg?.grid);
    p.armL.rotation.set(-1.15, 0, 0.1);
    if (waving) p.armR.rotation.set(-0.2, 0, 2.5 + Math.sin(t * (wonNow ? 12 : 8)) * 0.35);
    else p.armR.rotation.set(-1.15, 0, -0.1);
    p.pose.rotation.x = -0.12 * Math.min(1, b.v / 8);
    p.head.rotation.y = b.mode === 'race' && R?.goAt !== null && raceShow.racing ? Math.sin(t * 0.8 + i) * 0.35 : Math.sin(t * 0.4 + i) * 0.2;
  }

  return (
    <>
      <group ref={jetG} position={[SLIP.x, 0, SLIP.z]} rotation={[0, SLIP.h, 0]}>
        <JetBoatModel palette={PALETTES.launch} driver={jetDriver} driverColor="#ffb84d" onTap={onTap} pointer={pointer} />
      </group>
      <group ref={rivalG} visible={false}>
        <JetBoatModel palette={PALETTES.rival} driver={rivalDriver} driverColor="#ff6fae" />
      </group>
      <group ref={lines}>
        <Beam a={[DOCK.x0 + 6.6, ROPE_Y, BOLLARD_Z]} b={[BOW[0], JET_DECK + 0.08, BOW[1]]} r={0.014} m={ROPE} />
        <Beam a={[DOCK.x1 - 0.6, ROPE_Y, BOLLARD_Z]} b={[STERN[0], JET_DECK + 0.08, STERN[1]]} r={0.014} m={ROPE} />
      </group>
      <FinishLine show={showLine} />
      <RaceCrowd count={ctx.lowPower ? 3 : 5} />
      <primitive object={spray.mesh} />
    </>
  );
}
