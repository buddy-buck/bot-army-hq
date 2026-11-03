// Minutes-saved math for the top banner.
//
// Live data: displayed = total (static).
// Demo data: displayed = total + perHourRate * hoursSince(asOf)
// The extra part is capped at one week (perHourRate * 168) and never negative.
// The Ticker component also makes sure the number never counts backward.

export const MAX_EXTRA_HOURS = 168;
const TZ = 'America/Los_Angeles';

export function hoursSince(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return (now - t) / 3600000;
}

export function computeMinutesSaved(minutesSaved, now = Date.now(), isExample = false) {
  if (!minutesSaved) return 0;
  const total = Number(minutesSaved.total) || 0;
  // Live data: show the real total as-is. No extrapolation, no climbing.
  if (!isExample) return total;
  // Demo data only: grow at perHourRate since asOf (capped at one week).
  const rate = Math.max(0, Number(minutesSaved.perHourRate) || 0);
  const hours = Math.max(0, hoursSince(minutesSaved.asOf, now));
  const extra = Math.min(rate * hours, rate * MAX_EXTRA_HOURS);
  return total + Math.max(0, extra);
}

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
