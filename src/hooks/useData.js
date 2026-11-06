import { useCallback, useEffect, useRef, useState } from 'react';
import { TEAM_ZONE, ZONES } from '../utils/paths.js';

// Every 5 minutes. In local dev only, ?refresh=20 refreshes every 20 seconds for testing.
const DEV_REFRESH = import.meta.env.DEV && typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('refresh')) : 0;
const REFRESH_MS = DEV_REFRESH >= 10 ? DEV_REFRESH * 1000 : 5 * 60 * 1000;
const LIVE_URL = import.meta.env.VITE_DATA_URL || '';
const DEMO_URL = `${import.meta.env.BASE_URL}data.json`;
const MODE_KEY = 'bah-data-mode';

// True when this build has a real feed to show.
export const HAS_LIVE = !!LIVE_URL;

// Live / Demo choice: ?demo=1 or ?demo=0 wins (and is remembered), then the
// saved choice, then Live when a real feed exists, otherwise Demo.
export function initialMode() {
  if (!HAS_LIVE) return 'demo';
  try {
    const q = new URLSearchParams(window.location.search).get('demo');
    if (q === '1' || q === 'true') {
      localStorage.setItem(MODE_KEY, 'demo');
      return 'demo';
    }
    if (q === '0' || q === 'false') {
      localStorage.setItem(MODE_KEY, 'live');
      return 'live';
    }
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'demo' || saved === 'live') return saved;
  } catch {
    // storage blocked: fall through to the default
  }
  return 'live';
}

export function saveMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // ignore
  }
}

async function fetchJson(url) {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const MAX_FEED = 40;

// Where each bot lives when the data leaves the zone out (or uses an old name).
const HOME_ZONE = {
  chief: 'tower',
  spin: 'cabana', caption: 'cabana', slide: 'cabana', poster: 'cabana', cue: 'cabana', echo: 'cabana',
  download: 'cabana', stamp: 'cabana', 'scout-local': 'cabana', vibe: 'cabana', desk: 'cabana',
  lead: 'lanai', tour: 'lanai', board: 'lanai', scoop: 'lanai', dottie: 'lanai', tracy: 'lanai', jet: 'lanai',
  trace: 'tikihut', scout: 'tikihut', nudge: 'tikihut',
  benji: 'moneydesk',
  launch: 'dock',
  flo: 'bungalow',
  recon: 'lookout', brobot: 'lookout',
  nasty: 'beachchair',
  claude: 'tower',
};
// Claude used to live in a guest bungalow; every old name for it now means the tower.
const ZONE_ALIASES = { guestdesk: 'tower', 'guest-bungalow': 'tower', guestbungalow: 'tower', guest: 'tower', vip: 'tower', patio: 'cabana' };
const ZONE_TEAM = Object.fromEntries(Object.entries(TEAM_ZONE).map(([team, zone]) => [zone, team]));

function resolveZone(id, zone, team) {
  const z = String(zone || '').trim().toLowerCase();
  if (ZONE_ALIASES[z]) return ZONE_ALIASES[z];
  if (ZONES[z]) return z;
  return HOME_ZONE[id] || TEAM_ZONE[team] || 'tower';
}

// Pronouns come from the data ("he", "she", "he/him", ...). Anything else
// falls back to the house list: these bots are he/him, everyone else she/her.
// Kept for natural copy only; pronouns are never shown as labels on screen.
const HE_BOTS = new Set(['chief', 'brobot', 'board', 'recon', 'nasty', 'benji', 'jet']);
export function normalizePronoun(id, value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'he' || v.startsWith('he/')) return 'he';
  if (v === 'she' || v.startsWith('she/')) return 'she';
  return HE_BOTS.has(id) ? 'he' : 'she';
}

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// minutesSaved: total/asOf/perHourRate as before, plus optional today, live,
// ledgerTotal, week, recent [{ at, bot, minutes, what }] and daily [{ date, minutes }].
function normalizeMinutes(raw, ids) {
  const m = raw && typeof raw === 'object' ? raw : {};
  const recent = Array.isArray(m.recent)
    ? m.recent
        .filter((r) => r && num(r.minutes) !== null && num(r.minutes) > 0)
        .map((r) => ({
          at: r.at || null,
          bot: ids.has(r.bot) ? r.bot : null,
          minutes: Number(r.minutes),
          what: r.what ? String(r.what) : '',
        }))
        .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
    : [];
  const daily = Array.isArray(m.daily)
    ? m.daily.filter((d) => d && d.date && num(d.minutes) !== null).map((d) => ({ date: String(d.date), minutes: Number(d.minutes) }))
    : [];
  return {
    total: num(m.total), // already ledgerTotal + live when the feed sends it
    asOf: m.asOf || null,
    perHourRate: num(m.perHourRate) ?? 0,
    trackedSince: m.trackedSince || null,
    today: num(m.today),
    live: num(m.live), // only the unfolded minutes since the last fold
    liveEntries: num(m.liveEntries),
    ledgerTotal: num(m.ledgerTotal),
    week: num(m.week),
    recent,
    daily,
  };
}

// Headline number: total (which already includes live minutes). Only when
// total is missing, rebuild it from ledgerTotal + live. Never live alone.
export const headlineMinutes = (ms) => (ms ? ms.total ?? (ms.ledgerTotal ?? 0) + (ms.live ?? 0) : 0);

function normalizeNextUp(raw, ids) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n) => n && ids.has(n.bot) && !Number.isNaN(Date.parse(n.at)))
    .map((n) => ({ bot: n.bot, job: n.job ? String(n.job) : '', at: n.at }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

// Demo freshness: slide every sample timestamp so the newest one lands near
// "now". The shift is kept for the session (so countdowns really count down)
// and is only redone when the sample data has gone more than 3 hours stale.
let demoShift = null;
const DAY_MS = 24 * 3600 * 1000;
function shiftDates(node, ms, days) {
  if (Array.isArray(node)) return node.map((n) => shiftDates(n, ms, days));
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if ((k === 'at' || k === 'asOf' || k === 'updatedAt') && typeof v === 'string' && !Number.isNaN(Date.parse(v))) {
      out[k] = new Date(Date.parse(v) + ms).toISOString();
    } else if (k === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const d = new Date(`${v}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      out[k] = d.toISOString().slice(0, 10);
    } else {
      out[k] = shiftDates(v, ms, days);
    }
  }
  return out;
}
export function rebaseDemo(json, now = Date.now()) {
  const anchor = Date.parse(json?.updatedAt || json?.minutesSaved?.asOf || '');
  if (Number.isNaN(anchor)) return json;
  if (demoShift === null || now - (anchor + demoShift) > 3 * 3600 * 1000) demoShift = now - anchor - 60 * 1000;
  return shiftDates(json, demoShift, Math.round(demoShift / DAY_MS));
}

function normalizeBot(raw) {
  const id = String(raw.id || '').trim();
  const la = raw.lastAction || {};
  const zone = resolveZone(id, raw.zone, raw.team);
  return {
    id,
    name: raw.name || id.charAt(0).toUpperCase() + id.slice(1),
    pronoun: normalizePronoun(id, raw.pronoun),
    team: raw.team || ZONE_TEAM[zone] || 'guest',
    zone,
    color: raw.color || '#8a8f98',
    job: raw.job || '',
    status: ['working', 'idle', 'sleeping'].includes(raw.status) ? raw.status : 'idle',
    lastAction: {
      text: la.text || '',
      publicText: la.publicText || '',
      url: typeof la.url === 'string' ? la.url.trim() : '',
      at: la.at || null,
    },
    note: raw.note || (id === 'claude' ? "Up in Chief's Tower with a mai tai." : ''),
    minutesToday: num(raw.minutesToday),
    avatarUrl: raw.avatarUrl || `${import.meta.env.BASE_URL}avatars/${id}.png`,
  };
}

export function normalizeData(json) {
  const bots = Array.isArray(json?.bots) ? json.bots.filter((b) => b && b.id).map(normalizeBot) : [];
  const ids = new Set(bots.map((b) => b.id));
  const handoffs = Array.isArray(json?.handoffs)
    ? json.handoffs
        .filter((h) => h && ids.has(h.from) && ids.has(h.to) && h.from !== h.to)
        .map((h) => ({ from: h.from, to: h.to, at: h.at || null, what: h.what || '' }))
    : [];
  // Activity feed: [{ bot, text, url, at, to?, type? }], newest first, at most 40.
  const feed = Array.isArray(json?.feed)
    ? json.feed
        .filter((f) => f && ids.has(f.bot) && f.text)
        .map((f) => ({
          bot: f.bot,
          text: String(f.text),
          publicText: f.publicText || '',
          url: typeof f.url === 'string' ? f.url.trim() : '',
          at: f.at || null,
          to: f.to && ids.has(f.to) && f.to !== f.bot ? f.to : null,
          // optional event type for island effects, e.g. "shipped", "fantasy_win"
          type: typeof f.type === 'string' ? f.type.trim().toLowerCase() : '',
        }))
        .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
        .slice(0, MAX_FEED)
    : [];
  return {
    isExample: json?._example === true,
    feed,
    updatedAt: json?.updatedAt || null,
    minutesSaved: normalizeMinutes(json?.minutesSaved, ids),
    nextUp: normalizeNextUp(json?.nextUp, ids),
    bots,
    handoffs,
  };
}

const gainKey = (r) => `${r.at}|${r.bot}|${r.minutes}|${r.what}`;
let gainId = 0;

const actionKey = (b) => `${b.lastAction.at || ''}|${b.lastAction.text}|${b.lastAction.url}`;

// Fetches the live feed (or /data.json in Demo mode), refreshes every 5
// minutes, and tracks which bots' lastAction changed so they can pulse.
// If the live feed can't load, it shows the demo data and sets fellBack.
export default function useData(mode = HAS_LIVE ? 'live' : 'demo') {
  const [state, setState] = useState({ data: null, error: null, version: 0, pulseKeys: {}, fellBack: false, gains: [] });
  const prevRef = useRef(null);
  const lastLoad = useRef(0);
  const loading = useRef(false);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    const myReq = ++reqId.current;
    try {
      const wantLive = mode === 'live' && HAS_LIVE;
      let json;
      let fellBack = false;
      if (wantLive) {
        try {
          json = await fetchJson(LIVE_URL);
        } catch {
          json = await fetchJson(DEMO_URL);
          fellBack = true;
        }
      } else {
        json = await fetchJson(DEMO_URL);
      }
      if (myReq !== reqId.current) return; // mode changed mid-fetch
      const isDemo = !wantLive || fellBack;
      const data = normalizeData(isDemo ? rebaseDemo(json) : json);
      if (isDemo) data.isExample = true;
      lastLoad.current = Date.now();
      // Diff against the previous load here, outside the state updater, so the
      // updater stays pure (React may run it twice).
      const prev = prevRef.current;
      // New minutesSaved.recent entries since the last refresh: each one
      // floats a "+N min" chip from the bot that earned it.
      let gains = [];
      if (prev && prev.isExample === data.isExample) {
        const seen = new Set(prev.minutesSaved.recent.map(gainKey));
        gains = data.minutesSaved.recent.filter((r) => !seen.has(gainKey(r))).map((r) => ({ ...r, id: ++gainId }));
      }
      const changed = [];
      if (prev) {
        const prevById = Object.fromEntries(prev.bots.map((b) => [b.id, b]));
        for (const b of data.bots) {
          const p = prevById[b.id];
          if (p && actionKey(p) !== actionKey(b)) changed.push(b.id);
        }
      }
      prevRef.current = data;
      setState((s) => {
        const version = s.version + 1;
        const pulseKeys = { ...s.pulseKeys };
        for (const id of changed) pulseKeys[id] = version;
        return { data, error: null, version, pulseKeys, fellBack, gains };
      });
    } catch (err) {
      if (myReq === reqId.current) setState((s) => ({ ...s, error: err.message || 'Could not load data.json' }));
    } finally {
      if (myReq === reqId.current) loading.current = false;
    }
  }, [mode]);

  useEffect(() => {
    // New mode: don't pulse every bot just because the data source changed.
    prevRef.current = null;
    loading.current = false;
    load();
    const timer = setInterval(load, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > REFRESH_MS) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return state;
}
