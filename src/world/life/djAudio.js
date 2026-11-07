import { audioCtx } from '../state.js';

// "Beach Beats": a little lo-fi hip-hop loop made on the spot with Web Audio.
// No files, no network. Tap the DJ booth to start it, tap again to stop.
//
// 80 BPM, swung 16ths. A soft sine kick, a dusty noise snare, quiet hats,
// a round sine bass and a jazzy four-chord electric-piano loop
// (Dm9 - G13 - Cmaj9 - Am9) through a lowpass with a slow tape wobble, all
// over a looping vinyl crackle. Master volume ~0.25, faded in and out.
//
// Visuals read djState.playing and djBeat() (beats since the loop started,
// on the audio clock) so the DJ, the floor and the band move with the music.

import { closeSpotify, openSpotify, spotifyAvailable, spotifyState } from '../../utils/spotify.js';

export const DJ_BPM = 80;
const SPB = 60 / DJ_BPM; // seconds per beat
const STEP = SPB / 4; // a 16th
const SWING = STEP * 0.2; // late off-beat 16ths: the lazy lo-fi feel
const VOL = 0.25;
const LOOKAHEAD = 0.2; // seconds of notes scheduled ahead
const SR = 44100;

export const djState = { playing: false };

const listeners = new Set();
export function onDJChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) fn(djState.playing);
}

// ---------------------------------------------------------------------------
// Preload: sample data is computed once (on idle or the first pointer press
// anywhere), so the first tap on the booth starts the music right away.
// ---------------------------------------------------------------------------

let noiseData = null;
let crackleData = null;
let noiseBuf = null;
let crackleBuf = null;

function makeData() {
  if (noiseData) return;
  // 1 s of white noise for snares and hats.
  noiseData = new Float32Array(SR);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
  // 3 s of vinyl: a soft dark hiss with random pops and ticks. Loops.
  const n = SR * 3;
  crackleData = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += (Math.random() * 2 - 1 - lp) * 0.08;
    crackleData[i] = lp * 0.12;
  }
  const pops = 70;
  for (let k = 0; k < pops; k++) {
    const at = Math.floor(Math.random() * (n - 40));
    const amp = (0.25 + Math.random() * 0.75) * (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.15 ? 1 : 0.45);
    const len = 2 + Math.floor(Math.random() * 10);
    for (let j = 0; j < len; j++) crackleData[at + j] += amp * Math.exp(-j / (len * 0.35)) * (j % 2 ? -0.6 : 1);
  }
}

function makeBuffers(ac) {
  makeData();
  if (noiseBuf) return;
  noiseBuf = ac.createBuffer(1, noiseData.length, SR);
  noiseBuf.copyToChannel(noiseData, 0);
  crackleBuf = ac.createBuffer(1, crackleData.length, SR);
  crackleBuf.copyToChannel(crackleData, 0);
}

let preloadArmed = false;
export function preloadDJ() {
  if (preloadArmed || typeof window === 'undefined') return;
  preloadArmed = true;
  const onDown = () => {
    window.removeEventListener('pointerdown', onDown, true);
    // A pointer press is a user gesture: making the context here is allowed.
    const ac = audioCtx();
    if (ac) makeBuffers(ac);
  };
  window.addEventListener('pointerdown', onDown, true);
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2500));
  idle(() => makeData());
}

// ---------------------------------------------------------------------------
// Instruments. Each hit builds a few short-lived nodes on the audio clock.
// ---------------------------------------------------------------------------

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// One chord per bar. Root (bass) + electric-piano voicing.
const CHORDS = [
  { root: 38, notes: [53, 57, 60, 64] }, // Dm9 (F A C E over D)
  { root: 43, notes: [53, 59, 64, 69] }, // G13 (F B E A over G)
  { root: 36, notes: [52, 55, 59, 62] }, // Cmaj9 (E G B D over C)
  { root: 45, notes: [55, 60, 64, 71] }, // Am9 (G C E B over A)
];
// A lazy little melody on top, every other pass of the loop.
// [16th step in the 4-bar loop, midi, length in 16ths]
const MELODY = [
  [2, 76, 3], [6, 74, 2], [9, 72, 5],
  [18, 71, 3], [22, 74, 2], [26, 77, 4],
  [34, 76, 6], [42, 74, 2], [45, 72, 3],
  [50, 71, 2], [53, 69, 4], [58, 67, 5],
];

function envGain(ac, dest, t, peak, attack, decay) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  return g;
}

function kick(s, t, v) {
  const { ac } = s;
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(115, t);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
  o.connect(envGain(ac, s.drums, t, 0.95 * v, 0.004, 0.42));
  o.start(t);
  o.stop(t + 0.5);
}

function noiseHit(s, t, type, freq, q, peak, decay) {
  const { ac } = s;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f);
  f.connect(envGain(ac, s.drums, t, peak, 0.003, decay));
  src.start(t, Math.random() * 0.8, decay + 0.05);
}

function snare(s, t, v) {
  noiseHit(s, t, 'bandpass', 1700, 0.7, 0.42 * v, 0.2);
  const { ac } = s;
  const o = ac.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  o.connect(envGain(ac, s.drums, t, 0.22 * v, 0.003, 0.1));
  o.start(t);
  o.stop(t + 0.15);
}

function hat(s, t, v) {
  noiseHit(s, t, 'highpass', 7200, 0.6, 0.11 * v, 0.045);
}

function bass(s, t, midi, dur, v) {
  const { ac } = s;
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.value = mtof(midi);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.42 * v, t + 0.025);
  g.gain.setTargetAtTime(0.28 * v, t + 0.03, 0.25);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.06);
  o.connect(g);
  g.connect(s.master);
  o.start(t);
  o.stop(t + dur + 0.4);
}

// Electric piano-ish: triangle + a soft sine octave, quick attack, long decay.
function keyNote(s, t, midi, dur, v) {
  const { ac } = s;
  const f = mtof(midi);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.075 * v, t + 0.012);
  g.gain.setTargetAtTime(0.03 * v, t + 0.02, 0.5);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.12);
  g.connect(s.keys);
  const end = t + dur + 0.7;
  const o1 = ac.createOscillator();
  o1.type = 'triangle';
  o1.frequency.value = f;
  o1.connect(g);
  s.wow.connect(o1.detune);
  o1.start(t);
  o1.stop(end);
  const o2 = ac.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = f * 2;
  const g2 = ac.createGain();
  g2.gain.value = 0.25;
  o2.connect(g2);
  g2.connect(g);
  s.wow.connect(o2.detune);
  o2.start(t);
  o2.stop(end);
  // Let go of the wobble once the note is done so nodes can be collected.
  o1.onended = () => {
    try {
      s.wow.disconnect(o1.detune);
      s.wow.disconnect(o2.detune);
    } catch {
      // already gone
    }
  };
}

function playStep(s, i, t) {
  const st = i % 16;
  const bar = Math.floor(i / 16);
  const ch = CHORDS[bar % 4];
  const r = Math.random;

  // Drums
  if (st === 0 || st === 10 || (st === 7 && bar % 2 === 1)) kick(s, t, st === 0 ? 1 : 0.8);
  if (st === 4 || st === 12) snare(s, t, 1);
  else if (st === 15 && bar % 4 === 3) snare(s, t, 0.3);
  if (st % 2 === 0) hat(s, t, (st % 4 === 2 ? 0.85 : 0.55) * (0.85 + r() * 0.3));
  else if (r() < 0.22) hat(s, t, 0.3);

  // Bass
  if (st === 0) bass(s, t, ch.root, SPB * 1.6, 1);
  else if (st === 10) bass(s, t, ch.root, SPB * 0.6, 0.8);
  else if (st === 14 && bar % 2 === 1) bass(s, t, ch.root + 7, SPB * 0.3, 0.6);

  // Keys: the chord on the one (a lazy strum), a softer push on the "and" of 3.
  if (st === 0) {
    ch.notes.forEach((m, k) => keyNote(s, t + k * 0.018 + r() * 0.008, m, SPB * 2.6, 1));
  } else if (st === 11 && bar % 2 === 0) {
    ch.notes.forEach((m, k) => k > 0 && keyNote(s, t + k * 0.012, m, SPB * 1.1, 0.55));
  }

  // Melody every other time round the four bars.
  if (Math.floor(bar / 4) % 2 === 1) {
    const loopStep = i % 64;
    for (const [at, m, len] of MELODY) if (at === loopStep) keyNote(s, t, m, STEP * len, 0.8);
  }
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

let session = null; // the live graph and scheduler
let t0 = 0; // audio time of beat 0 for the visuals

function schedule() {
  const s = session;
  if (!s) return;
  const now = s.ac.currentTime;
  // After a stall, skip ahead instead of firing a pile of late notes.
  while (s.next < now - 0.05) {
    s.next += STEP;
    s.step++;
  }
  while (s.next < now + LOOKAHEAD) {
    playStep(s, s.step, s.next + (s.step % 2 ? SWING : 0));
    s.next += STEP;
    s.step++;
  }
}

export function startDJ() {
  if (session) return true;
  const ac = audioCtx();
  if (!ac) return false;
  if (ac.state !== 'running') ac.resume().catch(() => {});
  makeBuffers(ac);

  const now = ac.currentTime;
  const start = now + 0.06;
  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.setValueAtTime(0.0001, start);
  master.gain.linearRampToValueAtTime(VOL, start + 1.4);
  const tone = ac.createBiquadFilter(); // overall lo-fi warmth
  tone.type = 'lowpass';
  tone.frequency.value = 4200;
  tone.Q.value = 0.5;
  master.connect(tone);
  tone.connect(ac.destination);

  const drums = ac.createBiquadFilter();
  drums.type = 'lowpass';
  drums.frequency.value = 5200;
  drums.connect(master);

  const keys = ac.createBiquadFilter();
  keys.type = 'lowpass';
  keys.frequency.value = 1300;
  keys.Q.value = 0.8;
  keys.connect(master);

  // Tape wobble: a slow LFO on every key note's detune (a few cents).
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.45;
  const wow = ac.createGain();
  wow.gain.value = 9;
  lfo.connect(wow);
  lfo.start(start);

  const crackle = ac.createBufferSource();
  crackle.buffer = crackleBuf;
  crackle.loop = true;
  const crackleHp = ac.createBiquadFilter();
  crackleHp.type = 'highpass';
  crackleHp.frequency.value = 600;
  const crackleGain = ac.createGain();
  crackleGain.gain.value = 0.35;
  crackle.connect(crackleHp);
  crackleHp.connect(crackleGain);
  crackleGain.connect(master);
  crackle.start(start);

  session = { ac, master, drums, keys, wow, lfo, crackle, next: start, step: 0, timer: 0 };
  session.timer = setInterval(schedule, 25);
  schedule();
  t0 = start;
  djState.playing = true;
  emit();
  return true;
}

export function stopDJ(fade = 0.8) {
  const s = session;
  if (!s) return;
  session = null;
  clearInterval(s.timer);
  const now = s.ac.currentTime;
  const g = s.master.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(Math.max(0.0001, g.value), now);
  g.linearRampToValueAtTime(0.0001, now + fade);
  setTimeout(() => {
    try {
      s.crackle.stop();
      s.lfo.stop();
    } catch {
      // never started
    }
    s.master.disconnect();
  }, fade * 1000 + 150);
  djState.playing = false;
  emit();
}

export function toggleDJ() {
  if (session) stopDJ();
  else startDJ();
  return djState.playing;
}

// What a tap on the booth does: stop whatever is playing, or else open the
// Spotify player, or (Spotify not available) play the island's own beat.
export function tapDJ() {
  if (session) {
    stopDJ();
    return;
  }
  if (spotifyState.open) {
    closeSpotify();
    return;
  }
  if (spotifyAvailable()) openSpotify();
  else startDJ();
}

// The Spotify embed failed to load: switch to the island beat.
export function fallbackToIslandBeat() {
  if (!session) startDJ();
}

// Beats since the loop started on the audio clock (what you actually hear),
// or -1 when nothing is playing.
export function djBeat() {
  if (!session) return -1;
  return Math.max(0, (session.ac.currentTime - t0) / SPB);
}

// Hidden tab: stop right away, and pick the groove back up when the person
// comes back (only if the browser lets the audio resume without a tap).
let resumeOnShow = false;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (session) {
        resumeOnShow = true;
        stopDJ(0.12);
      }
    } else if (resumeOnShow) {
      resumeOnShow = false;
      const ac = audioCtx();
      if (!ac) return;
      const go = () => {
        if (ac.state === 'running' && !document.hidden) startDJ();
      };
      if (ac.state === 'running') go();
      else ac.resume().then(go, () => {});
    }
  });
  window.addEventListener('pagehide', () => {
    resumeOnShow = false;
    stopDJ(0.05);
  });
}
