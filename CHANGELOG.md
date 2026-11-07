# Changelog

## Bot Island HQ

The island grew (rx 15.6 to 18.5, rz 11.4 to 16) into a full resort. The Real Estate Lanai and Launch's Pier moved out to the new shoreline; every new landmark has a reserved spot in `src/utils/sites.js`, and palms, flowers, rocks and hammocks keep clear of them.

1. **Water.** Surf rolls up the beach and slides back; foam and ripples around stilts, rocks and moored boats; tap the water for a ripple. Night bioluminescence with glowing trails behind boats. V-shaped wakes behind every boat. Tropical fish schools that scatter from boats (one swims under Flo's glass floor), sea turtles, dolphin pairs.
2. **Boats.** Echo's surfboard became a jet ski with spray. Two sailboats that really tack, a glass-bottom tour boat with tourists, and a tugboat that delivers PROMPTS crates to Launch's Pier.
3. **Sky.** Hot air balloons, a pelican V, shooting stars and meteor showers, fireworks (9 PM, rare nights, and every round thousand minutes saved), bot-shaped clouds, rare northern lights, rainbows after passing showers, and richer sunrise and sunset palettes with a new sky dome.
4. **Buildings.** Lighthouse with a sweeping beam and a foghorn on tap, a "Welcome to Bot Island HQ" arch at the pier, a lifeguard watchtower, an airstrip with a plane that takes off and lands, a helipad and helicopter on Chief's Tower, and a Visitor Center with a live bot counter.
5. **Flo's overwater bungalow**, Maldives style, with a boardwalk, plunge pool and a glass floor over the lagoon.
6. **Island life.** Tiki bar with bots on stools, food truck with a line, napping bot in a hammock, volleyball, DJ booth with music notes and a dance floor, waiters with trays. Campfire bots now sit on logs, spread out.
7. **Bot personality.** Team bots have arms. Chillin' bots high-five, trip and help each other up, do push-ups and take selfies; crew bots arm-wrestle, fish off the pier and build sandcastles.
8. **Easter eggs.** The treasure chest glows gold and hands out useful bot tips. Bottles drift back in with new notes. Rare whale breach, rare UFO at night, lighthouse foghorn.

Also: `?test=` switches for every extra (see the README), shared slots so rare moments never pile up, and a fix so on-demand rendering (reduced motion, idle) draws the extras as soon as they load.

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
