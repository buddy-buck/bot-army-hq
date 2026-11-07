import { useEffect, useState } from 'react';
import * as THREE from 'three';

// Sky and light palette driven by the time in Duvall, WA (America/Los_Angeles).
//   Sunrise 5-7 AM, Day 7 AM-5 PM, Golden hour 5-7 PM, Night 7 PM-5 AM.
// For testing, add ?hour=21 (or any 0-24 value) to the URL.
//
// Between the four phases there are in-between looks: a blue hour before
// dawn and after dusk, a pink-violet dawn, a coral sunrise, a molten orange
// sunset that slides into magenta dusk. Colors blend smoothly between keys.
//
// Fields (all colors are hex strings):
//   top, horizon, fog        sky dome and distance fog
//   sun, sunI                the directional light (sun or moon)
//   hemiSky, hemiGround, hemiI
//   water                    tint multiplied into the sea
//   cloud                    cloud tops
//   glow, glowK              sunrise/sunset glow on the horizon around the sun
//                            (also lights cloud undersides); glowK 0..1
//   sunsetK                  same as glowK, a handy "how sunset-y is it"
//   stars                    0..1

const TZ = 'America/Los_Angeles';

const NIGHT = {
  top: '#0a1230', horizon: '#22315f', fog: '#1a2550', glow: '#3a4a8a', glowK: 0,
  sun: '#b4c4ff', sunI: 0.8, hemiSky: '#5f74b8', hemiGround: '#1f2944', hemiI: 1.0,
  water: '#7f97c4', cloud: '#4e5a82', stars: 1,
};
const BLUE_AM = {
  top: '#16205a', horizon: '#4d5299', fog: '#3a4078', glow: '#8a6ab8', glowK: 0.35,
  sun: '#b9b4ff', sunI: 0.85, hemiSky: '#7d7fc6', hemiGround: '#2c2c50', hemiI: 1.0,
  water: '#9aa2d8', cloud: '#7a76a8', stars: 0.75,
};
const DAWN = {
  top: '#3d3b86', horizon: '#ee8ea6', fog: '#c88aa6', glow: '#ff6f86', glowK: 0.85,
  sun: '#ff9fa0', sunI: 1.15, hemiSky: '#d8a6d0', hemiGround: '#5a4a6a', hemiI: 0.95,
  water: '#e6c0dc', cloud: '#f2a8c4', stars: 0.3,
};
const SUNRISE = {
  top: '#7b78c8', horizon: '#ffad86', fog: '#f6bba6', glow: '#ff7a5c', glowK: 1,
  sun: '#ffb08a', sunI: 1.6, hemiSky: '#ffd0c8', hemiGround: '#7b6a78', hemiI: 1.0,
  water: '#ffe2dc', cloud: '#ffcad0', stars: 0.05,
};
const MORNING = {
  top: '#5b9ae2', horizon: '#ffe3cc', fog: '#f4e6dc', glow: '#ffc49a', glowK: 0.4,
  sun: '#ffe2c4', sunI: 2.0, hemiSky: '#f0eeff', hemiGround: '#8cb27a', hemiI: 1.15,
  water: '#fff6f2', cloud: '#fff4ee', stars: 0,
};
const DAY = {
  top: '#3d8fe8', horizon: '#c4ebff', fog: '#cdeeff', glow: '#fff4d8', glowK: 0.1,
  sun: '#fff4e0', sunI: 2.3, hemiSky: '#e6f5ff', hemiGround: '#8cbf74', hemiI: 1.25,
  water: '#ffffff', cloud: '#ffffff', stars: 0,
};
const GOLDEN = {
  top: '#5f8fd6', horizon: '#ffd98a', fog: '#ffe0aa', glow: '#ffb050', glowK: 0.55,
  sun: '#ffc46e', sunI: 2.1, hemiSky: '#ffe6bc', hemiGround: '#8a7a50', hemiI: 1.1,
  water: '#fff0d8', cloud: '#ffe6c0', stars: 0,
};
const SUNSET = {
  top: '#5d5aa8', horizon: '#ff8a4c', fog: '#f7a479', glow: '#ff6a3d', glowK: 1,
  sun: '#ff9a52', sunI: 1.9, hemiSky: '#ffc4a4', hemiGround: '#7a5a50', hemiI: 1.12,
  water: '#ffd0b8', cloud: '#ffc0a0', stars: 0.02,
};
const DUSK = {
  top: '#2f2f72', horizon: '#c2557e', fog: '#8a4c78', glow: '#d8487e', glowK: 0.8,
  sun: '#f0a0bc', sunI: 1.25, hemiSky: '#b890c8', hemiGround: '#40345a', hemiI: 1.0,
  water: '#c8a6cc', cloud: '#c07a9e', stars: 0.35,
};
const BLUE_PM = {
  top: '#141c50', horizon: '#3f4b8e', fog: '#2c3670', glow: '#6a5aa8', glowK: 0.25,
  sun: '#b4bcff', sunI: 0.85, hemiSky: '#6c78c0', hemiGround: '#262c4c', hemiI: 1.0,
  water: '#8d9ad0', cloud: '#5e6492', stars: 0.8,
};

// [hour, palette]. Keys are closer together around dawn and dusk, where the
// sky changes fastest.
const KEYS = [
  [0, NIGHT], [4.5, NIGHT], [5.15, BLUE_AM], [5.7, DAWN], [6.25, SUNRISE], [6.9, MORNING], [7.7, DAY],
  [16.3, DAY], [17.3, GOLDEN], [18.25, SUNSET], [18.85, DUSK], [19.45, BLUE_PM], [20.3, NIGHT], [24, NIGHT],
];

const COLOR_FIELDS = ['top', 'horizon', 'fog', 'sun', 'hemiSky', 'hemiGround', 'water', 'cloud', 'glow'];
const NUM_FIELDS = ['sunI', 'hemiI', 'stars', 'glowK'];

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

const ca = new THREE.Color();
const cb = new THREE.Color();

export function skyForHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++;
  const [h0, a] = KEYS[i];
  const [h1, b] = KEYS[i + 1];
  const lin = h1 > h0 ? Math.min(1, Math.max(0, (h - h0) / (h1 - h0))) : 0;
  const t = lin * lin * (3 - 2 * lin); // ease, so keys melt into each other
  const out = {};
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
  // Just after sunset and before sunrise the light still comes from the
  // sun's side of the sky (the afterglow), lifted so it doesn't skim.
  let lightDir;
  if (sunDir.y > 0.08) lightDir = sunDir;
  else if (sunDir.y > -0.35) lightDir = new THREE.Vector3(sunDir.x, 0.3, sunDir.z).normalize();
  else if (moonDir.y > 0.08) lightDir = moonDir;
  else lightDir = new THREE.Vector3(0.3, 0.8, 0.5).normalize();

  const phase = phaseForHour(h);
  return {
    ...out,
    sunsetK: out.glowK,
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

// Around dawn and dusk the sky moves fast, so it updates every 30 seconds
// there instead of every minute.
const isTwilight = (h) => (h > 4.4 && h < 7.9) || (h > 16.2 && h < 20.5);

export default function useSunPosition() {
  const [sky, setSky] = useState(() => skyForHour(readOverride() ?? getLAHour()));
  useEffect(() => {
    const override = readOverride();
    if (override !== null) return undefined;
    let timer;
    const tick = () => {
      const h = getLAHour();
      setSky(skyForHour(h));
      clearTimeout(timer);
      timer = setTimeout(tick, isTwilight(h) ? 30 * 1000 : 60 * 1000);
    };
    timer = setTimeout(tick, isTwilight(getLAHour()) ? 30 * 1000 : 60 * 1000);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return sky;
}
