import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DOCK, SITES } from '../../utils/paths.js';
import { BOT_PITCH } from '../../utils/byob.js';
import { DEFAULT_TESTIMONIALS, loadTestimonials } from '../../utils/testimonials.js';
import { aliveClock, readStore, testOn, writeStore } from '../../wild/director.js';
import { Box, Cyl, M, pointer, std, tap } from './kit.jsx';

// The mailbox on Launch's Pier. Every few minutes a seagull glides in off
// the sea with a letter in its beak, lands on the mailbox, drops the letter
// in, the little red flag pops up, and off it goes. Tap the mailbox to read
// the mail: a BYOB fact about one of the bots, or a customer shoutout (from
// public/testimonials.json). The letters rotate, and the spot in the
// rotation is remembered between visits. ?test=mail: a gull every ~15 s.

const TEST = testOn('mail');
const MAIL_KEY = 'bah-mail-index';
const BOX_Y = DOCK.y + 0.95; // top of the mailbox
const GULL_IN = 6.5; // seconds gliding in
const GULL_SIT = 2.2;
const GULL_OUT = 5.5;

const MAT = {
  box: std('#2f6fdb', { roughness: 0.5, metalness: 0.2 }),
  boxDark: std('#24529f'),
  flag: std('#e5353d'),
  letter: std('#fdf8ee'),
  stamp: std('#e5353d'),
  gull: std('#f7f7f4'),
  gullGrey: std('#a9b1ba'),
  gullTip: std('#2b2b30'),
  beak: std('#f5b82e'),
  eye: std('#111111'),
};

const name = (id) => id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('-');

// Facts and shoutouts, alternating.
function mailList(testimonials, bots) {
  const names = new Map((bots || []).map((b) => [b.id, b.name]));
  const facts = Object.entries(BOT_PITCH).map(([id, p]) => ({
    kind: 'fact',
    title: 'Mail: a BYOB fact',
    body: [`Did you know? ${names.get(id) || name(id)} ${p.does}. That saves ${p.saves}.`, 'Every bot on the island is available for your own business at Boss Your Own Bots.'],
  }));
  const shout = testimonials.map((t) => ({ kind: 'shout', title: 'Mail: a customer shoutout', body: [`“${t.quote}”`, `— ${t.who}`] }));
  const out = [];
  const n = Math.max(facts.length, shout.length);
  for (let i = 0; i < n; i++) {
    if (i < facts.length) out.push(facts[i]);
    if (shout.length) out.push(shout[i % shout.length]);
  }
  return out;
}

// A small low-poly seagull. Wings pivot at the shoulders.
function Gull({ wingL, wingR, letter }) {
  return (
    <group>
      <mesh material={MAT.gull} scale={[0.09, 0.08, 0.2]}>
        <icosahedronGeometry args={[1, 0]} />
      </mesh>
      <mesh material={MAT.gull} position={[0, 0.06, 0.16]} scale={0.065}>
        <icosahedronGeometry args={[1, 0]} />
      </mesh>
      <mesh material={MAT.beak} position={[0, 0.05, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.018, 0.07, 4]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={MAT.eye} position={[s * 0.04, 0.08, 0.2]}>
          <sphereGeometry args={[0.009, 4, 3]} />
        </mesh>
      ))}
      <mesh material={MAT.gullGrey} position={[0, 0.0, -0.22]} rotation={[0.15, 0, 0]} scale={[0.07, 0.015, 0.08]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <group ref={wingL} position={[-0.06, 0.03, 0.02]}>
        <mesh material={MAT.gullGrey} position={[-0.17, 0, 0]} scale={[0.34, 0.012, 0.13]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
        <mesh material={MAT.gullTip} position={[-0.38, 0, -0.01]} scale={[0.1, 0.013, 0.1]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      </group>
      <group ref={wingR} position={[0.06, 0.03, 0.02]}>
        <mesh material={MAT.gullGrey} position={[0.17, 0, 0]} scale={[0.34, 0.012, 0.13]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
        <mesh material={MAT.gullTip} position={[0.38, 0, -0.01]} scale={[0.1, 0.013, 0.1]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      </group>
      <group ref={letter} position={[0, 0.03, 0.3]} rotation={[0.2, 0, 0]}>
        <Box p={[0, 0, 0]} s={[0.12, 0.004, 0.08]} m={MAT.letter} />
        <Box p={[0.035, 0.003, -0.018]} s={[0.025, 0.002, 0.025]} m={MAT.stamp} />
      </group>
    </group>
  );
}

const v = new THREE.Vector3();
const bez = (out, a, b, c, t) => {
  const u = 1 - t;
  return out.set(u * u * a.x + 2 * u * t * b.x + t * t * c.x, u * u * a.y + 2 * u * t * b.y + t * t * c.y, u * u * a.z + 2 * u * t * b.z + t * t * c.z);
};

export default function Mailbox({ ctx }) {
  const site = SITES.mailbox;
  const { animate } = ctx;
  const flag = useRef();
  const peek = useRef();
  const gull = useRef();
  const wingL = useRef();
  const wingR = useRef();
  const letter = useRef();
  const [quotes, setQuotes] = useState(DEFAULT_TESTIMONIALS);
  useEffect(() => {
    let live = true;
    loadTestimonials().then((l) => live && setQuotes(l));
    return () => {
      live = false;
    };
  }, []);
  const list = useMemo(() => mailList(quotes, ctx.bots), [quotes, ctx.bots]);
  const listRef = useRef(list);
  listRef.current = list;

  const perch = useMemo(() => new THREE.Vector3(site.x, BOX_Y + 0.07, site.z), [site.x, site.z]);
  const st = useMemo(
    () => ({
      clock: aliveClock(),
      phase: 'away', // 'away' | 'in' | 'sit' | 'out'
      at: 0,
      next: TEST ? 3 : 25 + Math.random() * 40,
      mail: false,
      flagK: 0,
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Vector3(),
    }),
    []
  );
  // the first letter is waiting when the page opens, flag up
  useEffect(() => {
    st.mail = true;
    st.flagK = 1;
  }, [st]);

  useFrame((_, delta) => {
    const t = st.clock.tick(delta);
    const dt = Math.min(delta, 0.1);
    const g = gull.current;
    if (!g) return;
    if (!animate) {
      g.visible = false;
    } else if (st.phase === 'away') {
      g.visible = false;
      if (t >= st.next && !ctx.bedtime) {
        // in from the open sea to the north-west, a gentle curving glide
        const side = Math.random() < 0.5 ? -1 : 1;
        st.a.set(site.x - 14, BOX_Y + 6, site.z - 10 * side);
        st.b.set(site.x - 4, BOX_Y + 2.6, site.z - 5 * side);
        st.c.copy(perch);
        st.phase = 'in';
        st.at = t;
      }
    } else {
      g.visible = true;
      const k = t - st.at;
      let flap = 1;
      if (st.phase === 'in') {
        const u = Math.min(1, k / GULL_IN);
        const e = 1 - (1 - u) * (1 - u);
        bez(g.position, st.a, st.b, st.c, e);
        bez(v, st.a, st.b, st.c, Math.min(1, e + 0.02));
        if (u < 0.98) g.rotation.y = Math.atan2(v.x - g.position.x, v.z - g.position.z);
        g.rotation.x = u > 0.8 ? -0.5 * ((u - 0.8) / 0.2) : 0.12; // flare to land
        flap = u > 0.8 ? 1.6 : u > 0.25 ? 0.25 : 1; // glide in the middle
        if (letter.current) letter.current.visible = true;
        if (u >= 1) {
          st.phase = 'sit';
          st.at = t;
        }
      } else if (st.phase === 'sit') {
        g.position.copy(perch);
        g.rotation.x = 0;
        g.rotation.y += Math.sin(t * 2) * 0.002;
        flap = 0;
        if (k > 0.7 && letter.current?.visible) {
          letter.current.visible = false;
          st.mail = true;
        }
        if (k > GULL_SIT) {
          st.phase = 'out';
          st.at = t;
          st.a.copy(perch);
          st.b.set(site.x - 3, BOX_Y + 1.5, site.z + 3);
          st.c.set(site.x - 16, BOX_Y + 7, site.z + 12);
        }
      } else if (st.phase === 'out') {
        const u = Math.min(1, k / GULL_OUT);
        const e = u * u;
        bez(g.position, st.a, st.b, st.c, e);
        bez(v, st.a, st.b, st.c, Math.min(1, e + 0.03));
        g.rotation.y = Math.atan2(v.x - g.position.x, v.z - g.position.z);
        g.rotation.x = -0.15;
        flap = 1.4;
        if (u >= 1) {
          st.phase = 'away';
          st.next = t + (TEST ? 12 : 150 + Math.random() * 150);
        }
      }
      const w = flap ? Math.sin(t * (9 + flap * 4)) * 0.6 * Math.min(1, flap) : 0.08;
      const fold = st.phase === 'sit' ? 1.2 : 0;
      if (wingL.current) wingL.current.rotation.z = w + fold;
      if (wingR.current) wingR.current.rotation.z = -w - fold;
    }
    // the flag eases up when there's mail, down once it's read
    const want = st.mail ? 1 : 0;
    st.flagK += (want - st.flagK) * Math.min(1, dt * 6);
    if (!animate) st.flagK = want;
    if (flag.current) flag.current.rotation.x = -st.flagK * (Math.PI / 2);
    if (peek.current) peek.current.visible = st.mail;
  });

  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const open = useMemo(
    () =>
      tap(() => {
        const l = listRef.current;
        if (!l.length) return;
        const i = (Number(readStore('localStorage', MAIL_KEY)) || 0) % l.length;
        writeStore('localStorage', MAIL_KEY, String(i + 1));
        const m = l[i];
        st.mail = false;
        ctxRef.current.onNote?.({ title: m.title, body: m.body, from: 'Delivered by seagull' });
      }),
    [st]
  );

  return (
    <group>
      <group position={[site.x, DOCK.y, site.z]} rotation={[0, Math.PI / 2, 0]} onClick={open} {...pointer}>
        <Cyl p={[0, 0.38, 0]} rt={0.035} h={0.76} m={M.darkWood} />
        <Box p={[0, 0.03, 0]} s={[0.18, 0.04, 0.18]} m={M.darkWood} />
        {/* the box: a flat bottom with a rounded top, door toward the island */}
        <group position={[0, 0.8, 0]}>
          <Box p={[0, 0, 0]} s={[0.2, 0.1, 0.34]} m={MAT.box} />
          <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} material={MAT.box}>
            <cylinderGeometry args={[0.1, 0.1, 0.34, 10, 1, false, -Math.PI / 2, Math.PI]} />
          </mesh>
          <Box p={[0, 0.02, 0.172]} s={[0.21, 0.16, 0.01]} m={MAT.boxDark} />
          {/* a letter peeking out of the door when there's mail */}
          <group ref={peek} position={[0, 0.03, 0.18]} rotation={[0.25, 0, 0]}>
            <Box p={[0, 0, 0]} s={[0.12, 0.08, 0.004]} m={MAT.letter} />
          </group>
          {/* flag on the side: down = flat along the box, up = pointing at the sky */}
          <group ref={flag} position={[0.105, 0.0, -0.08]}>
            <Box p={[0, 0, 0.09]} s={[0.012, 0.018, 0.18]} m={MAT.flag} />
            <Box p={[0, 0.03, 0.16]} s={[0.012, 0.07, 0.05]} m={MAT.flag} />
          </group>
        </group>
      </group>
      <group ref={gull} visible={false} scale={1.1}>
        <Gull wingL={wingL} wingR={wingR} letter={letter} />
      </group>
    </group>
  );
}
