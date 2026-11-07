import Sailboat from './boats/Sailboat.jsx';
import TourBoat from './boats/TourBoat.jsx';
import Tugboat from './boats/Tugboat.jsx';

// Boats around the island (Echo's jet ski lives in Surfer.jsx):
//   Sailboat: always out there, circling r 41-53, a bot reading a tablet on deck
//   Glass-bottom tour boat: loops r ~29 (wide around the west pier), pauses now and then
//   Tugboat + barge of PROMPT crates: in to Launch's Pier every few minutes
// Every hull registers itself in world.boats each frame (ids: sailboat,
// tourboat, tugboat, barge; the jet ski is jetski) so the water can draw
// wakes, fish can scatter and the night water can glow around them.
// Mounted in App.jsx only when motion is allowed.
//   Props: { sky, animate, lowPower, bots, layout }
export default function Boats({ sky, animate = true, lowPower = false }) {
  if (!animate) return null;
  return (
    <group>
      <Sailboat sky={sky} lowPower={lowPower} />
      <TourBoat sky={sky} lowPower={lowPower} />
      <Tugboat sky={sky} lowPower={lowPower} />
    </group>
  );
}
