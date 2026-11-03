// Public-safe mode (ON by default; ?safe=0 turns it off for testing): hides client names, family details and private
// links so the island can be shown or screenshotted in public.
//
// Note: this only changes what the page shows. data.json itself is still a
// public file, so the pipeline that writes it should never put anything
// truly private in it.

export function isSafeMode() {
  if (typeof window === 'undefined') return true;
  const v = new URLSearchParams(window.location.search).get('safe');
  return !(v === '0' || v === 'false');
}

// Teams whose work is mostly about clients, contacts, family or money.
// Their action text is always swapped for a generic line in safe mode.
const SENSITIVE_TEAMS = new Set(['realestate', 'networking', 'home', 'money']);

const GENERIC_BY_ID = {
  lead: 'Logged a new prospect',
  tour: 'Booked showings',
  board: 'Drafted a client update',
  scoop: 'Pulled comps for a property',
  dottie: 'Reviewed an offer',
  tracy: 'Moved a sale closer to closing',
  jet: 'Queued notes for past clients',
  trace: 'Logged people updates',
  scout: 'Updated people and business files',
  nudge: "Picked today's networking ping",
  benji: 'Checked the monthly money plan',
  flo: 'Sent a home reminder',
  desk: 'Sorted website messages',
  echo: 'Replied to comments',
};

const GENERIC_BY_TEAM = {
  realestate: 'Drafted a client update',
  networking: 'Updated contacts',
  home: 'Handled a home task',
  money: 'Checked the budget',
};

const GENERIC_NEXT_BY_TEAM = {
  realestate: 'Client updates',
  networking: 'Networking check-in',
  home: 'Home reminders',
  money: 'Money check-in',
};

const PRIVATE_HOSTS = [
  /(^|\.)mail\.google\.com$/,
  /(^|\.)docs\.google\.com$/,
  /(^|\.)drive\.google\.com$/,
  /(^|\.)sheets\.google\.com$/,
  /(^|\.)calendar\.google\.com$/,
  /(^|\.)gmail\.com$/,
  /(^|\.)supabase\.(co|com|in|io)$/,
  /^localhost$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
];

export function isPrivateUrl(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PRIVATE_HOSTS.some((r) => r.test(host));
  } catch {
    return true; // can't read it, so don't show it
  }
}

const FAMILY = '(?:Eve|Parker|Penny)';
const FAMILY_RE = new RegExp(`\\b${FAMILY}(?:(?:,\\s*and\\s+|,\\s*|\\s+and\\s+|\\s*&\\s*)${FAMILY})*(?:'s)?\\b`, 'g');
const STREET = '(?:St|Street|Ln|Lane|Rd|Road|Ave|Avenue|Way|Dr|Drive|Ct|Court|Pl|Place|Blvd|Hwy|Loop|Ter|Terrace|Cir|Circle)';
const ADDRESS_RE = new RegExp(`\\b(?:the\\s+)?(?:\\d{1,6}\\s+)?(?:(?:NE|NW|SE|SW|N|S|E|W)\\s+)?(?:\\d{1,4}(?:st|nd|rd|th)\\s+|[A-Z][a-z]+\\s+){1,3}${STREET}\\b\\.?`, 'g');
const CLIENT_WORDS = '(?:listing|offer|deal|family|file|closing|transaction|sale|purchase|house|home|escrow|inspection|showing|appraisal)';
const CLIENT_RE = new RegExp(`\\b(?:the\\s+)?[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?\\s+(${CLIENT_WORDS}s?)\\b`, 'g');
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const PHONE_RE = /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;
const URL_RE = /\bhttps?:\/\/\S+/g;

// Words that look like names but are fine to keep (places, shows, teams).
const KEEP = new Set(['Duvall', 'Carnation', 'Monroe', 'Snoqualmie', 'Fall', 'City', 'Valley', 'King', 'County', 'October', 'November', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Course', 'Daily', 'New', 'Weekly', 'Show', 'BB', 'LISN', 'DTV']);

export function scrubText(text) {
  if (!text) return '';
  let s = String(text);
  s = s.replace(URL_RE, 'a link');
  s = s.replace(EMAIL_RE, 'an email address');
  s = s.replace(PHONE_RE, 'a phone number');
  s = s.replace(FAMILY_RE, (m) => {
    const many = (m.match(new RegExp(FAMILY, 'g')) || []).length > 1;
    const who = many ? 'the family' : 'a family member';
    return m.endsWith("'s") ? `${who}'s` : who;
  });
  s = s.replace(ADDRESS_RE, 'a property');
  s = s.replace(CLIENT_RE, (m, word) => {
    const name = m.replace(/^the\s+/i, '').split(/\s+/)[0];
    if (KEEP.has(name)) return m;
    return `a client ${word}`;
  });
  return s.replace(/\s{2,}/g, ' ').trim();
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function safeBot(bot) {
  const sensitive = SENSITIVE_TEAMS.has(bot.team);
  const la = bot.lastAction;
  let text = '';
  if (la.publicText) text = la.publicText;
  else if (la.text) text = sensitive ? GENERIC_BY_ID[bot.id] || GENERIC_BY_TEAM[bot.team] || 'Finished a task' : capitalize(scrubText(la.text));
  const hideLink = !!la.url && (sensitive || isPrivateUrl(la.url));
  return {
    ...bot,
    job: capitalize(scrubText(bot.job)),
    note: scrubText(bot.note),
    lastAction: { ...la, text, url: hideLink ? '' : la.url, linkHidden: hideLink },
  };
}

export function applySafeMode(data) {
  if (!data) return data;
  const bots = data.bots.map(safeBot);
  const team = Object.fromEntries(data.bots.map((b) => [b.id, b.team]));
  const handoffs = data.handoffs.map((h) => ({
    ...h,
    what: SENSITIVE_TEAMS.has(team[h.from]) || SENSITIVE_TEAMS.has(team[h.to]) ? '' : scrubText(h.what),
  }));
  const feed = (data.feed || []).map((f) => {
    const t = team[f.bot];
    const sensitive = SENSITIVE_TEAMS.has(t) || (f.to && SENSITIVE_TEAMS.has(team[f.to]));
    const hideLink = !!f.url && (sensitive || isPrivateUrl(f.url));
    const text = f.publicText || (sensitive ? GENERIC_BY_ID[f.bot] || GENERIC_BY_TEAM[t] || 'Finished a task' : capitalize(scrubText(f.text)));
    return { ...f, text, url: hideLink ? '' : f.url };
  });
  // Minutes ledger and the schedule: sensitive teams get no detail at all.
  const ms = data.minutesSaved;
  const minutesSaved = ms
    ? { ...ms, recent: (ms.recent || []).map((r) => ({ ...r, what: r.bot && SENSITIVE_TEAMS.has(team[r.bot]) ? GENERIC_BY_ID[r.bot] || GENERIC_BY_TEAM[team[r.bot]] || 'Finished a task' : capitalize(scrubText(r.what)) })) }
    : ms;
  const nextUp = (data.nextUp || []).map((n) => ({
    ...n,
    job: SENSITIVE_TEAMS.has(team[n.bot]) ? GENERIC_NEXT_BY_TEAM[team[n.bot]] || 'Scheduled task' : capitalize(scrubText(n.job)),
  }));
  return { ...data, bots, handoffs, feed, minutesSaved, nextUp };
}
