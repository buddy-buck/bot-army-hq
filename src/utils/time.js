// Pacific time helpers for the HUD: clock text, "1:07 PM", countdowns.

export const TZ = 'America/Los_Angeles';

const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

// "Tue, Nov 3" -> "Tue Nov 3"
export function formatDayPT(date = new Date()) {
  return dayFmt.format(date).replace(',', '');
}

// "1:07 PM"
export function formatTimePT(iso) {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return timeFmt.format(new Date(t));
}

// "2026-11-03" in Pacific time, for grouping by day.
export function dayKeyPT(value = Date.now()) {
  const t = typeof value === 'number' ? value : Date.parse(value);
  if (Number.isNaN(t)) return '';
  return keyFmt.format(new Date(t));
}

// "in 2h 14m", "in 45s", "now"
export function countdown(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.round((t - now) / 1000);
  if (s <= 0) return 'now';
  if (s < 60) return `in ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 10) return `in ${m}m ${String(s % 60).padStart(2, '0')}s`;
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `in ${d}d ${h % 24}h`;
}
