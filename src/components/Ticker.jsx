import { useEffect, useRef, useState } from 'react';
import { computeMinutesSaved, formatAsOf, formatNumber } from '../utils/ticker.js';

// Top banner: "Buddy's minutes saved: 10,459"
// Grows at perHourRate per hour since asOf (capped at one week), never counts
// backward, shows a thin bar filling toward the next minute, and pops on each tick.
export default function Ticker({ minutesSaved, version }) {
  const [now, setNow] = useState(() => Date.now());
  const best = useRef(0);
  const [pop, setPop] = useState(false);
  const [pulse, setPulse] = useState(false);
  const lastWhole = useRef(null);

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

  const asOf = minutesSaved?.asOf ? formatAsOf(minutesSaved.asOf) : '';

  return (
    <header className={`ticker panel${pulse ? ' is-pulsing' : ''}`} aria-live="polite">
      <div className="ticker-line">
        <span className="ticker-label">Buddy&rsquo;s minutes saved:</span>
        <span className={`ticker-value${pop ? ' is-popping' : ''}`}>{formatNumber(whole)}</span>
      </div>
      <div className="ticker-bar" role="progressbar" aria-label="Progress to the next minute" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
        <div className="ticker-bar-fill" style={{ transform: `scaleX(${frac.toFixed(4)})` }} />
      </div>
      {asOf && <div className="ticker-asof">as of {asOf}</div>}
    </header>
  );
}
