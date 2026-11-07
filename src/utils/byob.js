// BYOB (Boss Your Own Bots): the store where every bot on the island can be
// picked up for your own business. Bot cards and treasure-chest tips link here.

export const BYOB_STORE = 'https://bossyourownbots.com/store';

// Link to one bot in the store. A query string lands on the store page even
// if a bot doesn't have its own page yet.
export function byobBotUrl(botOrId) {
  const id = typeof botOrId === 'string' ? botOrId : botOrId?.id;
  return id ? `${BYOB_STORE}?bot=${encodeURIComponent(id)}` : BYOB_STORE;
}

// What each bot does and roughly how much time it gives back. Used for the
// treasure-chest tips and anywhere a short pitch fits. Plain, friendly copy.
export const BOT_PITCH = {
  chief: { does: 'runs your week: plans the priorities, assigns the crew and checks the work', saves: 'about 45 minutes every morning' },
  spin: { does: 'turns one idea into a finished carousel for every channel', saves: 'about an hour per carousel' },
  caption: { does: 'writes on-brand captions for every post, in your voice', saves: 'about 10 minutes per post' },
  slide: { does: 'builds the weekly show carousel from your notes', saves: 'about 90 minutes a week' },
  poster: { does: 'schedules every post at the right time on the right channel', saves: 'about 30 minutes a day' },
  cue: { does: 'produces your show: rundowns, guests and reminders', saves: 'about 2 hours per episode' },
  echo: { does: 'replies to comments and sums up what your audience liked', saves: 'about 25 minutes a day' },
  download: { does: 'drafts your local newsletter from the week\'s news', saves: 'about 3 hours per issue' },
  stamp: { does: 'turns the monthly market numbers into a clean stats report', saves: 'about 2 hours a month' },
  'scout-local': { does: 'scans local news every morning and flags what matters', saves: 'about 20 minutes a day' },
  vibe: { does: 'researches what is happening around town for fresh content ideas', saves: 'about an hour a week' },
  desk: { does: 'sorts your website inbox and drafts the replies', saves: 'about 15 minutes a day' },
  lead: { does: 'logs every new prospect and starts the follow-up', saves: 'about 10 minutes per lead' },
  tour: { does: 'books showings and sends the confirmations', saves: 'about 20 minutes per showing day' },
  board: { does: 'keeps live deals on one board and drafts the weekly client updates', saves: 'about 2 hours every Tuesday' },
  scoop: { does: 'pulls comps and property intel in one tidy brief', saves: 'about 45 minutes per property' },
  dottie: { does: 'reviews offers line by line and flags anything odd', saves: 'about 30 minutes per offer' },
  tracy: { does: 'tracks every deadline from mutual acceptance to closing', saves: 'about an hour per transaction' },
  jet: { does: 'keeps past clients warm with thoughtful touchpoints', saves: 'about an hour a week' },
  trace: { does: 'logs people updates from your texts and email', saves: 'about 15 minutes a day' },
  scout: { does: 'keeps your people and business files up to date', saves: 'about 30 minutes a day' },
  nudge: { does: 'picks one smart networking ping or intro every day', saves: 'about 10 minutes a day (and a lot of guilt)' },
  benji: { does: 'checks the money plan and flags what needs a look', saves: 'about an hour a month' },
  launch: { does: 'gets products over the finish line with checklists and follow-through', saves: 'about 2 hours per launch' },
  flo: { does: 'handles home and family reminders so nothing slips', saves: 'about 15 minutes a day' },
  recon: { does: 'writes a daily learning brief on what is new in your field', saves: 'about 30 minutes a day' },
  brobot: { does: 'writes deep research briefs on demand', saves: 'about 3 hours per brief' },
  nasty: { does: 'runs your fantasy football team like a ruthless GM', saves: 'about 2 hours a week (in-season)' },
};
