import { useEffect, useState } from 'react';
import { timeAgo } from '../utils/ticker.js';
import { countdown, formatTimePT } from '../utils/time.js';

// Activity panel: starts as a slim chip at the bottom left, opens to a side
// drawer with three tabs.
//   Past : real feed entries from the last 24 hours, with PT time and bot
//   Now  : bots whose status is "working". Tap to fly to them.
//   Next : the optional nextUp array [{ bot, job, at }], soonest first, with
//          a live countdown. Tap to fly to the bot.
// Everything shown comes from data.json. Nothing is ever made up.

const RECENT_MS = 24 * 3600 * 1000;
const MAX_ITEMS = 20;
const NOW_GRACE_MS = 2 * 60 * 1000; // a run that just hit T-0 shows "now" for 2 minutes

export function recentFeed(feed, now = Date.now()) {
  return (feed || [])
    .map((f) => ({ ...f, t: Date.parse(f.at) }))
    .filter(({ t }) => !Number.isNaN(t) && now - t <= RECENT_MS && t - now < 5 * 60 * 1000)
    .sort((a, b) => b.t - a.t)
    .slice(0, MAX_ITEMS);
}

// Past tab: feed entries plus minutesSaved.recent entries from the last 24h.
// A ledger entry that matches a feed line (same bot, within 2 minutes) adds
// its "+N min" to that line instead of showing twice.
export function pastItems(feed, recent, now = Date.now()) {
  const items = recentFeed(feed, now).map((f) => ({ ...f, minutes: null }));
  const gains = (recent || [])
    .map((r) => ({ ...r, t: Date.parse(r.at) }))
    .filter((r) => r.bot && !Number.isNaN(r.t) && now - r.t <= RECENT_MS && r.t - now < 5 * 60 * 1000);
  for (const g of gains) {
    const match = items.find((f) => f.bot === g.bot && f.minutes === null && Math.abs(f.t - g.t) <= 2 * 60 * 1000);
    if (match) match.minutes = g.minutes;
    else items.push({ bot: g.bot, text: g.what || 'Saved Buddy some time', url: '', at: g.at, t: g.t, to: null, minutes: g.minutes });
  }
  return items.sort((a, b) => b.t - a.t).slice(0, MAX_ITEMS);
}

export function upcoming(nextUp, now = Date.now()) {
  return (nextUp || []).filter((n) => Date.parse(n.at) > now - NOW_GRACE_MS);
}

function FlyIcon() {
  return (
    <svg className="feed-go" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2.2" fill="none" />
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

function PastLine({ item, bot, toBot, now }) {
  const body = (
    <>
      <span className="feed-dot" style={{ background: bot.color }} aria-hidden="true" />
      <span className="feed-text">
        <strong style={{ color: 'var(--ink)' }}>{bot.name}</strong>
        {toBot && (
          <>
            {' '}
            to <strong>{toBot.name}</strong>:
          </>
        )}{' '}
        {item.text}
        {item.minutes != null && <span className="gain feed-gain">+{item.minutes} min</span>}
        <span className="feed-time">
          {formatTimePT(item.at)} PT &middot; {timeAgo(item.at, now)}
        </span>
      </span>
      {item.url && (
        <svg className="feed-go" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M9 6h9v9M18 6L7 17" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </>
  );
  return (
    <li>
      {item.url ? (
        <a className="feed-line is-link" href={item.url} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      ) : (
        <div className="feed-line">{body}</div>
      )}
    </li>
  );
}

export default function Feed({ feed, bots, walks, nextUp, minutesSaved, onFlyBot, forceClosed }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('past');
  const [now, setNow] = useState(() => Date.now());
  const ticking = open && tab === 'next';
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ticking ? 1000 : 15000);
    setNow(Date.now());
    return () => clearInterval(id);
  }, [ticking]);
  useEffect(() => {
    if (forceClosed) setOpen(false);
  }, [forceClosed]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const byId = Object.fromEntries(bots.map((b) => [b.id, b]));
  const past = pastItems(feed, minutesSaved?.recent, now).filter((f) => byId[f.bot]);
  const working = bots.filter((b) => b.status === 'working');
  const next = upcoming(nextUp, now).filter((n) => byId[n.bot]);
  const walking = walks?.[0];
  const soonest = next[0];

  const fly = (id) => {
    onFlyBot?.(id);
    if (window.innerWidth < 900) setOpen(false); // small screens: get out of the way so you can see the bot
  };

  let summary;
  if (walking) {
    summary = (
      <>
        <strong>{walking.fromName}</strong> is bringing <strong>{walking.toName}</strong> {walking.what || 'a handoff'}
      </>
    );
  } else if (soonest) {
    summary = (
      <>
        {working.length} working &middot; Next: <strong>{byId[soonest.bot].name}</strong> {countdown(soonest.at, now)}
      </>
    );
  } else {
    summary = working.length ? <>{working.length} working now</> : <>{"All quiet. The team is chillin'."}</>;
  }

  if (!open) {
    return (
      <button type="button" className="chip activity-chip" onClick={() => setOpen(true)} aria-expanded={false} aria-label="Open team activity">
        <span className="activity-title">Activity</span>
        <span className="activity-sum">{summary}</span>
        <span className="feed-caret" aria-hidden="true">
          ▸
        </span>
      </button>
    );
  }

  const TABS = [
    ['past', 'Past', past.length],
    ['now', 'Now', working.length],
    ['next', 'Next', next.length],
  ];

  return (
    <section className="feed panel is-open" aria-label="Team activity">
      <div className="feed-top">
        <h2 className="feed-h">Team activity</h2>
        <button type="button" className="card-close feed-close" onClick={() => setOpen(false)} aria-label="Close team activity">
          ×
        </button>
      </div>
      <div className="tabs" role="tablist" aria-label="Past, now and next">
        {TABS.map(([key, label, n]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`tab${tab === key ? ' is-on' : ''}`} onClick={() => setTab(key)}>
            {label}
            <span className="tab-n">{n}</span>
          </button>
        ))}
      </div>
      {walking && (
        <div className="feed-walk" aria-live="polite">
          <span className="feed-orb" style={{ background: walking.color }} aria-hidden="true" />
          <span>
            <strong>{walking.fromName}</strong> is bringing <strong>{walking.toName}</strong> {walking.what ? walking.what : 'a handoff'}
          </span>
        </div>
      )}
      <div className="feed-body" role="tabpanel">
        {tab === 'past' &&
          (past.length === 0 ? (
            <p className="feed-empty">{"All quiet. The team is chillin'."}</p>
          ) : (
            <ul className="feed-list">
              {past.map((item, i) => (
                <PastLine key={`${item.bot}-${item.at}-${i}`} item={item} bot={byId[item.bot]} toBot={item.to ? byId[item.to] : null} now={now} />
              ))}
            </ul>
          ))}
        {tab === 'now' &&
          (working.length === 0 ? (
            <p className="feed-empty">Nobody is working right now. The team is chillin'.</p>
          ) : (
            <ul className="feed-list">
              {working.map((b) => (
                <li key={b.id}>
                  <button type="button" className="feed-line is-link" onClick={() => fly(b.id)} aria-label={`Fly to ${b.name}`}>
                    <span className="feed-dot" style={{ background: b.color }} aria-hidden="true" />
                    <span className="feed-text">
                      <strong>{b.name}</strong>
                      <span className="feed-time">{b.lastAction?.text || b.job || 'Working'}</span>
                    </span>
                    <FlyIcon />
                  </button>
                </li>
              ))}
            </ul>
          ))}
        {tab === 'next' &&
          (next.length === 0 ? (
            <p className="feed-empty">Nothing scheduled</p>
          ) : (
            <ul className="feed-list">
              {next.map((n, i) => {
                const b = byId[n.bot];
                const cd = countdown(n.at, now);
                return (
                  <li key={`${n.bot}-${n.at}-${i}`}>
                    <button type="button" className={`feed-line is-link${cd === 'now' ? ' is-due' : ''}`} onClick={() => fly(n.bot)} aria-label={`Fly to ${b.name}`}>
                      <span className="feed-dot" style={{ background: b.color }} aria-hidden="true" />
                      <span className="feed-text">
                        <strong>{b.name}</strong> {n.job}
                        <span className="feed-time">{formatTimePT(n.at)} PT</span>
                      </span>
                      <span className="countdown">{cd}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}
      </div>
    </section>
  );
}
