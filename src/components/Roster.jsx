import { useEffect } from 'react';
import { ZONES } from '../utils/paths.js';

// "Find a bot" panel: every bot grouped by zone. Tap a name and the camera
// flies to that bot on the island.

const STATUS_LABEL = { working: 'Working', idle: 'Chilling', sleeping: 'Sleeping' };

export default function Roster({ open, bots, onPick, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const groups = Object.entries(ZONES)
    .map(([key, z]) => ({ key, label: z.label, bots: bots.filter((b) => (ZONES[b.zone] ? b.zone : 'tower') === key) }))
    .filter((g) => g.bots.length);

  return (
    <div className="roster-backdrop" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
      <aside className="roster panel" role="dialog" aria-label="Find a bot" onClick={(e) => e.stopPropagation()}>
        <div className="roster-head">
          <h2>Find a bot</h2>
          <button type="button" className="card-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="roster-count">{bots.length} on the island</p>
        <div className="roster-scroll">
          {groups.map((g) => (
            <div key={g.key} className="roster-group">
              <h3>{g.label}</h3>
              <ul>
                {g.bots.map((b) => (
                  <li key={b.id}>
                    <button type="button" className="roster-row" onClick={() => onPick(b.id)}>
                      <span className="roster-dot" style={{ background: b.color }} aria-hidden="true" />
                      <span className="roster-name">{b.name}</span>
                      <span className={`roster-status status-${b.status}`}>{STATUS_LABEL[b.status] || b.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
