// The DJ booth's Spotify player: a tiny shared store (no React) so the booth
// in the 3D scene and the floating player in the HUD stay in step.
//
// Tap the DJ booth -> the floating Spotify player opens with the playlist
// below. If Spotify isn't available (offline, the embed doesn't load, or it
// failed earlier this visit), the booth plays its own Web Audio lo-fi beat
// instead (src/world/life/djAudio.js).

// Buddy's "Bot Island Radio" playlist. Swap it with VITE_SPOTIFY_PLAYLIST
// (just the id, the part after /playlist/ in a Spotify link).
export const DEFAULT_PLAYLIST = '1TzbhbH7HBKhGRf7Hnfu4l';
export const PLAYLIST_ID = (import.meta.env?.VITE_SPOTIFY_PLAYLIST || DEFAULT_PLAYLIST).trim();
export const PLAYLIST_URI = `spotify:playlist:${PLAYLIST_ID}`;
export const EMBED_URL = `https://open.spotify.com/embed/playlist/${encodeURIComponent(PLAYLIST_ID)}?utm_source=generator&theme=0`;
export const IFRAME_API_URL = 'https://open.spotify.com/embed/iframe-api/v1';
export const LOAD_TIMEOUT_MS = 8000; // no embed by then: fall back to the island beat

// track: what the player says is playing ({ uri, paused, buffering,
// position, duration } in ms), or null when nothing is.
export const spotifyState = { open: false, failed: false, track: null };

const listeners = new Set();
export function onSpotifyChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) fn({ ...spotifyState });
}

// Spotify can work right now (as far as the page can tell).
export function spotifyAvailable() {
  if (spotifyState.failed) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return true;
}

export function openSpotify() {
  if (spotifyState.open) return;
  spotifyState.open = true;
  emit();
}

export function closeSpotify() {
  if (!spotifyState.open) return;
  spotifyState.open = false;
  setSpotifyTrack(null);
  emit();
}

// Now playing, from the Spotify iFrame API's playback_update events.
const trackListeners = new Set();
export function onSpotifyTrack(fn) {
  trackListeners.add(fn);
  return () => trackListeners.delete(fn);
}
export function setSpotifyTrack(track) {
  spotifyState.track = track;
  for (const fn of trackListeners) fn(track);
}

// Spotify's iFrame API (loaded once, on the first open). Resolves with the
// IFrameAPI object, or rejects if the script can't load; then the player
// falls back to a plain embed (music still plays, no track info).
let apiPromise = null;
export function loadSpotifyApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
    const prev = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (api) => {
      if (typeof prev === 'function') prev(api);
      resolve(api);
    };
    const s = document.createElement('script');
    s.src = IFRAME_API_URL;
    s.async = true;
    s.onerror = () => reject(new Error('Spotify iFrame API failed to load'));
    document.head.appendChild(s);
  });
  apiPromise.catch(() => {});
  return apiPromise;
}

// The embed didn't load: remember for this visit so the next tap goes
// straight to the island beat.
export function markSpotifyFailed() {
  spotifyState.failed = true;
  spotifyState.open = false;
  setSpotifyTrack(null);
  emit();
}

// Warm up the connection to Spotify on the first interaction, so the player
// shows up fast when someone taps the booth.
let warmed = false;
export function preconnectSpotify() {
  if (warmed || typeof document === 'undefined') return;
  warmed = true;
  for (const href of ['https://open.spotify.com', 'https://embed-cdn.spotifycdn.com']) {
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = href;
    l.crossOrigin = 'anonymous';
    document.head.appendChild(l);
  }
}
