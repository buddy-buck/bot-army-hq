import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { addBubble, fxNow } from './labels.js';
import { formatNumber } from '../utils/ticker.js';

// "+7 min" floats: big gold numbers that pop out above the bot that earned
// the minutes, throw a little star burst, then drift up and fade (~2.8 s).
// They follow the bot (labelState.positions) and use the shared bubble layout
// in labels.js, so two floats never sit on top of each other or on a name tag.
// Reduced motion: no pop, no rise, just a gentle fade in place.

export const FLOAT_SECONDS = 2.9;
const RISE_PX = 70;
const STARS = [0, 45, 90, 135, 180, 225, 270, 315];

function GainFloat({ f, animate }) {
  const group = useRef();
  const wrap = useRef();
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    if (f.pos && group.current) group.current.position.set(f.pos[0], f.pos[1], f.pos[2]);
    return addBubble({
      ref: wrap,
      group: group.current,
      bot: f.bot || null,
      x: f.pos?.[0] ?? 0,
      y: f.pos?.[1] ?? 6.2,
      z: f.pos?.[2] ?? 0,
      lift: 0.3,
      bottom: true,
      prio: 100,
      rise: animate ? RISE_PX : 0,
      dur: FLOAT_SECONDS,
      born: fxNow(),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // On-demand rendering (reduced motion, idle): draw a few frames so it's placed.
  useEffect(() => {
    invalidate();
    const a = setTimeout(invalidate, 60);
    const b = setTimeout(invalidate, 250);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [invalidate]);
  return (
    <group ref={group}>
      <Html center zIndexRange={[24, 12]} pointerEvents="none">
        <div ref={wrap} className="gain-wrap photo-hide" aria-hidden="true">
          <div className={`gain-pop${animate ? '' : ' is-static'}`} style={{ '--bot': f.color }}>
            {animate && (
              <span className="gain-burst">
                {STARS.map((a, i) => (
                  <i key={a} style={{ '--a': `${a}deg`, '--d': `${i % 2 ? 46 : 62}px` }} />
                ))}
              </span>
            )}
            <span className="gain-num">+{formatNumber(f.minutes)}</span>
            <span className="gain-unit">min</span>
          </div>
        </div>
      </Html>
    </group>
  );
}

function GainFloats({ floats, animate }) {
  return floats.map((f) => <GainFloat key={f.id} f={f} animate={animate} />);
}

export default memo(GainFloats);
