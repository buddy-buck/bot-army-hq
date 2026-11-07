import Lighthouse from './landmarks/Lighthouse.jsx';
import WelcomeArch from './landmarks/WelcomeArch.jsx';
import Watchtower from './landmarks/Watchtower.jsx';
import Airstrip from './landmarks/Airstrip.jsx';
import Helicopter from './landmarks/Helicopter.jsx';
import VisitorCenter from './landmarks/VisitorCenter.jsx';

// Buildings: lighthouse, dock welcome arch, lifeguard watchtower, airstrip
// (with its island-hopper plane), Chief's helicopter and the Visitor Center.
// Flo's overwater villa and the helipad itself are part of Island.jsx.
// Props (see App.jsx): { ctx } with sky, animate, lowPower, bots, sceneBots,
// layout, bedtime, reduced, onNote, onToast. Mounted in reduced motion too
// (animate=false): then everything renders still and no aircraft fly.
export default function Landmarks({ ctx }) {
  return (
    <group>
      <Lighthouse ctx={ctx} />
      <WelcomeArch ctx={ctx} />
      <Watchtower ctx={ctx} />
      <Airstrip ctx={ctx} />
      {ctx.animate && <Helicopter ctx={ctx} />}
      <VisitorCenter ctx={ctx} />
    </group>
  );
}
