import { memo } from 'react';
import TikiBarScene from './life/TikiBar.jsx';
import FoodTruckScene from './life/FoodTruck.jsx';
import NapHammockScene from './life/NapHammock.jsx';
import VolleyballScene from './life/Volleyball.jsx';
import DJBoothScene from './life/DJBooth.jsx';
import WaitersScene from './life/Waiters.jsx';
import YogaScene from './life/Yoga.jsx';
import { testOn } from '../wild/director.js';

// Scenes only re-render when their own props change, not on every sky tick.
const TikiBar = memo(TikiBarScene);
const FoodTruck = memo(FoodTruckScene);
const NapHammock = memo(NapHammockScene);
const Volleyball = memo(VolleyballScene);
const DJBooth = memo(DJBoothScene);
const Waiters = memo(WaitersScene);
const Yoga = memo(YogaScene);

// Sunrise yoga: 5:45-8:00 AM island time (sky.hour), or always with ?test=yoga.
const YOGA_TEST = testOn('yoga');
const yogaTime = (hour) => YOGA_TEST || (hour >= 5.75 && hour < 8);

// Island life: the crew that keeps the island lively. A tiki bar with
// regulars on stools, the Byte Bites food truck and its line, a napper in a
// hammock, beach volleyball, a DJ booth with a little dance floor, and two
// waiters carrying trays between the bar and the lounging spots, and a
// sunrise yoga class on the north lounge beach at dawn.
//
// Everyone here is a MiniBot in CREW_COLORS (never a team color) and nobody
// is tappable: the 28 team bots keep their real positions and status.
// Each scene gets: animate (false = posed and still, for reduced motion),
// night (0..1, sky.stars), bedtime (9 PM-6 AM: the crew mostly goes home),
// lowPower (fewer extras).
export default function IslandLife({ ctx }) {
  const { sky, animate, bedtime, lowPower, onNote } = ctx;
  const p = { animate, night: sky.stars, bedtime, lowPower };
  return (
    <group>
      <TikiBar {...p} />
      <FoodTruck {...p} onNote={onNote} />
      <NapHammock {...p} />
      <Volleyball {...p} />
      <DJBooth {...p} />
      <Waiters {...p} />
      <Yoga animate={animate} lowPower={lowPower} active={yogaTime(sky.hour)} />
    </group>
  );
}

