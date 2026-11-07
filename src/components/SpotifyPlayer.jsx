import { useEffect, useRef, useState } from 'react';
import { EMBED_URL, LOAD_TIMEOUT_MS, closeSpotify, markSpotifyFailed, onSpotifyChange, spotifyState } from '../utils/spotify.js';

// Small floating Spotify player for the Beach Beats DJ booth. Opens when the
// booth is tapped (see utils/spotify.js), sits under the top HUD, and can be
// dismissed with the close button or Esc. Press play inside the player to
// start the playlist (browsers don't let embeds autoplay).
//
// Fallback: if the embed hasn't loaded after LOAD_TIMEOUT_MS (offline, blocked,
// Spotify down), the player closes and the booth plays its own Web Audio
// lo-fi beat. "Island beat" switches to it by hand too.
// onFallback() starts that beat; onToast(text) says what happened.
export default function SpotifyPlayer({ onFallback, onToast }) {
  const [open, setOpen] = useState(spotifyState.open);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef(0);

  useEffect(() => onSpotifyChange((st) => setOpen(st.open)), []);

  // Each time the player opens, give the embed a few seconds to load.
  useEffect(() => {
    if (!open) return undefined;
    setLoaded(false);
    timer.current = setTimeout(() => {
      markSpotifyFailed();
      onFallback?.();
      onToast?.("Spotify isn't available right now, so the island DJ is spinning its own beat.");
    }, LOAD_TIMEOUT_MS);
    const onKey = (e) => e.key === 'Escape' && closeSpotify();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onFallback, onToast]);

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
          Beach Beats DJ
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
        <iframe
          title="Spotify lo-fi playlist"
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
      </div>
    </div>
  );
}
