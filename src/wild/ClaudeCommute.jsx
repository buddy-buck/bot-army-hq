import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { couriers } from '../components/Handoff.jsx';
import { CLAUDE_VISIT, groundY, routeBetween } from '../utils/paths.js';
import { claudeTrip, TEST } from './director.js';

// Claude lives up in Chief's Tower, mai tai in hand, next to Chief.
//   Status turns "working": Claude climbs down and walks the sand paths to
//   the zone the work is about (lastAction.text): Launch's Pier for builds,
//   the Content Cabana for content, the Real Estate Lanai for real estate.
//   Status turns idle: Claude walks back and climbs up to the chair.
// On page load Claude simply starts wherever the status says.
// ?claude=test makes Claude head out and come back every 40 seconds.

export function claudeZoneFor(text = '') {
  const t = text.toLowerCase();
  if (/(listing|buyer|seller|escrow|comps?\b|real estate|open house|offer|mls|home value|closing)/.test(t)) return 'lanai';
  if (/(caption|post|video|newsletter|content|social|blog|reel|script|photo|episode|podcast)/.test(t)) return 'cabana';
  return 'dock'; // builds, ships, fixes, anything else
}

function visitSpot(zone) {
  const v = CLAUDE_VISIT[zone];
  return v ? { x: v.x, y: groundY(v.x, v.z) + (v.lift || 0), z: v.z, rotY: v.rotY, zone } : null;
}

// Layout slot for Claude while visiting a zone for work.
export function visitSlot(slot, zone) {
  const v = visitSpot(zone);
  if (!v || !slot) return slot;
  const home = { x: v.x, y: v.y, z: v.z, rotY: v.rotY, raised: false };
  return { ...slot, zone, x: v.x, y: v.y, z: v.z, rotY: v.rotY, raised: false, lounge: false, doorstep: null, hammock: null, mode: 'station', home };
}

const WALK = 1.5;

function walkOn(route, u) {
  const p = route.pointAt(u);
  const t = route.tangentAt(Math.min(0.999, Math.max(0.001, u)));
  return { x: p.x, y: p.y, z: p.z, heading: Math.atan2(t.x, t.z) };
}

// Down from the tower to a zone, or back up to the tower chair.
function planWalk(fromSlot, toSlot, arriving) {
  const route = routeBetween(fromSlot, toSlot);
  const dur = Math.max(1.5, route.length / WALK);
  return { route, dur, total: dur + 0.5, arriving, zone: arriving ? toSlot.zone : null };
}

const TEST_ORDER = ['cabana', null, 'lanai', null, 'dock', null];
const TEST_PERIOD = 40;

export default function ClaudeCommute({ desired, visit, homeSlot, onVisit, animate = true }) {
  const trip = useRef(null);
  const inited = useRef(false);
  const alive = useRef(0);
  const latest = useRef({ desired, visit, homeSlot, onVisit });
  latest.current = { desired, visit, homeSlot, onVisit };

  useEffect(
    () => () => {
      claudeTrip.active = false;
      couriers.delete('claude');
    },
    []
  );

  useFrame((_, delta) => {
    alive.current += Math.min(delta, 0.1); // drawn time: walks pause with the tab
    const now = alive.current;
    const { visit: actual, homeSlot: home, onVisit: setVisit } = latest.current;
    let want = latest.current.desired;
    if (TEST.claude && now > 6) want = TEST_ORDER[Math.floor((now - 6) / TEST_PERIOD) % TEST_ORDER.length];

    if (!inited.current) {
      inited.current = true;
      setVisit(want); // take over from the starting spot
      return;
    }

    if (!trip.current && want !== actual) {
      if (!animate || !home) {
        setVisit(want);
        return;
      }
      const fromSlot = actual ? { ...visitSpot(actual), raised: false } : home;
      const toSlot = want ? { ...visitSpot(want), raised: false } : home;
      if (!fromSlot || !toSlot) {
        setVisit(want);
        return;
      }
      trip.current = { ...planWalk(fromSlot, toSlot, !!want), start: now, fired: false };
      if (!want) setVisit(null); // heading home: the layout points back at the chair
      claudeTrip.active = true;
    }

    const tr = trip.current;
    if (!tr) return;
    const t = now - tr.start;
    if (t >= tr.total) {
      claudeTrip.active = false;
      couriers.delete('claude');
      trip.current = null;
      return;
    }
    if (t >= tr.dur && !tr.fired) {
      tr.fired = true;
      if (tr.arriving) setVisit(tr.zone);
    }
    const c = walkOn(tr.route, Math.min(1, t / tr.dur));
    couriers.set('claude', { x: c.x, y: c.y, z: c.z, heading: c.heading });
  });

  return null;
}
