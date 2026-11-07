// Foam and ripples on the water, drawn by one shared GPU particle system.
//
// Anything can drop a particle with emitFx() (or the ripple()/splashFoam()
// helpers): boat wakes, fish jumps, taps on the water, the whale. Each
// particle is written once into a ring buffer and the shader animates it
// from its birth time, so live particles cost nothing on the CPU.
// Water.jsx owns the mesh and keeps fx.now ticking.

export const FX_MAX = 1536;

export const FX = {
  PUFF: 0, // soft lacy blob that spreads and fades (churned foam)
  STREAK: 1, // stretched blob (wake arms)
  RING: 2, // expanding ripple ring
};

export const fx = {
  now: 0,
  live: false, // false while the water is static (reduced motion)
  head: 0,
  lo: Infinity,
  hi: -1,
  a: new Float32Array(FX_MAX * 4), // x, z, vx, vz
  b: new Float32Array(FX_MAX * 4).fill(-999), // t0, life, size, grow
  c: new Float32Array(FX_MAX * 4), // kind, rotation, aspect, glowOnly
};

// Drop one particle. glow = 1 makes it a night-only bioluminescent blob.
// Positional args so hot paths (wakes) don't allocate.
export function emitFx(kind, x, z, vx = 0, vz = 0, life = 2, size = 1, grow = 1, rot = 0, aspect = 1, glow = 0, delay = 0) {
  if (!fx.live) return;
  const i = fx.head;
  fx.head = (i + 1) % FX_MAX;
  const k = i * 4;
  fx.a[k] = x;
  fx.a[k + 1] = z;
  fx.a[k + 2] = vx;
  fx.a[k + 3] = vz;
  fx.b[k] = fx.now + delay;
  fx.b[k + 1] = life;
  fx.b[k + 2] = size;
  fx.b[k + 3] = grow;
  fx.c[k] = kind;
  fx.c[k + 1] = rot;
  fx.c[k + 2] = aspect;
  fx.c[k + 3] = glow;
  if (i < fx.lo) fx.lo = i;
  if (i > fx.hi) fx.hi = i;
}

// A gentle ripple: two rings, the second a beat behind.
export function ripple(x, z, size = 1, delay = 0) {
  emitFx(FX.RING, x, z, 0, 0, 2.4 + size * 0.5, 0.25 * size, 5, 0, 1, 0, delay);
  emitFx(FX.RING, x, z, 0, 0, 2.0 + size * 0.4, 0.18 * size, 4.2, 0, 1, 0, delay + 0.4);
}

// Something hit the water: a ring, a burst of foam, and glow at night.
export function splashFoam(x, z, size = 1, linger = 1) {
  ripple(x, z, size * 1.4);
  emitFx(FX.PUFF, x, z, 0, 0, 2.5 * linger, 0.45 * size, 1.6, 0, 1);
  const n = size > 2 ? 10 : 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const v = (0.35 + Math.random() * 0.3) * size;
    emitFx(FX.PUFF, x, z, Math.cos(a) * v, Math.sin(a) * v, (2.2 + Math.random()) * linger, 0.3 * size, 1.4, a, 1.4);
  }
  emitFx(FX.PUFF, x, z, 0, 0, 3.5 * linger, 0.8 * size, 2, 0, 1, 1);
}
