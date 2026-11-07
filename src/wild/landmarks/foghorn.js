// Lighthouse foghorn: two long low blasts, "BWAAAH... BWAAAH", synthesized
// with WebAudio (no audio files). The AudioContext is made lazily on the
// first tap (a user gesture, so browsers allow it) and reused after that.

let ctx = null;
let busyUntil = 0;

export const HORN_BLAST = 2.2; // seconds per blast
export const HORN_GAP = 0.55; // silence between the two blasts
export const HORN_TOTAL = HORN_BLAST * 2 + HORN_GAP;

// The app has no global mute today (the sound chip only toggles the ambient
// ocean). If one appears it can set this flag: <html data-sound="off">.
export function soundMuted() {
  try {
    return document.documentElement.dataset.sound === 'off';
  } catch {
    return false;
  }
}

function blast(ac, out, t0) {
  const end = t0 + HORN_BLAST;
  const env = ac.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(0.32, t0 + 0.38); // slow attack
  env.gain.setValueAtTime(0.32, end - 0.55);
  env.gain.linearRampToValueAtTime(0.0001, end); // tail off

  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.4;
  lp.frequency.setValueAtTime(260, t0);
  lp.frequency.linearRampToValueAtTime(720, t0 + 0.45);
  lp.frequency.setValueAtTime(720, end - 0.6);
  lp.frequency.linearRampToValueAtTime(300, end);
  lp.connect(env).connect(out);

  const voices = [
    ['sawtooth', 1, 0.55],
    ['square', 1.008, 0.32], // detuned for the beating "waah"
    ['sawtooth', 0.497, 0.35], // a sub an octave down
  ];
  for (const [type, mul, level] of voices) {
    const o = ac.createOscillator();
    o.type = type;
    // the pitch sags up into the note and droops at the end, like real air
    o.frequency.setValueAtTime(98 * mul, t0);
    o.frequency.exponentialRampToValueAtTime(110 * mul, t0 + 0.3);
    o.frequency.setValueAtTime(110 * mul, end - 0.5);
    o.frequency.exponentialRampToValueAtTime(103 * mul, end);
    const g = ac.createGain();
    g.gain.value = level;
    o.connect(g).connect(lp);
    o.start(t0);
    o.stop(end + 0.05);
  }
}

// Plays the horn. Returns false if it couldn't (muted, no WebAudio, or
// already sounding).
export function playFoghorn() {
  if (soundMuted()) return false;
  const now = performance.now() / 1000;
  if (now < busyUntil) return false;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  try {
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const out = ctx.createGain();
    out.gain.value = 0.55;
    out.connect(ctx.destination);
    const t0 = ctx.currentTime + 0.03;
    blast(ctx, out, t0);
    blast(ctx, out, t0 + HORN_BLAST + HORN_GAP);
    setTimeout(() => out.disconnect(), (HORN_TOTAL + 0.4) * 1000);
    busyUntil = now + HORN_TOTAL;
    return true;
  } catch {
    return false;
  }
}
