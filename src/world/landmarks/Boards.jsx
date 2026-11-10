import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SITES, groundY, teamLabel } from '../../utils/paths.js';
import { botOfTheDay } from '../../utils/botOfDay.js';
import { dayKeyPT, formatDayPT, formatTimePT } from '../../utils/time.js';
import { formatNumber } from '../../utils/ticker.js';
import { headlineMinutes } from '../../hooks/useData.js';
import { minuteStats } from '../../components/Scoreboard.jsx';
import { BambooPost, Box, Cyl, Lantern, M, pointer, std, tap, useGlowMaterial } from './kit.jsx';

// Round 4 boards around the island, all drawn from the live data:
//   Whiteboard   : today's priorities on an easel at the foot of Chief's Tower
//                  (who's working on what, what just got done, what's next)
//   StadiumBoard : a stadium scoreboard by the volleyball court with the
//                  minutes saved this week (counts up when it grows)
//   FameWall     : framed bot achievements on the beach by the tiki bar
//   TraceNook    : Trace's quiet little desk (her station, away from the band)
// Each one taps open a note (or the minutes drawer, for the stadium board).

const MARKER = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive';
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

const byNewest = (a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0);

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
// Whiteboard: today's priorities
// ---------------------------------------------------------------------------

export function buildPlan(bots = [], feed = [], nextUp = [], now = Date.now()) {
  const byId = new Map(bots.map((b) => [b.id, b]));
  const working = bots
    .filter((b) => b.status === 'working' && b.id !== 'claude')
    .sort((a, b) => (Date.parse(b.lastAction?.at) || 0) - (Date.parse(a.lastAction?.at) || 0));
  const doing = working.map((b) => ({ name: b.name, text: b.job || 'On it', color: b.color }));
  const lines = (feed || []).filter((f) => f && f.text && byId.has(f.bot)).sort(byNewest);
  const today = dayKeyPT(now);
  const todays = lines.filter((f) => dayKeyPT(f.at) === today);
  const done = (todays.length ? todays : lines).map((f) => ({ name: byId.get(f.bot).name, text: f.text, color: byId.get(f.bot).color }));
  const next = (nextUp || [])
    .filter((n) => n && byId.has(n.bot) && Date.parse(n.at) > now)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((n) => ({ name: byId.get(n.bot).name, text: n.job || 'Scheduled run', when: formatTimePT(n.at), color: byId.get(n.bot).color }));
  return { day: formatDayPT(new Date(now)), doing, done, next, working: working.length };
}

function magnet(x, cx, cy, color) {
  x.fillStyle = 'rgba(0,0,0,0.18)';
  x.beginPath();
  x.arc(cx + 2, cy + 3, 11, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = color || '#999';
  x.beginPath();
  x.arc(cx, cy, 11, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.55)';
  x.beginPath();
  x.arc(cx - 3, cy - 4, 3.5, 0, Math.PI * 2);
  x.fill();
}

export function drawWhiteboard(b, plan) {
  const { x, w, h } = b;
  x.clearRect(0, 0, w, h);
  x.fillStyle = '#fbfcfd';
  x.fillRect(0, 0, w, h);
  // ghosts of yesterday's erased notes
  x.fillStyle = 'rgba(110,130,160,0.06)';
  x.fillRect(420, 150, 260, 26);
  x.fillRect(80, 300, 330, 20);
  x.fillRect(470, 380, 200, 22);
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  x.fillStyle = '#d6293b';
  x.font = `700 46px ${MARKER}`;
  x.fillText("TODAY'S PRIORITIES", 32, 54);
  x.strokeStyle = '#d6293b';
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(32, 86);
  x.quadraticCurveTo(250, 80, 470, 88);
  x.stroke();
  x.textAlign = 'right';
  x.fillStyle = '#5d6774';
  x.font = `400 28px ${MARKER}`;
  x.fillText(plan.day, w - 28, 54);

  const row = (y, item, color, mark) => {
    magnet(x, 48, y, item.color);
    x.textAlign = 'left';
    x.fillStyle = color;
    x.font = `400 29px ${MARKER}`;
    const label = `${item.name}: ${item.text}${item.when ? ` (${item.when})` : ''}`;
    const s = fit(x, label, w - 110);
    x.fillText(s, 72, y + 1);
    if (mark === 'done') {
      x.strokeStyle = 'rgba(30,140,70,0.75)';
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(72, y + 2);
      x.lineTo(72 + Math.min(x.measureText(s).width, w - 110), y);
      x.stroke();
    }
  };
  const head = (y, text, color) => {
    x.textAlign = 'left';
    x.fillStyle = color;
    x.font = `700 30px ${MARKER}`;
    x.fillText(text, 30, y);
  };

  let y = 124;
  head(y, plan.working ? `NOW · ${plan.working} on it` : 'NOW', '#1f5fd6');
  y += 40;
  if (!plan.doing.length) {
    x.fillStyle = '#1f5fd6';
    x.font = `400 29px ${MARKER}`;
    x.fillText("All quiet. The team's chillin'.", 72, y);
    y += 40;
  }
  for (const it of plan.doing.slice(0, 3)) {
    row(y, it, '#1d3f8f');
    y += 40;
  }
  y += 8;
  head(y, 'DONE ✓', '#1f8a4c');
  y += 40;
  for (const it of plan.done.slice(0, 2)) {
    row(y, it, '#24613d', 'done');
    y += 40;
  }
  if (plan.next.length) {
    y += 8;
    head(y, 'NEXT →', '#e0761c');
    y += 40;
    row(y, plan.next[0], '#9a4a0c');
  }
  // signature
  x.textAlign = 'right';
  x.fillStyle = '#7d3bb8';
  x.font = `400 26px ${MARKER}`;
  x.fillText('– Chief', w - 30, h - 26);
  x.strokeStyle = '#7d3bb8';
  x.lineWidth = 3;
  x.beginPath();
  x.arc(w - 150, h - 30, 12, 0.2, Math.PI - 0.2);
  x.stroke();
}

function planNote(plan) {
  const body = [];
  const more = plan.doing.length > 6 ? `, and ${plan.doing.length - 6} more` : '';
  if (plan.doing.length) body.push(`Now (${plan.working} working): ${plan.doing.slice(0, 6).map((d) => `${d.name} (${d.text})`).join(', ')}${more}.`);
  else body.push("Now: all quiet. The team's chillin'.");
  if (plan.done.length) body.push(`Just done: ${plan.done.slice(0, 4).map((d) => `${d.name}: ${d.text}`).join(' · ')}`);
  if (plan.next.length) body.push(`Up next: ${plan.next.slice(0, 3).map((n) => `${n.name}: ${n.text} at ${n.when}`).join(' · ')}`);
  return { title: `Today's priorities · ${plan.day}`, body, from: "Chief's whiteboard" };
}

export function Whiteboard({ ctx }) {
  const site = SITES.whiteboard;
  const g = useGround(site);
  const night = ctx.sky.stars;
  const invalidate = useThree((s) => s.invalidate);
  const minute = useMinute();
  const board = useLiveCanvas(768, 512, { emissive: '#e8f0ff' });
  const plan = useMemo(() => buildPlan(ctx.bots, ctx.feed, ctx.nextUp), [ctx.bots, ctx.feed, ctx.nextUp, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = JSON.stringify(plan);
  useEffect(() => {
    drawWhiteboard(board, plan);
    board.tex.needsUpdate = true;
    invalidate();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    board.mat.emissiveIntensity = night * 0.3;
    invalidate();
  }, [board, night, invalidate]);
  const planRef = useRef(plan);
  planRef.current = plan;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const open = useMemo(() => tap(() => ctxRef.current.onNote?.(planNote(planRef.current))), []);
  const BW = 1.3;
  const BH = 0.87;
  const cy = 1.12;
  return (
    <group position={[site.x, g, site.z]} rotation={[0, site.rotY, 0]} onClick={open} {...pointer}>
      {/* A-frame easel legs, front pair and a back strut */}
      {[-BW / 2 + 0.06, BW / 2 - 0.06].map((x) => (
        <Cyl key={x} p={[x, 0.78, 0.02]} rt={0.022} h={1.6} m={M.wire} r={[-0.1, 0, 0]} />
      ))}
      <Cyl p={[0, 0.75, -0.3]} rt={0.02} h={1.55} m={M.wire} r={[0.32, 0, 0]} />
      {/* board in an aluminium frame, tilted back a touch */}
      <group position={[0, cy, 0]} rotation={[-0.1, 0, 0]}>
        <Box p={[0, 0, -0.02]} s={[BW + 0.07, BH + 0.07, 0.03]} m={WB.frame} />
        <mesh position={[0, 0, 0]} material={board.mat}>
          <planeGeometry args={[BW, BH]} />
        </mesh>
        {/* marker tray with three markers */}
        <Box p={[0, -BH / 2 - 0.04, 0.04]} s={[BW * 0.7, 0.025, 0.08]} m={WB.frame} />
        {['#d6293b', '#1f5fd6', '#1f8a4c'].map((c, i) => (
          <mesh key={c} position={[-0.12 + i * 0.12, -BH / 2 - 0.015, 0.05]} rotation={[0, 0, Math.PI / 2]} material={WB.markers[i]}>
            <cylinderGeometry args={[0.012, 0.012, 0.1, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const WB = {
  frame: std('#c7ccd3', { roughness: 0.4, metalness: 0.5 }),
  markers: ['#d6293b', '#1f5fd6', '#1f8a4c'].map((c) => std(c)),
};

// ---------------------------------------------------------------------------
// Stadium board: minutes saved this week
// ---------------------------------------------------------------------------

const AMBER = '#ffc93c';

export function drawStadium(b, value, pulse) {
  const { x, w, h } = b;
  x.clearRect(0, 0, w, h);
  x.fillStyle = '#0f0e16';
  x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,0.035)';
  for (let yy = 8; yy < h; yy += 14) for (let xx = 8; xx < w; xx += 14) x.fillRect(xx, yy, 3, 3);
  x.strokeStyle = AMBER;
  x.lineWidth = 8;
  x.strokeRect(12, 12, w - 24, h - 24);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#ffffff';
  x.font = `900 66px ${BLOCK}`;
  x.fillText('MINUTES SAVED', w / 2, 78);
  x.fillStyle = '#7fe3ff';
  x.font = `900 38px ${BLOCK}`;
  x.fillText('· THIS WEEK ·', w / 2, 134);
  // big digits in flip-board cells
  const text = value == null ? '--' : formatNumber(Math.round(value));
  const units = [...text].reduce((n, ch) => n + (ch === ',' ? 0.45 : 1), 0);
  const cellW = Math.min(118, 860 / Math.max(3, units));
  const cellH = 224;
  const top = 170;
  let dx = w / 2 - (units * cellW) / 2;
  x.font = `900 ${Math.round(cellH * 0.8)}px ${BLOCK}`;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const cw = ch === ',' ? cellW * 0.45 : cellW;
    if (ch !== ',') {
      x.shadowBlur = 0;
      x.fillStyle = '#05050a';
      x.fillRect(dx + 5, top, cellW - 10, cellH);
    }
    x.fillStyle = AMBER;
    x.shadowColor = `rgba(255,170,40,${0.7 + 0.3 * pulse})`;
    x.shadowBlur = 18 + pulse * 30;
    x.fillText(ch, dx + cw / 2, top + cellH / 2 + 8);
    x.shadowBlur = 0;
    if (ch !== ',') {
      x.fillStyle = 'rgba(0,0,0,0.5)';
      x.fillRect(dx + 5, top + cellH / 2 - 2, cellW - 10, 4);
    }
    dx += cw;
  }
  x.fillStyle = 'rgba(255,201,60,0.85)';
  x.font = `900 30px ${BLOCK}`;
  x.fillText('GO BOTS!', w / 2, h - 44);
}

export function StadiumBoard({ ctx }) {
  const site = SITES.stadium;
  const g = useGround(site);
  const night = ctx.sky.stars;
  const animate = ctx.animate;
  const invalidate = useThree((s) => s.invalidate);
  const board = useLiveCanvas(1024, 512, { emissive: '#ffffff', roughness: 0.6 });
  const week = useMemo(() => minuteStats(ctx.minutesSaved).week, [ctx.minutesSaved]);
  const value = week == null ? null : week + (ctx.demoAdded || 0);
  const st = useRef({ shown: value, from: value, to: value, k: 1, pulse: 0 });
  const lampMat = useGlowMaterial('#fff6d6', night, 0.25, 1.6);

  useEffect(() => {
    const s = st.current;
    if (value == null || s.to == null || !animate) {
      s.from = s.to = s.shown = value;
      s.k = 1;
      drawStadium(board, value, 0);
      board.tex.needsUpdate = true;
      invalidate();
      return;
    }
    if (value === s.to) return;
    s.from = s.shown;
    s.to = value;
    s.k = 0;
    if (value > s.from) s.pulse = 1;
  }, [value, animate, board, invalidate]);

  useEffect(() => {
    drawStadium(board, st.current.shown, 0);
    board.tex.needsUpdate = true;
  }, [board]);
  useEffect(() => {
    board.mat.emissiveIntensity = 0.25 + night * 0.65;
    invalidate();
  }, [board, night, invalidate]);

  useFrame((_, delta) => {
    const s = st.current;
    if (s.k >= 1 && s.pulse <= 0) return;
    const dt = Math.min(delta, 0.1);
    if (s.k < 1) {
      s.k = Math.min(1, s.k + dt / 1.6);
      const e = 1 - Math.pow(1 - s.k, 3);
      s.shown = s.from + (s.to - s.from) * e;
    }
    s.pulse = Math.max(0, s.pulse - dt * 0.7);
    lampMat.emissiveIntensity = 0.25 + night * 1.6 + s.pulse * 2.2;
    drawStadium(board, s.shown, s.pulse);
    board.tex.needsUpdate = true;
  });

  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const open = useMemo(() => tap(() => ctxRef.current.onScore?.()), []);
  const BW = 2.0;
  const BH = 1.0;
  const cy = 2.05;
  return (
    <group position={[site.x, g, site.z]} rotation={[0, site.rotY, 0]} onClick={open} {...pointer}>
      {[-0.75, 0.75].map((x) => (
        <group key={x}>
          <Cyl p={[x, cy / 2, -0.06]} rt={0.05} rb={0.065} h={cy} m={ST.steel} />
          <Cyl p={[x, 0.04, -0.06]} rt={0.16} h={0.08} m={ST.base} seg={8} />
        </group>
      ))}
      <Box p={[0, cy, -0.06]} s={[BW + 0.16, BH + 0.16, 0.1]} m={ST.case} />
      <Box p={[0, cy + BH / 2 + 0.1, -0.03]} s={[BW + 0.2, 0.05, 0.14]} m={ST.trim} />
      <mesh position={[0, cy, 0.0]} material={board.mat}>
        <planeGeometry args={[BW, BH]} />
      </mesh>
      {/* stadium light bank on top */}
      <Box p={[0, cy + BH / 2 + 0.32, -0.08]} s={[1.3, 0.04, 0.04]} m={ST.steel} />
      {[-0.5, -0.25, 0, 0.25, 0.5].map((x) => (
        <group key={x} position={[x, cy + BH / 2 + 0.42, -0.04]} rotation={[0.35, 0, 0]}>
          <Box p={[0, 0, -0.02]} s={[0.2, 0.15, 0.06]} m={ST.case} />
          <mesh position={[0, 0, 0.012]} material={lampMat}>
            <planeGeometry args={[0.16, 0.11]} />
          </mesh>
        </group>
      ))}
      {[-0.5, 0.5].map((x) => (
        <Cyl key={x} p={[x, cy + BH / 2 + 0.22, -0.08]} rt={0.015} h={0.22} m={ST.steel} />
      ))}
    </group>
  );
}

const ST = {
  steel: std('#aab3bc', { roughness: 0.4, metalness: 0.5 }),
  base: std('#6f7780'),
  case: std('#1c1b24'),
  trim: std('#19469D'),
};

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
