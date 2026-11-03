import { useEffect, useState } from 'react';
import * as THREE from 'three';

// Sky and light palette driven by the time in Duvall, WA (America/Los_Angeles).
//   Sunrise 5-7 AM, Day 7 AM-5 PM, Golden hour 5-7 PM, Night 7 PM-5 AM.
// For testing, add ?hour=21 (or any 0-24 value) to the URL.

const TZ = 'America/Los_Angeles';

const NIGHT = {
  top: '#0b1433', horizon: '#25356b', fog: '#1a2550',
  sun: '#b4c4ff', sunI: 0.8, hemiSky: '#5f74b8', hemiGround: '#1f2944', hemiI: 1.0,
  water: '#7f97c4', cloud: '#56628a', stars: 1,
};
const SUNRISE = {
  top: '#d99ac4', horizon: '#ffb27f', fog: '#f6c3a8',
  sun: '#ffb98f', sunI: 1.6, hemiSky: '#ffd6c8', hemiGround: '#7b6a78', hemiI: 1.0,
  water: '#fff0ee', cloud: '#ffd0d8', stars: 0.1,
};
const DAY = {
  top: '#3d8fe8', horizon: '#c4ebff', fog: '#cdeeff',
  sun: '#fff4e0', sunI: 2.3, hemiSky: '#e6f5ff', hemiGround: '#8cbf74', hemiI: 1.25,
  water: '#ffffff', cloud: '#ffffff', stars: 0,
};
const GOLDEN = {
  top: '#e0955a', horizon: '#ffd77e', fog: '#ffdca0',
  sun: '#ffbe6a', sunI: 2.0, hemiSky: '#ffe2b8', hemiGround: '#8a7650', hemiI: 1.05,
  water: '#fff1e2', cloud: '#ffe0b8', stars: 0,
};

const KEYS = [
  [0, NIGHT], [4.8, NIGHT], [6, SUNRISE], [7.2, DAY],
  [16.8, DAY], [18, GOLDEN], [19.2, NIGHT], [24, NIGHT],
];

const COLOR_FIELDS = ['top', 'horizon', 'fog', 'sun', 'hemiSky', 'hemiGround', 'water', 'cloud'];
const NUM_FIELDS = ['sunI', 'hemiI', 'stars'];

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
  const t = h1 > h0 ? Math.min(1, Math.max(0, (h - h0) / (h1 - h0))) : 0;
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
