import { useCallback, useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';

// Postcard mode: the island freezes at a low golden three-quarter angle (App
// flies the camera there and switches the canvas to on-demand frames), the
// HUD hides and a vintage "Greetings from Bot Island" card frames the view.
// Share renders one fresh WebGL frame, copies it straight into a 2D canvas
// (no preserveDrawingBuffer needed, the copy happens right after the render),
// paints the postcard lettering, stamp and postmark on top and hands the PNG
// to the share sheet (iPhone) or downloads it (desktop).

// Inside <Canvas>: exposes capture() -> the WebGL canvas, freshly rendered.
export function CaptureBridge({ apiRef }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    apiRef.current = () => {
      gl.render(scene, camera);
      return gl.domElement;
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, gl, scene, camera]);
  return null;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function postmarkDate(d = new Date()) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
}

const TITLE_FONT = "900 {px}px 'Arial Black', 'Helvetica Neue', Impact, system-ui, sans-serif";
const SCRIPT_FONT = "italic 700 {px}px 'Snell Roundhand', 'Brush Script MT', 'Segoe Script', Georgia, cursive";
const font = (f, px) => f.replace('{px}', Math.round(px));

function drawStamp(ctx, x, y, w, h, u) {
  // perforated white edge
  ctx.save();
  ctx.fillStyle = '#fffaf0';
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 6 * u;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const r = 3.2 * u;
  const step = 9 * u;
  for (let px = x; px <= x + w; px += step) {
    ctx.beginPath();
    ctx.arc(px, y, r, 0, Math.PI * 2);
    ctx.arc(px, y + h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let py = y; py <= y + h; py += step) {
    ctx.beginPath();
    ctx.arc(x, py, r, 0, Math.PI * 2);
    ctx.arc(x + w, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // art
  const m = 7 * u;
  const g = ctx.createLinearGradient(0, y + m, 0, y + h - m);
  g.addColorStop(0, '#ff8a3d');
  g.addColorStop(0.55, '#ff04a0');
  g.addColorStop(1, '#19469d');
  ctx.fillStyle = g;
  ctx.fillRect(x + m, y + m, w - m * 2, h - m * 2);
  ctx.fillStyle = '#ffde69';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.62, w * 0.2, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(TITLE_FONT, w * 0.27);
  ctx.fillText('BYOB', x + w / 2, y + h * 0.3);
  ctx.font = font("800 {px}px system-ui, sans-serif", w * 0.11);
  ctx.fillText('BOT ISLAND', x + w / 2, y + h * 0.8);
}

function drawPostmark(ctx, cx, cy, r, u, date) {
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = '#fff6e1';
  ctx.fillStyle = '#fff6e1';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 4 * u;
  ctx.lineWidth = 2.4 * u;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.4 * u;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font("800 {px}px system-ui, sans-serif", r * 0.24);
  ctx.fillText('BOT ISLAND', cx, cy - r * 0.32);
  ctx.font = font("900 {px}px system-ui, sans-serif", r * 0.25);
  ctx.fillText(date, cx, cy + r * 0.02);
  ctx.font = font("800 {px}px system-ui, sans-serif", r * 0.2);
  ctx.fillText('AIR MAIL', cx, cy + r * 0.36);
  // wavy cancel lines
  ctx.lineWidth = 2 * u;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    const y0 = cy - r * 0.45 + k * r * 0.3;
    for (let i = 0; i <= 24; i++) {
      const x = cx - r * 1.1 - i * r * 0.1;
      const y = y0 + Math.sin(i * 0.9) * r * 0.06;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawTitle(ctx, W, y, u) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // "Greetings from"
  ctx.font = font(SCRIPT_FONT, 46 * u);
  ctx.lineWidth = 7 * u;
  ctx.strokeStyle = '#1f2430';
  ctx.lineJoin = 'round';
  ctx.strokeText('Greetings from', W / 2, y);
  ctx.fillStyle = '#fff6dc';
  ctx.fillText('Greetings from', W / 2, y);
  // "BOT ISLAND": block letters, sunset fill, thick outline, blue drop shadow
  let size = 118 * u;
  ctx.font = font(TITLE_FONT, size);
  const maxW = W * 0.9;
  const tw = ctx.measureText('BOT ISLAND').width;
  if (tw > maxW) {
    size *= maxW / tw;
    ctx.font = font(TITLE_FONT, size);
  }
  const ty = y + size * 1.02;
  ctx.fillStyle = '#19469d';
  ctx.fillText('BOT ISLAND', W / 2 + size * 0.06, ty + size * 0.07);
  ctx.lineWidth = size * 0.12;
  ctx.strokeStyle = '#1f2430';
  ctx.strokeText('BOT ISLAND', W / 2, ty);
  const g = ctx.createLinearGradient(0, ty - size * 0.8, 0, ty);
  g.addColorStop(0, '#ffe98a');
  g.addColorStop(0.45, '#ffb02e');
  g.addColorStop(1, '#ff04a0');
  ctx.fillStyle = g;
  ctx.fillText('BOT ISLAND', W / 2, ty);
  ctx.restore();
}

// Paint the postcard onto a 2D canvas. Returns a Promise<Blob>.
function composePostcard(src) {
  const sw = src.width;
  const sh = src.height;
  const scale = Math.min(1, 2048 / Math.max(sw, sh));
  const W = Math.round(sw * scale);
  const H = Math.round(sh * scale);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9fd4f0'; // behind any transparent sky pixels
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(src, 0, 0, W, H);
  const u = Math.min(W, H) / 700; // layout unit
  // golden-hour wash and vignette
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = 'rgba(255, 176, 80, 0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(60, 30, 0, 0)');
  vg.addColorStop(1, 'rgba(60, 30, 0, 0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  // cream border
  const b = 16 * u;
  ctx.strokeStyle = '#fbf3e0';
  ctx.lineWidth = b * 2;
  ctx.strokeRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(160, 110, 50, 0.55)';
  ctx.lineWidth = 1.5 * u;
  ctx.strokeRect(b + 5 * u, b + 5 * u, W - (b + 5 * u) * 2, H - (b + 5 * u) * 2);
  drawTitle(ctx, W, b + 70 * u, u);
  const sw2 = 92 * u;
  const sh2 = 112 * u;
  const sx = W - b - 18 * u - sw2;
  const sy = H - b - 18 * u - sh2;
  drawStamp(ctx, sx, sy, sw2, sh2, u);
  drawPostmark(ctx, sx - 34 * u, sy + sh2 * 0.32, 52 * u, u, postmarkDate());
  return new Promise((resolve) => c.toBlob((blob) => resolve(blob), 'image/png'));
}

export default function Postcard({ captureRef, onClose }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const date = postmarkDate();

  // Prepare the image as soon as the card opens, so Share can open the share
  // sheet straight from the tap (Safari wants that).
  const prepare = useCallback(async () => {
    const cap = captureRef.current;
    if (!cap) return null;
    const blob = await composePostcard(cap());
    if (!blob) return null;
    const f = new File([blob], 'bot-island-postcard.png', { type: 'image/png' });
    fileRef.current = f;
    setFile(f);
    return f;
  }, [captureRef]);

  useEffect(() => {
    const id = setTimeout(() => prepare().catch(() => {}), 60);
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [prepare, onClose]);

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const f = fileRef.current || (await prepare());
      if (!f) return;
      if (navigator.canShare?.({ files: [f] }) && navigator.share) {
        try {
          await navigator.share({ files: [f], title: 'Greetings from Bot Island' });
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return; // closed the sheet
        }
      }
      const url = URL.createObjectURL(f);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      // nothing to share: leave the card open
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="postcard" role="dialog" aria-label="Postcard from Bot Island">
      <div className="postcard-frame" aria-hidden="true" />
      <div className="postcard-title" aria-hidden="true">
        <span className="postcard-greet">Greetings from</span>
        <span className="postcard-big" data-text="BOT ISLAND">
          BOT ISLAND
        </span>
      </div>
      <div className="postcard-stamp" aria-hidden="true">
        <div className="postcard-stamp-art">
          <span className="postcard-stamp-byob">BYOB</span>
          <span className="postcard-stamp-sun" />
          <span className="postcard-stamp-sub">BOT ISLAND</span>
        </div>
      </div>
      <div className="postcard-postmark" aria-hidden="true">
        <span>BOT ISLAND</span>
        <strong>{date}</strong>
        <span>AIR MAIL</span>
      </div>
      <div className="postcard-actions">
        <button type="button" className="postcard-btn is-primary" onClick={share} disabled={busy} aria-busy={!file}>
          Share
        </button>
        <button type="button" className="postcard-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
