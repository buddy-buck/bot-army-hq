import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { aliveClock, claimSlot, releaseSlot, testOn } from '../../wild/director.js';
import { skyRequests, world } from '../state.js';
import { cameraYaw, heightAtNdc, pick, rand } from './common.js';
import { skyFx } from './fx.js';
import { ISLAND } from '../../utils/paths.js';

// Fireworks launched from the water just off the beach: rockets
// climb with a sparkly trail and burst as a peony, a ring, a golden willow
// that drips glitter, or the Buck shell (gold with a blue heart). One pooled
// Points cloud holds every spark.
//
// When:
//   - App bumps skyRequests.fireworks (minutes saved crossed a round
//     thousand), day or night: a short show.
//   - 9 PM Duvall time, once per visit: the nightly show with a finale.
//   - Rarely, a small surprise show on some nights.
//   - ?test=fireworks: a show right away and every ~25 seconds.
// Shows take the 'sky' slot so they never overlap another big sky show.
//
// The camera looks down on the island, so a show high over a beach would
// burst above the top of the frame. Rockets go up from just off the beaches
// to the left and right of the view (east and west when the camera is south,
// as it starts), and burst at a height that
// lands in the upper half of the view. At night each burst softly lights
// the island in its color.

const OWNER = 'fireworks';
const G = 9; // rocket gravity
const COLORS = ['#ff4d6d', '#4dd2ff', '#b26bff', '#7dff8a', '#ffb03b', '#ff7ad9', '#fff1a8'];
const GOLD = '#ffd25e';
const BUCK_BLUE = '#3f7bff';
const KINDS = ['peony', 'ring', 'willow', 'peony', 'ring', 'crackle'];

// Per-visit memory so the 9 PM show plays once.
let nightlyPlayed = false;

const vertex = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uScale * 1.2 / -mv.z, 0.0, 64.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const fragment = /* glsl */ `
  uniform float uDay;
  varying vec4 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    // A bright core in a soft glow.
    float a = vColor.a * (smoothstep(0.5, 0.0, d) * 0.5 + smoothstep(0.16, 0.0, d) * 0.9);
    if (a < 0.003) discard;
    // At night the core burns white-hot; by day keep the color strong.
    vec3 c = mix(vColor.rgb, vec3(1.0), smoothstep(0.14, 0.0, d) * 0.5 * (1.0 - uDay));
    gl_FragColor = vec4(c, a);
  }
`;

// A show is a list of shells: { at, kind, x (spread along the beach), h (burst
// height as a spot on screen, -1 bottom .. 1 top) }.
function makeShow(n, seconds, finale) {
  const shells = [];
  const main = finale ? Math.round(n * 0.7) : n;
  for (let i = 0; i < main; i++) {
    shells.push({ at: (i / Math.max(1, main - 1)) * (finale ? seconds * 0.78 : seconds) + rand(-0.4, 0.4), kind: pick(KINDS), x: rand(-8, 8), h: rand(0.4, 0.62) });
  }
  if (finale) {
    const rest = n - main;
    for (let i = 0; i < rest; i++) shells.push({ at: seconds * 0.82 + (i / rest) * seconds * 0.14, kind: pick(['peony', 'crackle', 'ring']), x: rand(-9, 9), h: rand(0.45, 0.68) });
  }
  // Every show has a Buck shell; the finale ends on one.
  shells.push({ at: seconds + 0.6, kind: 'buck', x: rand(-2, 2), h: 0.6 });
  if (!finale) shells[Math.floor(shells.length / 2)].kind = 'willow';
  shells.forEach((s) => (s.at = Math.max(0, s.at)));
  return shells.sort((a, b) => a.at - b.at);
}

export default function Fireworks({ ctx }) {
  const { sky, lowPower } = ctx;
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const { size, gl, camera } = useThree();
  const test = testOn('fireworks');
  const N = lowPower ? 600 : 1500;
  const clock = useMemo(aliveClock, []);

  const P = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 4);
    const sz = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1).setUsage(THREE.DynamicDrawUsage));
    return {
      geo, pos, col, sz,
      vel: new Float32Array(N * 3),
      rgb: new Float32Array(N * 3),
      age: new Float32Array(N),
      life: new Float32Array(N),
      kind: new Uint8Array(N), // 0 dead, 1 rocket, 2 spark, 3 trail ember, 4 glitter
      drag: new Float32Array(N),
      grav: new Float32Array(N),
      base: new Float32Array(N),
      shell: [], // rocket index -> burst kind
      next: 0,
      alive: 0,
      spawned: 0,
    };
  }, [N]);
  const uniforms = useMemo(() => ({ uScale: { value: 400 }, uDay: { value: 0 } }), []);
  const mat = useMemo(
    () => new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    [uniforms]
  );
  useEffect(() => () => [P.geo, mat].forEach((x) => x.dispose()), [P, mat]);
  useEffect(() => () => {
    releaseSlot('sky', OWNER);
    world.glow.delete(OWNER);
    skyFx.flash = 0;
  }, []);

  const S = useRef({
    show: null, // { start, shells, i, until }
    pending: [], // shows waiting for the slot
    seenReq: 0,
    nightT: 0,
    surpriseAt: Math.random() < 0.15 ? rand(150, 480) : Infinity,
    surpriseDone: false,
    nextTest: test ? 2 : Infinity,
    flash: 0,
    flashX: 0,
    flashZ: 0,
    day: -1,
  });

  const spawn = (kind, x, y, z, vx, vy, vz, color, life, size, drag, grav) => {
    const i = P.next;
    P.next = (P.next + 1) % N;
    if (P.kind[i] === 0) P.alive++;
    P.spawned++;
    P.kind[i] = kind;
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
    P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
    P.rgb[i * 3] = color.r; P.rgb[i * 3 + 1] = color.g; P.rgb[i * 3 + 2] = color.b;
    P.age[i] = 0;
    P.life[i] = life;
    P.base[i] = size;
    P.drag[i] = drag;
    P.grav[i] = grav;
    return i;
  };

  const tmpC = useMemo(() => new THREE.Color(), []);
  const tmpC2 = useMemo(() => new THREE.Color(), []);
  const axis = useMemo(() => ({ u: new THREE.Vector3(), v: new THREE.Vector3(), n: new THREE.Vector3() }), []);

  const burst = (kind, x, y, z) => {
    const lp = lowPower ? 0.55 : 1;
    const sphere = (n, speed, color, life, size, drag, grav, k = 2, jitter = 0.12) => {
      for (let j = 0; j < n; j++) {
        // Even-ish spread on a sphere (golden spiral) with a little jitter.
        const yy = 1 - (2 * (j + 0.5)) / n;
        const r = Math.sqrt(1 - yy * yy);
        const a = j * 2.39996 + rand(-jitter, jitter);
        const sp = speed * rand(0.88, 1.0);
        spawn(k, x, y, z, Math.cos(a) * r * sp, yy * sp, Math.sin(a) * r * sp, color, life * rand(0.85, 1.1), size, drag, grav);
      }
    };
    if (kind === 'peony') {
      sphere(Math.round(140 * lp), rand(6, 7), tmpC.set(pick(COLORS)), 1.9, 1.15, 1.25, 3.2);
    } else if (kind === 'crackle') {
      sphere(Math.round(90 * lp), 6.3, tmpC.set(pick(COLORS)), 1.6, 1.1, 1.3, 3.2);
      sphere(Math.round(50 * lp), 3.6, tmpC2.set('#fff6d8'), 1.5, 0.75, 1.4, 2.5, 4);
    } else if (kind === 'ring') {
      tmpC.set(pick(COLORS));
      // Tilted toward the viewer so it reads as a ring, not a line.
      axis.n.copy(camera.position).sub(axis.u.set(x, y, z)).normalize();
      axis.n.x += rand(-0.4, 0.4);
      axis.n.y += rand(-0.3, 0.5);
      axis.n.normalize();
      axis.u.set(0, 1, 0).cross(axis.n).normalize();
      axis.v.crossVectors(axis.n, axis.u);
      const n = Math.round(90 * lp);
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2;
        const sp = 7;
        const dx = axis.u.x * Math.cos(a) + axis.v.x * Math.sin(a);
        const dy = axis.u.y * Math.cos(a) + axis.v.y * Math.sin(a);
        const dz = axis.u.z * Math.cos(a) + axis.v.z * Math.sin(a);
        spawn(2, x, y, z, dx * sp, dy * sp, dz * sp, tmpC, 1.8, 1.25, 1.2, 2.6);
      }
      sphere(Math.round(24 * lp), 2.5, tmpC2.set('#ffffff'), 1.1, 0.9, 1.5, 2);
    } else if (kind === 'willow') {
      sphere(Math.round(100 * lp), 4.8, tmpC.set(GOLD), 3.2, 1.0, 0.95, 3.6, 4);
    } else if (kind === 'buck') {
      sphere(Math.round(150 * lp), 7, tmpC.set(GOLD), 2.6, 1.25, 1.05, 3.4, 4);
      sphere(Math.round(55 * lp), 3.4, tmpC2.set(BUCK_BLUE), 1.9, 1.2, 1.3, 2.6);
    }
    const st = S.current;
    const c = kind === 'buck' || kind === 'willow' ? tmpC.set(GOLD) : tmpC;
    skyFx.flashColor[0] = c.r;
    skyFx.flashColor[1] = c.g;
    skyFx.flashColor[2] = c.b;
    st.flash = 1;
    st.flashX = x;
    st.flashZ = z;
  };

  const startShow = (shells, owner = OWNER) => {
    const dur = shells[shells.length - 1].at + 5;
    if (!claimSlot('sky', owner, dur)) return false;
    S.current.show = { start: clock.t, shells, i: 0, until: clock.t + dur };
    return true;
  };

  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const dt = Math.min(delta, 0.05);
    const st = S.current;
    const s = skyRef.current;

    // Requests from the app (a round thousand minutes saved).
    if (skyRequests.fireworks !== st.seenReq) {
      st.seenReq = skyRequests.fireworks;
      st.pending.push({ shells: makeShow(lowPower ? 6 : 9, 9, false), until: t + 90 });
    }
    // The 9 PM show, once per visit.
    if (!nightlyPlayed && s.hour >= 21 && s.hour < 21.05) {
      nightlyPlayed = true;
      st.pending.push({ shells: makeShow(lowPower ? 16 : 26, 40, true), until: t + 240 });
    }
    // A rare surprise on some nights.
    if (s.isNight && s.stars > 0.6) st.nightT += dt;
    if (!st.surpriseDone && st.nightT > st.surpriseAt) {
      st.surpriseDone = true;
      st.pending.push({ shells: makeShow(lowPower ? 8 : 12, 18, false), until: t + 120 });
    }
    if (t > st.nextTest) {
      st.nextTest = t + 25;
      if (!st.show) st.pending.push({ shells: makeShow(lowPower ? 7 : 11, 13, Math.random() < 0.4), until: t + 20 });
    }
    if (!st.show && st.pending.length) {
      st.pending = st.pending.filter((p) => p.until > t);
      if (st.pending.length && startShow(st.pending[0].shells)) st.pending.shift();
    }

    // Fire the shells that are due.
    if (st.show) {
      const sh = st.show;
      while (sh.i < sh.shells.length && t - sh.start >= sh.shells[sh.i].at) {
        const shell = sh.shells[sh.i++];
        const side = sh.i % 2 ? 1 : -1;
        const a = cameraYaw(camera) + Math.PI + side * (Math.PI / 2 + 0.05) + shell.x * 0.03;
        const ex = Math.sin(a) / ISLAND.rx;
        const ez = Math.cos(a) / ISLAND.rz;
        const rr = 1.22 / Math.hypot(ex, ez) + rand(0, 2); // just off the beach
        const x = Math.sin(a) * rr;
        const z = Math.cos(a) * rr;
        const h = Math.min(22, Math.max(6.5, heightAtNdc(camera, x, z, shell.h, 14)));
        const vy = Math.sqrt(2 * G * h);
        const r = spawn(1, x, 0.4, z, rand(-0.5, 0.5), vy, rand(-0.5, 0.5), tmpC.set('#ffe7b0'), 6, 1.4, 0, G);
        P.shell[r] = shell.kind;
      }
      if (t > sh.until) {
        st.show = null;
        releaseSlot('sky', OWNER);
      }
    }

    // Day or night look: additive glow at night, solid color by day.
    const day = s.sunUp && !s.isNight ? 1 : 0;
    if (day !== st.day) {
      st.day = day;
      mat.blending = day ? THREE.NormalBlending : THREE.AdditiveBlending;
      mat.needsUpdate = true;
      uniforms.uDay.value = day;
    }
    uniforms.uScale.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));

    // Night flashes light up the water a little.
    st.flash = Math.max(0, st.flash - dt * 1.6);
    skyFx.flash = day ? 0 : st.flash;
    if (st.flash > 0.01 && !day) world.glow.set(OWNER, { x: st.flashX, z: st.flashZ, strength: st.flash });
    else world.glow.delete(OWNER);

    if (P.alive === 0) return;
    let alive = 0;
    P.spawned = 0;
    const emit = !lowPower || Math.floor(t * 60) % 2 === 0;
    for (let i = 0; i < N; i++) {
      const k = P.kind[i];
      if (k === 0) continue;
      P.age[i] += dt;
      const i3 = i * 3;
      if (k === 1) {
        // Rocket: climb, shed embers, burst near the top.
        P.vel[i3 + 1] -= G * dt;
        P.pos[i3] += P.vel[i3] * dt;
        P.pos[i3 + 1] += P.vel[i3 + 1] * dt;
        P.pos[i3 + 2] += P.vel[i3 + 2] * dt;
        if (emit) {
          const e = spawn(3, P.pos[i3] + rand(-0.05, 0.05), P.pos[i3 + 1] - 0.2, P.pos[i3 + 2], rand(-0.4, 0.4), rand(-1.5, -0.5), rand(-0.4, 0.4), tmpC2.set('#ffc46a'), rand(0.35, 0.6), 0.55, 2, 2);
          if (e === i) continue; // pool wrapped onto the rocket itself
        }
        P.col[i * 4] = 1; P.col[i * 4 + 1] = 0.92; P.col[i * 4 + 2] = 0.7; P.col[i * 4 + 3] = 1;
        P.sz[i] = 1.4;
        if (P.vel[i3 + 1] < 1.2) {
          P.kind[i] = 0;
          P.col[i * 4 + 3] = 0;
          P.sz[i] = 0;
          P.alive--;
          burst(P.shell[i] || 'peony', P.pos[i3], P.pos[i3 + 1], P.pos[i3 + 2]);
          continue;
        }
        alive++;
        continue;
      }
      const life = P.life[i];
      const a = P.age[i] / life;
      if (a >= 1) {
        P.kind[i] = 0;
        P.col[i * 4 + 3] = 0;
        P.sz[i] = 0;
        P.alive--;
        continue;
      }
      alive++;
      const damp = Math.exp(-P.drag[i] * dt);
      P.vel[i3] *= damp;
      P.vel[i3 + 1] = P.vel[i3 + 1] * damp - P.grav[i] * dt;
      P.vel[i3 + 2] *= damp;
      P.pos[i3] += P.vel[i3] * dt;
      P.pos[i3 + 1] += P.vel[i3 + 1] * dt;
      P.pos[i3 + 2] += P.vel[i3 + 2] * dt;
      let alpha = (1 - a) ** 1.4;
      if (k === 4) alpha *= 0.35 + 0.65 * (Math.sin(P.age[i] * 38 + i * 1.7) > 0.2 ? 1 : 0.15); // glitter twinkle
      if (k === 3) alpha *= 0.7;
      // Sparks cool from white-hot to their color.
      const hot = Math.max(0, 1 - P.age[i] * 4);
      P.col[i * 4] = P.rgb[i3] + (1 - P.rgb[i3]) * hot;
      P.col[i * 4 + 1] = P.rgb[i3 + 1] + (1 - P.rgb[i3 + 1]) * hot;
      P.col[i * 4 + 2] = P.rgb[i3 + 2] + (1 - P.rgb[i3 + 2]) * hot;
      P.col[i * 4 + 3] = alpha;
      P.sz[i] = P.base[i] * (0.55 + 0.45 * (1 - a));
    }
    P.alive = alive + P.spawned; // sparks born this frame count too
    P.geo.attributes.position.needsUpdate = true;
    P.geo.attributes.aColor.needsUpdate = true;
    P.geo.attributes.aSize.needsUpdate = true;
  });

  return <points geometry={P.geo} material={mat} frustumCulled={false} renderOrder={6} />;
}
