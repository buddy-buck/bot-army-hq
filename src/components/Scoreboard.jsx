import { useEffect, useMemo, useRef, useState } from 'react';
import { formatAsOf, formatDay, formatNumber } from '../utils/ticker.js';
import { dayKeyPT, formatTimePT } from '../utils/time.js';

// Compact "Buddy's minutes saved" chip at the top. The number rolls up like
// an odometer when it grows. Tap it for the drawer: today, this week, all
// time, top bot this week, a 7-day sparkline and the latest gains. Every
// figure comes straight from data.json; a figure the data doesn't have is
// simply left out (nothing is estimated in Live mode).

function Odometer({ value, reduced }) {
  const text = formatNumber(value);
  const chars = text.split('');
  return (
    <span className="odo" aria-hidden="true">
      {chars.map((ch, i) => {
        const key = chars.length - i; // keyed from the right so columns stay put as digits are added
        if (!/\d/.test(ch)) {
          return (
            <span key={`s${key}`} className="odo-sep">
              {ch}
            </span>
          );
        }
        return (
          <span key={`d${key}`} className="odo-col">
            <span className={`odo-strip${reduced ? ' is-still' : ''}`} style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
              {'0123456789'.split('').map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function Sparkline({ points }) {
  const max = Math.max(1, ...points.map((p) => p.minutes));
  const W = 260;
  const H = 56;
  const step = points.length > 1 ? W / (points.length - 1) : W;
  const xy = points.map((p, i) => [i * step, H - 6 - (p.minutes / max) * (H - 14)]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = xy[xy.length - 1];
  return (
    <svg className="spark" viewBox={`-4 0 ${W + 8} ${H}`} role="img" aria-label={`Last ${points.length} days: ${points.map((p) => p.minutes).join(', ')} minutes`}>
      <polyline points={`0,${H} ${line} ${W},${H}`} fill="rgba(25, 70, 157, 0.1)" stroke="none" />
      <polyline points={line} fill="none" stroke="#19469d" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="4" fill="#f09024" />}
    </svg>
  );
}

// Figures for the drawer, only from what the data reports.
export function minuteStats(ms, now = Date.now()) {
  if (!ms) return {};
  const todayKey = dayKeyPT(now);
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  const daily = [...(ms.daily || [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  const todayDaily = daily.find((d) => d.date === todayKey);
  const today = ms.today ?? todayDaily?.minutes ?? null;
  const week = ms.week ?? (daily.length ? daily.reduce((s, d) => s + d.minutes, 0) : null);
  const byBot = {};
  for (const r of ms.recent || []) {
    const t = Date.parse(r.at);
    if (!r.bot || Number.isNaN(t) || t < weekAgo) continue;
    byBot[r.bot] = (byBot[r.bot] || 0) + r.minutes;
  }
  const top = Object.entries(byBot).sort((a, b) => b[1] - a[1])[0];
  return { today, week, allTime: ms.ledgerTotal ?? ms.live ?? ms.total ?? 0, daily, topBot: top ? { id: top[0], minutes: top[1] } : null };
}

export default function Scoreboard({ value, minutesSaved, isExample, version, bots, reduced }) {
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const wrap = useRef();
  const byId = useMemo(() => Object.fromEntries((bots || []).map((b) => [b.id, b])), [bots]);

  useEffect(() => {
    if (!version) return undefined;
    setPulse(true);
    const id = setTimeout(() => setPulse(false), 1400);
    return () => clearTimeout(id);
  }, [version]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => wrap.current && !wrap.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const stats = open ? minuteStats(minutesSaved) : {};
  const asOf = minutesSaved?.asOf ? formatAsOf(minutesSaved.asOf) : '';
  const since = formatDay(minutesSaved?.trackedSince);
  const recent = (minutesSaved?.recent || []).slice(0, 4);
  const top = stats.topBot && byId[stats.topBot.id];

  return (
    <div className="score-wrap" ref={wrap}>
      <button
        type="button"
        className={`chip score-chip${pulse ? ' is-pulsing' : ''}`}
        aria-expanded={open}
        aria-label={`Buddy's minutes saved: ${formatNumber(value)}. Tap for details.`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="score-label">Buddy&rsquo;s minutes saved</span>
        <span className="score-value">
          <Odometer value={value} reduced={reduced} />
        </span>
        <span className="score-caret" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      <div className="sr-only" aria-live="polite">
        {formatNumber(value)} minutes saved
      </div>
      {open && (
        <div className="score-drawer panel" role="dialog" aria-label="Minutes saved details">
          <div className="score-grid">
            <div className="stat">
              <span className="stat-label">Today</span>
              <span className="stat-value">{stats.today != null ? formatNumber(stats.today) : 'Not reported'}</span>
            </div>
            <div className="stat">
              <span className="stat-label">This week</span>
              <span className="stat-value">{stats.week != null ? formatNumber(stats.week) : 'Not reported'}</span>
            </div>
            <div className="stat">
              <span className="stat-label">All time</span>
              <span className="stat-value">{formatNumber(Math.max(stats.allTime || 0, value))}</span>
            </div>
          </div>
          {top && (
            <div className="score-top">
              <span className="stat-label">Top bot this week</span>
              <span className="score-top-name">
                <span className="feed-dot" style={{ background: top.color }} aria-hidden="true" />
                {top.name}
                <span className="score-top-min">{formatNumber(stats.topBot.minutes)} min</span>
              </span>
            </div>
          )}
          {stats.daily?.length >= 2 && (
            <div className="score-spark">
              <span className="stat-label">Last {stats.daily.length} days</span>
              <Sparkline points={stats.daily} />
            </div>
          )}
          {recent.length > 0 && (
            <ul className="score-recent">
              {recent.map((r, i) => {
                const b = byId[r.bot];
                return (
                  <li key={`${r.at}-${i}`}>
                    <span className="gain">+{r.minutes} min</span>
                    <span className="score-recent-text">
                      {b && (
                        <>
                          <span className="feed-dot" style={{ background: b.color }} aria-hidden="true" />
                          <strong>{b.name}</strong>{' '}
                        </>
                      )}
                      {r.what}
                      {r.at && <span className="feed-time">{formatTimePT(r.at)} PT</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="score-note">
            Every minute the bots save Buddy by handling tasks he&rsquo;d otherwise do himself: drafting emails, scanning events, posting to social, writing captions, pulling market stats, and more.
          </p>
          {(asOf || since) && (
            <p className="score-small">
              {asOf && `Updated ${asOf}. `}
              {since && `Tracked since ${since}.`}
            </p>
          )}
          {isExample && <p className="score-small">Demo mode: sample numbers, not a real total.</p>}
        </div>
      )}
    </div>
  );
}
