import { useCallback, useEffect, useRef, useState } from 'react';

const REFRESH_MS = 5 * 60 * 1000;
const DATA_URL = `${import.meta.env.BASE_URL}data.json`;

function normalizeBot(raw) {
  const id = String(raw.id || '').trim();
  const la = raw.lastAction || {};
  return {
    id,
    name: raw.name || id,
    pronoun: raw.pronoun || 'they',
    team: raw.team || 'guest',
    zone: raw.zone || 'tower',
    color: raw.color || '#8a8f98',
    job: raw.job || '',
    status: ['working', 'idle', 'sleeping'].includes(raw.status) ? raw.status : 'idle',
    lastAction: {
      text: la.text || '',
      url: typeof la.url === 'string' ? la.url.trim() : '',
      at: la.at || null,
    },
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
  return {
    isExample: json?._example === true,
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
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
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
