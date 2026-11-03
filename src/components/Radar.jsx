import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { TEAM_ZONE, ZONES } from '../utils/paths.js';

// Saturn radar: Chief is the planet, each team rides a tilted ring with its
// bots as colored dots. Tap a ring (or a dot) to fly the camera to that zone.

const RINGS = [
  { id: 'content', tagAngle: 155, label: 'Content', teams: ['content'], zone: 'cabana', R: 1.0, tilt: [-1.15, 0, 0.15], color: '#F09024', speed: 0.22 },
  { id: 'realestate', tagAngle: 25, label: 'Real Estate', teams: ['realestate'], zone: 'lanai', R: 1.32, tilt: [-1.22, 0, -0.12], color: '#2F6FED', speed: 0.16 },
  { id: 'networking', tagAngle: 270, label: 'Networking', teams: ['networking'], zone: 'tikihut', R: 1.62, tilt: [-1.05, 0, 0.25], color: '#8B5CF6', speed: 0.13 },
  { id: 'research', tagAngle: 205, label: 'Research', teams: ['research'], zone: 'lookout', R: 1.9, tilt: [-1.28, 0, -0.2], color: '#2BA84A', speed: 0.1 },
  { id: 'other', tagAngle: 335, label: 'Other teams', legend: 'Money, Product, Home, Fun, Guest', teams: ['money', 'product', 'home', 'fun', 'guest'], zone: 'tower', R: 2.18, tilt: [-1.12, 0, 0.06], color: '#0F9D8A', speed: 0.075 },
];

const dotGeo = new THREE.SphereGeometry(0.085, 10, 8);
const hitGeoCache = {};

function Ring({ ring, bots, animate, onPick, interactive, labelSide }) {
  const spin = useRef();
  const [hover, setHover] = useState(false);
  const hitGeo = useMemo(() => (hitGeoCache[ring.R] ||= new THREE.TorusGeometry(ring.R, 0.13, 6, 48)), [ring.R]);
  useFrame((_, dt) => {
    if (animate && spin.current) spin.current.rotation.z += Math.min(dt, 0.1) * ring.speed;
  });
  const working = bots.filter((b) => b.status === 'working').length;
  return (
    <group rotation={ring.tilt}>
      <mesh>
        <torusGeometry args={[ring.R, hover ? 0.03 : 0.016, 6, 64]} />
        <meshBasicMaterial color={ring.color} transparent opacity={hover ? 0.95 : 0.55} />
      </mesh>
      {interactive && (
      <mesh
        geometry={hitGeo}
        onClick={(e) => {
          e.stopPropagation();
          onPick(ring.zone);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      )}
      {labelSide && (
        <Html position={[Math.cos((ring.tagAngle * Math.PI) / 180) * ring.R, Math.sin((ring.tagAngle * Math.PI) / 180) * ring.R, 0]} center zIndexRange={[5, 0]}>
          <button type="button" className="ring-tag" style={{ borderColor: ring.color }} onClick={() => onPick(ring.zone)}>
            {ring.label} <span className="ring-count">{working}/{bots.length}</span>
          </button>
        </Html>
      )}
      <group ref={spin}>
        {bots.map((b, i) => {
          const a = (i / Math.max(1, bots.length)) * Math.PI * 2;
          return (
            <mesh
              key={b.id}
              geometry={dotGeo}
              position={[Math.cos(a) * ring.R, Math.sin(a) * ring.R, 0]}
              onClick={
                interactive
                  ? (e) => {
                      e.stopPropagation();
                      onPick(ZONES[b.zone] ? b.zone : ring.zone);
                    }
                  : undefined
              }
            >
              <meshBasicMaterial color={b.color} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function Planet({ color, onPick, interactive }) {
  return (
    <group
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onPick('tower');
            }
          : undefined
      }
    >
      <mesh>
        <icosahedronGeometry args={[0.5, 2]} />
        <meshStandardMaterial color={color} flatShading roughness={0.5} emissive={color} emissiveIntensity={0.15} />
      </mesh>
      <mesh rotation={[-1.2, 0, 0.1]}>
        <torusGeometry args={[0.66, 0.05, 6, 40]} />
        <meshStandardMaterial color="#ffffff" flatShading />
      </mesh>
    </group>
  );
}

function RadarScene({ chief, byRing, animate, onPick, expanded }) {
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} />
      <Planet color={chief?.color || '#D63AF9'} onPick={onPick} interactive={expanded} />
      {RINGS.map((r) => (
        <Ring key={r.id} ring={r} bots={byRing[r.id]} animate={animate} onPick={onPick} interactive={expanded} labelSide={expanded} />
      ))}
    </>
  );
}

// Small Saturn radar in the corner. Tap it for a bigger card with each ring
// labeled by team and how many of its bots are working. Tap a ring, a dot,
// or a row in the big card to fly to that team.
export default function Radar({ bots, onFly, animate = true, paused = false, hidden = false }) {
  const [open, setOpen] = useState(false);
  const chief = bots.find((b) => b.id === 'chief');

  const byRing = useMemo(() => {
    const out = Object.fromEntries(RINGS.map((r) => [r.id, []]));
    for (const b of bots) {
      if (b.team === 'leadership') continue;
      const ring = RINGS.find((r) => r.teams.includes(b.team)) || RINGS[RINGS.length - 1];
      out[ring.id].push(b);
    }
    return out;
  }, [bots]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const pick = (zone) => {
    setOpen(false);
    onFly(zone);
  };

  const totalWorking = bots.filter((b) => b.status === 'working').length;

  return (
    <>
      <button type="button" className="radar panel" style={hidden ? { display: 'none' } : undefined} onClick={() => setOpen(true)} aria-label="Team radar. Tap for the bigger view.">
        <Canvas
          flat
          dpr={[1, 1.5]}
          frameloop={paused || open ? 'never' : animate ? 'always' : 'demand'}
          camera={{ position: [0, 1.3, 7.4], fov: 35 }}
          gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
          onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
          style={{ pointerEvents: 'none' }}
        >
          <RadarScene chief={chief} byRing={byRing} animate={animate} onPick={pick} expanded={false} />
        </Canvas>
      </button>
      {open && (
        <div className="card-backdrop radar-backdrop" onClick={() => setOpen(false)} onPointerDown={(e) => e.stopPropagation()}>
          <div className="radar-card panel" role="dialog" aria-modal="true" aria-label="Team radar" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="card-close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
            <h2 className="radar-title">Team radar</h2>
            <p className="radar-sub">
              Chief in the middle. {totalWorking} of {bots.length} bots working.
            </p>
            <div className="radar-big">
              <Canvas
                flat
                dpr={[1, 1.5]}
                frameloop={paused ? 'never' : animate ? 'always' : 'demand'}
                camera={{ position: [0, 2.2, 6.3], fov: 40 }}
                gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
                onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
              >
                <RadarScene chief={chief} byRing={byRing} animate={animate} onPick={pick} expanded />
              </Canvas>
            </div>
            <ul className="radar-legend">
              <li>
                <button type="button" className="roster-row" onClick={() => pick('tower')}>
                  <span className="roster-dot" style={{ background: chief?.color || '#D63AF9' }} aria-hidden="true" />
                  <span className="roster-name">Chief&rsquo;s Tower</span>
                  <span className="ring-count">{chief?.status === 'working' ? '1/1' : '0/1'} working</span>
                </button>
              </li>
              {RINGS.map((r) => {
                const list = byRing[r.id];
                const w = list.filter((b) => b.status === 'working').length;
                return (
                  <li key={r.id}>
                    <button type="button" className="roster-row" onClick={() => pick(r.zone)}>
                      <span className="roster-dot" style={{ background: r.color }} aria-hidden="true" />
                      <span className="roster-name">{r.legend || r.label}</span>
                      <span className="ring-count">
                        {w}/{list.length} working
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

export { TEAM_ZONE };
