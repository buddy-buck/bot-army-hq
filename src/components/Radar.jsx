import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TEAM_ZONE, ZONES } from '../utils/paths.js';

// Saturn radar: Chief is the planet, each team rides a tilted ring with its
// bots as colored dots. Tap a ring (or a dot) to fly the camera to that zone.

const RINGS = [
  { id: 'content', teams: ['content'], zone: 'cabana', R: 1.0, tilt: [-1.15, 0, 0.15], color: '#F3B624', speed: 0.22 },
  { id: 'realestate', teams: ['realestate'], zone: 'lanai', R: 1.32, tilt: [-1.22, 0, -0.12], color: '#2F6FED', speed: 0.16 },
  { id: 'networking', teams: ['networking'], zone: 'tikihut', R: 1.62, tilt: [-1.05, 0, 0.25], color: '#8B5CF6', speed: 0.13 },
  { id: 'research', teams: ['research'], zone: 'lookout', R: 1.9, tilt: [-1.28, 0, -0.2], color: '#2BA84A', speed: 0.1 },
  { id: 'other', teams: ['money', 'product', 'home', 'fun', 'guest'], zone: 'tower', R: 2.18, tilt: [-1.12, 0, 0.06], color: '#F09024', speed: 0.075 },
];

const dotGeo = new THREE.SphereGeometry(0.085, 10, 8);
const hitGeoCache = {};

function Ring({ ring, bots, animate, onPick }) {
  const spin = useRef();
  const [hover, setHover] = useState(false);
  const hitGeo = useMemo(() => (hitGeoCache[ring.R] ||= new THREE.TorusGeometry(ring.R, 0.13, 6, 48)), [ring.R]);
  useFrame((_, dt) => {
    if (animate && spin.current) spin.current.rotation.z += Math.min(dt, 0.1) * ring.speed;
  });
  return (
    <group rotation={ring.tilt}>
      <mesh>
        <torusGeometry args={[ring.R, hover ? 0.03 : 0.016, 6, 64]} />
        <meshBasicMaterial color={ring.color} transparent opacity={hover ? 0.95 : 0.55} />
      </mesh>
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
      <group ref={spin}>
        {bots.map((b, i) => {
          const a = (i / Math.max(1, bots.length)) * Math.PI * 2;
          return (
            <mesh
              key={b.id}
              geometry={dotGeo}
              position={[Math.cos(a) * ring.R, Math.sin(a) * ring.R, 0]}
              onClick={(e) => {
                e.stopPropagation();
                onPick(ZONES[b.zone] ? b.zone : ring.zone);
              }}
            >
              <meshBasicMaterial color={b.color} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function Planet({ color, onPick }) {
  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onPick('tower');
      }}
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

export default function Radar({ bots, onFly, animate = true, paused = false }) {
  const [note, setNote] = useState(null);
  const noteTimer = useRef(null);
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

  const pick = (zone) => {
    onFly(zone);
    const label = ZONES[zone]?.label || 'Island';
    setNote(zone === 'tower' ? "Chief's Tower" : label);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 2200);
  };

  return (
    <div className="radar panel" aria-label="Team radar. Tap a ring to fly to that team.">
      {note && <div className="radar-note">{note}</div>}
      <Canvas
        flat
        dpr={[1, 2]}
        frameloop={paused ? 'never' : animate ? 'always' : 'demand'}
        camera={{ position: [0, 1.3, 7.4], fov: 35 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[3, 5, 4]} intensity={1.6} />
        <Planet color={chief?.color || '#D63AF9'} onPick={pick} />
        {RINGS.map((r) => (
          <Ring key={r.id} ring={r} bots={byRing[r.id]} animate={animate} onPick={pick} />
        ))}
      </Canvas>
    </div>
  );
}

export { TEAM_ZONE };
