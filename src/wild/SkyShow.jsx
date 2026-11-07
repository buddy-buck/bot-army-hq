import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { rareGap } from './director.js';
import { requestAmbientWeather } from './Weather.jsx';
import Balloons from './sky/Balloons.jsx';
import Pelicans from './sky/Pelicans.jsx';
import ShootingStars from './sky/ShootingStars.jsx';
import Fireworks from './sky/Fireworks.jsx';
import BotCloud from './sky/BotCloud.jsx';
import Aurora from './sky/Aurora.jsx';
import Ufo from './sky/Ufo.jsx';
import { isDaylight } from './sky/common.js';

// The sky show: hot air balloons with bot logos and pelicans by day, a cloud
// that turns into a bot now and then, shooting stars, fireworks, northern
// lights and the odd UFO at night, and a passing shower with a rainbow every
// so often in the daytime (through the Weather queue, one at a time).
// Mounted in App.jsx inside the Canvas, only when motion is allowed.
// Props: { sky, animate, lowPower, bots, layout }
//   sky: useSunPosition() output (sky.stars 0..1 = how dark it is, sky.phase, sky.hour)
//   animate: false under reduced motion: nothing is drawn
//   lowPower: phones and ?lite=1: fewer balloons, birds, sparks and ribbons
//
// Timers count seconds of frames drawn and use rareGap(), so ?rare=test makes
// the rare sights come around every 20 to 40 seconds.
export default function SkyShow({ sky, animate = true, lowPower = false }) {
  if (!animate) return null;
  return (
    <group>
      <AmbientRainbow sky={sky} />
      <Balloons sky={sky} lowPower={lowPower} />
      <Pelicans sky={sky} lowPower={lowPower} />
      <BotCloud sky={sky} />
      <ShootingStars sky={sky} />
      <Fireworks sky={sky} lowPower={lowPower} />
      <Aurora sky={sky} lowPower={lowPower} />
      <Ufo sky={sky} />
    </group>
  );
}

// Every 6 to 12 minutes of daytime: a passing shower, then a rainbow (now and
// then a double). Skipped if the weather is busy; it tries again shortly.
function AmbientRainbow({ sky }) {
  const skyRef = useRef(sky);
  skyRef.current = sky;
  const wait = useRef(rareGap(360, 720));
  useFrame((_, delta) => {
    wait.current -= Math.min(delta, 0.1);
    if (wait.current > 0) return;
    if (!isDaylight(skyRef.current)) {
      wait.current = 30;
      return;
    }
    const kinds = ['shower', Math.random() < 0.2 ? 'double' : 'rainbow'];
    wait.current = requestAmbientWeather(kinds) ? rareGap(360, 720) : 20;
  });
  return null;
}
