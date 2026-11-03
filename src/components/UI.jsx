import { useEffect, useRef, useState } from 'react';
import { formatAsOf } from '../utils/ticker.js';

// Small light UI pieces: demo-mode note, Duvall clock, sound toggle,
// recenter and roster buttons, the reduced-motion handoff list, and toasts.

export function DemoNote() {
  return (
    <div className="demo-note" role="status">
      Demo mode: sample data
    </div>
  );
}

export function SafeNote() {
  return (
    <div className="demo-note" role="status">
      Public view
    </div>
  );
}

function SunIcon({ phase }) {
  if (phase === 'night') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="#4b5bb3" />
      </svg>
    );
  }
  const color = phase === 'day' ? '#f5b301' : '#f08a24';
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="5" fill={color} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="12" y1="2.5" x2="12" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round" transform={`rotate(${a} 12 12)`} />
      ))}
    </svg>
  );
}

export function ClockChip({ sky }) {
  return (
    <div className="chip chip-clock">
      <SunIcon phase={sky.phase} />
      <span>
        Duvall {sky.clock}
      </span>
    </div>
  );
}

// Live / Demo switch. Live shows the real bot feed; Demo shows sample data
// with busy bots and a climbing ticker (handy for showing the island off).
export function ModeToggle({ mode, onMode, fellBack }) {
  return (
    <div className="mode-wrap">
      <div className="mode-toggle" role="group" aria-label="Data: Live or Demo">
        {[
          ['live', 'Live'],
          ['demo', 'Demo'],
        ].map(([m, label]) => (
          <button
            key={m}
            type="button"
            className={`mode-btn${mode === m ? ' is-on' : ''}`}
            aria-pressed={mode === m}
            onClick={() => mode !== m && onMode(m)}
            title={m === 'live' ? 'Show real bot activity' : 'Show sample data'}
          >
            {m === 'live' && <span className="mode-dot" aria-hidden="true" />}
            {label}
          </button>
        ))}
      </div>
      {fellBack && mode === 'live' && (
        <div className="mode-fallback" role="status">
          Live feed unavailable, showing demo
        </div>
      )}
    </div>
  );
}

export function StatusChips({ isExample, safe, sky, error, mode, hasLive, fellBack, onMode }) {
  return (
    <div className="hud-chips">
      {hasLive ? <ModeToggle mode={mode} onMode={onMode} fellBack={fellBack} /> : isExample && <DemoNote />}
      {safe && <SafeNote />}
      <ClockChip sky={sky} />
      {error && <div className="chip chip-error">Couldn&rsquo;t refresh data. Retrying.</div>}
    </div>
  );
}

// --- Ambient sound: gentle ocean + breeze made from filtered noise ----------

function createAmbience() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const seconds = 6;
  const len = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const fade = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      data[i] *= k;
      data[len - 1 - i] *= k;
    }
  }

  // Waves: brown noise, low-pass, slow swell
  const surf = ctx.createBufferSource();
  surf.buffer = buffer;
  surf.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 520;
  const surfGain = ctx.createGain();
  surfGain.gain.value = 0.5;
  const swell = ctx.createOscillator();
  swell.frequency.value = 0.085;
  const swellDepth = ctx.createGain();
  swellDepth.gain.value = 0.38;
  const swellFilter = ctx.createGain();
  swellFilter.gain.value = 260;
  swell.connect(swellDepth).connect(surfGain.gain);
  swell.connect(swellFilter).connect(lp.frequency);
  surf.connect(lp).connect(surfGain).connect(master);

  // Breeze: band-passed noise, very quiet, slower drift
  const breeze = ctx.createBufferSource();
  breeze.buffer = buffer;
  breeze.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1100;
  bp.Q.value = 0.6;
  const breezeGain = ctx.createGain();
  breezeGain.gain.value = 0.05;
  const drift = ctx.createOscillator();
  drift.frequency.value = 0.045;
  const driftDepth = ctx.createGain();
  driftDepth.gain.value = 0.035;
  drift.connect(driftDepth).connect(breezeGain.gain);
  breeze.connect(bp).connect(breezeGain).connect(master);

  surf.start();
  breeze.start(ctx.currentTime, 2.7);
  swell.start();
  drift.start();
  master.gain.setTargetAtTime(0.35, ctx.currentTime, 1.5);

  return {
    ctx,
    stop() {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
      setTimeout(() => ctx.close().catch(() => {}), 1500);
    },
  };
}

export function SoundToggle() {
  const [on, setOn] = useState(false);
  const engine = useRef(null);

  useEffect(() => {
    const onVis = () => {
      const ctx = engine.current?.ctx;
      if (!ctx) return;
      if (document.visibilityState === 'hidden') ctx.suspend().catch(() => {});
      else ctx.resume().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      engine.current?.stop();
    };
  }, []);

  const toggle = () => {
    if (on) {
      engine.current?.stop();
      engine.current = null;
      setOn(false);
    } else {
      engine.current = createAmbience();
      setOn(!!engine.current);
    }
  };

  return (
    <button type="button" className="square-btn" onClick={toggle} aria-pressed={on} aria-label={on ? 'Turn ocean sound off' : 'Turn ocean sound on'} title={on ? 'Sound on' : 'Sound off'}>
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="#1f2430" />
        {on ? (
          <>
            <path d="M16 8.5a5 5 0 0 1 0 7" stroke="#1f2430" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M18.5 6a8.5 8.5 0 0 1 0 12" stroke="#1f2430" strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <path d="M16.5 9.5l5 5m0-5l-5 5" stroke="#1f2430" strokeWidth="2" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}

export function RecenterButton({ onClick }) {
  return (
    <button type="button" className="square-btn" onClick={onClick} aria-label="Recenter the island" title="Recenter">
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
        <circle cx="12" cy="12" r="7" stroke="#1f2430" strokeWidth="2" fill="none" />
        <circle cx="12" cy="12" r="2.5" fill="#1f2430" />
        <path d="M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5" stroke="#1f2430" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function RosterButton({ onClick, open }) {
  return (
    <button type="button" className="square-btn" onClick={onClick} aria-expanded={open} aria-label="Find a bot" title="Find a bot">
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
        <circle cx="10" cy="8" r="3.5" stroke="#1f2430" strokeWidth="2" fill="none" />
        <path d="M3.5 19c.8-3.4 3.4-5.2 6.5-5.2s5.7 1.8 6.5 5.2" stroke="#1f2430" strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="18" cy="9" r="2.6" stroke="#1f2430" strokeWidth="1.8" fill="none" />
        <path d="M20.6 14.5l2 2" stroke="#1f2430" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite" key={message.id}>
      {message.text}
    </div>
  );
}

// Reduced motion: no walking, so list the last 24h of handoffs instead.
export function RecentHandoffs({ handoffs, bots }) {
  const [open, setOpen] = useState(false);
  if (!handoffs?.length) return null;
  const byId = Object.fromEntries(bots.map((b) => [b.id, b]));
  const list = [...handoffs].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return (
    <div className="recent panel">
      <button type="button" className="recent-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Recent handoffs ({list.length}) {open ? '▾' : '▸'}
      </button>
      {open && (
        <ul className="recent-list">
          {list.map((h, i) => (
            <li key={i}>
              <span className="handoff-orb" style={{ background: byId[h.from]?.color }} />
              <span>
                <strong>{byId[h.from]?.name}</strong> → <strong>{byId[h.to]?.name}</strong>
                {h.what ? ` · ${h.what}` : ''}
                <span className="recent-time">{formatAsOf(h.at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LoadingNotice({ error }) {
  return (
    <div className="loading panel" role="status">
      {error ? `Couldn't load data.json (${error}). Retrying in a few minutes.` : 'Waking up the island...'}
    </div>
  );
}

export default function UI({ isExample, safe, sky, error, mode, hasLive, fellBack, onMode, onRecenter, onRoster, rosterOpen }) {
  return (
    <div className="hud-row">
      <StatusChips isExample={isExample} safe={safe} sky={sky} error={error} mode={mode} hasLive={hasLive} fellBack={fellBack} onMode={onMode} />
      <div className="hud-buttons">
        <RosterButton onClick={onRoster} open={rosterOpen} />
        <SoundToggle />
        <RecenterButton onClick={onRecenter} />
      </div>
    </div>
  );
}
