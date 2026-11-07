// Ocean agent: V-shaped wakes behind every boat in world.boats, plus better ripples.
// Mounted in App.jsx inside the Canvas. Props: { sky, animate, lowPower, bots, layout }
//   sky: useSunPosition() output (sky.stars 0..1 = how dark it is, sky.phase, sky.hour)
//   animate: false under reduced motion: draw a still frame (or nothing for pure motion)
//   lowPower: phones and ?lite=1: fewer particles and extras
//   bots / layout: the scene bots and their layout from paths.js layoutBots
export default function Wakes() {
  return null;
}
