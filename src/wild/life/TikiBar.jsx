import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Drink } from '../../components/Bot.jsx';
import MiniBot, { extraColor } from '../MiniBot.jsx';
import { SITES, groundY } from '../../utils/paths.js';
import { BambooPost, Box, Cyl, L, StringLights, canvasTexture, keepLevel, std, useGlow } from './kit.jsx';
import StaticMerge from '../../utils/StaticMerge.jsx';

// Tiki bar on the south side: a thatched bar with a counter, bamboo stools,
// bottles on a shelf and string lights. A bartender shakes cocktails while
// regulars on the stools sip and, every so often, raise their glasses and
// clink (with a little sparkle). Open late: a couple of regulars stay at night.

const S = SITES.tikibar;
const HALF_X = 1.35;
const COUNTER_Z = 0.3;
const COUNTER_TOP = 0.92;
const STOOL_Z = 1.0;
const STOOL_TOP = 0.6;
const STOOL_XS = [-0.95, -0.32, 0.32, 0.95];
const SIT_Y = STOOL_TOP - 0.15; // MiniBot body bottom is 0.15 above its root
const DRINK_S = 1.2;
const CLINK_PERIOD = 9;
const CLINK_LEN = 1.8;
const DRINK_KINDS = ['maitai', 'margarita', 'coconut', 'maitai'];

const BOTTLE_GEO = new THREE.CylinderGeometry(0.045, 0.05, 0.2, 7).translate(0, 0.1, 0);
const NECK_GEO = new THREE.CylinderGeometry(0.015, 0.022, 0.09, 5).translate(0, 0.24, 0);
const BOTTLE_COLORS = ['#3fae5a', '#d98a2b', '#3a8fd8', '#ff6b9a', '#f1c40f', '#8e44ad'];
const SPARK_GEO = new THREE.OctahedronGeometry(0.09, 0);
const sparkMat = () => new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
const SPARK_MATS = [sparkMat(), sparkMat()];
const SHAKER_MAT = std('#d8dee6', { roughness: 0.3, metalness: 0.6 });

let signTex = null;
function tikiSign() {
  if (signTex) return signTex;
  signTex = canvasTexture(256, 80, (g, w, h) => {
    g.fillStyle = '#5a3a1e';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2c46d';
    g.lineWidth = 6;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#ffe9b0';
    g.font = 'bold 44px "Trebuchet MS", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('TIKI BAR', w / 2, h / 2 + 2);
  });
  return signTex;
}

function Bottles({ night }) {
  const mats = [
    useGlow(BOTTLE_COLORS[0], night, 0.1, 0.9),
    useGlow(BOTTLE_COLORS[1], night, 0.1, 0.9),
    useGlow(BOTTLE_COLORS[2], night, 0.1, 0.9),
    useGlow(BOTTLE_COLORS[3], night, 0.1, 0.9),
    useGlow(BOTTLE_COLORS[4], night, 0.1, 0.9),
    useGlow(BOTTLE_COLORS[5], night, 0.1, 0.9),
  ];
  const list = [];
  [1.08, 1.42].forEach((y, row) => {
    for (let i = 0; i < 7; i++) list.push({ x: -0.9 + i * 0.3 + row * 0.12, y, k: (i + row * 3) % 6 });
  });
  return list.map((b, i) => (
    <group key={i} position={[b.x, b.y, -0.72]} scale={i % 3 === 0 ? 1.15 : 1}>
      <mesh geometry={BOTTLE_GEO} material={mats[b.k]} />
      <mesh geometry={NECK_GEO} material={mats[b.k]} />
    </group>
  ));
}

function Stool({ x }) {
  return (
    <group position={[x, 0, STOOL_Z]}>
      <Cyl p={[0, STOOL_TOP / 2, 0]} rt={0.04} h={STOOL_TOP} m={L.bamboo} />
      <Cyl p={[0, 0.22, 0]} rt={0.12} h={0.03} m={L.bambooNode} seg={8} />
      <Cyl p={[0, STOOL_TOP - 0.02, 0]} rt={0.17} h={0.06} m={L.wood} seg={9} />
    </group>
  );
}

function Shaker() {
  return (
    <group>
      <Cyl p={[0, 0.1, 0]} rt={0.05} rb={0.04} h={0.2} m={SHAKER_MAT} seg={8} />
      <Cyl p={[0, 0.23, 0]} rt={0.02} rb={0.05} h={0.07} m={SHAKER_MAT} seg={8} />
    </group>
  );
}

export default function TikiBar({ night, glow, animate, lowPower }) {
  const g0 = groundY(S.x, S.z);
  const crowd = night || lowPower ? 2 : 4;
  const stoolXs = crowd === 4 ? STOOL_XS : STOOL_XS.slice(1, 3);
  // Patrons sit in pairs, turned a little toward their partner.
  const patrons = useMemo(
    () =>
      stoolXs.map((x, i) => {
        const left = i % 2 === 0; // the west one of a pair
        return { x, turn: left ? -0.55 : 0.55, hand: left ? 'L' : 'R', pair: i >> 1, drink: DRINK_KINDS[i], color: extraColor(i * 3 + 2) };
      }),
    [crowd] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const bots = useRef([]);
  const drinks = useRef([]);
  const sparks = useRef([]);
  const bartender = useRef();
  const shaker = useRef();
  const signMat = useMemo(() => new THREE.MeshStandardMaterial({ map: tikiSign(), emissive: '#ffffff', emissiveMap: tikiSign(), emissiveIntensity: 0.15 }), []);
  signMat.emissiveIntensity = 0.15 + glow * 0.6;

  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 2.3;
    // Bartender: shake, shake, shake... then a breather looking around.
    const bt = bartender.current;
    if (bt) {
      const cyc = (t % 6) / 6;
      const shaking = cyc < 0.55;
      const sh = shaking ? Math.sin(t * 22) * 0.22 : 0;
      bt.armR.rotation.set(shaking ? -2.3 + sh : -0.5, 0, shaking ? -0.35 : 0.15);
      bt.armL.rotation.set(shaking ? -2.2 - sh : -0.4, 0, shaking ? 0.35 : -0.15);
      bt.pose.position.y = shaking ? Math.abs(Math.sin(t * 11)) * 0.02 : 0;
      bt.head.rotation.set(shaking ? -0.1 : 0.05, shaking ? 0 : Math.sin(t * 0.9) * 0.5, shaking ? Math.sin(t * 11) * 0.06 : 0);
      keepLevel(shaker.current, bt.armR);
    }
    // Regulars: sip now and then; each pair clinks every CLINK_PERIOD seconds.
    for (let i = 0; i < patrons.length; i++) {
      const b = bots.current[i];
      if (!b) continue;
      const p = patrons[i];
      const arm = p.hand === 'L' ? b.armL : b.armR;
      const other = p.hand === 'L' ? b.armR : b.armL;
      const k = (t + p.pair * (CLINK_PERIOD / 2)) % CLINK_PERIOD;
      const clink = animate && k < CLINK_LEN ? k / CLINK_LEN : -1;
      let raise;
      let lean = 0;
      if (clink >= 0) {
        raise = Math.sin(Math.PI * clink);
        lean = raise;
      } else {
        const cyc = ((t * 0.21 + i * 0.37) % 1);
        raise = cyc > 0.8 ? Math.sin(((cyc - 0.8) / 0.2) * Math.PI) * 0.7 : 0;
      }
      arm.rotation.set(-0.75 - raise * 1.25, 0, (p.hand === 'L' ? -1 : 1) * (0.1 + lean * 0.25));
      other.rotation.set(-0.55, 0, p.hand === 'L' ? 0.15 : -0.15);
      b.root.rotation.y = Math.PI + p.turn * (1 + lean * 0.35);
      b.pose.rotation.set(-0.05 + lean * 0.08, 0, 0);
      b.footL.position.set(-0.08, 0.08, 0.12);
      b.footR.position.set(0.08, 0.08, 0.12);
      b.head.rotation.set(clink >= 0 ? -0.1 : -raise * 0.35, Math.sin(t * 0.5 + i) * 0.25 * (1 - lean), 0);
      keepLevel(drinks.current[i], arm);
      // Sparkle where the glasses meet.
      const sp = sparks.current[p.pair];
      if (sp && p.hand === 'L') {
        const on = clink > 0.38 && clink < 0.7;
        sp.visible = on;
        if (on) {
          const u = (clink - 0.38) / 0.32;
          sp.scale.setScalar(0.4 + u * 1.2);
          sp.rotation.set(u * 2, u * 3, 0);
          sp.material.opacity = 1 - u;
        }
      }
    }
  });

  const night01 = glow;
  const front = HALF_X + 0.1;
  return (
    <group position={[S.x, g0, S.z]} rotation={[0, S.rotY, 0]}>
      <StaticMerge>
      {/* sand floor mat and the bar itself */}
      <Box p={[0, 0.01, 0.35]} s={[3.2, 0.02, 2.2]} m={L.sand} />
      {[[-HALF_X, -0.85], [HALF_X, -0.85], [-HALF_X, 0.55], [HALF_X, 0.55]].map(([x, z], i) => (
        <BambooPost key={i} p={[x, 0, z]} h={2.0} />
      ))}
      <mesh position={[0, 2.35, -0.15]} rotation={[0, Math.PI / 4, 0]} scale={[1.75 * 1.414, 0.85, 1.25 * 1.414]} material={L.thatch}>
        <coneGeometry args={[1, 1, 4]} />
      </mesh>
      <mesh position={[0, 2.03, -0.15]} rotation={[0, Math.PI / 4, 0]} scale={[1.85 * 1.414, 0.22, 1.35 * 1.414]} material={L.thatchDark}>
        <coneGeometry args={[1, 1, 4, 1, true]} />
      </mesh>
      <mesh position={[0, 1.83, 0.62]} material={signMat}>
        <planeGeometry args={[1.1, 0.34]} />
      </mesh>
      {/* counter: bamboo front, dark wood top */}
      <Box p={[0, COUNTER_TOP / 2 - 0.02, COUNTER_Z]} s={[2.3, COUNTER_TOP - 0.04, 0.32]} m={L.bamboo} />
      {Array.from({ length: 11 }, (_, i) => (
        <Cyl key={i} p={[-1.05 + i * 0.21, COUNTER_TOP / 2 - 0.02, COUNTER_Z + 0.17]} rt={0.04} h={COUNTER_TOP - 0.06} m={i % 2 ? L.bambooNode : L.bamboo} />
      ))}
      <Box p={[0, COUNTER_TOP, COUNTER_Z + 0.04]} s={[2.5, 0.06, 0.5]} m={L.darkWood} />
      {/* back shelf with bottles */}
      <Box p={[0, 0.95, -0.86]} s={[2.3, 1.5, 0.05]} m={L.darkWood} />
      <Box p={[0, 1.07, -0.74]} s={[2.2, 0.04, 0.24]} m={L.wood} />
      <Box p={[0, 1.41, -0.74]} s={[2.2, 0.04, 0.24]} m={L.wood} />
      <Bottles night={night01} />
      {/* a pineapple and a coconut on the counter */}
      <mesh position={[-0.98, COUNTER_TOP + 0.12, COUNTER_Z]} material={L.shell}>
        <icosahedronGeometry args={[0.09, 0]} />
      </mesh>
      <mesh position={[-0.98, COUNTER_TOP + 0.25, COUNTER_Z]} material={L.lettuce}>
        <coneGeometry args={[0.07, 0.14, 5]} />
      </mesh>
      {STOOL_XS.map((x) => (
        <Stool key={x} x={x} />
      ))}
      <StringLights points={[[-front, 1.85, 0.62], [0, 1.72, 0.75], [front, 1.85, 0.62]]} sag={0.18} per={6} night={night01} />
      <StringLights points={[[front, 1.85, 0.62], [front + 0.6, 1.15, 1.4]]} sag={0.12} per={3} night={night01} />
      <StringLights points={[[-front, 1.85, 0.62], [-front - 0.6, 1.15, 1.4]]} sag={0.12} per={3} night={night01} />
      <Cyl p={[front + 0.6, 0.6, 1.4]} rt={0.03} h={1.2} m={L.bamboo} />
      <Cyl p={[-front - 0.6, 0.6, 1.4]} rt={0.03} h={1.2} m={L.bamboo} />
      </StaticMerge>

      <MiniBot ref={bartender} color="#ff7a59" position={[0, 0, -0.3]} right={<group ref={shaker}><Shaker /></group>} />
      {patrons.map((p, i) => (
        <MiniBot
          key={`${crowd}-${i}`}
          ref={(r) => (bots.current[i] = r)}
          color={p.color}
          position={[p.x, SIT_Y, STOOL_Z + 0.04]}
          rotation={[0, Math.PI + p.turn, 0]}
          shadow={false}
          {...{
            [p.hand === 'L' ? 'left' : 'right']: (
              <group ref={(r) => (drinks.current[i] = r)}>
                <group scale={DRINK_S} position={[0, -0.02, 0]}>
                  <Drink type={p.drink} />
                </group>
              </group>
            ),
          }}
        />
      ))}
      {[0, 1].map((k) =>
        k * 2 < patrons.length ? (
          <mesh
            key={k}
            ref={(r) => (sparks.current[k] = r)}
            geometry={SPARK_GEO}
            material={SPARK_MATS[k]}
            position={[(stoolXs[k * 2] + stoolXs[k * 2 + 1]) / 2, SIT_Y + 1.15, STOOL_Z - 0.35]}
            visible={false}
          />
        ) : null
      )}
    </group>
  );
}

