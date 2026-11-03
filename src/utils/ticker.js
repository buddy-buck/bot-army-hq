// Minutes-saved math for the top banner.
//
// displayed = total + perHourRate * hoursSince(asOf)
// The extra part is capped at one week (perHourRate * 168) and never negative.
// The Ticker component also makes sure the number never counts backward.

export const MAX_EXTRA_HOURS = 168;
const TZ = 'America/Los_Angeles';

export function hoursSince(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return (now - t) / 3600000;
}

export function computeMinutesSaved(minutesSaved, now = Date.now()) {
  if (!minutesSaved) return 0;
  const total = Number(minutesSaved.total) || 0;
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

export function timeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!iso || Number.isNaN(t)) return '';
  const s = Math.round((now - t) / 1000);
  if (s < 0) {
    // Timestamps in the future (example data, clock skew): show the date.
    return formatAsOf(iso);
  }
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} day${d === 1 ? '' : 's'} ago`;
  return formatAsOf(iso);
}
