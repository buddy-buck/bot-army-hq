import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SITES, groundY, teamLabel } from '../../utils/paths.js';
import { botOfTheDay } from '../../utils/botOfDay.js';
import { formatDayPT } from '../../utils/time.js';
import { formatNumber } from '../../utils/ticker.js';
import { headlineMinutes } from '../../hooks/useData.js';
import { minuteStats } from '../../components/Scoreboard.jsx';
import { BambooPost, Box, Cyl, Lantern, M, pointer, std, tap } from './kit.jsx';

// Round 4 boards around the island, all drawn from the live data:
//   FameWall     : framed bot achievements on the beach by the tiki bar
//   TraceNook    : Trace's quiet little desk (her station, away from the band)
// The wall of fame taps open a note.

const BLOCK = '"Arial Black", "Helvetica Neue", Arial, sans-serif';

// A canvas texture that gets redrawn when its data changes.
function useLiveCanvas(w, h, { emissive = '#ffffff', roughness = 0.8 } = {}) {
  const board = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness, emissiveMap: tex, emissive, emissiveIntensity: 0 });
    return { x: canvas.getContext('2d'), tex, mat, w, h };
  }, [w, h, emissive, roughness]);
  useEffect(() => () => (board.tex.dispose(), board.mat.dispose()), [board]);
  return board;
}

// Shorten text with an ellipsis so it fits maxW at the current font.
function fit(x, text, maxW) {
  if (x.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && x.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// A minute ticker so time-based boards (today, next up) roll over on their own.
function useMinute() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((v) => v + 1), 60000);
    return () => clearInterval(id);
  }, []);
  return n;
}

function useGround(site) {
  return useMemo(() => groundY(site.x, site.z), [site.x, site.z]);
}

// ---------------------------------------------------------------------------
// Wall of fame: framed bot achievements
// ---------------------------------------------------------------------------

export function buildFame(ctx, now = Date.now()) {
  const bots = (ctx.bots || []).filter((b) => b.id !== 'claude');
  const byId = new Map((ctx.bots || []).map((b) => [b.id, b]));
  const ms = ctx.minutesSaved;
  const out = [];
  const total = headlineMinutes(ms) + (ctx.demoAdded || 0);
  if (total >= 1000) {
    const k = Math.floor(total / 1000) * 1000;
    out.push({ title: `${formatNumber(k)} Minute Club`, detail: 'Saved for Buddy, all time', color: '#FFDE69', badge: 'gold' });
  }
  const stats = minuteStats(ms, now);
  const top = stats.topBot && byId.get(stats.topBot.id);
  if (top) out.push({ title: 'Top Bot This Week', detail: `${top.name} · ${formatNumber(stats.topBot.minutes)} min`, color: top.color });
  const botd = botOfTheDay(ctx.bots, now);
  if (botd) out.push({ title: 'Bot of the Day', detail: botd.name, color: botd.color, crown: true });
  const best = [...(stats.daily || [])].sort((a, b) => b.minutes - a.minutes)[0];
  if (best && best.minutes > 0) {
    const d = formatDayPT(new Date(`${best.date}T12:00:00-08:00`));
    out.push({ title: 'Best Day', detail: `${formatNumber(best.minutes)} min · ${d}`, color: '#2ec4c8' });
  }
  const win = [...(ms?.recent || [])].filter((r) => byId.has(r.bot)).sort((a, b) => b.minutes - a.minutes)[0];
  if (win) out.push({ title: 'Biggest Single Win', detail: `${byId.get(win.bot).name} · +${win.minutes} min`, color: byId.get(win.bot).color, note: win.what });
  const teams = {};
  for (const b of bots) if (b.status === 'working') teams[b.team] = (teams[b.team] || 0) + 1;
  const busy = Object.entries(teams).sort((a, b) => b[1] - a[1])[0];
  if (busy) out.push({ title: 'Busiest Crew', detail: `${teamLabel(busy[0])} · ${busy[1]} working`, color: bots.find((b) => b.team === busy[0])?.color || '#9b7bff' });
  if (bots.length) out.push({ title: `${bots.length} Bots Strong`, detail: 'And the army keeps growing', color: '#19469D', group: true });
  return out.slice(0, 6);
}

function doodleBot(x, cx, cy, s, color, { crown = false } = {}) {
  x.save();
  x.translate(cx, cy);
  x.scale(s, s);
  x.lineWidth = 4;
  x.strokeStyle = '#2b2118';
  // antenna + bulb
  x.beginPath();
  x.moveTo(0, -46);
  x.lineTo(0, -60);
  x.stroke();
  x.fillStyle = color;
  x.beginPath();
  x.arc(0, -64, 7, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  // head
  x.fillStyle = '#fbf3dc';
  x.beginPath();
  x.roundRect(-30, -48, 60, 42, 14);
  x.fill();
  x.stroke();
  x.fillStyle = '#2b2a33';
  x.beginPath();
  x.arc(-11, -28, 5.5, 0, Math.PI * 2);
  x.arc(11, -28, 5.5, 0, Math.PI * 2);
  x.fill();
  x.lineWidth = 3;
  x.beginPath();
  x.arc(0, -22, 8, 0.2, Math.PI - 0.2);
  x.stroke();
  // body
  x.lineWidth = 4;
  x.fillStyle = color;
  x.beginPath();
  x.roundRect(-24, -4, 48, 40, 12);
  x.fill();
  x.stroke();
  if (crown) {
    x.fillStyle = '#f5c542';
    x.beginPath();
    x.moveTo(-22, -50);
    x.lineTo(-22, -70);
    x.lineTo(-11, -60);
    x.lineTo(0, -76);
    x.lineTo(11, -60);
    x.lineTo(22, -70);
    x.lineTo(22, -50);
    x.closePath();
    x.fill();
    x.stroke();
  }
  x.restore();
}

export function drawFame(b, items) {
  const { x, w, h } = b;
  x.clearRect(0, 0, w, h);
  // bamboo-slat backing
  for (let i = 0; i < 16; i++) {
    x.fillStyle = i % 2 ? '#d4b872' : '#c9ab62';
    x.fillRect((i * w) / 16, 0, w / 16, h);
    x.fillStyle = 'rgba(120,90,40,0.35)';
    for (let k = 0; k < 4; k++) x.fillRect((i * w) / 16, 40 + k * 160 + (i % 3) * 20, w / 16, 5);
  }
  // header plaque
  x.fillStyle = '#5a3a20';
  x.beginPath();
  x.roundRect(w / 2 - 250, 14, 500, 72, 14);
  x.fill();
  x.strokeStyle = '#f5c542';
  x.lineWidth = 5;
  x.stroke();
  x.fillStyle = '#f5c542';
  x.font = `900 46px ${BLOCK}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('★ WALL OF FAME ★', w / 2, 52);
  // frames
  const cols = 3;
  const fw = 290;
  const fh = 250;
  const gx = (w - cols * fw) / (cols + 1);
  items.forEach((it, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const fx = gx + c * (fw + gx);
    const fy = 108 + r * (fh + 22);
    const tilt = ((i * 37) % 5 - 2) * 0.008;
    x.save();
    x.translate(fx + fw / 2, fy + fh / 2);
    x.rotate(tilt);
    x.translate(-fw / 2, -fh / 2);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(6, 8, fw, fh);
    x.fillStyle = it.badge === 'gold' ? '#e2b84a' : '#7a5232';
    x.fillRect(0, 0, fw, fh);
    x.fillStyle = '#fdf8ee';
    x.fillRect(12, 12, fw - 24, fh - 24);
    // the "photo": sky, sea, sand and the bot
    const px = 22;
    const py = 22;
    const pw = fw - 44;
    const ph = 132;
    const sky = x.createLinearGradient(0, py, 0, py + ph);
    sky.addColorStop(0, '#8fd8f5');
    sky.addColorStop(0.62, '#c9efff');
    sky.addColorStop(0.62, '#2fb9c9');
    sky.addColorStop(0.78, '#2fb9c9');
    sky.addColorStop(0.78, '#f3dfa6');
    sky.addColorStop(1, '#f3dfa6');
    x.fillStyle = sky;
    x.fillRect(px, py, pw, ph);
    if (it.group) {
      ['#D63AF9', '#2BA84A', '#FF4500', '#19469D', '#8B5CF6'].forEach((col, k) => doodleBot(x, px + 30 + k * 49, py + ph - 34, 0.62, col));
    } else {
      doodleBot(x, px + pw / 2, py + ph - 32, 0.95, it.color || '#2ec4c8', { crown: it.crown });
      if (it.badge === 'gold') {
        x.fillStyle = '#f5c542';
        x.strokeStyle = '#8a6a12';
        x.lineWidth = 3;
        x.beginPath();
        x.arc(px + pw - 34, py + 34, 22, 0, Math.PI * 2);
        x.fill();
        x.stroke();
        x.fillStyle = '#8a6a12';
        x.font = `900 22px ${BLOCK}`;
        x.fillText('★', px + pw - 34, py + 35);
      }
    }
    // caption
    x.fillStyle = '#2b2118';
    x.font = `900 24px ${BLOCK}`;
    x.fillText(fit(x, it.title, fw - 36), fw / 2, py + ph + 30);
    x.fillStyle = '#6b4a2a';
    x.font = '700 21px "Helvetica Neue", Arial, sans-serif';
    x.fillText(fit(x, it.detail, fw - 36), fw / 2, py + ph + 62);
    x.restore();
  });
}

export function FameWall({ ctx }) {
  const site = SITES.fameWall;
  const g = useGround(site);
  const night = ctx.sky.stars;
  const invalidate = useThree((s) => s.invalidate);
  const minute = useMinute();
  const board = useLiveCanvas(1024, 640, { emissive: '#ffe2b0' });
  const items = useMemo(() => buildFame(ctx), [ctx.bots, ctx.minutesSaved, ctx.demoAdded, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = JSON.stringify(items);
  useEffect(() => {
    drawFame(board, items);
    board.tex.needsUpdate = true;
    invalidate();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    board.mat.emissiveIntensity = night * 0.35;
    invalidate();
  }, [board, night, invalidate]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const open = useMemo(
    () =>
      tap(() =>
        ctxRef.current.onNote?.({
          title: 'Wall of Fame',
          body: itemsRef.current.map((it) => `${it.title}: ${it.detail}${it.note ? ` (${it.note})` : ''}`),
          from: 'The Tiki Bar',
        })
      ),
    []
  );
  const BW = 1.7;
  const BH = BW * (640 / 1024);
  const cy = 0.95;
  return (
    <group position={[site.x, g, site.z]} rotation={[0, site.rotY, 0]} onClick={open} {...pointer}>
      {[-BW / 2 - 0.08, BW / 2 + 0.08].map((x) => (
        <BambooPost key={x} p={[x, 0, 0]} h={cy + BH / 2 + 0.25} r={0.06} />
      ))}
      <Box p={[0, cy, -0.04]} s={[BW + 0.1, BH + 0.1, 0.05]} m={M.darkWood} />
      <mesh position={[0, cy, 0]} material={board.mat}>
        <planeGeometry args={[BW, BH]} />
      </mesh>
      {/* little thatch cap */}
      <Box p={[0, cy + BH / 2 + 0.14, -0.02]} s={[BW + 0.4, 0.05, 0.36]} r={[0.28, 0, 0]} m={M.thatchDark} />
      <Lantern p={[-BW / 2 - 0.08, cy + BH / 2 + 0.05, 0.1]} night={night} />
      <Lantern p={[BW / 2 + 0.08, cy + BH / 2 + 0.05, 0.1]} night={night} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Trace's Nook: a quiet desk, far from the DJ booth's band stage
// ---------------------------------------------------------------------------

const NK = {
  card: std('#fdf8ee'),
  tab: std('#8B5CF6'),
  mug: std('#ffffff'),
  pot: std('#c4643a'),
  leaf: std('#3fae5a'),
};

export function TraceNook({ ctx }) {
  const site = SITES.traceNook;
  const g = useGround(site);
  const night = ctx.sky.stars;
  // desk runs north-south on Trace's west side, so her walk to the hammock
  // (south-east) stays clear
  return (
    <group position={[site.x, g, site.z]} rotation={[0, Math.PI / 2, 0]}>
      <Box p={[0, 0.5, 0]} s={[0.72, 0.05, 0.38]} m={M.wood} />
      {[[-0.32, -0.15], [0.32, -0.15], [-0.32, 0.15], [0.32, 0.15]].map(([x, z]) => (
        <Cyl key={`${x}${z}`} p={[x, 0.25, z]} rt={0.025} h={0.5} m={M.darkWood} />
      ))}
      {/* card file of people updates */}
      <group position={[0.12, 0.53, 0.02]}>
        <Box p={[0, 0.04, 0]} s={[0.22, 0.08, 0.14]} m={M.darkWood} />
        {[-0.07, -0.035, 0, 0.035, 0.07].map((x, i) => (
          <Box key={x} p={[x, 0.11, 0]} s={[0.012, 0.09, 0.12]} m={i === 2 ? NK.tab : NK.card} />
        ))}
      </group>
      {/* coffee mug and a little potted plant */}
      <Cyl p={[-0.12, 0.57, 0.08]} rt={0.035} h={0.08} m={NK.mug} seg={8} />
      <Cyl p={[-0.27, 0.56, -0.08]} rt={0.05} rb={0.04} h={0.08} m={NK.pot} seg={7} />
      <mesh position={[-0.27, 0.65, -0.08]} material={NK.leaf}>
        <icosahedronGeometry args={[0.07, 0]} />
      </mesh>
      <Lantern p={[0.3, 0.62, -0.1]} night={night} />
    </group>
  );
}
