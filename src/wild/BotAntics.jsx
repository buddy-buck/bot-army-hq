import { isIslandNight } from './director.js';
import { Puffs } from './antics/fx.jsx';
import HighFives from './antics/HighFives.jsx';
import BeachWalk from './antics/BeachWalk.jsx';
import ArmWrestle from './antics/ArmWrestle.jsx';
import PushUps from './antics/PushUps.jsx';
import Selfie from './antics/Selfie.jsx';
import Fishing from './antics/Fishing.jsx';
import Sandcastle from './antics/Sandcastle.jsx';

// Bot antics: a little personality around the island, all in the existing
// bot style (MiniBot extras).
//   High fives  : real bots passing each other (or a standing bot) high five
//   Beach walk  : two strollers; one trips, the other helps it up
//   Arm wrestle : at the picnic table, with a fan watching
//   Push-ups    : with a rep counter and a flex between sets
//   Selfie      : phone up, peace sign, flash, a tiny instant photo
//   Fishing     : off the end of Launch's Pier; stays out at night with a lantern
//   Sandcastle  : grows a piece at a time through the day (saved), then a wave
// At night (9 PM - 6 AM) the day antics go home; only the fisher stays.
// Mounted in App.jsx inside the Canvas. Props: { sky, animate, lowPower, bots, layout }
export default function BotAntics({ sky, animate = true, lowPower = false }) {
  const night = isIslandNight(sky?.hour ?? 12);
  return (
    <group>
      {animate && <Puffs lowPower={lowPower} />}
      {animate && <HighFives />}
      <Fishing animate={animate} night={night || (sky?.stars ?? 0) > 0.5} />
      {!night && (
        <>
          <BeachWalk animate={animate} />
          <ArmWrestle animate={animate} lowPower={lowPower} />
          <PushUps animate={animate} />
          <Selfie animate={animate} />
          <Sandcastle animate={animate} />
        </>
      )}
    </group>
  );
}
