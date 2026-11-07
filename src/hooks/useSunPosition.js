import { useEffect, useState } from 'react';
import * as THREE from 'three';

// Sky and light palette driven by the time in Duvall, WA (America/Los_Angeles).
//   Sunrise 5-7 AM, Day 7 AM-5 PM, Golden hour 5-7 PM, Night 7 PM-5 AM.
//   (Phase labels; the colors ease through finer key frames, see KEYS.)
// For testing, add ?hour=21 (or any 0-24 value) to the URL.

const TZ = 'America/Los_Angeles';

// Key frames. Each one is a full palette; skyForHour eases between the two
// around the current hour with a smoothstep, so dawn and dusk roll through
// pre-dawn blue, pink, orange, gold, red-orange, violet and blue hour.
//   glow / glowI: the horizon glow toward the sun (sunrise and sunset).
const NIGHT = {
  top: '#0b1433', horizon: '#25356b', fog: '#1a2550',
  sun: '#b4c4ff', sunI: 0.8, hemiSky: '#5f74b8', hemiGround: '#1f2944', hemiI: 1.0,
  water: '#7f97c4', cloud: '#56628a', stars: 1, glow: '#3a4a8a', glowI: 0,
};
const PREDAWN = {
  top: '#1c2a5c', horizon: '#5a6aa8', fog: '#46558e',
  sun: '#b9c2ff', sunI: 0.9, hemiSky: '#7a88c8', hemiGround: '#2a3150', hemiI: 1.0,
  water: '#a3b2dc', cloud: '#7a84b4', stars: 0.65, glow: '#8f86d8', glowI: 0.35,
};
const DAWN = {
  top: '#6f74b8', horizon: '#f2a6c0', fog: '#e2b0c8',
  sun: '#ffb0c0', sunI: 1.2, hemiSky: '#f0c8dc', hemiGround: '#5e5470', hemiI: 1.0,
  water: '#ffe4f0', cloud: '#f7c2d6', stars: 0.3, glow: '#ff9ec0', glowI: 0.8,
};
const SUNRISE = {
  top: '#d99ac4', horizon: '#ffb27f', fog: '#f6c3a8',
  sun: '#ffb98f', sunI: 1.6, hemiSky: '#ffd6c8', hemiGround: '#7b6a78', hemiI: 1.0,
  water: '#fff0ee', cloud: '#ffd0d8', stars: 0.08, glow: '#ffa060', glowI: 1,
};
const MORNING = {
  top: '#6aa6e8', horizon: '#ffe0c0', fog: '#f4e6d8',
  sun: '#ffe2c0', sunI: 2.0, hemiSky: '#f0eeff', hemiGround: '#8cb07a', hemiI: 1.15,
  water: '#fffaf4', cloud: '#fff2ea', stars: 0, glow: '#ffd2a0', glowI: 0.45,
};
const DAY = {
  top: '#3d8fe8', horizon: '#c4ebff', fog: '#cdeeff',
  sun: '#fff4e0', sunI: 2.3, hemiSky: '#e6f5ff', hemiGround: '#8cbf74', hemiI: 1.25,
  water: '#ffffff', cloud: '#ffffff', stars: 0, glow: '#fff6e0', glowI: 0.12,
};
const LATE_GOLD = {
  top: '#7fa0d8', horizon: '#ffe6a6', fog: '#fbe8c0',
  sun: '#ffd890', sunI: 2.15, hemiSky: '#fff0d0', hemiGround: '#8fb070', hemiI: 1.15,
  water: '#fff6e8', cloud: '#fff0d4', stars: 0, glow: '#ffd27a', glowI: 0.5,
};
const GOLDEN = {
  top: '#e0955a', horizon: '#ffd77e', fog: '#ffdca0',
  sun: '#ffbe6a', sunI: 2.0, hemiSky: '#ffe2b8', hemiGround: '#8a7650', hemiI: 1.05,
  water: '#fff1e2', cloud: '#ffe0b8', stars: 0, glow: '#ffb050', glowI: 0.85,
};
const SUNSET = {
  top: '#c27aa6', horizon: '#ff9a6a', fog: '#f8b392',
  sun: '#ff9a62', sunI: 1.6, hemiSky: '#ffc8b0', hemiGround: '#7a5c62', hemiI: 1.0,
  water: '#ffe2d6', cloud: '#ffbca8', stars: 0.05, glow: '#ff6a40', glowI: 1,
};
const DUSK = {
  top: '#5a5aa6', horizon: '#d88ab8', fog: '#b98ab8',
  sun: '#e0a0d0', sunI: 1.15, hemiSky: '#c0a6dc', hemiGround: '#463e60', hemiI: 1.0,
  water: '#e6d0f0', cloud: '#c39ac8', stars: 0.35, glow: '#ff7aa0', glowI: 0.7,
};
const BLUE_HOUR = {
  top: '#1c2a64', horizon: '#4a5aa6', fog: '#3a4882',
  sun: '#b0bcff', sunI: 0.9, hemiSky: '#6a7cc4', hemiGround: '#252c4c', hemiI: 1.0,
  water: '#9aaad8', cloud: '#6a74a6', stars: 0.75, glow: '#7a6ac8', glowI: 0.3,
};

const KEYS = [
  [0, NIGHT], [4.5, NIGHT], [5.15, PREDAWN], [5.65, DAWN], [6.15, SUNRISE], [6.9, MORNING], [7.8, DAY],
  [16.3, DAY], [17.1, LATE_GOLD], [17.7, GOLDEN], [18.15, SUNSET], [18.65, DUSK], [19.2, BLUE_HOUR], [20.0, NIGHT], [24, NIGHT],
];

const COLOR_FIELDS = ['top', 'horizon', 'fog', 'sun', 'hemiSky', 'hemiGround', 'water', 'cloud', 'glow'];
const NUM_FIELDS = ['sunI', 'hemiI', 'stars', 'glowI'];
const smooth = (t) => t * t * (3 - 2 * t);

export function getLAHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  return (get('hour') % 24) + get('minute') / 60 + get('second') / 3600;
}

export function phaseForHour(h) {
  if (h >= 5 && h < 7) return 'sunrise';
  if (h >= 7 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'golden';
  return 'night';
}

export const PHASE_LABELS = { sunrise: 'Sunrise', day: 'Daytime', golden: 'Golden hour', night: 'Night' };

function formatClock(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

export function skyForHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++;
  const [h0, a] = KEYS[i];
  const [h1, b] = KEYS[i + 1];
  const t = h1 > h0 ? smooth(Math.min(1, Math.max(0, (h - h0) / (h1 - h0)))) : 0;
  const out = {};
  const ca = new THREE.Color();
  const cb = new THREE.Color();
  for (const f of COLOR_FIELDS) {
    ca.set(a[f]);
    cb.set(b[f]);
    out[f] = `#${ca.lerp(cb, t).getHexString()}`;
  }
  for (const f of NUM_FIELDS) out[f] = a[f] + (b[f] - a[f]) * t;

  // Sun rises in the east (+x) at 6, peaks south-ish at noon, sets west at 18.
  const theta = ((h - 6) / 12) * Math.PI;
  const sunDir = new THREE.Vector3(Math.cos(theta) * 0.9, Math.sin(theta), 0.45).normalize();
  const moonDir = new THREE.Vector3(-Math.cos(theta) * 0.8, -Math.sin(theta), 0.5).normalize();
  const sunUp = sunDir.y > -0.02;
  const lightDir = sunDir.y > 0.08 ? sunDir : moonDir.y > 0.08 ? moonDir : new THREE.Vector3(0.3, 0.8, 0.5).normalize();

  const phase = phaseForHour(h);
  return {
    ...out,
    hour: h,
    phase,
    phaseLabel: PHASE_LABELS[phase],
    isNight: phase === 'night',
    clock: formatClock(h),
    sunDir: sunDir.toArray(),
    moonDir: moonDir.toArray(),
    sunUp,
    moonUp: moonDir.y > 0.05,
    lightDir: lightDir.toArray(),
    key: `${phase}-${h.toFixed(2)}`,
  };
}

function readOverride() {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('hour');
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? ((n % 24) + 24) % 24 : null;
}

export default function useSunPosition() {
  const [sky, setSky] = useState(() => skyForHour(readOverride() ?? getLAHour()));
  useEffect(() => {
    const override = readOverride();
    if (override !== null) return undefined;
    const tick = () => setSky(skyForHour(getLAHour()));
    const timer = setInterval(tick, 60 * 1000);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return sky;
}
