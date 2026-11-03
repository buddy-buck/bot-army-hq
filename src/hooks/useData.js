import { useCallback, useEffect, useRef, useState } from 'react';
import { TEAM_ZONE, ZONES } from '../utils/paths.js';

const REFRESH_MS = 5 * 60 * 1000;
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
  claude: 'guestdesk',
};
const ZONE_ALIASES = { 'guest-bungalow': 'guestdesk', guestbungalow: 'guestdesk', guest: 'guestdesk', vip: 'guestdesk' };
const ZONE_TEAM = Object.fromEntries(Object.entries(TEAM_ZONE).map(([team, zone]) => [zone, team]));

function resolveZone(id, zone, team) {
  const z = String(zone || '').trim().toLowerCase();
  if (ZONES[z]) return z;
  if (ZONE_ALIASES[z]) return ZONE_ALIASES[z];
  return HOME_ZONE[id] || TEAM_ZONE[team] || 'tower';
}

function normalizeBot(raw) {
  const id = String(raw.id || '').trim();
  const la = raw.lastAction || {};
  const zone = resolveZone(id, raw.zone, raw.team);
  return {
    id,
    name: raw.name || id.charAt(0).toUpperCase() + id.slice(1),
    pronoun: raw.pronoun || 'they',
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
    note: raw.note || (id === 'claude' ? 'Launch and Chief drop by.' : ''),
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
  // Activity feed: [{ bot, text, url, at, to? }], newest first, at most 40.
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
        }))
        .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
        .slice(0, MAX_FEED)
    : [];
  return {
    isExample: json?._example === true,
    feed,
    updatedAt: json?.updatedAt || null,
    minutesSaved: json?.minutesSaved || { total: 0, asOf: new Date().toISOString(), perHourRate: 0 },
    bots,
    handoffs,
  };
}

const actionKey = (b) => `${b.lastAction.at || ''}|${b.lastAction.text}|${b.lastAction.url}`;

// Fetches the live feed (or /data.json in Demo mode), refreshes every 5
// minutes, and tracks which bots' lastAction changed so they can pulse.
// If the live feed can't load, it shows the demo data and sets fellBack.
export default function useData(mode = HAS_LIVE ? 'live' : 'demo') {
  const [state, setState] = useState({ data: null, error: null, version: 0, pulseKeys: {}, fellBack: false });
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
      const data = normalizeData(json);
      if (!wantLive || fellBack) data.isExample = true;
      lastLoad.current = Date.now();
      setState((s) => {
        const version = s.version + 1;
        const pulseKeys = { ...s.pulseKeys };
        const prev = prevRef.current;
        if (prev) {
          const prevById = Object.fromEntries(prev.bots.map((b) => [b.id, b]));
          for (const b of data.bots) {
            const p = prevById[b.id];
            if (p && actionKey(p) !== actionKey(b)) pulseKeys[b.id] = version;
          }
        }
        prevRef.current = data;
        return { data, error: null, version, pulseKeys, fellBack };
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
