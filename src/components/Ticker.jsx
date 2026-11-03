import { useEffect, useRef, useState } from 'react';
import { computeMinutesSaved, formatAsOf, formatDay, formatNumber, MAX_EXTRA_HOURS } from '../utils/ticker.js';

// Top banner: "Buddy's minutes saved: 10,459"
// Grows at perHourRate per hour since asOf (capped at one week), never counts
// backward, shows a thin bar filling toward the next minute, and pops on each
// tick. Tap it for a short note on what the number means.
export default function Ticker({ minutesSaved, version, isExample }) {
  const [now, setNow] = useState(() => Date.now());
  const best = useRef(0);
  const [pop, setPop] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [info, setInfo] = useState(false);
  const lastWhole = useRef(null);
  const wrap = useRef();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const raw = computeMinutesSaved(minutesSaved, now);
  if (raw > best.current) best.current = raw;
  const value = best.current;
  const whole = Math.floor(value);
  const frac = value - whole;

  useEffect(() => {
    if (lastWhole.current !== null && whole > lastWhole.current) {
      setPop(true);
      const id = setTimeout(() => setPop(false), 650);
      lastWhole.current = whole;
      return () => clearTimeout(id);
    }
    lastWhole.current = whole;
    return undefined;
  }, [whole]);

  useEffect(() => {
    if (!version) return undefined;
    setPulse(true);
    const id = setTimeout(() => setPulse(false), 1400);
    return () => clearTimeout(id);
  }, [version]);

  // Close the note when tapping anywhere else, or on Escape.
  useEffect(() => {
    if (!info) return undefined;
    const onDown = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setInfo(false);
    };
    const onKey = (e) => e.key === 'Escape' && setInfo(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [info]);

  const asOf = minutesSaved?.asOf ? formatAsOf(minutesSaved.asOf) : '';
  const since = formatDay(minutesSaved?.trackedSince);
  const rate = Number(minutesSaved?.perHourRate) || 0;

  return (
    <div className="ticker-wrap" ref={wrap}>
      <button
        type="button"
        className={`ticker panel${pulse ? ' is-pulsing' : ''}`}
        aria-live="polite"
        aria-expanded={info}
        aria-label={`Buddy's minutes saved: ${formatNumber(whole)}. Tap for details.`}
        onClick={() => setInfo((v) => !v)}
      >
        <span className="ticker-line">
          <span className="ticker-label">Buddy&rsquo;s minutes saved:</span>
          <span className={`ticker-value${pop ? ' is-popping' : ''}`}>{formatNumber(whole)}</span>
        </span>
        <span className="ticker-bar" role="progressbar" aria-label="Progress to the next minute" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
          <span className="ticker-bar-fill" style={{ transform: `scaleX(${frac.toFixed(4)})` }} />
        </span>
        {asOf && (
          <span className="ticker-asof">
            as of {asOf}
            <span className="ticker-info-icon" aria-hidden="true">i</span>
          </span>
        )}
      </button>
      {info && (
        <div className="ticker-info panel" role="note">
          <p>
            This counts every minute the bots save Buddy by handling tasks he&rsquo;d otherwise do himself: drafting emails, scanning events, posting to social, writing captions,
            pulling market stats, and more.
          </p>
          {since && <p className="ticker-info-small">Based on tracked tasks since {since}.</p>}
          {rate > 0 && (
            <p className="ticker-info-small">
              Between data updates it grows at the recent pace of {rate} minutes per hour, and stops growing after {MAX_EXTRA_HOURS / 24} days without new data.
            </p>
          )}
          {isExample && <p className="ticker-info-small">Demo mode: this is a sample number, not a real total.</p>}
        </div>
      )}
    </div>
  );
}
