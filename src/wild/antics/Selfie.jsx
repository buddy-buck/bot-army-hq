import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import MiniBot, { extraColor } from '../MiniBot.jsx';
import { BOT_SCALE, MAT } from '../../components/Bot.jsx';
import { labelState } from '../../components/labels.js';
import { SITES, groundY } from '../../utils/paths.js';
import { AMAT, ease, ramp } from './common.jsx';

// An extra taking a selfie on the south beach: phone up at arm's length,
// a peace sign or a head tilt, a quick flash, and a tiny instant photo pops
// up for a moment. It faces the default camera with the island behind it.

const SITE = SITES.selfie;
const CYCLE = 9;
const FLASH_AT = 3.2;
const COLOR = extraColor(1);

const phoneGeo = new THREE.BoxGeometry(0.1, 0.17, 0.014);
const screenGeo = new THREE.PlaneGeometry(0.085, 0.145).rotateY(Math.PI);
const fingerGeo = new THREE.CapsuleGeometry(0.014, 0.06, 2, 4);
const flashGeo = new THREE.SphereGeometry(0.06, 8, 6);
const screenMat = new THREE.MeshBasicMaterial({ color: '#9fe3ff' });

function Phone({ phoneRef, flashRef }) {
  // In the hand slot; rotated so it stands upright facing the bot when the
  // arm is raised (see ARM_UP below).
  return (
    <group ref={phoneRef} rotation={[2.3, 0, 0]} position={[0, -0.06, 0]}>
      <mesh geometry={phoneGeo} material={AMAT.dark} />
      <mesh geometry={screenGeo} material={screenMat} position={[0, 0, -0.008]} />
      <mesh ref={flashRef} geometry={flashGeo} material={AMAT.flash} position={[0.025, 0.06, 0.02]} visible={false} />
    </group>
  );
}

function Peace({ peaceRef }) {
  return (
    <group ref={peaceRef} position={[0, -0.04, 0]} visible={false}>
      <mesh geometry={fingerGeo} material={MAT.face} position={[-0.02, -0.04, 0]} rotation={[0, 0, -0.3]} />
      <mesh geometry={fingerGeo} material={MAT.face} position={[0.02, -0.04, 0]} rotation={[0, 0, 0.3]} />
    </group>
  );
}

const ARM_UP = -2.3;

export default function Selfie({ animate = true }) {
  const bot = useRef();
  const phone = useRef();
  const flash = useRef();
  const peace = useRef();
  const photo = useRef();
  const st = useRef({ t: 1.5, cycle: -1 });

  useFrame((_, delta) => {
    const b = bot.current;
    if (!b?.root) return;
    const s = st.current;
    if (animate) s.t += Math.min(delta, 0.1);
    const t = animate ? s.t : 2;
    const k = t % CYCLE;
    const cyc = Math.floor(t / CYCLE);
    const peaceSign = cyc % 2 === 0;
    b.reset();

    // phone arm: up for the shot, down at the end to look at the photo
    const up = ease(ramp(k, 0, 1)) * (1 - ease(ramp(k, 7.4, 8.0)) * 0.55);
    b.armR.rotation.set(ARM_UP * up, 0, 0.12 - 0.42 * up);
    if (phone.current) phone.current.rotation.x = 2.3 * up + 0.4 * (1 - up);

    const posing = ramp(k, 1.0, 1.6) * (1 - ramp(k, 6.8, 7.4));
    if (peaceSign) {
      b.armL.rotation.set(-2.55 * posing, 0, -0.12 - 0.26 * posing);
      b.head.rotation.z = -0.22 * posing;
    } else {
      // hand on hip, head tilt the other way
      b.armL.rotation.set(0.35 * posing, 0, -0.12 - 0.5 * posing);
      b.head.rotation.z = 0.25 * posing;
      b.pose.rotation.z = -0.05 * posing;
    }
    if (peace.current) peace.current.visible = peaceSign && posing > 0.5;
    // looking up at the phone, then down at the photo
    b.head.rotation.x = k > 7.4 ? 0.35 * ramp(k, 7.4, 7.8) : -0.18 * up;
    b.head.rotation.y = -0.15 * up;
    if (animate) b.pose.position.y = Math.abs(Math.sin(t * 1.4)) * 0.012;

    // flash, then the instant photo
    const fk = (k - FLASH_AT) / 0.25;
    if (flash.current) {
      const on = animate && fk >= 0 && fk < 1;
      flash.current.visible = on;
      if (on) flash.current.scale.setScalar(1 + Math.sin(fk * Math.PI) * 3);
    }
    const el = photo.current;
    if (el) {
      const show = animate && k > FLASH_AT + 0.3 && k < 7.4 && labelState.tier !== 'far' ? '' : 'none';
      if (el.style.display !== show) el.style.display = show;
      const tag = peaceSign ? 'peace' : 'tilt';
      if (el.dataset.pose !== tag) el.dataset.pose = tag;
    }
  });

  return (
    <group position={[SITE.x, groundY(SITE.x, SITE.z), SITE.z]} rotation={[0, 0.3, 0]}>
      <MiniBot
        ref={bot}
        color={COLOR}
        right={<Phone phoneRef={phone} flashRef={flash} />}
        left={<Peace peaceRef={peace} />}
      />
      <Html position={[0.35, 1.75 * BOT_SCALE, 0]} center zIndexRange={[7, 0]} pointerEvents="none">
        <div ref={photo} className="antics-polaroid" aria-hidden="true" style={{ display: 'none' }}>
          <div className="antics-polaroid-shot">
            <span className="antics-polaroid-bot" style={{ background: COLOR }} />
          </div>
        </div>
      </Html>
    </group>
  );
}
