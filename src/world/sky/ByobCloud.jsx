import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { aliveClock, testOn } from '../../wild/director.js';
import { PUFF_GEO, cloudMaterial, cloudUniforms, setCloudUniforms } from './cloudLook.js';
import { clamp01, heightAtNdc, isDaytime, rand, smooth } from './common.js';
import { skyFx } from './fx.js';

// Sky writing, cloud style: now and then by day a puffy cloud gathers over
// the far side of the island and reshapes itself into the letters "BYOB",
// built from the same faceted puffs as the other clouds. It drifts slowly,
// then melts back into a plain cloud and puffs away. While it's up, the
// nearest ordinary low cloud melts out of the way (Sky.jsx reads skyFx.byob).
// Tap the letters: "BYOB: Boss Your Own Bots. bossyourownbots.com".
//
// Every 4-7 minutes of daytime viewing, up for 25-40 seconds.
// ?test=byob: right away and every ~45 seconds.

const TOAST = 'BYOB: Boss Your Own Bots. bossyourownbots.com';
// Distance from the island center, on the far side from the camera.
const R_MAX = 30;
const R_MIN = 16;
const MIN_Y = 4;
const NDC_Y = 0.64; // where on screen the word sits (low clouds sit at 0.7-0.82)
const SCALE = 1.35;
const H = 3.6; // letter height (word units)
const W = 2.1; // letter width
const GAP = 0.85;
const STEP = 0.42; // puff spacing along a stroke
const PUFF = 0.42;

// Strokes for each letter, polylines in a W x H box (y up).
const B = [
  [[0, 0], [0, H]],
  [[0, H], [1.2, H], [1.72, H - 0.42], [1.72, H - 1.2], [1.25, H / 2 + 0.05], [0, H / 2 + 0.05]],
  [[1.25, H / 2 + 0.05], [1.95, H / 2 - 0.4], [1.95, 0.45], [1.35, 0], [0, 0]],
];
const Y = [
  [[0, H], [W / 2, H * 0.47]],
  [[W, H], [W / 2, H * 0.47]],
  [[W / 2, H * 0.47], [W / 2, 0]],
];
const O = [
  Array.from({ length: 17 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return [W / 2 + Math.sin(a) * (W / 2), H / 2 + Math.cos(a) * (H / 2)];
  }),
];
const WORD = [B, Y, O, B];

// Puffs: target spot in the letters, a start spot in a plain cumulus clump,
// size, and a delay so the word forms left to right.
const PUFFS = (() => {
  const out = [];
  const total = WORD.length * W + (WORD.length - 1) * GAP;
  let ox = -total / 2;
  let seed = 11;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (const letter of WORD) {
    for (const stroke of letter) {
      for (let i = 0; i < stroke.length - 1; i++) {
        const [ax, ay] = stroke[i];
        const [bx, by] = stroke[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        const n = Math.max(1, Math.round(len / STEP));
        for (let k = i === 0 ? 0 : 1; k <= n; k++) {
          const f = k / n;
          const x = ox + ax + (bx - ax) * f;
          const y = ay + (by - ay) * f - H / 2;
          const s = PUFF * (0.9 + r() * 0.35);
          // start inside a lumpy cumulus around the word's middle
          const a = r() * Math.PI * 2;
          const rr = Math.sqrt(r());
          out.push({
            to: [x + (r() - 0.5) * 0.08, y + (r() - 0.5) * 0.08, (r() - 0.5) * 0.3],
            from: [Math.cos(a) * rr * 4.6, Math.sin(a) * rr * 1.3 - 0.2, (r() - 0.5) * 1.6],
            s: [s * (1 + r() * 0.15), s, s * 0.9],
            fs: 1.5 + r() * 0.9, // bigger, rounder puffs while it's a plain cloud
            d: (x + total / 2) / total,
            ph: r() * 6.28,
          });
        }
      }
    }
    ox += W + GAP;
  }
  return out;
})();

// A generous invisible tap target over the word.
const HIT = new THREE.BoxGeometry(WORD.length * W + (WORD.length - 1) * GAP + 1.4, H + 1.4, 1.2);
const M_HIT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();

export default function ByobCloud({ ctx }) {
  const { sky, onToast } = ctx;
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const toastRef = useRef(onToast);
  toastRef.current = onToast;
  const { camera } = useThree();
  const test = testOn('byob');
  const clock = useMemo(aliveClock, []);
  const group = useRef();
  const mesh = useRef();
  const uniforms = useMemo(cloudUniforms, []);
  const material = useMemo(() => cloudMaterial(uniforms), [uniforms]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => setCloudUniforms(uniforms, sky), [sky, uniforms]);
  useEffect(
    () => () => {
      skyFx.byob = 0;
      document.body.style.cursor = '';
    },
    []
  );

  const S = useRef({ start: -1, life: 0, next: test ? 3 : rand(240, 420), pos: new THREE.Vector3(), yaw: 0, placed: false, vis: 0, boing: 0 });

  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const dt = Math.min(delta, 0.1);
    const s = S.current;
    const g = group.current;
    const m = mesh.current;
    if (!g || !m) return;

    if (s.start < 0) {
      if (t < s.next) return;
      if (!test && !isDaytime(skyRef.current)) {
        s.next = t + 30;
        return;
      }
      s.start = t;
      s.life = test ? 30 : rand(25, 40);
      s.placed = false;
    }
    const age = t - s.start;
    if (age > s.life) {
      s.start = -1;
      s.next = t + (test ? 15 : rand(240, 420));
      g.visible = false;
      skyFx.byob = 0;
      return;
    }

    // Anchor: across the island from the camera, drifting slowly sideways,
    // easing along as the camera turns.
    const cx = camera.position.x;
    const cz = camera.position.z;
    const fl = Math.hypot(cx, cz) || 1;
    const fx = -cx / fl;
    const fz = -cz / fl;
    const drift = (age / s.life - 0.5) * 5;
    // Out over the far sea if the view has room there; on a squat view
    // (little sky showing) pull in toward the island so the word stays below
    // the top of the screen instead of floating off it.
    let dist = R_MAX;
    let ay = heightAtNdc(camera, fx * dist, fz * dist, NDC_Y, 10);
    while (ay < MIN_Y && dist > R_MIN) {
      dist -= 2;
      ay = heightAtNdc(camera, fx * dist, fz * dist, NDC_Y, 10);
    }
    ay = Math.min(17, Math.max(MIN_Y, ay));
    const ax = fx * dist - fz * drift; // (-fz, fx) is the view's right, so it drifts left to right
    const az = fz * dist + fx * drift;
    _a.set(ax, ay, az);
    const yawWant = Math.atan2(cx - ax, cz - az);
    if (!s.placed) {
      s.pos.copy(_a);
      s.yaw = yawWant;
      s.placed = true;
    } else {
      s.pos.lerp(_a, Math.min(1, dt * 0.6));
      let dy = yawWant - s.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      s.yaw += dy * Math.min(1, dt * 0.6);
    }
    g.visible = true;
    g.position.set(s.pos.x, s.pos.y + Math.sin(t * 0.4) * 0.2, s.pos.z);
    g.rotation.set(0, s.yaw, Math.sin(t * 0.23) * 0.02);
    s.boing = Math.max(0, s.boing - dt * 1.6);
    const boing = 1 + Math.sin(s.boing * 14) * s.boing * 0.08;
    g.scale.setScalar(SCALE * boing);

    // Puffs: grow as a clump, gather into letters, hold, melt back, puff away.
    const left = s.life - age;
    let word = 0;
    for (let i = 0; i < PUFFS.length; i++) {
      const p = PUFFS[i];
      const mIn = smooth(0, 1, (age - 2.2 - p.d * 1.6) / 3.0);
      const mOut = smooth(0, 1, (left - 2.4 - (1 - p.d) * 1.2) / 3.0);
      const k = Math.min(mIn, mOut);
      const grow = Math.min(smooth(0, 1, (age - p.d * 0.6) / 2.0), smooth(0, 1, (left - p.d * 0.4) / 2.0));
      const wob = Math.sin(t * 0.9 + p.ph) * 0.05;
      _p.set(p.from[0] + (p.to[0] - p.from[0]) * k, p.from[1] + (p.to[1] - p.from[1]) * k + wob, p.from[2] + (p.to[2] - p.from[2]) * k);
      const big = p.fs + (1 - p.fs) * k;
      const sc = Math.max(0.0001, grow * big);
      _s.set(p.s[0] * sc, p.s[1] * sc, p.s[2] * sc);
      m.setMatrixAt(i, _m.compose(_p, _q.identity(), _s));
      word += k;
    }
    m.instanceMatrix.needsUpdate = true;
    s.vis = word / PUFFS.length;

    // Let Sky.jsx melt the plain cloud nearest the letters.
    skyFx.byob = clamp01(Math.min(age / 3, left / 3));
    skyFx.byobX = s.pos.x;
    skyFx.byobZ = s.pos.z;
  });

  const onTap = (e) => {
    if (S.current.vis < 0.5) return;
    e.stopPropagation();
    if (e.delta > 8) return;
    S.current.boing = 1;
    toastRef.current?.(TOAST);
  };

  return (
    <group ref={group} visible={false}>
      <instancedMesh ref={mesh} args={[PUFF_GEO, material, PUFFS.length]} frustumCulled={false} />
      <mesh
        geometry={HIT}
        material={M_HIT}
        onClick={onTap}
        onPointerOver={(e) => {
          if (S.current.vis < 0.5) return;
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      />
    </group>
  );
}
