// Number and date formatting for the HUD.

const TZ = 'America/Los_Angeles';

export function formatNumber(n) {
  return Math.floor(n).toLocaleString('en-US');
}

export function formatAsOf(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(t));
}

// "just now", "3 min ago", "2 hrs ago", "yesterday", "4 days ago", or a date.
export function timeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!iso || Number.isNaN(t)) return '';
  const s = Math.round((now - t) / 1000);
  if (s < -300) return formatAsOf(iso); // future timestamp: show the date
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hr' : 'hrs'} ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  return formatAsOf(iso);
}

// "Sep 1, 2026" for a date like "2026-09-01".
export function formatDay(value) {
  if (!value) return '';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-08:00` : value;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(t));
}
