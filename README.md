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
| Guest Desk | Tower base | Claude (visiting) |

How it behaves:

- **Camera** turns slowly (one full turn every 3 minutes). It pauses while you touch it and starts again after 10 seconds. Drag to rotate, pinch or scroll to zoom. Tap a zone's name tag, or double-tap the ground, to fly there. The round target button recenters.
- **Tap a bot** to see its card: avatar, name, team, job, last action, and an Open button (or "No link yet").
- **Handoffs** from the last 24 hours replay on a loop. The sender walks a glowing package down the sand path to the receiver, then walks home. Only one or two walk at a time. The bottom-left note says who's walking and what they're carrying.
- **Sky** follows the time in Duvall (America/Los_Angeles): sunrise 5 to 7 AM, day 7 AM to 5 PM, golden hour 5 to 7 PM, night 7 PM to 5 AM. At night, sleeping bots move to hammocks and working bots get lanterns.
- **Ticker** shows `total + perHourRate × hours since asOf`. The extra is capped at one week, and the number never goes down.
- **Radar** (bottom right): Chief is the planet, teams ride the rings. Tap a ring or dot to fly to that team.
- **Sound** is off by default. The speaker button plays a soft ocean and breeze sound, generated in the browser (no audio files).
- **Reduced motion**: if the phone or computer has "Reduce Motion" turned on, you get a still top-down view with all the same data, plus a "Recent handoffs" list.
- **Data refresh**: `data.json` is re-fetched every 5 minutes. The ticker pulses on refresh, and any bot whose last action changed gets a ripple at its feet.

## Swap in real data

Replace `public/data.json` (or have your pipeline overwrite `dist/data.json` after a build, or upload a new one with each deploy). The shape:

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
  ]
}
```

Rules:

- `_example: true` shows a yellow **EXAMPLE DATA** tag. Set it to `false` (or remove it) for real data.
- `status` must be `working`, `idle`, or `sleeping`. The island never guesses. Anything else shows as idle.
- `zone` must be one of: `tower`, `cabana`, `lanai`, `tikihut`, `moneydesk`, `dock`, `bungalow`, `lookout`, `beachchair`, `guestdesk`. Unknown zones get a spot near the tower.
- `team` values used by the labels and radar: `leadership`, `content`, `realestate`, `networking`, `money`, `product`, `home`, `research`, `fun`, `guest`.
- `lastAction.url` can be an empty string. The card then shows "No link yet".
- `handoffs`: everything within 24 hours of the newest handoff replays. Handoffs naming a bot that isn't in `bots` are skipped.
- Timestamps should include a timezone offset (like `-08:00`).

### Avatars

Put square images at `public/avatars/<id>.png`, for example `public/avatars/spin.png`. Around 256×256 is plenty. Any bot without an image shows a colored circle with its first initial. To use a different path or host, set `avatarUrl` on that bot in `data.json`.

## Deploy to Vercel

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
public/avatars/            drop <id>.png files here
src/main.jsx               React entry
src/App.jsx                scene, camera rig, HUD layout
src/components/Island.jsx  terrain, water, foam, sand paths, palms, all buildings, zone tags
src/components/Bot.jsx     bot mesh, poses, hammock, lantern, name tag
src/components/Handoff.jsx handoff schedule, walking couriers, glowing orbs with trails
src/components/Sky.jsx     sky dome, sun/moon, stars, clouds, lights, fog
src/components/Ticker.jsx  minutes-saved banner
src/components/Radar.jsx   Saturn minimap
src/components/BotCard.jsx tap-a-bot card
src/components/UI.jsx      example tag, clock, sound, recenter, handoff note
src/hooks/useData.js       fetch + 5-minute refresh + change detection
src/hooks/useSunPosition.js Duvall time → sky palette and sun direction
src/utils/paths.js         terrain height, zones, bot slots, bezier walking routes
src/utils/ticker.js        minutes-saved math, time formatting
src/styles.css             light UI panels, big readable type
```

Performance notes: palms, flowers, rocks and trails are instanced; pixel ratio is capped at 2; rendering stops when the tab is hidden.
