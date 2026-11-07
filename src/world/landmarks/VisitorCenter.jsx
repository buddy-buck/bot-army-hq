import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SITES, ZONES, DECKS, groundY, islandWobble, ISLAND, teamLabel } from '../../utils/paths.js';
import { botOfTheDay } from '../../utils/botOfDay.js';
import { BambooPost, Beam, Box, Cone, Cyl, Fringe, Lantern, M, Roof, canvasTexture, hash2, pointer, std, tap } from './kit.jsx';

// The Visitor Center near the head of Launch's Pier: an open tropical
// pavilion with brochure racks, a map of the island, potted palms, a bench,
// and a scoreboard on posts beside it with the live bot count (on the
// island, working, chillin'/snoozing). Digits roll like a flip board when a
// count changes. Tap the pavilion or the board for the full rundown.
// Under the scoreboard hangs the Bot of the Day plaque (tap for its stats),
// and on the pier side stands the Guest Book, a cork board of visitor quotes
// (one featured note flips to the next every 12 s; tap to read them all).
//
// Counts use ctx.sceneBots: what's on screen right now (at bedtime the
// off-duty bots show as sleeping, so the board says SNOOZING).

const BOARD_W = 1024;
const BOARD_H = 400;
const ROLL_SECONDS = 0.75;
const AMBER = '#ffc93c';

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function digitsOf(n, len) {
  return String(Math.max(0, n)).padStart(len, ' ');
}

// One column of the board: label on top, rolling digits below.
function drawColumn(x, cx, col, t) {
  const len = Math.max(2, String(col.from).length, String(col.to).length);
  const cellW = Math.min(112, 300 / len);
  const cellH = 196;
  const top = 160;
  const a = digitsOf(col.from, len);
  const b = digitsOf(col.to, len);
  x.fillStyle = '#9fe6ff';
  x.font = '900 40px "Arial Black", Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowBlur = 0;
  x.fillText(col.label, cx, 118);
  const left = cx - (len * cellW) / 2;
  x.font = `900 ${Math.round(cellH * 0.82)}px "Arial Black", Arial, sans-serif`;
  for (let i = 0; i < len; i++) {
    const dx = left + i * cellW;
    // flip-board cell
    x.shadowBlur = 0;
    x.fillStyle = '#0b0a10';
    x.fillRect(dx + 5, top, cellW - 10, cellH);
    x.save();
    x.beginPath();
    x.rect(dx + 5, top, cellW - 10, cellH);
    x.clip();
    x.fillStyle = AMBER;
    x.shadowColor = 'rgba(255,170,40,0.9)';
    x.shadowBlur = 18;
    const mid = top + cellH / 2 + 6;
    if (a[i] === b[i] || t >= 1) {
      x.fillText(b[i], dx + cellW / 2, mid);
    } else {
      const k = ease(t);
      x.fillText(a[i], dx + cellW / 2, mid - k * cellH);
      x.fillText(b[i], dx + cellW / 2, mid + (1 - k) * cellH);
    }
    x.restore();
    // the split line across the middle of each cell
    x.fillStyle = 'rgba(0,0,0,0.55)';
    x.fillRect(dx + 5, top + cellH / 2 - 2, cellW - 10, 4);
  }
}

function drawBoard(x, cols, t) {
  x.clearRect(0, 0, BOARD_W, BOARD_H);
  x.fillStyle = '#17151d';
  x.fillRect(0, 0, BOARD_W, BOARD_H);
  // faint LED dot grid
  x.fillStyle = 'rgba(255,255,255,0.035)';
  for (let yy = 8; yy < BOARD_H; yy += 16) for (let xx = 8; xx < BOARD_W; xx += 16) x.fillRect(xx, yy, 3, 3);
  x.strokeStyle = AMBER;
  x.lineWidth = 6;
  x.strokeRect(10, 10, BOARD_W - 20, BOARD_H - 20);
  x.fillStyle = '#ffffff';
  x.font = '900 42px "Arial Black", Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('BOT ISLAND HQ  ·  LIVE', BOARD_W / 2, 56);
  x.fillStyle = AMBER;
  x.beginPath();
  x.arc(BOARD_W / 2 + 196, 56, 9, 0, Math.PI * 2);
  x.fill();
  const w = BOARD_W / cols.length;
  cols.forEach((c, i) => {
    drawColumn(x, w * i + w / 2, c, t);
    if (i) {
      x.fillStyle = 'rgba(255,201,60,0.5)';
      for (let yy = 110; yy < 360; yy += 22) x.fillRect(w * i - 3, yy, 6, 8);
    }
  });
}

// The island map on the back wall, drawn once.
function drawMap(x, w, h) {
  const s = 9.2;
  const ox = w / 2;
  const oz = h / 2 + 12;
  const px = (X) => ox + X * s;
  const pz = (Z) => oz + Z * s;
  x.fillStyle = '#f3e3b8';
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#8fd8e6';
  x.fillRect(14, 14, w - 28, h - 28);
  const ring = (e) => {
    x.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const X = Math.cos(a) * ISLAND.rx;
      const Z = Math.sin(a) * ISLAND.rz;
      const k = islandWobble(X, Z) * e;
      i ? x.lineTo(px(X * k), pz(Z * k)) : x.moveTo(px(X * k), pz(Z * k));
    }
    x.closePath();
  };
  x.fillStyle = '#b6ecf0';
  ring(1.12);
  x.fill();
  x.fillStyle = '#f6e3b0';
  ring(1.0);
  x.fill();
  x.fillStyle = '#79c766';
  ring(0.88);
  x.fill();
  x.fillStyle = '#9ad97c';
  x.beginPath();
  x.arc(px(0), pz(0), 2.3 * s, 0, Math.PI * 2);
  x.fill();
  // decks and the airstrip (all read from paths.js / sites.js)
  x.fillStyle = '#b07a48';
  const deck = (x0, x1, z0, z1) => x.fillRect(px(x0), pz(z0), (x1 - x0) * s, (z1 - z0) * s);
  for (const d of DECKS) deck(d.x0, d.x1, d.z0, d.z1);
  const r = SITES.runway;
  x.fillStyle = '#4a4a52';
  x.fillRect(px(r.x - r.hx + 0.15), pz(r.z + 0.72 - 0.45), (r.hx * 2 - 0.3) * s, 0.9 * s);
  x.fillStyle = '#ffffff';
  for (let k = -3; k <= 3; k++) x.fillRect(px(r.x + k * 1.2 - 0.3), pz(r.z + 0.72) - 1, 0.6 * s, 2);
  // volleyball court, DJ floor, food truck, tiki bar, lifeguard tower
  const v = SITES.volleyball;
  x.fillStyle = '#f2d48a';
  x.fillRect(px(v.x - v.hx), pz(v.z - v.hz), v.hx * 2 * s, v.hz * 2 * s);
  x.strokeStyle = '#ffffff';
  x.lineWidth = 1.5;
  x.strokeRect(px(v.x - v.hx), pz(v.z - v.hz), v.hx * 2 * s, v.hz * 2 * s);
  x.beginPath();
  x.moveTo(px(v.x), pz(v.z - v.hz));
  x.lineTo(px(v.x), pz(v.z + v.hz));
  x.stroke();
  const spot = (site, color, rad = 4.5) => {
    x.fillStyle = color;
    x.beginPath();
    x.arc(px(site.x), pz(site.z), rad, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#ffffff';
    x.lineWidth = 1.5;
    x.stroke();
  };
  spot(SITES.dj, '#9b5cff');
  spot(SITES.foodtruck, '#ff8a3d');
  spot(SITES.tikibar, '#e8a33c');
  spot(SITES.watchtower, '#e0393e', 3.5);
  // lighthouse
  const L = SITES.lighthouse;
  x.fillStyle = '#e0393e';
  x.beginPath();
  x.arc(px(L.x), pz(L.z), 6, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.arc(px(L.x), pz(L.z), 2.5, 0, Math.PI * 2);
  x.fill();
  // zones
  x.font = 'bold 13px Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'top';
  // labels go under their dot, or above it when that would overlap one
  // already placed (the tiki hut and Nasty's chair sit side by side)
  const placed = [];
  const hits = (b) => placed.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0);
  for (const z of Object.values(ZONES)) {
    if (z.noLabel) continue;
    x.fillStyle = '#d63af9';
    x.beginPath();
    x.arc(px(z.x), pz(z.z), 5, 0, Math.PI * 2);
    x.fill();
    const tw = x.measureText(z.label).width;
    let ty = pz(z.z) + 7;
    const box = (y) => ({ x0: px(z.x) - tw / 2, x1: px(z.x) + tw / 2, y0: y, y1: y + 14 });
    if (hits(box(ty))) ty = pz(z.z) - 21;
    placed.push(box(ty));
    x.fillStyle = '#2b2a33';
    x.fillText(z.label, px(z.x), ty);
  }
  // you are here
  const V = SITES.visitor;
  x.fillStyle = '#ff4d4d';
  x.beginPath();
  x.arc(px(V.x), pz(V.z), 7, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.arc(px(V.x), pz(V.z), 3, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#c8202f';
  x.font = '900 13px Arial, sans-serif';
  x.fillText('YOU ARE HERE', px(V.x), pz(V.z) + 9);
  // title and compass
  x.fillStyle = '#19469D';
  x.font = '900 22px "Arial Black", Arial, sans-serif';
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  x.fillText('BOT ISLAND HQ', 26, 34);
  x.textAlign = 'center';
  x.fillStyle = '#2b2a33';
  x.beginPath();
  x.moveTo(w - 44, 34);
  x.lineTo(w - 52, 58);
  x.lineTo(w - 36, 58);
  x.closePath();
  x.fill();
  x.font = 'bold 16px Arial, sans-serif';
  x.fillText('N', w - 44, 72);
}

function signTexture() {
  return canvasTexture(512, 112, (x, w, h) => {
    x.fillStyle = '#c08a57';
    x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(90,55,25,0.25)';
    for (let yy = 10; yy < h; yy += 18) x.fillRect(0, yy, w, 3);
    x.strokeStyle = '#6b4424';
    x.lineWidth = 8;
    x.strokeRect(4, 4, w - 8, h - 8);
    x.fillStyle = '#3d2412';
    x.font = '900 54px "Arial Black", Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('VISITOR CENTER', w / 2, h / 2 + 3);
  });
}

// Live counts from the scene bots.
function useCounts(ctx) {
  const list = ctx.sceneBots?.length ? ctx.sceneBots : ctx.bots || [];
  const total = list.length;
  const working = list.filter((b) => b.status === 'working').length;
  return { total, working, rest: total - working, restLabel: ctx.bedtime ? 'SNOOZING' : "CHILLIN'" };
}

function buildNote(ctx, counts) {
  const bots = ctx.sceneBots?.length ? ctx.sceneBots : ctx.bots || [];
  if (!bots.length) {
    return { title: 'Visitor Center', body: ['The bot counter is still warming up. Check back in a moment!'], from: 'The Visitor Center' };
  }
  const restWord = ctx.bedtime ? 'snoozing' : "chillin'";
  const teams = new Map();
  for (const b of bots) {
    const t = teams.get(b.team) || { n: 0, w: 0 };
    t.n += 1;
    if (b.status === 'working') t.w += 1;
    teams.set(b.team, t);
  }
  const rows = [...teams.entries()].sort((a, b) => b[1].n - a[1].n || b[1].w - a[1].w);
  const busiest = [...rows].sort((a, b) => b[1].w - a[1].w)[0];
  const body = [
    `Welcome to Bot Island HQ! There are ${counts.total} bots on the island right now: ${counts.working} working and ${counts.rest} ${restWord}.`,
    `By team: ${rows.map(([team, t]) => `${teamLabel(team)} ${t.n}${t.w ? ` (${t.w} working)` : ''}`).join(', ')}.`,
  ];
  if (busiest && busiest[1].w > 0) body.push(`Busiest crew right now: ${teamLabel(busiest[0])}, with ${busiest[1].w} at work.`);
  body.push(
    ctx.bedtime
      ? "It's after 9 PM in Duvall, so the off-duty bots are tucked into hammocks and the night shift is at the campfire."
      : 'Grab a brochure, wave at anyone on the paths, and tap a bot to see what it is up to.'
  );
  return { title: 'Visitor Center', body, from: 'The Visitor Center' };
}

const LEAFLETS = ['#ff5d8f', '#2ec4c8', '#ffd23f', '#5fd16b', '#9b7bff', '#ff8a3d', '#4aa8ff', '#f25cff', '#ffffff'].map((c) => std(c));
const POT = std('#c86a3c');
const LEAF = std('#3f9b4f', { side: THREE.DoubleSide });

function BrochureRack({ p, rotY }) {
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <Box p={[0, 0.55, -0.06]} s={[0.62, 1.1, 0.05]} m={M.darkWood} />
      {[-0.29, 0.29].map((x) => (
        <Box key={x} p={[x, 0.45, 0.02]} s={[0.04, 0.9, 0.16]} m={M.darkWood} />
      ))}
      {[0.35, 0.65, 0.95].map((y, row) => (
        <group key={y}>
          <Box p={[0, y - 0.12, 0.02]} s={[0.58, 0.03, 0.16]} m={M.wood} />
          {[-0.18, 0, 0.18].map((x, k) => (
            <Box key={x} p={[x, y, 0.0]} s={[0.15, 0.22, 0.02]} r={[-0.2, 0, 0]} m={LEAFLETS[(row * 3 + k) % LEAFLETS.length]} />
          ))}
        </group>
      ))}
    </group>
  );
}

function PottedPalm({ p }) {
  return (
    <group position={p}>
      <Cyl p={[0, 0.17, 0]} rt={0.2} rb={0.14} h={0.34} seg={8} m={POT} />
      <Cyl p={[0, 0.45, 0]} rt={0.03} rb={0.045} h={0.3} m={M.wood} />
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} material={LEAF} position={[0, 0.6, 0]} rotation={[0.9, (i / 5) * Math.PI * 2, 0, 'YXZ']}>
          <coneGeometry args={[0.09, 0.55, 3]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Bot of the Day plaque: crown, the bot's name in its team color, team and
// job. Picked by utils/botOfDay.js (same winner all day, Pacific time).

const BOTD_W = 512;
const BOTD_H = 400;
const GOLD = '#f5c542';

function wrapLines(x, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (x.measureText(next).width <= maxW || !line) line = next;
    else {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && x.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.replace(/[\s,.;:]+$/, '')}…`;
  }
  return lines;
}

function drawCrown(x, cx, cy, s) {
  x.save();
  x.translate(cx, cy);
  x.scale(s, s);
  x.fillStyle = GOLD;
  x.strokeStyle = '#8a5a12';
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(-60, 30);
  x.lineTo(-66, -22);
  x.lineTo(-33, 4);
  x.lineTo(0, -38);
  x.lineTo(33, 4);
  x.lineTo(66, -22);
  x.lineTo(60, 30);
  x.closePath();
  x.fill();
  x.stroke();
  x.fillRect(-60, 26, 120, 14);
  x.strokeRect(-60, 26, 120, 14);
  const gem = (gx, gy, r, c) => {
    x.fillStyle = c;
    x.beginPath();
    x.arc(gx, gy, r, 0, Math.PI * 2);
    x.fill();
  };
  gem(-66, -26, 7, '#ff5d8f');
  gem(0, -42, 8, '#2ec4c8');
  gem(66, -26, 7, '#ff5d8f');
  gem(0, 14, 8, '#e0393e');
  gem(-32, 16, 5, '#5fd16b');
  gem(32, 16, 5, '#5fd16b');
  x.restore();
}

function drawBotd(x, bot) {
  const w = BOTD_W;
  const h = BOTD_H;
  // deep navy plaque, gold frame
  x.fillStyle = '#1d2a52';
  x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 12; i++) {
    x.beginPath();
    x.moveTo(w / 2, 96);
    x.arc(w / 2, 96, 420, (i / 12) * Math.PI * 2, ((i + 0.5) / 12) * Math.PI * 2);
    x.fill();
  }
  x.strokeStyle = GOLD;
  x.lineWidth = 10;
  x.strokeRect(8, 8, w - 16, h - 16);
  x.lineWidth = 2;
  x.strokeRect(22, 22, w - 44, h - 44);
  drawCrown(x, w / 2, 70, 0.78);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = GOLD;
  x.font = '900 34px "Arial Black", Arial, sans-serif';
  x.fillText('BOT OF THE DAY', w / 2, 138);
  if (!bot) {
    x.fillStyle = '#ffffff';
    x.font = '700 30px Arial, sans-serif';
    x.fillText('Picking a winner…', w / 2, 240);
    return;
  }
  const color = bot.color || '#ffffff';
  // team-color ribbon with the name
  x.fillStyle = color;
  x.beginPath();
  x.moveTo(40, 172);
  x.lineTo(w - 40, 172);
  x.lineTo(w - 58, 204);
  x.lineTo(w - 40, 236);
  x.lineTo(40, 236);
  x.lineTo(58, 204);
  x.closePath();
  x.fill();
  let size = 54;
  x.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
  while (size > 26 && x.measureText(bot.name).width > w - 140) {
    size -= 2;
    x.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
  }
  // dark text on light team colors, white on dark ones
  const c = new THREE.Color(color);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  x.fillStyle = lum > 0.55 ? '#1d2a52' : '#ffffff';
  x.fillText(bot.name, w / 2, 206);
  x.fillStyle = '#9fe6ff';
  x.font = '800 24px Arial, sans-serif';
  x.fillText(`${teamLabel(bot.team).toUpperCase()} TEAM`, w / 2, 266);
  x.fillStyle = '#ffffff';
  x.font = '700 25px Arial, sans-serif';
  wrapLines(x, bot.job || '', w - 90, 2).forEach((l, i) => x.fillText(l, w / 2, 304 + i * 31));
  x.fillStyle = 'rgba(255,255,255,0.55)';
  x.font = '700 17px Arial, sans-serif';
  x.fillText('TAP FOR TODAY’S STATS', w / 2, 368);
}

const STATUS_WORD = { working: 'Working', idle: "Chillin'", sleeping: 'Snoozing', offline: 'Off duty' };

function botdNote(bot, bedtime) {
  if (!bot) return { title: 'Bot of the Day', body: ['The judges are still deciding. Check back in a moment!'], from: 'The Visitor Center' };
  const status = STATUS_WORD[bot.status] || (bot.status ? bot.status.charAt(0).toUpperCase() + bot.status.slice(1) : 'On the island');
  const body = [
    `${bot.name} wears the crown today!`,
    `Job: ${bot.job || 'Island crew'}`,
    `Team: ${teamLabel(bot.team)}`,
    `Status: ${bedtime && bot.status !== 'working' ? 'Snoozing' : status}`,
    `Last action: ${bot.lastAction?.text || 'Nothing logged yet'}`,
  ];
  if (typeof bot.minutesToday === 'number' && bot.minutesToday > 0) body.push(`Saved today: ${bot.minutesToday} min`);
  body.push('A new Bot of the Day is crowned every midnight, Duvall time.');
  return { title: 'Bot of the Day', body, from: 'The Visitor Center' };
}

// A little gold crown that sits on top of the plaque frame.
const CROWN_BAND = new THREE.CylinderGeometry(0.15, 0.13, 0.1, 8, 1, true);
const CROWN_POINT = new THREE.ConeGeometry(0.04, 0.11, 4);
const CROWN_GEM = new THREE.OctahedronGeometry(0.035, 0);
const CROWN_GOLD = std('#f5c542', { roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide });
const CROWN_RUBY = std('#ff3d6e', { roughness: 0.3 });
const CROWN_POINTS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i / 8) * Math.PI * 2);

function Crown({ p, s = 1, r }) {
  return (
    <group position={p} scale={s} rotation={r}>
      <mesh geometry={CROWN_BAND} material={CROWN_GOLD} />
      {CROWN_POINTS.map((a) => (
        <mesh key={a} geometry={CROWN_POINT} material={CROWN_GOLD} position={[Math.sin(a) * 0.14, 0.1, Math.cos(a) * 0.14]} />
      ))}
      <mesh geometry={CROWN_GEM} material={CROWN_RUBY} position={[0, 0, 0.15]} />
    </group>
  );
}

// A simple wooden easel: two front legs and a back leg, a ledge for the board.
function Easel() {
  return (
    <group>
      {[-0.38, 0.38].map((x) => (
        <Box key={x} p={[x, 0.7, -0.03]} s={[0.06, 1.5, 0.06]} r={[-0.08, 0, 0]} m={M.wood} />
      ))}
      <Box p={[0, 0.66, -0.3]} s={[0.06, 1.35, 0.06]} r={[0.32, 0, 0]} m={M.wood} />
      <Box p={[0, 0.55, 0.04]} s={[1.08, 0.05, 0.12]} m={M.darkWood} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Guest book: a cork board of pinned notes. One big note features a quote
// and flips to the next one every 12 seconds; tap to read them all.

const QUOTES = [
  ['My listing captions write themselves now. I just sip my coffee.', 'Happy BYOB owner, Duvall'],
  ['Got two hours of my Tuesday back. Spent them on the river.', 'Weekend kayaker, Carnation'],
  ['The bots never forget a follow-up. I used to forget lunch.', 'Busy agent, Monroe'],
  ['They drafted my newsletter before my latte cooled.', 'Small business owner, Fall City'],
  ['Tiny robots, huge help. Would visit the island again.', 'First-time visitor, Snoqualmie'],
  ['Best part? They wave at you on the paths.', 'Island regular, Woodinville'],
];
const QUOTE_SECONDS = 12;
const FLIP_SECONDS = 0.6;
const GB_W = 768;
const GB_H = 512;

function pin(x, cx, cy, color) {
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.beginPath();
  x.arc(cx + 3, cy + 4, 9, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = color;
  x.beginPath();
  x.arc(cx, cy, 9, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.6)';
  x.beginPath();
  x.arc(cx - 3, cy - 3, 3, 0, Math.PI * 2);
  x.fill();
}

function note(x, cx, cy, w, h, rot, color) {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.fillStyle = 'rgba(0,0,0,0.22)';
  x.fillRect(-w / 2 + 5, -h / 2 + 7, w, h);
  x.fillStyle = color;
  x.fillRect(-w / 2, -h / 2, w, h);
  x.restore();
}

// The cork and the little decorative notes, drawn once into a back canvas.
function drawCork(x) {
  const w = GB_W;
  const h = GB_H;
  x.fillStyle = '#c99a62';
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const k = hash2(i * 1.3, i * 0.7);
    x.fillStyle = k > 0.5 ? 'rgba(120,75,35,0.35)' : 'rgba(240,200,140,0.35)';
    x.fillRect(hash2(i, 3.1) * w, hash2(7.7, i) * h, 2 + k * 3, 2 + k * 2);
  }
  // header banner
  note(x, w / 2, 40, 360, 52, -0.01, '#2ec4c8');
  x.fillStyle = '#ffffff';
  x.font = '900 32px "Arial Black", Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('GUEST BOOK', w / 2, 41);
  pin(x, w / 2 - 160, 26, '#ffd23f');
  pin(x, w / 2 + 160, 26, '#ffd23f');
  // side notes: a bot doodle, a heart, a thank-you
  note(x, 640, 170, 170, 150, 0.08, '#ff9ec4');
  x.save();
  x.translate(640, 175);
  x.rotate(0.08);
  x.fillStyle = '#c8202f';
  x.beginPath();
  x.moveTo(0, 38);
  x.bezierCurveTo(-70, -6, -30, -58, 0, -22);
  x.bezierCurveTo(30, -58, 70, -6, 0, 38);
  x.fill();
  x.fillStyle = '#ffffff';
  x.font = '900 22px Arial, sans-serif';
  x.fillText('BOTS!', 0, -4);
  x.restore();
  pin(x, 640, 104, '#2b6cff');
  note(x, 640, 380, 170, 150, -0.06, '#b8f0a8');
  x.save();
  x.translate(640, 380);
  x.rotate(-0.06);
  x.fillStyle = '#2b4a2b';
  x.font = 'italic 700 24px Georgia, serif';
  x.fillText('Thank you', 0, -26);
  x.fillText('for all the', 0, 4);
  x.fillText('help! :)', 0, 34);
  x.restore();
  pin(x, 640, 312, '#e0393e');
  // a polaroid of a bot on the beach
  note(x, 96, 380, 120, 140, -0.1, '#fbf7ef');
  x.save();
  x.translate(96, 372);
  x.rotate(-0.1);
  x.fillStyle = '#8fd8e6';
  x.fillRect(-48, -54, 96, 74);
  x.fillStyle = '#f3dfa6';
  x.fillRect(-48, 4, 96, 16);
  x.fillStyle = '#2ec4c8';
  x.fillRect(-14, -22, 28, 26);
  x.fillStyle = '#fbf3dc';
  x.fillRect(-16, -44, 32, 22);
  x.fillStyle = '#2b2a33';
  x.fillRect(-9, -36, 5, 5);
  x.fillRect(4, -36, 5, 5);
  x.font = 'italic 700 15px Georgia, serif';
  x.fillText('island day!', 0, 40);
  x.restore();
  pin(x, 96, 312, '#5fd16b');
  note(x, 96, 170, 120, 120, 0.07, '#ffd23f');
  x.save();
  x.translate(96, 170);
  x.rotate(0.07);
  x.fillStyle = '#7a5232';
  x.font = '900 30px "Arial Black", Arial, sans-serif';
  x.fillText('5★', 0, -10);
  x.font = '700 16px Arial, sans-serif';
  x.fillText('would visit', 0, 22);
  x.restore();
  pin(x, 96, 114, '#9b5cff');
}

// The featured quote: a big sticky note that flips (squashes to a line and
// back) when it changes. flip 0..1 (1 = settled).
function drawGuestBook(x, back, idx, prev, flip) {
  x.drawImage(back, 0, 0);
  const k = flip >= 1 ? 1 : Math.abs(Math.cos(flip * Math.PI));
  const show = flip < 0.5 ? prev : idx;
  const [quote, who] = QUOTES[show];
  const cx = GB_W / 2;
  const cy = 284;
  x.save();
  x.translate(cx, cy);
  x.scale(1, Math.max(0.02, k));
  x.rotate(-0.02);
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.fillRect(-196, -170, 400, 348);
  x.fillStyle = '#fff6a8';
  x.fillRect(-200, -176, 400, 348);
  x.fillStyle = 'rgba(0,0,0,0.05)';
  x.fillRect(-200, 150, 400, 22);
  x.fillStyle = '#e8a33c';
  x.font = '900 90px Georgia, serif';
  x.textAlign = 'left';
  x.textBaseline = 'top';
  x.fillText('“', -184, -184);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#3d2412';
  x.font = 'italic 700 34px Georgia, serif';
  const lines = wrapLines(x, quote, 340, 5);
  const top = -40 - ((lines.length - 1) * 42) / 2;
  lines.forEach((l, i) => x.fillText(l, 0, top + i * 42));
  x.fillStyle = '#7a5232';
  x.font = '700 22px Arial, sans-serif';
  wrapLines(x, `— ${who}`, 360, 2).forEach((l, i) => x.fillText(l, 0, 104 + i * 26));
  x.restore();
  pin(x, cx, cy - 166, '#e0393e');
  // which quote is up: a row of dots
  for (let i = 0; i < QUOTES.length; i++) {
    x.fillStyle = i === idx ? '#ffffff' : 'rgba(255,255,255,0.4)';
    x.beginPath();
    x.arc(cx + (i - (QUOTES.length - 1) / 2) * 22, GB_H - 22, i === idx ? 7 : 5, 0, Math.PI * 2);
    x.fill();
  }
}

function guestBookNote() {
  return {
    title: 'Guest Book',
    body: [...QUOTES.map(([q, who]) => `“${q}” — ${who}`), 'Thanks for visiting Bot Island HQ!'],
    from: 'The Visitor Center',
  };
}

function GuestBook({ p, rotY, ctx }) {
  const { animate, sky } = ctx;
  const night = sky.stars;
  const invalidate = useThree((s) => s.invalidate);
  const gb = useMemo(() => {
    const back = document.createElement('canvas');
    back.width = GB_W;
    back.height = GB_H;
    drawCork(back.getContext('2d'));
    const canvas = document.createElement('canvas');
    canvas.width = GB_W;
    canvas.height = GB_H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissiveMap: tex, emissive: '#ffd9a0', emissiveIntensity: 0 });
    const st = { back, x: canvas.getContext('2d'), tex, mat, idx: 0, prev: 0, flip: 1, wait: 0 };
    drawGuestBook(st.x, back, 0, 0, 1);
    return st;
  }, []);
  useEffect(() => () => (gb.tex.dispose(), gb.mat.dispose()), [gb]);
  useEffect(() => {
    gb.mat.emissiveIntensity = night * 0.35;
    invalidate();
  }, [gb, night, invalidate]);
  useFrame((_, delta) => {
    if (!animate) return;
    const dt = Math.min(delta, 0.1);
    if (gb.flip < 1) {
      gb.flip = Math.min(1, gb.flip + dt / FLIP_SECONDS);
      drawGuestBook(gb.x, gb.back, gb.idx, gb.prev, gb.flip);
      gb.tex.needsUpdate = true;
      return;
    }
    gb.wait += dt;
    if (gb.wait >= QUOTE_SECONDS) {
      gb.wait = 0;
      gb.prev = gb.idx;
      gb.idx = (gb.idx + 1) % QUOTES.length;
      gb.flip = 0;
    }
  });
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const open = useMemo(() => tap(() => ctxRef.current.onNote?.(guestBookNote())), []);
  const BW = 1.14;
  const BH = 0.76;
  const cy = 0.98;
  return (
    <group position={p} rotation={[0, rotY, 0]} onClick={open} {...pointer}>
      {[-BW / 2 - 0.05, BW / 2 + 0.05].map((x) => (
        <Cyl key={x} p={[x, 0.72, 0]} rt={0.045} rb={0.055} h={1.6} m={M.darkWood} />
      ))}
      <Box p={[0, cy, -0.03]} s={[BW + 0.12, BH + 0.12, 0.05]} m={M.wood} />
      <mesh position={[0, cy, 0.0]} material={gb.mat}>
        <planeGeometry args={[BW, BH]} />
      </mesh>
      {/* little shingle roof to keep the notes dry */}
      <Box p={[0, cy + BH / 2 + 0.16, -0.02]} s={[BW + 0.34, 0.045, 0.34]} r={[0.32, 0, 0]} m={M.thatchDark} />
      <Box p={[0, cy + BH / 2 + 0.1, -0.02]} s={[BW + 0.2, 0.05, 0.07]} m={M.darkWood} />
      <Lantern p={[-BW / 2 - 0.05, cy + BH / 2 + 0.02, 0.1]} night={night} />
    </group>
  );
}

export default function VisitorCenter({ ctx }) {
  const { sky, animate } = ctx;
  const night = sky.stars;
  const site = SITES.visitor;
  const g = useMemo(() => groundY(site.x, site.z), [site.x, site.z]);
  const invalidate = useThree((s) => s.invalidate);
  const counts = useCounts(ctx);

  // Bot of the Day: re-checked when the bots change and once a minute (so it
  // turns over at midnight PT without a reload).
  const [dayTick, setDayTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDayTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);
  const botd = useMemo(() => botOfTheDay(ctx.bots), [ctx.bots, dayTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const botdMat = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = BOTD_W;
    canvas.height = BOTD_H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.6 });
    mat.userData.x = canvas.getContext('2d');
    return mat;
  }, []);
  const botdKey = botd ? `${botd.id}|${botd.name}|${botd.color}|${botd.team}|${botd.job}` : '';
  useEffect(() => {
    drawBotd(botdMat.userData.x, botd);
    botdMat.map.needsUpdate = true;
    invalidate();
  }, [botdKey, botdMat, invalidate]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    botdMat.emissiveIntensity = 0.25 + night * 0.6;
  }, [botdMat, night]);

  const board = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = BOARD_W;
    canvas.height = BOARD_H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.8, roughness: 0.6 });
    const cols = [
      { label: 'ON ISLAND', from: 0, to: 0 },
      { label: 'WORKING', from: 0, to: 0 },
      { label: "CHILLIN'", from: 0, to: 0 },
    ];
    return { canvas, x: canvas.getContext('2d'), tex, mat, cols, t: 1, rolling: false, first: true };
  }, []);
  const mapMat = useMemo(() => {
    const map = canvasTexture(512, 384, drawMap);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.8 });
  }, []);
  const signMat = useMemo(() => new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.8 }), []);
  useEffect(
    () => () => {
      for (const m of [board.mat, mapMat, signMat, botdMat]) {
        m.map.dispose();
        m.dispose();
      }
    },
    [board, mapMat, signMat, botdMat]
  );
  useEffect(() => {
    board.mat.emissiveIntensity = 0.8 + night * 0.7;
  }, [board, night]);

  // A count changed: roll the digits (or just redraw when nothing animates).
  useEffect(() => {
    const next = [counts.total, counts.working, counts.rest];
    board.cols[2].label = counts.restLabel;
    const changed = board.first || board.cols.some((c, i) => c.to !== next[i]);
    board.cols.forEach((c, i) => {
      c.from = board.first ? next[i] : c.to;
      c.to = next[i];
    });
    if (animate && changed && !board.first) {
      board.t = 0;
      board.rolling = true;
    } else {
      board.t = 1;
      board.rolling = false;
      drawBoard(board.x, board.cols, 1);
      board.tex.needsUpdate = true;
      invalidate();
    }
    board.first = false;
  }, [counts.total, counts.working, counts.rest, counts.restLabel, animate, board, invalidate]);

  useFrame((_, delta) => {
    if (!board.rolling) return;
    board.t = Math.min(1, board.t + Math.min(delta, 0.1) / ROLL_SECONDS);
    drawBoard(board.x, board.cols, board.t);
    board.tex.needsUpdate = true;
    if (board.t >= 1) board.rolling = false;
  });

  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const counterRef = useRef(counts);
  counterRef.current = counts;
  const open = useMemo(() => tap(() => ctxRef.current.onNote?.(buildNote(ctxRef.current, counterRef.current))), []);
  const botdRef = useRef(botd);
  botdRef.current = botd;
  const openBotd = useMemo(() => tap(() => ctxRef.current.onNote?.(botdNote(botdRef.current, ctxRef.current.bedtime))), []);

  const HX = 1.45;
  const HZ = 1.05;
  const floorY = 0.14;
  const beamY = floorY + 2.0;
  const posts = [[-HX, -HZ], [HX, -HZ], [-HX, HZ], [HX, HZ], [0, HZ]];
  // The live counter is a marquee across the front of the roof, facing the
  // default camera. It used to stand on tall posts behind the pavilion,
  // right where the floating "Visitor Center" tag sits, so the tag hid it.
  // Up front and lower it stays clear of the tag. Everything stays inside
  // the site circle (SITES.visitor.r) so it never meets the campfire seats.
  const MZ = HZ + 0.6; // marquee face, just in front of the eave
  const boardY = beamY + 0.5;
  const BW = 2.1;
  const BH = 0.82;

  return (
    <group position={[site.x, g, site.z]} rotation={[0, site.rotY, 0]}>
      <group onClick={open} {...pointer}>
        {/* plank floor on a low footing */}
        <Box p={[0, floorY / 2 - 0.12, 0]} s={[HX * 2 + 0.3, floorY + 0.24, HZ * 2 + 0.3]} m={M.plank} />
        {[-1.0, -0.5, 0, 0.5, 1.0].map((x) => (
          <Box key={`pl${x}`} p={[x, floorY + 0.003, 0]} s={[0.025, 0.005, HZ * 2 + 0.2]} m={M.darkWood} />
        ))}
        {/* woven welcome mat at the front */}
        <Box p={[0, floorY + 0.01, HZ - 0.15]} s={[1.2, 0.02, 0.5]} m={M.mat} />
        {posts.map(([x, z], i) => (
          <BambooPost key={i} p={[x, floorY, z]} h={2.02} r={0.075} />
        ))}
        <Beam a={[-HX - 0.1, beamY, HZ]} b={[HX + 0.1, beamY, HZ]} r={0.05} m={M.bamboo} />
        <Beam a={[-HX - 0.1, beamY, -HZ]} b={[HX + 0.1, beamY, -HZ]} r={0.05} m={M.bamboo} />
        <Beam a={[-HX, beamY, -HZ - 0.1]} b={[-HX, beamY, HZ + 0.1]} r={0.05} m={M.bamboo} />
        <Beam a={[HX, beamY, -HZ - 0.1]} b={[HX, beamY, HZ + 0.1]} r={0.05} m={M.bamboo} />
        {/* layered thatch roof */}
        <Roof p={[0, beamY + 0.45, 0]} halfX={HX + 0.55} halfZ={HZ + 0.5} h={0.9} m={M.thatchDark} />
        <Fringe p={[0, beamY, 0]} halfX={HX + 0.55} halfZ={HZ + 0.5} drop={0.26} />
        <Roof p={[0, beamY + 0.82, 0]} halfX={HX - 0.15} halfZ={HZ - 0.08} h={0.8} m={M.thatch} />
        <Fringe p={[0, beamY + 0.42, 0]} halfX={HX - 0.15} halfZ={HZ - 0.08} drop={0.16} />
        <Cone p={[0, beamY + 1.3, 0]} rad={0.12} h={0.3} seg={6} m={M.darkWood} />
        {/* carved sign, hung just under the marquee in front of the thatch
            fringe so the fringe never hides it */}
        {[-0.62, 0.62].map((x) => (
          <Box key={`sc${x}`} p={[x, beamY - 0.02, MZ]} s={[0.025, 0.12, 0.025]} m={M.wire} />
        ))}
        <mesh position={[0, beamY - 0.26, MZ + 0.03]} material={signMat}>
          <planeGeometry args={[1.5, 0.33]} />
        </mesh>
        <Box p={[0, beamY - 0.26, MZ]} s={[1.58, 0.4, 0.04]} m={M.darkWood} />
        {/* island map on the back wall */}
        <Box p={[0, 1.2, -HZ + 0.02]} s={[1.86, 1.42, 0.07]} m={M.darkWood} />
        <mesh position={[0, 1.2, -HZ + 0.06]} material={mapMat}>
          <planeGeometry args={[1.72, 1.29]} />
        </mesh>
        {[-0.75, 0.75].map((x) => (
          <Box key={`ml${x}`} p={[x, 0.32, -HZ + 0.02]} s={[0.07, 0.4, 0.07]} m={M.darkWood} />
        ))}
        {/* low bamboo rail along the back */}
        <Beam a={[-HX, floorY + 0.55, -HZ]} b={[HX, floorY + 0.55, -HZ]} r={0.03} m={M.bamboo} />
        {/* brochure racks on both sides */}
        <BrochureRack p={[-HX + 0.25, floorY, -0.2]} rotY={Math.PI / 2} />
        <BrochureRack p={[HX - 0.25, floorY, -0.2]} rotY={-Math.PI / 2} />
        {/* potted palms at the front corners, beside the two boards */}
        <PottedPalm p={[-HX - 0.45, floorY - 0.1, HZ - 0.4]} />
        <PottedPalm p={[HX + 0.45, floorY - 0.1, HZ - 0.4]} />
        {/* a bench by the east side */}
        <group position={[HX + 0.65, 0, -0.2]} rotation={[0, -Math.PI / 2, 0]}>
          <Box p={[0, 0.36, 0]} s={[1.1, 0.06, 0.34]} m={M.wood} />
          <Box p={[0, 0.62, -0.15]} s={[1.1, 0.24, 0.04]} m={M.wood} />
          {[-0.45, 0.45].map((x) => (
            <Box key={x} p={[x, 0.18, 0]} s={[0.06, 0.36, 0.3]} m={M.darkWood} />
          ))}
        </group>
        <Lantern p={[-HX, beamY - 0.3, HZ + 0.1]} night={night} />
        <Lantern p={[HX, beamY - 0.3, HZ + 0.1]} night={night} />
      </group>
      {/* the live bot counter: a marquee across the front of the roof */}
      <group position={[0, 0, MZ]} onClick={open} {...pointer}>
        {[-0.75, 0.75].map((x) => (
          <Box key={x} p={[x, beamY + 0.12, -0.3]} s={[0.08, 0.08, 0.62]} m={M.darkWood} />
        ))}
        <Box p={[0, boardY, -0.03]} s={[BW + 0.14, BH + 0.12, 0.06]} m={M.dark} />
        <Box p={[0, boardY + BH / 2 + 0.09, -0.02]} s={[BW + 0.26, 0.07, 0.14]} m={M.bbYellow} />
        <mesh position={[0, boardY, 0.002]} material={board.mat}>
          <planeGeometry args={[BW, BH]} />
        </mesh>
      </group>
      {/* Bot of the Day plaque on an easel at the front right, crown on top */}
      <group position={[1.3, 0, HZ + 0.62]} rotation={[0, -0.3, 0]} onClick={openBotd} {...pointer}>
        <Easel />
        <Box p={[0, 0.98, 0]} s={[1.05, 0.84, 0.06]} m={M.darkWood} />
        <mesh position={[0, 0.98, 0.032]} material={botdMat}>
          <planeGeometry args={[0.95, 0.74]} />
        </mesh>
        <Crown p={[0.2, 1.47, 0]} s={1.35} r={[0, 0, -0.2]} />
      </group>
      {/* guest book on the front left, toward the pier */}
      <GuestBook p={[-1.3, 0, HZ + 0.62]} rotY={0.3} ctx={ctx} />
    </group>
  );
}
