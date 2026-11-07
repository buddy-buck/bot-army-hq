# Changelog

## Island Mega Upgrade

The island grew (north and south) and filled up. Everything below is low-poly, matches the existing bot style, and only plays while the island is on screen. `?rare=test` makes the rare sights come around every 20 to 40 seconds so they can be checked.

**Water and ocean**
1. **Real waves.** Gerstner waves (they roll sideways as well as up and down): calm in the lagoon, choppier offshore with faint whitecaps.
2. **Foam on the beach.** Waves wash up the sand with a ragged white edge, leave wet sand and slide back, at different times along the coast.
3. **Bioluminescence.** At night the shoreline glows cyan, and the water lights up around bots out over the water, around moving boats and in their wakes.
4. **Ripples.** Expanding rings with a bright crest that ride the waves (turtles, fish, the fishing bot's catch).
5. **V-shaped wakes** behind every boat (and the shark fins), bending through turns.
6. **Fish schools dart away** when a boat or shark gets close, then regroup.
7. **Sea turtles** (two) surface, poke their heads up to breathe and dive again.
8. **Dolphins** leap in pairs far out, in sync, during the day.
9. **Whale.** About every 10 minutes in daylight a humpback breaches near the horizon, crashes down, blows and dives with its flukes up.

**Boats**
10. **Jet ski.** Echo's surfboard is now a jet ski with a rooster-tail spray, carving S-turns behind the island every 3 to 5 minutes.
11. **Sailboat** circling far out with a bot lounging on deck, reading a tablet.
12. **Glass-bottom tour boat** with tourists, a guide pointing things out, and fish swimming under the glass.
13. **Tugboat** pulling a barge of "PROMPTS" crates to Launch's Pier every few minutes, smoke puffing.

**Sky and atmosphere**
14. **Hot air balloons** with a bot-face logo and a waving passenger.
15. **Pelicans** fly over in a V.
16. **Shooting stars** at night, and a **fireworks** show every few minutes after dark (some bursts make a bot face).
17. **Bot cloud.** Now and then a cloud turns into a bot, waves, and drifts apart.
18. **Northern lights** (rare, at night) and a **UFO** (rare, at night, with a tractor beam).
19. **Rainbows** now also appear on their own after a passing shower.
20. **Sunrise and sunset** have 15 color key frames, from pre-dawn blue to blue hour, and the sky glows toward the sun at dawn and dusk.
21. Buddy's banner seaplane is unchanged.

**Buildings**
22. **Lighthouse** on the north-west point, with a sweeping beam at night. Tap it for a foghorn (made in the browser, no audio file).
23. **Launch's Pier** has a rowboat, a runabout and a catamaran tied up, and a hand-painted "Welcome to Bot Island" sign.
24. **Watchtower** on the south-east beach, with a bot scanning the horizon through binoculars.
25. **Airstrip** ("BOT AIR") on the back of the island: a prop plane lands every few minutes and new recruits climb out and walk in, waving.
26. **Helipad** on Chief's Tower. A helicopter lifts off every few minutes, circles the island and lands.
27. **Visitor Center** with a counter of bots deployed worldwide that ticks up, and greeters holding "Welcome!", "Aloha!" and "Hi there!" signs.
28. **Flo's overwater villa.** Flo's bungalow moved out over the lagoon on a boardwalk: a steep thatched roof, glass doors, a plunge pool, loungers, a ladder into the water and a glass floor with fish and coral underneath.

**Island life**
29. **Tiki bar** with stools, a bartender and regulars who clink glasses.
30. **Food truck** ("Bytes & Bites") with a line that moves up; each bot walks off with a taco or a shave ice.
31. **Hammock** between two palms with a napping bot and floating Z's.
32. **Volleyball**: two against two with serves, sets and spikes.
33. **DJ booth** by the Cabana Patio with spinning decks, pulsing speakers, lights and floating music notes.
34. **Waiters** carry trays of drinks to the patio loungers and Nasty's Chair.
35. **Campfire.** Bots spread out over three rings, sit on stumps and keep working on tablets and laptops.

**Bot personality**
36. **High fives** when two bots pass each other (with a little star burst).
37. A bot on the beach **trips**, and its friend helps it up.
38. **Arm wrestling** at a picnic table, with a spectator.
39. **Push-ups** with a rep counter, then a flex.
40. **Selfie** on the beach with a flash and a little instant photo.
41. **Fishing** off the end of Launch's Pier: now and then a fish (or a boot, or a tiny chest) comes up and goes back with a splash.
42. **Sandcastle** that grows a piece at a time through the day (saved for the day), until a wave washes it away.

**Easter eggs**
43. **Message in a bottle.** Chief's welcome still comes first. After that a bottle washes up on the south beach every so often with a note from one of the bots.
44. **Treasure chest** glows gold when it opens and now holds useful bot tips and Build Your Own Bot ("BYOB") facts.

**Under the hood**
- The island is 45% longer north to south. `SITES` in `paths.js` reserves a spot for every new landmark; palms, flowers, hammocks and campfire seats keep clear of them.
- `MiniBot` draws the extra bots with the real bots' own geometry and materials, so they look the same. Extras can't be tapped.
- `world.js` is a shared boat registry: wakes, fleeing fish and the night glow all read it.
- `StaticMerge` bakes scenery that never moves into a few draw calls (the island went from about 2,500 draw calls a frame to about 1,400). Moving parts opt out.
- Reduced motion shows a still island with all the new buildings and no moving extras. Low-power devices get fewer extras and particles.

## Island Wild Ideas

1. **Claude's commute.** When the status turns working, Claude walks from the tower to the zone the work is about (pier for builds, cabana for content, lanai for real estate) and back up when idle. (A first version used a speedboat; Claude now lives in the tower, so it walks.)
2. **Weather events.** 5-second thunderstorm over the pier (`feed[].type: "shipped"`), rainbow (`"fantasy_win"`) and double rainbow (every round thousand minutes). One at a time. `?weather=test` cycles them.
3. **Buddy flies over.** Once per session, a BB seaplane with a "Buck's Island" banner.
4. **Campfire mode.** 9 PM to 6 AM: working bots gather at a campfire with thought bubbles; everyone else sleeps (sleeping now starts at 9 PM instead of 10 PM).
5. **Message in a bottle.** First visit only; tap for a note from Chief.
6. **Treasure chest.** A new spot every day; tap for a Nasty line.
7. **Echo surfs** past the island every 3 to 5 minutes.
8. **Delivery drones** for handoffs between far-apart zones, one at a time.
9. **Buddy's dock office.** A BB houseboat at the pier; tap for the minutes drawer.
10. **Photo booth.** Tap the beach camera for a clean group shot with the UI hidden.

11. **Sun redesign.** A faceted glowing sun with soft layered glow and two rings of tapered rays. Golden hour stretches the rays and turns them orange; near sunrise and sunset the sun dips and blooms pink-orange. The moon is a faceted silver crescent. The sun fades out when you zoom in on a zone.
12. **Open-air Chief's Tower.** Bamboo legs with cross braces, a wide deck, a low rail, a see-through thatched canopy on tall posts, string lights, two chairs, a little table and a brass telescope.
13. **Claude lives in the tower** next to Chief. The guest bungalow is gone; `guestdesk` now means `tower`.
14. **Content Cabana split.** A wider cabana with six workstations inside (Spin, Caption, Poster, Cue, Download, Desk) and a beach patio with loungers and umbrellas next door (Echo, Slide, Stamp, Scout-Local, Vibe).
15. **Compact activity panel.** Opens in place under the score, at most 30% of the screen tall, about five lines visible with scroll for more; new lines slide in at the top.
16. **Buddy's cruiser.** Launch's Pier is longer and wider, with a low-poly cabin cruiser (blue hull, gold trim, flybridge) that bobs and rocks.
17. **Flo's bungalow** turns to face the water and the sunset, with a porch, Flo's chair, planters and flowers.
18. **Bigger island.** The footprint is 20% larger and every zone is spread out to match. Building and bot sizes are unchanged.

Also: one travel animation at a time (drone, plane, surfer) and one weather effect at a time. These timed extras only advance while the island is actually on screen, so nothing plays unseen in a background tab.

## Island Round 3

1. **No more blue blobs.** The far-ocean disk sat at y=-0.12 and poked through wave troughs (down to about -0.15). It now sits at y=-0.4.
2. **Sea life.** Two great white shark fins circle slowly with wakes, a blue marlin leaps every 40 to 90 seconds with splashes, salmon hop off the end of Launch's Pier, and small fish schools swim in the shallows. All low-poly.
3. **Compact scoreboard.** "Buddy's minutes saved" is now a single chip (at most 8% of screen height). Tap it for today, this week, all time, top bot this week, a 7-day sparkline and the latest gains.
4. **Real-time minutes.** A higher total rolls up like an odometer. Each new `minutesSaved.recent` entry floats a "+18 min" chip from the bot that earned it, and that bot does a little cheer.
5. **Lock icon for safe mode.** Safe mode stays on by default; a small lock says "Names hidden for sharing".
6. **Past / Now / Next.** The activity panel has three tabs: real feed entries with PT times, who's working now (tap to fly), and upcoming runs from the new optional `nextUp` array with live countdowns and a spotlight at T-0.
7. **Nasty's umbrella** has a red and white striped canopy with a navy crown and little white stars. Chair and cooler stay red.
8. **"Chillin'"** everywhere: cards, Find a bot, the activity panel and the README.
9. **Launch's Pier.** The dock has a new name everywhere.
10. **Bigger drinks.** Mai tais, margaritas and coconuts are 60% bigger. Chillin' bots standing together clink glasses, and a bot that finishes a task does a happy sip-hop.
11. **Kiosk mode** (button or `?kiosk=1`, remembered): keeps the screen awake where supported, hides secondary buttons, and drifts the camera and panels slightly to prevent burn-in.
12. **Battery.** Pixel ratio capped at 1.5 on touch devices, about 30fps after 60 seconds with no touch, waves moved into a shader, and no 250ms ticker timer.
13. **Bigger clock:** "Tue Nov 3, 1:07 PM PT" with a sun or moon.
14. **Activity starts collapsed** as a slim chip and opens to a side drawer (bottom sheet in portrait).
15. **Radar card.** Tap the radar for a bigger view with each ring labeled by team and its working count.
16. **One chip system.** Every chip and icon button is 44px tall with the same corners, border and shadow.
17. **Demo freshness.** Sample timestamps slide to "now" at load, so the demo never looks stale.
18. **Bot card** shows "he/him" or "she/her", plus "Next run" and "Saved today" when the data has them.
19. **Living world.** Seagulls, a sailboat on the horizon, a sea turtle that surfaces, dolphins at sunrise, fireflies at night and a faint bioluminescent shimmer along the shore.
20. **Celebrations.** Crossing a round thousand fires confetti from Chief's Tower and a "Buck yeah!" toast.
21. **Readability.** Muted text is #4a5363 or darker, small text is at least 16px, and every panel stays light at night.

Also: the camera glides to the new framing when an iPad rotates, reduced motion skips sea life and effects while keeping every number and list, and every tap target is at least 44px.

## Round 1

1. **Real feed.** Each bot's `lastAction` (`text`, `url`, `at`) drives the island. The looping handoff replay is gone: each real handoff from the last 24 hours plays once, and new ones play when the data refreshes. Sample data shows a small cream "Demo mode: sample data" note in place of the old EXAMPLE DATA badge. Real data shows no note.
2. **Idle bots chill.** Idle bots hold a mai tai, margarita or coconut drink. Some lie in hammocks and some hang out near their station. When a bot starts working, it puts the drink down and walks to its station. Nasty always keeps his coconut. Sleeping bots stay in hammocks with zzz's.
3. **No pill shapes.** Every rounded element now uses 4 to 6px corners: the demo note, time chip, zone tags, name tags, feed lines, buttons, ticker, cards, radar and avatars. Gold is gone from the UI and the island.
4. **Bigger bots, cleaner names.** Bots are 35% bigger. At normal zoom, a name shows only on hover, tap or while that bot is walking. Close up, every name shows. Far out, names hide. Names and zone tags that would overlap a nearer one stay hidden, so nothing piles up.
5. **Activity feed.** The bottom-left feed lists the newest actions, newest first: bot name, what they did, and "3 min ago", "2 hrs ago" or "yesterday". Lines with a link open it in a new tab. Lines without one aren't clickable.
6. **Find a bot.** A people button opens a panel listing all 29 bots by zone, each with a color dot and status. Tap a name to fly the camera to that bot.
7. **Claude's VIP guest bungalow.** The small desk became a cozy bungalow with a porch, a lei garland, glowing windows and a "Welcome Claude" sign. Claude wears a lei and holds a mai tai, and Claude's card says "Launch and Chief drop by."
8. **Buck constellation.** At night, a buck with antlers sits low in the north-west sky, drawn in faint stars and lines. Tilt toward the horizon to find it. Tapping it makes it glow and shows "Buck yeah!", "The Buck stops here." or "Oh deer, you found it."
9. **Public-safe mode.** Add `?safe=1` to hide client names, family details and private links (Gmail, Google Docs and Drive, Supabase). Real estate, networking, home and money actions become generic lines like "Drafted a client update". Optional `lastAction.publicText` sets the exact wording.
10. **Minutes-saved note.** Tapping the ticker explains what it counts. It adds "Based on tracked tasks since [date]" when `minutesSaved.trackedSince` is set, says how the count grows between updates, and flags sample numbers in demo mode.

**Data updates from Chief (folded into Round 1):**

- The data URL comes from `VITE_DATA_URL` (set on Vercel for Preview only, a gist that updates every 5 minutes), falling back to `public/data.json` (example data, `_example: true`).
- The Team activity feed now reads the top-level `feed` array (`bot`, `text`, `url`, `at`, optional `to`), newest first, at most 40. Lines with a `to` read "Caption to Poster: ...". Public-safe mode filters the feed too.
- Sparse real data looks right: idle bots with no actions relax with drinks, cards say "Nothing logged yet", and nothing is made up when `_example` is false. Empty `handoffs` means nobody walks.
- Empty URLs: no Open button, just "No link yet" in small gray text.
- Bots with a missing or unknown zone go to their usual spot by id. The bot id list in `public/data.json` matches the official 29.

**Also fixed:** camera framing. The island is centered and fully visible on load on every screen size, between the top and bottom panels. It stays in frame as the camera turns, and phones start looking along the island's long side. Palms that block a close-up view fold out of the way.
