import { useEffect, useState } from 'react';
import { timeAgo } from '../utils/ticker.js';

// Bottom-left activity feed: the newest real actions from data.json, newest
// first. Lines with a link open it in a new tab; lines without one are plain
// text (no dead links). Nothing in the last 24 hours means an empty, quiet feed.

const RECENT_MS = 24 * 3600 * 1000;
const MAX_ITEMS = 8;

export function recentActions(bots, now = Date.now()) {
  return bots
    .filter((b) => b.lastAction?.text && b.lastAction.at)
    .map((b) => ({ bot: b, t: Date.parse(b.lastAction.at) }))
    .filter(({ t }) => !Number.isNaN(t) && now - t <= RECENT_MS && t - now < 5 * 60 * 1000)
    .sort((a, b) => b.t - a.t)
    .slice(0, MAX_ITEMS);
}

function FeedLine({ bot, now }) {
  const la = bot.lastAction;
  const body = (
    <>
      <span className="feed-dot" style={{ background: bot.color }} aria-hidden="true" />
      <span className="feed-text">
        <strong>{bot.name}</strong> {la.text}
        <span className="feed-time">{timeAgo(la.at, now)}</span>
      </span>
      {la.url && (
        <svg className="feed-go" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M9 6h9v9M18 6L7 17" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </>
  );
  if (la.url) {
    return (
      <li>
        <a className="feed-line is-link" href={la.url} target="_blank" rel="noopener noreferrer">
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

export default function Feed({ bots, walks }) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1100 && window.innerHeight >= 760);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const items = recentActions(bots, now);
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
          {(open ? items : items.slice(0, 1)).map(({ bot }) => (
            <FeedLine key={bot.id} bot={bot} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}
