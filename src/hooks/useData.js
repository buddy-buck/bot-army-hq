import { useCallback, useEffect, useRef, useState } from 'react';
import { TEAM_ZONE, ZONES } from '../utils/paths.js';

const REFRESH_MS = 5 * 60 * 1000;
const DATA_URL = import.meta.env.VITE_DATA_URL || `${import.meta.env.BASE_URL}data.json`;

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

// Fetches /data.json, refreshes every 5 minutes, and tracks which bots'
// lastAction changed so they can pulse.
export default function useData() {
  const [state, setState] = useState({ data: null, error: null, version: 0, pulseKeys: {} });
  const prevRef = useRef(null);
  const lastLoad = useRef(0);
  const loading = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const sep = DATA_URL.includes('?') ? '&' : '?';
      const res = await fetch(`${DATA_URL}${sep}t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data = normalizeData(json);
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
        return { data, error: null, version, pulseKeys };
      });
    } catch (err) {
      setState((s) => ({ ...s, error: err.message || 'Could not load data.json' }));
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
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
