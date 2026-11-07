import Aurora from './sky/Aurora.jsx';
import Balloons from './sky/Balloons.jsx';
import ByobCloud from './sky/ByobCloud.jsx';
import Fireworks from './sky/Fireworks.jsx';
import Pelicans from './sky/Pelicans.jsx';
import PassingShower from './sky/Shower.jsx';
import ShootingStars from './sky/ShootingStars.jsx';
import SupplyDrop from './sky/SupplyDrop.jsx';
import Ufo from './sky/Ufo.jsx';

// Sky life: hot air balloons and a pelican V by day, shooting stars, rare
// northern lights and a very rare UFO by night, fireworks for big moments
// (and at 9 PM), and now and then a passing shower with a rainbow.
// By day, now and then: a cloud that spells BYOB (tap it), and a supply drop
// (a crate parachutes onto the island and the crew unbox it). Tap or hold a
// balloon to fire its burner.
// The bot-shaped clouds live with the other clouds in Sky.jsx.
// Mounted only when motion is allowed (not reduced).
//
// Test switches (?test=a,b or ?test=all): balloons are out all day anyway;
// pelicans, stars, meteors, fireworks, aurora, ufo, rainbow, byob, drop.
export default function SkyShow({ ctx }) {
  return (
    <>
      <Balloons ctx={ctx} />
      <ByobCloud ctx={ctx} />
      <SupplyDrop ctx={ctx} />
      <Pelicans ctx={ctx} />
      <PassingShower ctx={ctx} />
      <ShootingStars ctx={ctx} />
      <Fireworks ctx={ctx} />
      <Aurora ctx={ctx} />
      <Ufo ctx={ctx} />
    </>
  );
}
