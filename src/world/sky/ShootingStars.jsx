import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { aliveClock, claimSlot, releaseSlot, testOn } from '../../wild/director.js';
import { isDarkNight, pick, rand } from './common.js';

// Shooting stars at night: a bright head and a fading tail, every 20 to 60
// seconds. Now and then a little meteor shower (a dozen streaks from one
// spot in the sky over about 12 seconds), which takes the 'sky' slot.
// They're placed in front of the camera, whatever way it's facing, 110
// units out in the top part of the view. The camera looks down on the
// island, so that's usually over the far sea; they draw on top (no depth
// test) the way the night sky would.

const DIST = 110;
const OWNER = 'meteors';
const _v = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _tail = new THREE.Vector3();
const _side = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _dir = new THREE.Vector3();
const TINTS = [
  [1, 1, 1],
  [0.85, 0.92, 1],
  [1, 0.95, 0.8],
  [0.75, 1, 0.85],
];

export default function ShootingStars({ ctx }) {
  const { sky, lowPower } = ctx;
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const { camera } = useThree();
  const N = lowPower ? 5 : 10;
  const testOne = testOn('stars') || testOn('shootingstars');
  const testShower = testOn('meteors');
  const clock = useMemo(aliveClock, []);

  const { geo, streaks } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 4 * 4), 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < N; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    g.setIndex(idx);
    const list = Array.from({ length: N }, () => ({ on: false, age: 0, life: 1, len: 16, w: 0.35, head: new THREE.Vector3(), vel: new THREE.Vector3(), tint: TINTS[0], bright: 1 }));
    return { geo: g, streaks: list };
  }, [N]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide }), []);
  useEffect(() => () => [geo, mat].forEach((x) => x.dispose()), [geo, mat]);

  const state = useRef({ next: testOne ? 2 : rand(8, 25), shower: null, nextShower: testShower ? 3 : rand(240, 600), anyOn: false });

  // Start a streak at a spot on screen (x, y in -1..1), heading down-left or down-right.
  const launch = (sx, sy, dirX, dirDown, speed, bright) => {
    const s = streaks.find((q) => !q.on);
    if (!s) return;
    _v.set(sx, sy, 0.5).unproject(camera).sub(camera.position).normalize();
    s.head.copy(camera.position).addScaledVector(_v, DIST);
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _up.set(0, 1, 0);
    s.vel.copy(_right).multiplyScalar(dirX).addScaledVector(_up, -dirDown).normalize().multiplyScalar(speed);
    s.on = true;
    s.age = 0;
    s.life = rand(0.6, 1.1);
    s.len = rand(12, 20);
    s.w = rand(0.28, 0.42);
    s.tint = pick(TINTS);
    s.bright = bright;
  };

  useFrame((_, delta) => {
    const t = clock.tick(delta);
    const dt = Math.min(delta, 0.1);
    const st = state.current;
    const dark = isDarkNight(skyRef.current);

    // Singles.
    if (t > st.next) {
      st.next = t + (testOne ? rand(2, 4) : rand(20, 60));
      if (dark || testOne) launch(rand(-0.75, 0.75), rand(0.6, 0.92), Math.random() < 0.5 ? -1 : 1, rand(0.35, 0.7), rand(55, 75), 1);
    }
    // Showers: all streaks share one radiant, so they fan out from a point.
    if (!st.shower && t > st.nextShower) {
      st.nextShower = t + (testShower ? 25 : rand(420, 720));
      const roll = testShower || (dark && Math.random() < 0.35);
      if (roll && claimSlot('sky', OWNER, 15)) {
        st.shower = { start: t, count: lowPower ? 7 : 13, fired: 0, rx: rand(-0.4, 0.4), ry: rand(0.85, 0.95), side: Math.random() < 0.5 ? -1 : 1 };
      }
    }
    if (st.shower) {
      const sh = st.shower;
      const due = Math.floor(((t - sh.start) / 12) * sh.count);
      while (sh.fired < Math.min(due + 1, sh.count)) {
        sh.fired++;
        const spread = rand(0.08, 0.5);
        const ang = rand(-0.9, 0.9);
        launch(sh.rx + Math.sin(ang) * spread * sh.side, sh.ry - Math.cos(ang) * spread * 0.5, sh.side * (0.6 + Math.sin(ang) * 0.5), 0.6, rand(60, 85), rand(0.7, 1));
      }
      if (t - sh.start > 13.5) {
        st.shower = null;
        releaseSlot('sky', OWNER);
      }
    }

    // Draw.
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    let anyOn = false;
    for (let i = 0; i < N; i++) {
      const s = streaks[i];
      const p = i * 12;
      const c = i * 16;
      if (!s.on) {
        if (st.anyOn) for (let k = 0; k < 16; k++) col[c + k] = 0;
        continue;
      }
      anyOn = true;
      s.age += dt;
      if (s.age > s.life) {
        s.on = false;
        for (let k = 0; k < 16; k++) col[c + k] = 0;
        continue;
      }
      s.head.addScaledVector(s.vel, dt);
      const k = s.age / s.life;
      const fade = Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 0.6 * s.bright;
      _dir.copy(s.vel).normalize();
      _tail.copy(s.head).addScaledVector(_dir, -s.len * Math.min(1, s.age / 0.18));
      _toCam.copy(camera.position).sub(s.head).normalize();
      _side.crossVectors(_dir, _toCam).normalize();
      const hw = s.w;
      const tw = s.w * 0.15;
      pos[p] = s.head.x + _side.x * hw; pos[p + 1] = s.head.y + _side.y * hw; pos[p + 2] = s.head.z + _side.z * hw;
      pos[p + 3] = s.head.x - _side.x * hw; pos[p + 4] = s.head.y - _side.y * hw; pos[p + 5] = s.head.z - _side.z * hw;
      pos[p + 6] = _tail.x - _side.x * tw; pos[p + 7] = _tail.y - _side.y * tw; pos[p + 8] = _tail.z - _side.z * tw;
      pos[p + 9] = _tail.x + _side.x * tw; pos[p + 10] = _tail.y + _side.y * tw; pos[p + 11] = _tail.z + _side.z * tw;
      const [r, g, b] = s.tint;
      for (let v = 0; v < 4; v++) {
        const a = v < 2 ? fade : 0;
        col[c + v * 4] = r;
        col[c + v * 4 + 1] = g;
        col[c + v * 4 + 2] = b;
        col[c + v * 4 + 3] = a;
      }
    }
    if (anyOn || st.anyOn) {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
    st.anyOn = anyOn;
  });

  useEffect(() => () => releaseSlot('sky', OWNER), []);

  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={20} />;
}
