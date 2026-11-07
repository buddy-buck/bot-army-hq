// Live sky effects other pieces can react to, written every frame (never
// React state). Sky.jsx tints the ambient light from these.
//   aurora: 0..1 while the northern lights are up
//   flash : 0..1 right after a firework bursts at night; flashColor its color
//   byob  : 0..1 while the BYOB cloud letters are up, at (byobX, byobZ); the
//           plain low cloud nearest them melts away to make room
export const skyFx = { aurora: 0, flash: 0, flashColor: [1, 1, 1], byob: 0, byobX: 0, byobZ: 0 };
