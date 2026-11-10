import { DOCK, SITES, ZONES } from '../../utils/paths.js';

// Hand-checked spots for the arrivals (see Arrivals.jsx). Each stop is
// { zone, at: [x, z], via?: [...] } for route.js, plus what to look at.

// The welcome gate: arrivals stop on the island side of the arch, facing
// south (toward the default camera), and the greeter steps in front of them.
const ARCH_X = DOCK.x1 + 1.05;
export const MEET = { x: ARCH_X + 1.25, z: 4.95 };
export const GREET_AT = { x: MEET.x, z: MEET.z + 0.62 }; // greeter, facing north
export const GREETER_HOME = { x: -13.25, z: 6.3, heading: -0.75 }; // on the welcome lawn

// Water taxi: berths nose-in on the north side of Launch's Pier.
export const TAXI_X = -20.5;
export const PIER_LINE = DOCK.z0 + 0.5; // walking line along the pier's north half
// Hop off the bow onto the pier, then walk to the arch and the gate.
export const FROM_TAXI = [
  [TAXI_X, DOCK.z0 + 0.3],
  [TAXI_X + 0.4, PIER_LINE],
  [DOCK.x1 - 0.6, PIER_LINE],
  [DOCK.x1 + 0.4, 5.15],
  [MEET.x, MEET.z],
];

// The island-hopper's door (Airstrip.jsx parks it on the apron, nose south).
const R = SITES.runway;
export const PLANE_DOOR = { x: R.x - R.hx + 2.1 - 0.62, z: R.z - 0.45 };

// The tourist's sights, visited in a loop.
const VC = SITES.visitor;
export const SIGHTS = [
  { key: 'visitor', zone: 'dock', at: [-13.85, 1.85], look: [VC.x, VC.z], pose: 'photo' },
  { key: 'whiteboard', zone: 'tower', at: [-0.95, 5.05], look: [SITES.whiteboard.x, SITES.whiteboard.z], pose: 'read' },
  { key: 'dj', zone: 'tikihut', via: [[4.7, 6.3], [5.0, 8.3], [4.7, 9.5], [4.15, 10.5]], at: [3.7, 11.6], look: [6.8, 11.3], pose: 'dance', day: true },
  { key: 'pier', zone: 'dock', via: [[DOCK.x1 - 0.6, PIER_LINE], [DOCK.x0 + 2.2, PIER_LINE]], at: [DOCK.x0 + 1.8, 5.2], look: [DOCK.x0 - 6, 5.0], pose: 'photo' },
];
// From the gate to the first sight.
export const GATE_STOP = { zone: 'dock', at: [MEET.x, MEET.z] };

// Recruits: where each team meets its new member (a step in from the end
// of the zone's sand path) and the team's zone.
export const TEAM_STOPS = {
  content: { zone: 'cabana', at: [-6.75, -2.75] },
  realestate: { zone: 'lanai', at: [14.75, 1.85] },
  networking: { zone: 'tikihut', at: [2.95, 5.6] },
  money: { zone: 'moneydesk', at: [-10.45, 2.3] },
  research: { zone: 'lookout', at: [7.95, -6.35] },
};
export const teamZone = (team) => ZONES[TEAM_STOPS[team]?.zone];
