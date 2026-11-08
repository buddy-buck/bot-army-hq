import { useEffect, useRef, useState } from 'react';
import {
  EMBED_URL,
  LOAD_TIMEOUT_MS,
  PLAYLIST_URI,
  closeSpotify,
  loadSpotifyApi,
  markSpotifyFailed,
  onSpotifyChange,
  setSpotifyTrack,
  spotifyState,
} from '../utils/spotify.js';

// Small floating Spotify player for the Beach Beats DJ booth. Opens when the
// booth is tapped (see utils/spotify.js), sits under the top HUD, and can be
// dismissed with the close button or Esc. Press play inside the player to
// start the playlist (browsers don't let embeds autoplay).
//
// It's built with Spotify's iFrame API so the island knows what's playing
// (that's how the conga line knows "Conga!" is on, see world/life/conga.js).
// If the API script can't load, it falls back to a plain embed: the music
// still plays, the island just can't tell which song.
//
// Fallback: if the player hasn't loaded after LOAD_TIMEOUT_MS (offline,
// blocked, Spotify down), it closes and the booth plays its own Web Audio
// lo-fi beat. "Island beat" switches to it by hand too.
// onFallback() starts that beat; onToast(text) says what happened.
export default function SpotifyPlayer({ onFallback, onToast }) {
  const [open, setOpen] = useState(spotifyState.open);
  const [loaded, setLoaded] = useState(false);
  const [plain, setPlain] = useState(false); // API unavailable: plain iframe
  const timer = useRef(0);
  const host = useRef(null);

  useEffect(() => onSpotifyChange((st) => setOpen(st.open)), []);

  // Each time the player opens, give it a few seconds to load.
  const giveUp = useRef(null);
  giveUp.current = () => {
    markSpotifyFailed();
    onFallback?.();
    onToast?.("Spotify isn't available right now, so the island DJ is spinning its own beat.");
  };
  const startTimer = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => giveUp.current(), LOAD_TIMEOUT_MS);
  };
  useEffect(() => {
    if (!open) return undefined;
    setLoaded(false);
    startTimer();
    const onKey = (e) => e.key === 'Escape' && closeSpotify();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onFallback, onToast]);

  // The controller replaces the element it's given, so hand it a fresh child
  // of a div React owns, and destroy it on close.
  useEffect(() => {
    if (!open || plain) return undefined;
    let controller = null;
    let dead = false;
    loadSpotifyApi()
      .then((api) => {
        if (dead || !host.current) return;
        startTimer(); // the script took its time: give the player its own few seconds
        const el = document.createElement('div');
        host.current.appendChild(el);
        api.createController(el, { uri: PLAYLIST_URI, width: '100%', height: 152 }, (c) => {
          if (dead) {
            c.destroy();
            return;
          }
          controller = c;
          const ready = () => {
            clearTimeout(timer.current);
            setLoaded(true);
          };
          // Spotify's own ready message, or the iframe's load event, whichever comes first
          c.addListener('ready', ready);
          host.current?.querySelector('iframe')?.addEventListener('load', ready, { once: true });
          c.addListener('playback_update', (e) => {
            const d = e?.data || {};
            setSpotifyTrack(
              d.playingURI
                ? { uri: d.playingURI, paused: !!d.isPaused, buffering: !!d.isBuffering, position: d.position || 0, duration: d.duration || 0 }
                : null
            );
          });
        });
      })
      .catch(() => !dead && setPlain(true));
    return () => {
      dead = true;
      setSpotifyTrack(null);
      try {
        controller?.destroy();
      } catch {
        // already gone
      }
      if (host.current) host.current.textContent = '';
    };
  }, [open, plain]);

  if (!open) return null;

  const onLoad = () => {
    clearTimeout(timer.current);
    setLoaded(true);
  };
  const useIslandBeat = () => {
    closeSpotify();
    onFallback?.();
  };

  return (
    <div className="spotify-player panel" role="dialog" aria-label="Beach Beats DJ: Spotify player" onPointerDown={(e) => e.stopPropagation()}>
      <div className="spotify-head">
        <span className="spotify-title">
          <span className="spotify-dot" aria-hidden="true" />
          Bot Island Radio
        </span>
        <button type="button" className="spotify-alt" onClick={useIslandBeat}>
          Island beat
        </button>
        <button type="button" className="spotify-close" onClick={closeSpotify} aria-label="Close player">
          ×
        </button>
      </div>
      <div className={`spotify-frame${loaded ? ' is-loaded' : ''}`}>
        {!loaded && <div className="spotify-loading">Tuning in…</div>}
        {plain ? (
          <iframe
            title="Bot Island Radio on Spotify"
            src={EMBED_URL}
            width="100%"
            height="152"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="eager"
            onLoad={onLoad}
            onError={() => {
              clearTimeout(timer.current);
              markSpotifyFailed();
              onFallback?.();
            }}
          />
        ) : (
          <div ref={host} className="spotify-host" />
        )}
      </div>
    </div>
  );
}
