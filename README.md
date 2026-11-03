# Bot Army HQ: Island Edition

A calm, living 3D island where Buddy Buck's 28-bot AI team works, hands things off, and sleeps. It replaces https://buddys-bot-army.vercel.app.

- Vite + React + Three.js (`@react-three/fiber` + `@react-three/drei`)
- Static site: `npm run build` writes everything to `dist/`. No server, no secrets.
- Not indexed by search engines: `noindex` meta tag, `public/robots.txt`, and an `X-Robots-Tag` header in `vercel.json`.

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. To try it on your iPhone, use the "Network" URL Vite prints while the phone is on the same Wi-Fi.

Handy test switches (add to the URL):

| URL | What it does |
|---|---|
| `?hour=21` | Pretend it's 9 PM in Duvall (night sky, hammocks, lanterns). Any value 0 to 24 works. |
| `?hour=6` / `?hour=18` | Sunrise / golden hour |
| `?reduced=1` | Force the reduced-motion view (flat top-down, no animation) |
| `?safe=0` | Turns off public-safe view for testing. Safe view is ON by default (see below) |
| `?demo=1` / `?demo=0` | Switch to Demo / Live data (remembered in localStorage as `bah-data-mode`) |
| `?kiosk=1` / `?kiosk=0` | Turn kiosk mode on / off (remembered as `bah-kiosk`) |
| `?lite=1` | Low-power look: fewer fish and fireflies, no night shimmer on the water |
| `?refresh=20` | Local dev only: refresh data every 20 seconds instead of 5 minutes |

Note: if npm prints a warning that esbuild's install script was skipped, the build still works. If `npm run dev` ever fails because esbuild is missing, run `npm rebuild esbuild`.

## What's on the island

| Zone | Where | Who |
|---|---|---|
| Chief's Tower | Center hill | Chief |
| Content Cabana | North-west | Spin, Caption, Slide, Poster, Cue, Echo, Download, Stamp, Scout-Local, Vibe, Desk |
| Real Estate Lanai | East, deck over water | Lead, Tour, Board, Scoop, Dottie, Tracy, Jet |
| Networking Tiki Hut | South, in the palms | Trace, Scout, Nudge |
| Money Desk | Between dock and cabana | Benji |
| Launch's Pier | West | Launch |
| Flo's Bungalow | Behind the tower, screened by palms | Flo |
| Research Lookout | Next to the tower | Recon, Brobot |
| Nasty's Chair | On the sand | Nasty |
| Guest Bungalow | Near the tower | Claude (visiting, with a lei and a mai tai) |

How it behaves:

- **Camera** frames the whole island in the open space between the top and bottom panels, on any screen. Phones start looking along the island's long side so it fills the tall screen. It turns slowly (one full turn every 3 minutes) and keeps the island in frame as it turns. It pauses while you touch it and starts again after 10 seconds. Drag to rotate, pinch or scroll to zoom. Tap a zone's name tag, or double-tap the ground, to fly there. The target button recenters.
- **Name tags**: at the normal zoom, a bot's name shows when you hover it, tap it, or when it's walking a handoff. Zoom in close and every name shows. Zoom far out and they hide. Tags that would overlap a nearer one stay hidden, so they never pile up.
- **Find a bot** (people button, top right) lists every bot by zone. Tap a name and the camera flies to that bot.
- **Tap a bot** to see its card: avatar, name, team, job, last action, and an Open button (or "No link yet").
- **Status** comes from `data.json`: working bots stand at their station with a tablet (and a lantern at night). Idle bots relax with a mai tai, margarita or coconut drink, some in hammocks. Sleeping bots are in hammocks with zzz's. When a status changes, the bot puts its drink down and walks to its new spot. Nasty always has a coconut.
- **Activity** (slim chip, bottom left) shows a one-line summary. Tap it for a drawer (a side drawer on desktop and iPad landscape, a bottom sheet in portrait) with three tabs:
  - **Past**: real feed entries plus `minutesSaved.recent` entries from the last 24 hours, with the PT time, the bot's name and color, "12 min ago" and a "+N min" badge when minutes were logged. A ledger entry that matches a feed line (same bot, within 2 minutes) adds its badge to that line instead of showing twice. Lines with a link open it in a new tab. Nothing recent says "All quiet. The team is chillin'."
  - **Now**: every bot whose status is `working`. Tap one to fly to it.
  - **Next**: upcoming runs from the optional `nextUp` array, soonest first, with a live countdown ("in 2h 14m"). Tap to fly to the bot. When a run hits T-0 the bot gets a spotlight and a toast. Empty says "Nothing scheduled".
- **Handoffs** only play what's in `data.json`. On page load, handoffs from the last 24 hours play once as a recap. After that, only new handoffs (from a data refresh) play. Nothing loops.
- **Sky** follows the time in Duvall (America/Los_Angeles). At night there's a buck constellation low in the sky to the north-west. Tilt the view toward the horizon to find it, then tap it.
- **Scoreboard** ("Buddy's minutes saved", top center) is a compact chip, at most 8% of the screen height. In Live mode it shows `minutesSaved.total` exactly as the data says (or `ledgerTotal + live` if `total` is missing). When a refresh brings a higher number, the digits roll up like an odometer, and each new `minutesSaved.recent` entry floats a "+18 min" chip from the bot that earned it while that bot does a little cheer. Crossing a round thousand fires confetti from Chief's Tower and a "Buck yeah!" toast. Tap the chip for a drawer: today, this week, all time, top bot this week, a 7-day sparkline (when `daily` is present) and the latest gains. Figures the data doesn't send show "Not reported" or are left out. In Demo mode a working bot earns a few sample minutes every minute or so, so all of this can be seen.
- **Radar** (bottom right, drawn in SVG so the island is the only WebGL context): Chief is the planet, teams ride the rings. Tap it for a bigger card with each ring labeled by team and how many of its bots are working. Tap a ring, a label or a row to fly to that team.
- **Clock** reads like "Tue Nov 3, 1:07 PM PT" with a sun or moon.
- **Kiosk mode** (screen button, or `?kiosk=1`): keeps the screen awake with the Screen Wake Lock API where the browser supports it, hides the secondary buttons, keeps the clock and scoreboard, and slowly drifts the camera tilt and the panels a few pixels so nothing burns in.
- **Sea life and the living world**: two great white shark fins circling with wakes, a blue marlin that leaps every 40 to 90 seconds with a splash, salmon hopping off Launch's Pier, fish schools in the shallows, seagulls, a sailboat on the horizon, a sea turtle that surfaces now and then, dolphins at sunrise, fireflies at night and a faint bioluminescent shimmer along the shore. All purely decorative.
- **Drinks**: chillin' bots hold big mai tais, margaritas and coconuts. Two chillin' bots standing together clink glasses now and then, and a bot that just finished a task does a happy sip-hop. Claude keeps the lei and mai tai; Nasty keeps the coconut.
- **Sound** is off by default. The speaker button plays a soft ocean and breeze sound, generated in the browser (no audio files).
- **Reduced motion**: if the phone or computer has "Reduce Motion" turned on, you get a still top-down view with all the same data, plus a "Recent handoffs" list. Sea life, confetti and other effects are skipped; the numbers and lists all still work.
- **Battery**: pixel ratio is capped at 1.5 on touch devices. After 60 seconds with no touch the 3D view drops to about 30fps and goes back to full speed on the next touch. Waves run in a shader. Live mode has no ticking timers for the scoreboard.
- **Data refresh**: `data.json` is re-fetched every 5 minutes. The scoreboard pulses on refresh, and any bot whose last action changed gets a ripple at its feet.
- **Demo freshness**: in Demo mode every sample timestamp is slid forward so the newest lands at "now". Feed times, countdowns and the scoreboard never look stale.

## Public-safe mode (on by default)

Safe mode is on for every visit, so screenshots and screen recordings are safe to share anywhere public (for example on X). Add `?safe=0` to turn it off for testing. In safe mode:

- Real estate, networking, home and money bots show a generic line instead of their real action, like "Drafted a client update" instead of the real action text. To control the exact wording, add `lastAction.publicText` in `data.json`.
- Other bots keep their text, with names that look like clients ("the Smith listing"), street addresses, family names, emails and phone numbers swapped for generic words.
- Links to Gmail, Google Docs/Drive/Sheets/Calendar, Supabase and local addresses are hidden, along with every link from the sensitive teams. The card says "Link hidden".
- A small lock icon shows at the top. Tap or hover it for "Names hidden for sharing".
- `minutesSaved.recent[].what` and `nextUp[].job` are scrubbed the same way.

Important: safe mode only changes what the page shows. `data.json` is a public file that anyone can open, so the pipeline that writes it should leave out anything truly private.

## Swap in real data

The app reads its data from `VITE_DATA_URL` when that's set (on Vercel it's set for Preview builds only, pointing at a gist JSON that updates every 5 minutes). Without it, it falls back to `public/data.json`, which is example data with `_example: true`.

To try a different data file locally, create `.env.local` (it's git-ignored) with:

```
VITE_DATA_URL=https://example.com/your-data.json
```

The shape:

```json
{
  "_example": false,
  "updatedAt": "2026-11-02T16:00:00-08:00",
  "minutesSaved": {
    "total": 10459, "asOf": "2026-11-02T16:00:00-08:00", "perHourRate": 31.1,
    "today": 212, "ledgerTotal": 10422, "live": 37, "liveEntries": 2, "week": 1418,
    "recent": [{ "at": "2026-11-02T15:40:00-08:00", "bot": "chief", "minutes": 18, "what": "Set this week's priorities" }],
    "daily": [{ "date": "2026-11-02", "minutes": 212 }]
  },
  "nextUp": [{ "bot": "recon", "job": "Evening event scan", "at": "2026-11-02T18:00:00-08:00" }],
  "bots": [
    {
      "id": "spin",
      "name": "Spin",
      "pronoun": "she",
      "team": "content",
      "zone": "cabana",
      "color": "#F3B624",
      "job": "LISN and DTV carousels",
      "status": "working",
      "lastAction": { "text": "Drafted LISN carousel", "url": "https://...", "at": "2026-11-02T08:10:00-08:00" },
      "avatarUrl": "/avatars/spin.png"
    }
  ],
  "handoffs": [
    { "from": "spin", "to": "caption", "at": "2026-11-02T08:10:00-08:00", "what": "Council recap carousel" }
  ],
  "feed": [
    { "bot": "spin", "to": "caption", "text": "Drafted LISN carousel", "url": "https://...", "at": "2026-11-02T08:10:00-08:00" }
  ]
}
```

Rules:

- `_example: true` shows a small "Demo mode: sample data" note. Set it to `false` (or remove it) for real data, and the note goes away.
- `status` must be `working`, `idle`, or `sleeping`. The island never guesses. Anything else shows as idle.
- `zone` must be one of: `tower`, `cabana`, `lanai`, `tikihut`, `moneydesk`, `dock`, `bungalow`, `lookout`, `beachchair`, `guestdesk`. Unknown zones get a spot near the tower.
- `team` values used by the labels and radar: `leadership`, `content`, `realestate`, `networking`, `money`, `product`, `home`, `research`, `fun`, `guest`.
- `lastAction.url` can be an empty string. The card then shows "No link yet" and the feed line isn't clickable.
- `lastAction.publicText` (optional) is the wording to use in public-safe mode.
- `note` (optional) is a short italic line on the bot's card. Claude's says "Launch and Chief drop by."
- `minutesSaved.trackedSince` (optional, like `"2026-09-01"`) adds "Tracked since Sep 1, 2026." to the scoreboard drawer.
- Every field below is optional. Today's data works without any of them.
  - `minutesSaved.total` is the headline and "All time" number. It already includes live minutes (`total = ledgerTotal + live`).
  - `minutesSaved.ledgerTotal` and `minutesSaved.live`: folded minutes and the unfolded minutes since the last fold. They're only used to rebuild the total when `total` is missing. `live` alone is never shown as the headline. `liveEntries` is accepted and ignored for now.
  - `minutesSaved.today`, `minutesSaved.week`: shown in the drawer. Without `week`, the drawer adds up `daily` when it has entries.
  - `minutesSaved.recent`: `[{ at, bot, minutes, what }]`. New entries between refreshes float "+N min" chips. Also used for "Top bot this week" and a bot's "Saved today" on its card.
  - `minutesSaved.daily`: `[{ date: "YYYY-MM-DD", minutes }]` for the 7-day sparkline.
  - `nextUp`: `[{ bot, job, at }]` for the Next tab, countdowns, T-0 spotlights and "Next run" on the bot card.
  - `bots[].minutesToday`: overrides the card's "Saved today".
- `pronoun`: `he` or `she` (or `he/him`, `she/her`). Cards show "he/him" or "she/her". If it's missing, Chief, Brobot, Board, Recon, Nasty, Benji and Jet are he/him and everyone else is she/her.
- `handoffs`: each handoff from the last 24 hours plays once. Handoffs naming a bot that isn't in `bots` are skipped. An empty list is fine: nobody walks.
- `feed`: the Team activity lines, newest first, at most 40. `to` is optional. Entries from the last 24 hours show. Lines with a `url` are clickable; lines without one aren't.
- Real data can be sparse. A bot with `"lastAction": { "text": "", "url": "", "at": null }` and `"status": "idle"` just relaxes with a drink, and its card says "Nothing logged yet" and "No link yet". The island never makes up activity when `_example` is false.
- If a bot's `zone` is missing or unknown, the bot goes to its usual spot (by id), so the island still looks right.
- Bot ids: chief, spin, caption, slide, poster, cue, echo, download, stamp, scout-local, vibe, desk, lead, tour, board, scoop, dottie, tracy, jet, trace, scout, nudge, benji, launch, flo, recon, brobot, nasty, claude. Claude lives in the `guestdesk` zone (the guest bungalow).
- Timestamps should include a timezone offset (like `-08:00`).

### Avatars

Put square images at `public/avatars/<id>.png`, for example `public/avatars/spin.png`. Around 256×256 is plenty. Any bot without an image shows a colored circle with its first initial. To use a different path or host, set `avatarUrl` on that bot in `data.json`.

## Deploy to Vercel

Every push to `main` deploys to production at bot-army-hq.vercel.app, which is public. Do work on a branch and open a pull request; Vercel builds a Preview for each branch (with the live `VITE_DATA_URL`).

Option A: import the repo
1. Push this folder to a GitHub repo.
2. In Vercel, choose **Add New → Project** and import the repo.
3. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
4. Deploy. To replace the old site, point the `buddys-bot-army` project (or its domain) at this repo.

Option B: from your computer

```bash
npm i -g vercel
```

```bash
vercel --prod
```

`vercel.json` already sets the build command, the `dist` output folder, the noindex header, and no-cache on `data.json` so refreshes show up right away.

## Project layout

```
index.html                 noindex meta, app shell
public/robots.txt          Disallow: /
public/data.json           sample data (28 bots + Claude, 10 handoffs)
outputs/                   screenshots
public/avatars/            drop <id>.png files here
src/main.jsx               React entry
src/App.jsx                scene, camera rig, HUD layout
src/components/Island.jsx  terrain, water, foam, sand paths, palms, all buildings, guest bungalow, zone tags
src/components/Bot.jsx     bot mesh, poses, drinks, lei, hammock, lantern, name tag
src/components/labels.js   which name tags show (zoom, hover, no overlaps)
src/components/Feed.jsx    activity drawer: Past / Now / Next
src/components/Roster.jsx  "Find a bot" panel
src/components/Handoff.jsx handoff schedule, walking couriers, glowing orbs with trails
src/components/Sky.jsx     sky dome, sun/moon, stars, buck constellation, clouds, lights, fog
src/components/Scoreboard.jsx compact minutes-saved chip, odometer, drawer
src/components/SeaLife.jsx sharks, marlin, salmon, fish, gulls, sailboat, turtle, dolphins, fireflies
src/components/Radar.jsx   Saturn minimap
src/components/BotCard.jsx tap-a-bot card
src/components/UI.jsx      demo note, clock, buttons, sound, toast
src/hooks/useData.js       fetch + 5-minute refresh + change detection
src/hooks/useSunPosition.js Duvall time → sky palette and sun direction
src/utils/paths.js         terrain height, zones, bot slots, bezier walking routes
src/utils/ticker.js        number and date formatting
src/utils/time.js          Pacific time clock, countdowns
src/utils/safe.js          public-safe mode
src/styles.css             light UI panels, big readable type
```

Performance notes: one WebGL context (the island; the radar is SVG); three.js, the React 3D layer and React are split into their own cached chunks, and sea life loads lazily; palms, flowers, rocks, fish and trails are instanced; waves run in a vertex shader; pixel ratio is capped at 2 (1.5 on touch devices); the view drops to about 30fps after a minute without input; rendering stops when the tab is hidden.
