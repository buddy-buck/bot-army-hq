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
| `?safe=1` | Public-safe view: hides client names, family details and private links (see below) |

Note: if npm prints a warning that esbuild's install script was skipped, the build still works. If `npm run dev` ever fails because esbuild is missing, run `npm rebuild esbuild`.

## What's on the island

| Zone | Where | Who |
|---|---|---|
| Chief's Tower | Center hill | Chief |
| Content Cabana | North-west | Spin, Caption, Slide, Poster, Cue, Echo, Download, Stamp, Scout-Local, Vibe, Desk |
| Real Estate Lanai | East, deck over water | Lead, Tour, Board, Scoop, Dottie, Tracy, Jet |
| Networking Tiki Hut | South, in the palms | Trace, Scout, Nudge |
| Money Desk | Between dock and cabana | Benji |
| Launch Dock | West | Launch |
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
- **Team activity** (bottom left) lists the newest actions from the last 24 hours, newest first, with "3 min ago" style times. A line with a link opens it in a new tab; a line without one isn't clickable. If nothing happened in 24 hours, it says the team is chilling.
- **Handoffs** only play what's in `data.json`. On page load, handoffs from the last 24 hours play once as a recap. After that, only new handoffs (from a data refresh) play. Nothing loops.
- **Sky** follows the time in Duvall (America/Los_Angeles). At night there's a buck constellation low in the sky to the north-west. Tilt the view toward the horizon to find it, then tap it.
- **Ticker** shows `total + perHourRate × hours since asOf`. The extra stops growing after one week without new data, and the number never goes down. Tap the ticker for a short note on what it counts.
- **Radar** (bottom right): Chief is the planet, teams ride the rings. Tap a ring or dot to fly to that team.
- **Sound** is off by default. The speaker button plays a soft ocean and breeze sound, generated in the browser (no audio files).
- **Reduced motion**: if the phone or computer has "Reduce Motion" turned on, you get a still top-down view with all the same data, plus a "Recent handoffs" list.
- **Data refresh**: `data.json` is re-fetched every 5 minutes. The ticker pulses on refresh, and any bot whose last action changed gets a ripple at its feet.

## Public-safe mode (`?safe=1`)

Use this link before sharing screenshots or a screen recording anywhere public (for example on X). In safe mode:

- Real estate, networking, home and money bots show a generic line instead of their real action, like "Drafted a client update" instead of "Started the Tuesday update for the Maplewood listing". To control the exact wording, add `lastAction.publicText` in `data.json`.
- Other bots keep their text, with names that look like clients ("the Maplewood listing"), street addresses, family names (Eve, Parker, Penny), emails and phone numbers swapped for generic words.
- Links to Gmail, Google Docs/Drive/Sheets/Calendar, Supabase and local addresses are hidden, along with every link from the sensitive teams. The card says "Link hidden in public view".
- A small "Public view" note shows at the top.

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
  "minutesSaved": { "total": 10459, "asOf": "2026-11-02T16:00:00-08:00", "perHourRate": 31.1 },
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
- `minutesSaved.trackedSince` (optional, like `"2026-09-01"`) adds "Based on tracked tasks since Sep 1, 2026." to the ticker note.
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
src/components/Feed.jsx    team activity feed
src/components/Roster.jsx  "Find a bot" panel
src/components/Handoff.jsx handoff schedule, walking couriers, glowing orbs with trails
src/components/Sky.jsx     sky dome, sun/moon, stars, buck constellation, clouds, lights, fog
src/components/Ticker.jsx  minutes-saved banner
src/components/Radar.jsx   Saturn minimap
src/components/BotCard.jsx tap-a-bot card
src/components/UI.jsx      demo note, clock, buttons, sound, toast
src/hooks/useData.js       fetch + 5-minute refresh + change detection
src/hooks/useSunPosition.js Duvall time → sky palette and sun direction
src/utils/paths.js         terrain height, zones, bot slots, bezier walking routes
src/utils/ticker.js        minutes-saved math, time formatting
src/utils/safe.js          public-safe mode
src/styles.css             light UI panels, big readable type
```

Performance notes: palms, flowers, rocks and trails are instanced; pixel ratio is capped at 2; rendering stops when the tab is hidden.
