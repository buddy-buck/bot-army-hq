// Landmarks: lighthouse (foghorn on tap), watchtower, airstrip with a prop
// plane that drops off new recruits, and the Visitor Center.
// Mounted in App.jsx inside the Canvas. Props: { sky, animate, lowPower, bots, layout }
//   sky: useSunPosition() output (sky.stars 0..1 = how dark it is)
//   animate: false under reduced motion: everything is drawn still, no plane
//   lowPower: phones and ?lite=1: fewer extras
// The pieces live in ./landmarks/.
import Airport from './landmarks/Airport.jsx';
import Lighthouse from './landmarks/Lighthouse.jsx';
import VisitorCenter from './landmarks/VisitorCenter.jsx';
import Watchtower from './landmarks/Watchtower.jsx';

export default function Landmarks({ sky, animate = true, lowPower = false }) {
  if (!sky) return null;
  return (
    <group>
      <Lighthouse sky={sky} animate={animate} lowPower={lowPower} />
      <Watchtower sky={sky} animate={animate} lowPower={lowPower} />
      <Airport sky={sky} animate={animate} lowPower={lowPower} />
      <VisitorCenter sky={sky} animate={animate} lowPower={lowPower} />
    </group>
  );
}
