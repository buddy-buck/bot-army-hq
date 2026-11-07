import { botHash } from './paths.js';
import { dayKeyPT } from './time.js';

// Bot of the Day: one team bot per Pacific-time day gets a crown and a glow,
// and the Visitor Center board shows its stats. Picked by hashing the day,
// so everybody sees the same winner all day and it changes at midnight PT.
// Claude (a guest) is never picked. Returns the bot object or null.
export function botOfTheDay(bots, now = Date.now()) {
  const list = (bots || []).filter((b) => b && b.id !== 'claude').slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!list.length) return null;
  return list[botHash(`botd-${dayKeyPT(now)}`) % list.length];
}

export function botOfTheDayId(bots, now = Date.now()) {
  return botOfTheDay(bots, now)?.id ?? null;
}
