import { memo } from 'react';
import TikiBarScene from './life/TikiBar.jsx';
import FoodTruckScene from './life/FoodTruck.jsx';
import NapHammockScene from './life/NapHammock.jsx';
import VolleyballScene from './life/Volleyball.jsx';
import DJBoothScene from './life/DJBooth.jsx';
import WaitersScene from './life/Waiters.jsx';

// Scenes only re-render when their own props change, not on every sky tick.
const TikiBar = memo(TikiBarScene);
const FoodTruck = memo(FoodTruckScene);
const NapHammock = memo(NapHammockScene);
const Volleyball = memo(VolleyballScene);
const DJBooth = memo(DJBoothScene);
const Waiters = memo(WaitersScene);

// Island life: the crew that keeps the island lively. A tiki bar with
// regulars on stools, the Byte Bites food truck and its line, a napper in a
// hammock, beach volleyball, a DJ booth with a little dance floor, and two
// waiters carrying trays between the bar and the lounging spots.
//
// Everyone here is a MiniBot in CREW_COLORS (never a team color) and nobody
// is tappable: the 28 team bots keep their real positions and status.
// Each scene gets: animate (false = posed and still, for reduced motion),
// night (0..1, sky.stars), bedtime (9 PM-6 AM: the crew mostly goes home),
// lowPower (fewer extras).
export default function IslandLife({ ctx }) {
  const { sky, animate, bedtime, lowPower } = ctx;
  const p = { animate, night: sky.stars, bedtime, lowPower };
  return (
    <group>
      <TikiBar {...p} />
      <FoodTruck {...p} />
      <NapHammock {...p} />
      <Volleyball {...p} />
      <DJBooth {...p} />
      <Waiters {...p} />
    </group>
  );
}

