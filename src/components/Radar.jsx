import { useEffect, useMemo, useRef, useState } from 'react';
import { TEAM_ZONE, ZONES } from '../utils/paths.js';

// Saturn radar, drawn in SVG (no extra WebGL context: the island is the only
// one). Chief is the planet in the middle, each team rides a tilted ring with
// its bots as colored dots. Tap the small radar for a bigger card with ring
// labels and how many bots on each ring are working. Tap a ring, a label or a
// row in the big card to fly to that team.

const RINGS = [
  { id: 'content', label: 'Content', teams: ['content'], zone: 'cabana', R: 1.0, tilt: 8, color: '#F09024', speed: 0.22, tagAngle: 200 },
  { id: 'realestate', label: 'Real Estate', teams: ['realestate'], zone: 'lanai', R: 1.32, tilt: -6, color: '#2F6FED', speed: 0.16, tagAngle: 340 },
  { id: 'networking', label: 'Networking', teams: ['networking'], zone: 'tikihut', R: 1.62, tilt: 13, color: '#8B5CF6', speed: 0.13, tagAngle: 90 },
  { id: 'research', label: 'Research', teams: ['research'], zone: 'lookout', R: 1.9, tilt: -10, color: '#2BA84A', speed: 0.1, tagAngle: 160 },
  { id: 'other', label: 'Other teams', legend: 'Money, Product, Home, Fun, Guest', teams: ['money', 'product', 'home', 'fun', 'guest'], zone: 'tower', R: 2.18, tilt: 3, color: '#0F9D8A', speed: 0.075, tagAngle: 20 },
];

const SCALE = 46; // ring radius 1 -> 46 SVG units
// How flat the rings look (Saturn seen from a little above), and the SVG box.
const LOOK = {
  small: { squash: 0.36, w: 236, h: 150 },
  big: { squash: 0.52, w: 236, h: 160 },
};

function ringPoint(ring, a, squash) {
  const rx = ring.R * SCALE;
  const x = Math.cos(a) * rx;
  const y = Math.sin(a) * rx * squash;
  const t = (ring.tilt * Math.PI) / 180;
  return [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
}

function RadarSvg({ chief, byRing, animate, big, onPick }) {
  const dotRefs = useRef({});
  const spin = useRef(0);
  const { squash: SQUASH, w: VW, h: VH } = big ? LOOK.big : LOOK.small;

  // Gentle orbit: one cheap timer at ~15fps, moving dots by attribute.
  useEffect(() => {
    if (!animate) return undefined;
    let raf;
    let last = performance.now();
    let acc = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      acc += dt;
      if (acc < 1 / 15) return;
      spin.current += acc;
      acc = 0;
      for (const ring of RINGS) {
        const list = byRing[ring.id];
        list.forEach((b, i) => {
          const el = dotRefs.current[`${ring.id}-${b.id}`];
          if (!el) return;
          const a = (i / Math.max(1, list.length)) * Math.PI * 2 + spin.current * ring.speed;
          const [x, y] = ringPoint(ring, a, SQUASH);
          el.setAttribute('cx', x.toFixed(1));
          el.setAttribute('cy', y.toFixed(1));
          el.setAttribute('opacity', Math.sin(a) < 0 ? '0.55' : '1');
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animate, byRing, SQUASH]);

  const chiefColor = chief?.color || '#D63AF9';
  const pr = big ? 15 : 17;

  const ringEl = (ring, half) => {
    const t = ring.tilt;
    const rx = ring.R * SCALE;
    // Back half (top of the ellipse) is drawn before the planet, front half after.
    const d = half === 'back' ? `M ${-rx} 0 A ${rx} ${rx * SQUASH} 0 0 1 ${rx} 0` : `M ${rx} 0 A ${rx} ${rx * SQUASH} 0 0 1 ${-rx} 0`;
    return (
      <g key={`${ring.id}-${half}`} transform={`rotate(${t})`}>
        <path d={d} fill="none" stroke={ring.color} strokeWidth={big ? 2.2 : 1.8} strokeOpacity={half === 'back' ? 0.45 : 0.8} />
        {big && half === 'front' && (
          <ellipse
            rx={rx}
            ry={rx * SQUASH}
            fill="none"
            stroke="transparent"
            strokeWidth="12"
            style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
            onClick={() => onPick(ring.zone)}
          >
            <title>{ring.legend || ring.label}</title>
          </ellipse>
        )}
      </g>
    );
  };

  return (
    <svg className="radar-svg" viewBox={`${-VW / 2} ${-VH / 2} ${VW} ${VH}`} role="img" aria-label={`Team radar: ${RINGS.map((r) => `${r.label} ${byRing[r.id].filter((b) => b.status === 'working').length} of ${byRing[r.id].length} working`).join(', ')}`}>
      {RINGS.map((r) => ringEl(r, 'back'))}
      <g onClick={big ? () => onPick('tower') : undefined} style={big ? { cursor: 'pointer' } : undefined}>
        <circle r={pr} fill={chiefColor} />
        <circle r={pr} fill="url(#planet-shade)" />
        <ellipse rx={pr * 1.45} ry={pr * 0.42} fill="none" stroke="#ffffff" strokeWidth="3" transform="rotate(-8)" />
      </g>
      {RINGS.map((r) => ringEl(r, 'front'))}
      {RINGS.map((ring) =>
        byRing[ring.id].map((b, i) => {
          const a = (i / Math.max(1, byRing[ring.id].length)) * Math.PI * 2;
          const [x, y] = ringPoint(ring, a, SQUASH);
          return (
            <circle
              key={b.id}
              ref={(el) => {
                dotRefs.current[`${ring.id}-${b.id}`] = el;
              }}
              cx={x}
              cy={y}
              r={big ? 4.2 : 4}
              fill={b.color}
              opacity={Math.sin(a) < 0 ? 0.55 : 1}
              stroke={b.status === 'working' ? '#ffffff' : 'none'}
              strokeWidth="1.2"
            />
          );
        })
      )}
      <defs>
        <radialGradient id="planet-shade" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.2" />
        </radialGradient>
      </defs>
    </svg>
  );
}

// Ring labels for the big card, placed as HTML over the SVG so text stays crisp.
function RingTags({ byRing, onPick }) {
  return RINGS.map((ring) => {
    const { squash, w, h } = LOOK.big;
    const [x, y] = ringPoint(ring, (ring.tagAngle * Math.PI) / 180, squash);
    const working = byRing[ring.id].filter((b) => b.status === 'working').length;
    return (
      <button
        key={ring.id}
        type="button"
        className="ring-tag"
        style={{ borderColor: ring.color, left: `${50 + (x / w) * 100}%`, top: `${50 + (y / h) * 100}%` }}
        onClick={() => onPick(ring.zone)}
      >
        {ring.label} <span className="ring-count">{working}/{byRing[ring.id].length}</span>
      </button>
    );
  });
}

export default function Radar({ bots, onFly, animate = true, paused = false, hidden = false }) {
  const [open, setOpen] = useState(false);
  const chief = bots.find((b) => b.id === 'chief');

  const byRing = useMemo(() => {
    const out = Object.fromEntries(RINGS.map((r) => [r.id, []]));
    for (const b of bots) {
      if (b.team === 'leadership') continue;
      const ring = RINGS.find((r) => r.teams.includes(b.team)) || RINGS[RINGS.length - 1];
      out[ring.id].push(b);
    }
    return out;
  }, [bots]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const pick = (zone) => {
    setOpen(false);
    onFly(ZONES[zone] ? zone : 'tower');
  };

  const totalWorking = bots.filter((b) => b.status === 'working').length;
  const moving = animate && !paused;

  return (
    <>
      <button type="button" className="radar panel" style={hidden ? { display: 'none' } : undefined} onClick={() => setOpen(true)} aria-label="Team radar. Tap for the bigger view.">
        <RadarSvg chief={chief} byRing={byRing} animate={moving && !open} big={false} onPick={pick} />
      </button>
      {open && (
        <div className="card-backdrop radar-backdrop" onClick={() => setOpen(false)} onPointerDown={(e) => e.stopPropagation()}>
          <div className="radar-card panel" role="dialog" aria-modal="true" aria-label="Team radar" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="card-close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
            <h2 className="radar-title">Team radar</h2>
            <p className="radar-sub">
              Chief in the middle. {totalWorking} of {bots.length} bots working.
            </p>
            <div className="radar-big">
              <RadarSvg chief={chief} byRing={byRing} animate={moving} big onPick={pick} />
              <RingTags byRing={byRing} onPick={pick} />
            </div>
            <ul className="radar-legend">
              <li>
                <button type="button" className="roster-row" onClick={() => pick('tower')}>
                  <span className="roster-dot" style={{ background: chief?.color || '#D63AF9' }} aria-hidden="true" />
                  <span className="roster-name">Chief&rsquo;s Tower</span>
                  <span className="ring-count">{chief?.status === 'working' ? '1/1' : '0/1'} working</span>
                </button>
              </li>
              {RINGS.map((r) => {
                const list = byRing[r.id];
                const w = list.filter((b) => b.status === 'working').length;
                return (
                  <li key={r.id}>
                    <button type="button" className="roster-row" onClick={() => pick(r.zone)}>
                      <span className="roster-dot" style={{ background: r.color }} aria-hidden="true" />
                      <span className="roster-name">{r.legend || r.label}</span>
                      <span className="ring-count">
                        {w}/{list.length} working
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

export { TEAM_ZONE };
