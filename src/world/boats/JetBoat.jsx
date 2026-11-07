import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import MiniBot from '../MiniBot.jsx';
import { hullGeometry, std } from './kit.js';
import { Box, Light, SideLights } from './parts.jsx';

// A go-fast "cigarette" boat: long, low and pointed, with a stepped deck,
// a raked windshield, a racing number on the foredeck and twin outboards.
// Nose along +z, centered on the group, waterline at y = 0.
// Launch's own boat wears red, white and blue with stars; the race rival
// wears the HQ navy and gold.

export const JET_LEN = 3.3;
export const JET_BEAM = 0.92;
export const JET_DECK = 0.26;
const D = JET_DECK;
const HULL_OPTS = { bow: 0.55, stern: 0.96, sheer: 0.16 };

const HULL_GEO = hullGeometry(JET_LEN, JET_BEAM, 0.5, { ...HULL_OPTS, taper: 0.45 });
const BAND_GEO = hullGeometry(JET_LEN * 1.008, JET_BEAM * 1.025, 0.075, { ...HULL_OPTS, taper: 1 });
const LOW_GEO = hullGeometry(JET_LEN * 1.004, JET_BEAM * 1.01, 0.1, { ...HULL_OPTS, taper: 0.88 });
const DECK_GEO = hullGeometry(JET_LEN * 0.965, JET_BEAM * 0.92, 0.04, { ...HULL_OPTS, taper: 1 });
const FORE_GEO = hullGeometry(1.75, JET_BEAM * 0.68, 0.1, { bow: 0.6, stern: 0.9, taper: 1, sheer: 0.1 });
const ROUNDEL_GEO = new THREE.CircleGeometry(0.17, 18).rotateX(-Math.PI / 2).rotateY(Math.PI); // number reads bow-up
const STAR_GEO = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.4 : 1;
    const x = Math.sin(a) * r;
    const y = Math.cos(a) * r;
    if (i) s.lineTo(x, y);
    else s.moveTo(x, y);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2).rotateY(Math.PI);
})();
const HIT_GEO = new THREE.BoxGeometry(JET_BEAM + 0.5, 1.1, JET_LEN + 0.5);
const HIT_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });

const SHARED = {
  dark: std('#22232a'),
  seat: std('#f4efe6', { roughness: 0.8 }),
  glass: new THREE.MeshStandardMaterial({ color: '#7fb8e8', transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.2, depthWrite: false }),
  chrome: std('#d7dde4', { metalness: 0.5, roughness: 0.3 }),
  white: std('#fdf8ee'),
};

export const PALETTES = {
  launch: { hull: '#fdf8ee', top: '#d62f36', low: '#1f3f9a', deck: '#1f3f9a', fore: '#1f3f9a', cowl: '#d62f36', hatch: '#fdf8ee', stars: true, num: '1', numBg: '#fdf8ee', numFg: '#d62f36' },
  rival: { hull: '#19469D', top: '#ffde69', low: '#0f2c66', deck: '#fdf8ee', fore: '#ffde69', cowl: '#19469D', hatch: '#ffde69', stars: false, num: '2', numBg: '#19469D', numFg: '#ffde69' },
};

function numberTexture(num, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = fg;
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = fg;
  g.font = '900 84px "Arial Black", Impact, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(num, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function usePalette(p) {
  const mats = useMemo(
    () => ({
      hull: std(p.hull),
      top: std(p.top),
      low: std(p.low),
      deck: std(p.deck),
      fore: std(p.fore),
      cowl: std(p.cowl),
      hatch: std(p.hatch),
      num: std('#ffffff', { map: numberTexture(p.num, p.numBg, p.numFg), roughness: 0.5 }),
    }),
    [p]
  );
  useEffect(() => () => Object.values(mats).forEach((m) => (m.map?.dispose(), m.dispose())), [mats]);
  return mats;
}

// The boat itself. `driver` is a parts ref for the MiniBot at the wheel;
// `onTap`/`pointer` make the whole hull a tap target.
export default function JetBoatModel({ palette = PALETTES.launch, driver, driverColor = '#ffb84d', onTap, pointer }) {
  const m = usePalette(palette);
  return (
    <group>
      {/* hull with its stripes: top band, hull color, a dark boot stripe at the water */}
      <mesh geometry={HULL_GEO} material={m.hull} position={[0, D, 0]} />
      <mesh geometry={BAND_GEO} material={m.top} position={[0, D - 0.04, 0]} />
      <mesh geometry={LOW_GEO} material={m.low} position={[0, D - 0.2, 0]} />
      <mesh geometry={DECK_GEO} material={m.deck} position={[0, D + 0.03, 0]} />
      {/* stepped deck: the raised foredeck, its racing number and stars */}
      <mesh geometry={FORE_GEO} material={m.fore} position={[0, D + 0.13, 0.72]} />
      <mesh geometry={ROUNDEL_GEO} material={m.num} position={[0, D + 0.15, 0.62]} />
      {palette.stars &&
        [
          [0, 1.2, 0.07],
          [0.12, 0.98, 0.055],
          [-0.12, 0.98, 0.055],
        ].map(([x, z, s]) => <mesh key={`${x}${z}`} geometry={STAR_GEO} material={SHARED.white} position={[x, D + 0.145, z]} scale={s} />)}
      {/* raked windshield in two panes, a chrome grab rail */}
      <Box p={[0.15, D + 0.2, 0.08]} s={[0.32, 0.2, 0.015]} r={[-0.75, -0.42, 0]} m={SHARED.glass} />
      <Box p={[-0.15, D + 0.2, 0.08]} s={[0.32, 0.2, 0.015]} r={[-0.75, 0.42, 0]} m={SHARED.glass} />
      <Box p={[0, D + 0.12, 0.17]} s={[0.56, 0.03, 0.03]} m={SHARED.chrome} />
      {/* cockpit: a dark well, two bucket seats */}
      <Box p={[0, D + 0.055, -0.35]} s={[0.66, 0.02, 0.85]} m={SHARED.dark} />
      {[-0.16, 0.16].map((x) => (
        <group key={x}>
          <Box p={[x, D + 0.12, -0.5]} s={[0.24, 0.1, 0.24]} m={SHARED.seat} />
          <Box p={[x, D + 0.24, -0.63]} s={[0.24, 0.24, 0.06]} r={[-0.25, 0, 0]} m={SHARED.seat} />
        </group>
      ))}
      <Box p={[0.16, D + 0.27, -0.14]} s={[0.04, 0.16, 0.04]} r={[0.6, 0, 0]} m={SHARED.dark} />
      <MiniBot color={driverColor} parts={driver} position={[0.16, D - 0.12, -0.42]} scale={0.55} shadow={false} />
      {/* engine hatch with a stripe, twin outboards on the transom */}
      <Box p={[0, D + 0.09, -1.15]} s={[0.72, 0.12, 0.7]} m={m.hatch} />
      <Box p={[0, D + 0.155, -1.15]} s={[0.2, 0.012, 0.71]} m={m.top} />
      {[-0.22, 0.22].map((x) => (
        <group key={x} position={[x, 0, -JET_LEN / 2 - 0.1]}>
          <Box p={[0, D + 0.08, 0]} s={[0.2, 0.3, 0.26]} m={m.cowl} />
          <Box p={[0, D + 0.24, 0]} s={[0.21, 0.05, 0.27]} m={SHARED.dark} />
          <Box p={[0, D - 0.25, -0.02]} s={[0.07, 0.42, 0.12]} m={SHARED.dark} />
        </group>
      ))}
      {/* running lights */}
      <SideLights x={0.36} y={D + 0.06} z={0.95} s={0.7} />
      <Light p={[0, D + 0.3, -1.42]} kind="white" s={0.7} />
      {onTap && <mesh geometry={HIT_GEO} material={HIT_MAT} position={[0, 0.3, 0]} onClick={onTap} {...pointer} />}
    </group>
  );
}
