// Island life agent: tiki bar, food truck, hammock napper, volleyball, DJ booth, waiters.
// Mounted in App.jsx inside the Canvas. Props: { sky, animate, lowPower, bots, layout }
//   sky: useSunPosition() output (sky.stars 0..1 = how dark it is, sky.phase, sky.hour)
//   animate: false under reduced motion: draw a still frame (or nothing for pure motion)
//   lowPower: phones and ?lite=1: fewer particles and extras
//   bots / layout: the scene bots and their layout from paths.js layoutBots
//
// Every crowd member is a MiniBot extra (can't be tapped). Each scene poses
// all of its bots from a single useFrame. At night (9 PM to 6 AM, when the
// real bots sleep or gather at the campfire) the day crowd goes home: no
// volleyball, food truck line or waiters. The tiki bar stays open with a
// couple of regulars, the DJ keeps spinning and the hammock napper naps on.
import { isIslandNight } from './director.js';
import DJBooth from './life/DJBooth.jsx';
import FoodTruck from './life/FoodTruck.jsx';
import HammockNap from './life/HammockNap.jsx';
import TikiBar from './life/TikiBar.jsx';
import Volleyball from './life/Volleyball.jsx';
import Waiters from './life/Waiters.jsx';

export default function IslandLife({ sky, animate = true, lowPower = false }) {
  const night = isIslandNight(sky?.hour ?? 12);
  const glow = sky?.stars ?? 0;
  return (
    <group>
      <TikiBar night={night} glow={glow} animate={animate} lowPower={lowPower} />
      <FoodTruck night={night} glow={glow} animate={animate} lowPower={lowPower} />
      <HammockNap animate={animate} />
      <Volleyball night={night} animate={animate} />
      <DJBooth glow={glow} animate={animate} lowPower={lowPower} />
      <Waiters night={night} animate={animate} lowPower={lowPower} />
    </group>
  );
}
