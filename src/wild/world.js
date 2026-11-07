// Live, shared state for the ambient world (written every frame, read every
// frame, never React state).
//
// boats: anything moving on the water registers here each frame so the rest
// of the world can react: the water draws a V-shaped wake behind it, fish
// schools dart away, and the night water glows around it.
//   world.boats.set(id, { x, z, heading, speed, size })
//     heading: direction of travel as atan2(dx, dz) (the same convention as
//              a group's rotation.y when its nose points along local +z)
//     speed:   units per second (0 when moored: no wake)
//     size:    rough hull length, scales the wake
//   Delete the entry when the boat leaves or unmounts.
//
// glow: extra points that make the night water light up (a bot fishing off
// the pier, a swimmer...). world.glow.set(id, { x, z, strength })
export const world = {
  boats: new Map(),
  glow: new Map(),
};

// Seconds of frames actually drawn. Timed extras use this instead of the wall
// clock so nothing plays unseen in a hidden tab (the same rule as the wild
// extras in director.js). Call tick(delta) once per frame from one place.
export function aliveClock() {
  let t = 0;
  return {
    tick(delta) {
      t += Math.min(delta, 0.1);
      return t;
    },
    get now() {
      return t;
    },
  };
}
