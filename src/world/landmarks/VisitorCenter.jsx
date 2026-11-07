import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SITES, ZONES, FLO, groundY, islandWobble, ISLAND, teamLabel } from '../../utils/paths.js';
import { BambooPost, Beam, Box, Cone, Cyl, Fringe, Lantern, M, Roof, canvasTexture, pointer, std, tap } from './kit.jsx';

// The Visitor Center near the head of Launch's Pier: an open tropical
// pavilion with brochure racks, a map of the island, potted palms, a bench,
// and a big scoreboard on posts with the live bot count (on the island,
// working, chillin'/snoozing). Digits roll like a flip board when a count
// changes. Tap the pavilion or the board for the full rundown.
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
  // decks and the airstrip
  x.fillStyle = '#b07a48';
  const deck = (x0, x1, z0, z1) => x.fillRect(px(x0), pz(z0), (x1 - x0) * s, (z1 - z0) * s);
  deck(FLO.platform.x0, FLO.platform.x1, FLO.platform.z0, FLO.platform.z1);
  deck(FLO.boardwalk.x0, FLO.boardwalk.x1, FLO.boardwalk.z0, FLO.boardwalk.z1);
  deck(-25.6, -16, 4.35, 6.35);
  deck(15.6, 21, -1, 3.4);
  const r = SITES.runway;
  x.fillStyle = '#4a4a52';
  x.fillRect(px(r.x - r.hx), pz(-13.1), r.hx * 2 * s, 1.1 * s);
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
  for (const z of Object.values(ZONES)) {
    if (z.noLabel) continue;
    x.fillStyle = '#d63af9';
    x.beginPath();
    x.arc(px(z.x), pz(z.z), 5, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#2b2a33';
    x.fillText(z.label, px(z.x), pz(z.z) + 7);
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
  x.font = '900 26px "Arial Black", Arial, sans-serif';
  x.textBaseline = 'middle';
  x.fillText('BOT ISLAND HQ', w / 2, 36);
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

export default function VisitorCenter({ ctx }) {
  const { sky, animate } = ctx;
  const night = sky.stars;
  const site = SITES.visitor;
  const g = useMemo(() => groundY(site.x, site.z), [site.x, site.z]);
  const invalidate = useThree((s) => s.invalidate);
  const counts = useCounts(ctx);

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
      for (const m of [board.mat, mapMat, signMat]) {
        m.map.dispose();
        m.dispose();
      }
    },
    [board, mapMat, signMat]
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

  const HX = 1.45;
  const HZ = 1.05;
  const floorY = 0.14;
  const beamY = floorY + 2.0;
  const posts = [[-HX, -HZ], [HX, -HZ], [-HX, HZ], [HX, HZ], [0, HZ]];
  const boardY = 3.95;

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
        {/* carved sign on the front beam */}
        <mesh position={[0, beamY - 0.24, HZ + 0.07]} material={signMat}>
          <planeGeometry args={[1.5, 0.33]} />
        </mesh>
        <Box p={[0, beamY - 0.24, HZ + 0.04]} s={[1.58, 0.4, 0.04]} m={M.darkWood} />
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
        {/* potted palms at the front corners */}
        <PottedPalm p={[-HX - 0.35, floorY - 0.1, HZ + 0.35]} />
        <PottedPalm p={[HX + 0.35, floorY - 0.1, HZ + 0.35]} />
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
      {/* the live bot counter, on tall posts behind the pavilion */}
      <group position={[0, 0, -HZ - 0.55]} onClick={open} {...pointer}>
        {[-1.42, 1.42].map((x) => (
          <Cyl key={x} p={[x, 2.3, 0]} rt={0.07} rb={0.09} h={4.6} m={M.darkWood} />
        ))}
        <Box p={[0, boardY, 0]} s={[2.98, 1.26, 0.1]} m={M.dark} />
        <Box p={[0, boardY + 0.66, 0]} s={[3.1, 0.08, 0.18]} m={M.bbYellow} />
        <mesh position={[0, boardY, 0.052]} material={board.mat}>
          <planeGeometry args={[2.8, 1.094]} />
        </mesh>
        <mesh position={[0, boardY, -0.052]} rotation={[0, Math.PI, 0]} material={board.mat}>
          <planeGeometry args={[2.8, 1.094]} />
        </mesh>
      </group>
    </group>
  );
}
