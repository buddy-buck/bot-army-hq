import { useEffect, useState } from 'react';
import { teamLabel } from '../utils/paths.js';
import { timeAgo } from '../utils/ticker.js';

// Tap-a-bot card. Always light (cream background, dark text), day or night.

const STATUS_LABEL = { working: 'Working', idle: 'Idle', sleeping: 'Sleeping' };

export function Avatar({ bot, size = 72 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [bot.avatarUrl]);
  const style = { width: size, height: size, background: bot.color };
  if (!bot.avatarUrl || failed) {
    return (
      <div className="avatar avatar-fallback" style={style} aria-hidden="true">
        {bot.name.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <div className="avatar" style={style}>
      <img src={bot.avatarUrl} alt="" onError={() => setFailed(true)} draggable={false} />
    </div>
  );
}

export default function BotCard({ bot, onClose }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!bot) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bot, onClose]);

  if (!bot) return null;
  const { lastAction } = bot;
  const ago = lastAction.at ? timeAgo(lastAction.at, now) : '';

  return (
    <div className="card-backdrop" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
      <div className="bot-card panel" role="dialog" aria-modal="true" aria-label={`${bot.name} details`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="card-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="card-head">
          <Avatar bot={bot} key={bot.id} />
          <div className="card-titles">
            <div className="card-name">
              {bot.name} <span className="card-pronoun">({bot.pronoun})</span>
            </div>
            <div className="card-team">
              <span className="team-dot" style={{ background: bot.color }} />
              {teamLabel(bot.team)}
            </div>
            <div className={`status-chip status-${bot.status}`}>{STATUS_LABEL[bot.status] || bot.status}</div>
          </div>
        </div>
        {bot.job && <div className="card-job">{bot.job}</div>}
        <div className="card-section">
          <div className="card-label">Last action</div>
          <div className="card-action">{lastAction.text || 'Nothing logged yet'}</div>
          {ago && <div className="card-time">{ago}</div>}
        </div>
        {lastAction.url ? (
          <a className="card-open" href={lastAction.url} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        ) : (
          <div className="card-nolink">No link yet</div>
        )}
      </div>
    </div>
  );
}
