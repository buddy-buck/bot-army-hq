// The DJ booth's Spotify player: a tiny shared store (no React) so the booth
// in the 3D scene and the floating player in the HUD stay in step.
//
// Tap the DJ booth -> the floating Spotify player opens with the playlist
// below. If Spotify isn't available (offline, the embed doesn't load, or it
// failed earlier this visit), the booth plays its own Web Audio lo-fi beat
// instead (src/world/life/djAudio.js).

// Spotify's own "lofi beats" playlist. Swap it with VITE_SPOTIFY_PLAYLIST
// (just the id, the part after /playlist/ in a Spotify link).
export const DEFAULT_PLAYLIST = '37i9dQZF1DWWQRwui0ExPn';
export const PLAYLIST_ID = (import.meta.env?.VITE_SPOTIFY_PLAYLIST || DEFAULT_PLAYLIST).trim();
export const EMBED_URL = `https://open.spotify.com/embed/playlist/${encodeURIComponent(PLAYLIST_ID)}?utm_source=generator&theme=0`;
export const LOAD_TIMEOUT_MS = 8000; // no embed by then: fall back to the island beat

export const spotifyState = { open: false, failed: false };

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
  emit();
}

// The embed didn't load: remember for this visit so the next tap goes
// straight to the island beat.
export function markSpotifyFailed() {
  spotifyState.failed = true;
  spotifyState.open = false;
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
