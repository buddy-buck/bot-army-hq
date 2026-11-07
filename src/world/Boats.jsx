import BoatCam, { boatCamId } from './boats/BoatCam.jsx';
import Sailboat from './boats/Sailboat.jsx';
import TourBoat from './boats/TourBoat.jsx';
import Tugboat from './boats/Tugboat.jsx';

// Boats on the water: two sloops out on the sail lane, the glass-bottom tour
// boat on its loop, and the tug that brings crates of prompts to Launch's
// Pier every few minutes. Each boat registers in world.boats so the water
// draws its wake. (Echo's jet ski lives in wild/Surfer.jsx.)
// Props (see App.jsx): { ctx } with sky, animate, lowPower, bots, sceneBots,
// layout, bedtime, reduced, onNote, onToast.
const CAM = boatCamId();

export default function Boats({ ctx }) {
  return (
    <>
      {CAM && <BoatCam id={CAM} />}
      <Sailboat id="sail-a" ctx={ctx} laneScale={1.06} dir={1} speed={1.6} phase={3.9} />
      {!ctx.lowPower && (
        <Sailboat id="sail-b" ctx={ctx} laneScale={0.97} dir={-1} speed={1.15} phase={0.8} scale={0.72} hull="#ff8a5c" stripe="#fdf8ee" jib="#bfe3ff" />
      )}
      <TourBoat ctx={ctx} />
      <Tugboat ctx={ctx} />
    </>
  );
}
