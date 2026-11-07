// Live shared state for the ambient world. Written and read every frame,
// never React state, so it costs nothing to share.
//
// boats: anything moving on the water registers here each frame.
//   world.boats.set(id, { x, z, heading, speed, size })
//     heading: atan2(dx, dz) of travel (same as a group's rotation.y when its
//              nose points along local +z); speed in units/second (0 = moored);
//     size: rough hull length. Delete the entry when the boat leaves.
//   The water draws a V-shaped wake behind each one and fish dart away.
//
// glow: extra spots that make the night water sparkle (a fishing line, a
// jet ski, the glass-bottom boat). world.glow.set(id, { x, z, strength })
//
// sound: a tiny shared WebAudio context, created on the first user tap.
export const world = {
  boats: new Map(),
  glow: new Map(),
};

let ctx = null;
export function audioCtx() {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}
