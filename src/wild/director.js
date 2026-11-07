// Shared rules for the "wild" extras.
//
// Travel: only one travel animation plays at a time (a delivery drone,
// Buddy's seaplane, Echo surfing). Each one asks for the
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

// True while Claude is walking between the tower and a work zone.
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
  claude: params.get('claude') === 'test',
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

// ---------------------------------------------------------------------------
// Bot Island HQ upgrade: more shared slots and test switches.
//
// Slots: one thing at a time per slot, same rules as the travel slot above.
//   'travel' : aircraft and fast runs (seaplane, drone, jet ski, helicopter,
//              the airstrip plane). Use claimTravel/releaseTravel.
//   'sky'    : big sky shows (fireworks, UFO, northern lights, shooting star
//              showers) so two never overlap.
//   'rare'   : rare easter eggs (whale breach, UFO) so rarities stay rare.
//   'antic'  : bot antics that grab attention (a trip-and-help, a selfie)
const slots = new Map();
export function claimSlot(slot, owner, seconds) {
  const t = now();
  const s = slots.get(slot);
  if (s && s.owner !== owner && t < s.until) return false;
  slots.set(slot, { owner, until: t + seconds });
  return true;
}
export function releaseSlot(slot, owner) {
  const s = slots.get(slot);
  if (s && s.owner === owner) slots.delete(slot);
}
export const slotBusy = (slot) => {
  const s = slots.get(slot);
  return !!s && now() < s.until;
};

// ?test=whale,ufo,aurora (or ?test=all) makes those extras show up right
// away and often, so they can be checked. Off unless asked for.
const testSet = new Set((params.get('test') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
export const testOn = (name) => testSet.has(name) || testSet.has('all');

// Seconds of frames actually drawn, so timed extras never play unseen in a
// hidden tab. Make one per component: const clock = aliveClock();
// then in useFrame: const t = clock.tick(delta).
export function aliveClock() {
  let t = 0;
  return {
    tick(delta) {
      t += Math.min(delta, 0.1);
      return t;
    },
    get t() {
      return t;
    },
  };
}
