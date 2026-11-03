import { useEffect, useState } from 'react';
import { timeAgo } from '../utils/ticker.js';

// Bottom-left activity feed, built from the top-level "feed" array in
// data.json ([{ bot, text, url, at, to? }], newest first). Lines with a link
// open it in a new tab; lines without one are plain text (no dead links).
// Only real entries from the last 24 hours show. Nothing recent means an
// empty, quiet feed. Nothing is ever made up.

const RECENT_MS = 24 * 3600 * 1000;
const MAX_ITEMS = 12;

export function recentFeed(feed, now = Date.now()) {
  return (feed || [])
    .map((f) => ({ ...f, t: Date.parse(f.at) }))
    .filter(({ t }) => !Number.isNaN(t) && now - t <= RECENT_MS && t - now < 5 * 60 * 1000)
    .sort((a, b) => b.t - a.t)
    .slice(0, MAX_ITEMS);
}

function FeedLine({ item, bot, toBot, now }) {
  const body = (
    <>
      <span className="feed-dot" style={{ background: bot.color }} aria-hidden="true" />
      <span className="feed-text">
        <strong>{bot.name}</strong>
        {toBot && (
          <>
            {' '}
            to <strong>{toBot.name}</strong>:
          </>
        )}{' '}
        {item.text}
        <span className="feed-time">{timeAgo(item.at, now)}</span>
      </span>
      {item.url && (
        <svg className="feed-go" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M9 6h9v9M18 6L7 17" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </>
  );
  if (item.url) {
    return (
      <li>
        <a className="feed-line is-link" href={item.url} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      </li>
    );
  }
  return (
    <li>
      <div className="feed-line">{body}</div>
    </li>
  );
}

export default function Feed({ feed, bots, walks }) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1100 && window.innerHeight >= 760);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const byId = Object.fromEntries(bots.map((b) => [b.id, b]));
  const items = recentFeed(feed, now).filter((f) => byId[f.bot]);
  const walking = walks?.[0];

  return (
    <section className={`feed panel${open ? ' is-open' : ''}`} aria-label="Latest from the team">
      <button type="button" className="feed-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>Team activity</span>
        <span className="feed-caret" aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>
      {walking && (
        <div className="feed-walk" aria-live="polite">
          <span className="feed-orb" style={{ background: walking.color }} aria-hidden="true" />
          <span>
            <strong>{walking.fromName}</strong> is bringing <strong>{walking.toName}</strong> {walking.what ? walking.what : 'a handoff'}
          </span>
        </div>
      )}
      {!open && walking ? null : items.length === 0 ? (
        <p className="feed-empty">All quiet. The team is chilling.</p>
      ) : (
        <ul className="feed-list">
          {(open ? items : items.slice(0, 1)).map((item, i) => (
            <FeedLine key={`${item.bot}-${item.at}-${i}`} item={item} bot={byId[item.bot]} toBot={item.to ? byId[item.to] : null} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}
