// Shared rules for the "wild" extras.
//
// Travel: only one travel animation plays at a time (Claude's speedboat,
// a delivery drone, Buddy's seaplane, Echo surfing). Each one asks for the
// slot before it starts and gives it back when it's done; if the slot is
// taken it simply waits and asks again.

const now = () => performance.now() / 1000;

const travel = { owner: null, until: 0 };

// Ask for the travel slot for up to `seconds`. Returns true if granted.
export function claimTravel(owner, seconds) {
  const t = now();
  if (travel.owner && travel.owner !== owner && t < travel.until) return false;
  travel.owner = owner;
  travel.until = t + seconds;
  return true;
}

export function releaseTravel(owner) {
  if (travel.owner === owner) {
    travel.owner = null;
    travel.until = 0;
  }
}

// True while Claude's speedboat trip is moving Claude around.
export const claudeTrip = { active: false };

export const travelBusy = () => !!travel.owner && now() < travel.until;

// Night on the island: from 9 PM to 6 AM Duvall time, idle bots sleep in
// hammocks and working bots gather at the campfire.
export const NIGHT_START = 21;
export const NIGHT_END = 6;
export const isIslandNight = (hour) => hour >= NIGHT_START || hour < NIGHT_END;

// URL test switches (off unless asked for, never on the public island).
const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
export const TEST = {
  weather: params.get('weather') === 'test',
  boat: params.get('boat') === 'test',
  plane: params.get('plane') === 'test',
  surf: params.get('surf') === 'test',
};

// Storage that never throws (private windows, blocked site data).
export function readStore(kind, key) {
  try {
    return window[kind].getItem(key);
  } catch {
    return undefined; // unknown: treat as "can't tell"
  }
}
export function writeStore(kind, key, value) {
  try {
    window[kind].setItem(key, value);
  } catch {
    // blocked: nothing to do
  }
}
