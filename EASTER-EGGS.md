# Bot Island: Master Easter Egg Guide

Every easter egg, interaction, rare event and timed moment on the island, with where to find it and how often it happens.

**Timing rules (apply to everything below)**
- **Visible time only.** Timers only advance while the island is on screen. A hidden tab pauses them, so "every 8 minutes" means 8 minutes of looking.
- **One at a time.** Big moments take turns through shared slots:
  - **Rare slot:** whale, Bigfoot, Nessie and the UFO.
  - **Sky slot:** fireworks, aurora, meteor shower and UFO.
  - **Travel slot:** plane, seaplane, helicopter flyovers, drones, jet ski and supply-drop plane.
  - **Sea slot:** boat race.
  - **Antic slot:** the big bot antics.
- **Island time** is Duvall, WA (Pacific). Day/night and bedtime (9 PM to 6 AM) come from it. `?hour=6` (or any hour) pretends it's that time.
- **Reduced motion** (OS setting or `?reduced=1`) turns off almost everything animated. Taps that open notes still work.
- **Test switches:** `?test=name` makes an event show up within seconds and repeat. Combine them with commas, e.g. `?test=bigfoot,nessie`; `?test=all` turns on everything.

---

## Rarity ladder (rarest first)

| # | Event | How often | Test switch |
|---|---|---|---|
| 1 | **Bigfoot / Sasquatch** | Once every 20 to 30 visible minutes, day or golden hour only | `bigfoot` |
| 2 | **UFO** | About once per 15 to 20 minutes of night viewing | `ufo` |
| 3 | **Humpback whale breach** (unchanged) | Every 8 to 15 visible minutes | `whale` |
| 4 | **Loch Ness monster** | Every 8 to 14 visible minutes, not 10:30 PM to 4:30 AM | `nessie` |
| 5 | **Northern lights** | About 1 night in 4, plus small chances later | `aurora` |
| 6 | **Passing shower + rainbow** | About 1 visit in 10, then small chances every few minutes | `rainbow` |
| 7 | **Boat race** | Every 6 to 10 minutes by day | `race` |
| 8 | **Supply drop** | Every 5 to 9 minutes by day | `drop` |
| 9 | **BYOB cloud** | Every 4 to 7 minutes by day | `byob` |
| 10 | **Tide pools (low tide)** | Every 6 visible minutes, open about 2.5 minutes | `tide` |

---

## The key moment: "+X min" celebrations

- **What:** When a bot finishes a task, a big glowing gold "+7 min" pops up over it with a star burst, rises and fades (~2.9 s). The bot crouches, jumps and does a full 360° spin with squash and stretch.
  - Sitting bots at the campfire do a smaller hop-spin.
  - Bots lying down get a bounce.
  - Sleeping bots don't jump, but the number still floats.
- **Live data:**
  - Every new `minutesSaved.recent` entry fires one, 0.9 s apart.
  - On page load, up to 3 entries from the last 2 hours replay (at about 3.5 s, 6.7 s and 9.9 s).
  - A new feed line with no matching minutes gets the jump and spin only.
- **Demo data:** a random working bot every 12 to 25 s, 2 to 15 minutes each (mostly 3 to 8).
- **Overlaps:** floats never overlap each other or other bubbles (see Speech bubbles).
- **Round thousands:** crossing a round thousand minutes saved fires confetti from Chief's Tower, a "Buck yeah!" toast, a double rainbow and fireworks.

---

## Things to tap

### Bots and the HUD
| Where | What happens |
|---|---|
| **Any bot** | Bot card: job, last action, next run, minutes saved today, plus **"Learn more about [bot] in the BYOB store"** (bossyourownbots.com/store?bot=id) |
| **Camera button (top HUD)** | **Postcard mode**: the island freezes at a golden three-quarter angle, the HUD hides, and a vintage "Greetings from Bot Island" postcard appears with a BYOB stamp and today's postmark. **Share** opens the iPhone share sheet (or downloads a PNG on desktop). **Close** or Esc to exit |
| **Score (bottom left)** | Minutes-saved drawer |
| **Buck constellation** (night, low in the north-west sky) | Rotating "Buck yeah!" lines |
| **Zone tags** | Fly to that zone. Double-tap the ground to fly to the nearest zone; double-tap water to zoom out |

### Landmarks
| Where | What happens |
|---|---|
| **Money Desk** (Benji) | Piled with cash stacks, spilling bundles, gold coins, gold bars and a $ money bag. **Tap:** low three-quarter close-up, made for screenshots. Holds 12 s or until you drag |
| **Flo's glass floor** (overwater bungalow) | **Tap:** the camera looks almost straight down through the glass at the fish, coral, starfish and moving light below. Holds 12 s. Brighter at night |
| **Lighthouse** | **Tap:** foghorn, with sound rings rolling out from the lamp. On top, a **weather vane** spins with the wind: gentle gusts and now and then a fast spin (`?test=vane`) |
| **Visitor Center** | Counter shows bots on the island, working and chillin'. **Bot of the Day** board and **Guest Book** message board (testimonials) are tappable (see below) |
| **Welcome arch** (Launch's Pier) | Bigger, taller "Welcome to Bot Island HQ" arch |
| **Dock office** (Buddy's houseboat, south side of the pier) | Opens the minutes-saved drawer |
| **Photo booth** (tripod on the south beach) | Flies to a clean angle, the UI hides, every bot waves, soft flash |
| **Treasure chest** (glows gold; moves to one of 8 spots daily) | **BYOB tips**, signed "BYOB". Tips alternate: a BYOB tip, then a bot spotlight (what the bot does, how much time it saves, and a **"Get [bot] in the BYOB store"** link). Tap again for the next one. 28 tips |
| **Message in a bottle** | First visit: a welcome note from Chief (`bah-bottle-seen`). After that a bottle drifts in every 4 to 7 minutes with a note from a different bot (`?test=bottle`) |

### Island life
| Where | What happens |
|---|---|
| **Beach Beats DJ booth** (next to the tiki bar) | **Tap** to open a small floating **Spotify player** (Buddy's **Bot Island Radio** playlist; press play in the player, since browsers don't let embeds autoplay). Close it with ×, Esc or another tap on the booth. **Fallback:** if Spotify isn't available (offline, or the player hasn't loaded after 8 s), or you tap **"Island beat"** in the player, the booth plays its own lo-fi beat, generated in the browser (80 BPM, jazzy chords, vinyl crackle); tap again to stop. While music is on, the floor flashes, notes float up and the DJ bobs harder. Tapping at bedtime brings the DJ and dancers back out |
| **Byte Bites menu board** (or the rooftop sign) | Full menu note: Byte Taco, **Buck Taco** ("the house special. Buck yeah."), **Shave Ice** in six flavors (or "the Rainbow"), chips and salsa, coconut |
| **Hot air balloons** (day) | **Tap or hold the burner** for a flame burst and a whoosh. Hold to climb (up to +6 units, auto-stops after 8 s). Release and it drifts back down |
| **Launch's jet boat** (red/white/blue cigarette boat, south side of the pier) | **Tap:** it roars off for a lap around the island (~40 s) with a random toast like "zero to 60 in 'just one more feature'." 6 s cooldown. During a race it tells you to cheer from the south beach (`?test=jetboat`) |
| **BYOB cloud** (when it shows) | Toast: "BYOB: Boss Your Own Bots. bossyourownbots.com" |
| **Tide pools** (low tide) | A fun fact about starfish, crabs and anemones (11 facts, cycles; `bah-tide-fact`) |
| **Bigfoot** (if you're lucky) | "You saw Bigfoot! Nobody's going to believe you." Later sightings: "Bigfoot again?! Sighting #N" (`bah-bigfoot-sightings`) |
| **Nessie** | "Nessie's on vacation. Don't tell Scotland." |
| **UFO** (night) | A word from our visitor |

---

## Rare and timed events

### Sea
- **Bigfoot (ultra rare).** He peeks out from behind a palm in the north-west woods, creeps west past Nudge's hammock in the classic film stride, **turns to look at the camera** about a third of the way along, wades into the sea and dives with a splash. ~22 s.
- **Loch Ness monster.** Three humps, then the neck and head rise 34 to 42 units out in open sea. She glides, looks around, stares at the camera, and sinks in ripples. ~19 s.
- **Whale breach.** Kept exactly as before: a humpback blows, breaches, rolls onto its back and crashes; flukes on the dive.
- **Tide pools.**
  - **Cycle:** a 6-minute tide cycle. Low tide starts 40 s in and lasts 150 s.
  - **Where:** 5 pools appear at the waterline: two on the south beach in front of the default camera, plus west, north and east.
  - **What's in them:** starfish, anemones, rocks and a sideways-scuttling crab.
- **Boat race.**
  - **Racers:** Launch's #1 "Ship It" vs the gold #2 "Hotfix", one lap around the island (~29 s) with 3 to 4 lead changes.
  - **Course:** a checkered-flag finish line rises off the south beach.
  - **Fans:** 5 crew bots run down to the south beach and jump and cheer.
  - **Toasts:** one at the start, one for the winner.
  - **When:** day only, and only when the jet boat is home and the water is clear (no tug, no travel event, rare slot free).
- **Dolphins** (often at sunrise), **turtles** (one sometimes hauls out on the beach), **sharks, marlin, salmon, fish schools**: ambient.
- **Tugboat** brings PROMPTS crates to the pier every few minutes (`tug`).
- **Glass-bottom tour boat** loops the reef and stops to look (`tour`).
- **Echo's jet ski** every 3 to 5 minutes. It waits while a boat race owns the water (`jetski`).

### Sky
- **Supply drop.** An orange cargo plane drops a BYOB "BOT PARTS" crate on a striped parachute onto open ground. Toast: "Supply drop! New bot parts just landed." 3 to 4 crew bots run over, pry it open (confetti), pull out a prize (a laptop, a surfboard or a glowing antenna bulb), celebrate, and carry it off. ~40 s.
- **BYOB cloud.** A cloud gathers and its puffs form the letters **B Y O B**, readable from the camera. It holds, then melts back. Up 25 to 40 s.
- **Hot air balloons and pelicans** by day.
- **Shooting stars** every 20 to 60 s at night, plus meteor showers (`stars`, `meteors`).
- **Fireworks**: 9 PM nightly show, rare surprise nights, and every round thousand minutes saved (`fireworks`).
- **Northern lights** some nights (`aurora`).
- **Passing shower and rainbow** some days (`rainbow`).
- **UFO** on dark nights tries to beam up a beach ball (`ufo`).
- **Buddy's seaplane** once per browser session with a "Buck's Island" banner (`?plane=test`).
- **Island-hopper plane**: takes off from the inland airstrip every few minutes, climbs out over the east shore and lands back eastbound-to-westbound (`plane2`).
- **Chief's helicopter**: visits the helipad on top of Chief's Tower every few minutes (`heli`).

### Island life (daily rhythm)
| Time | What |
|---|---|
| **5:45 to 8:00 AM** | **Sunrise yoga** on the north lounge beach: an instructor in a pink headband and 5 students roll out mats and flow through sun salutation, forward fold, downward dog, warrior II and tree pose (with a wobble), facing the sunrise. A rack of rolled mats sits there the rest of the day (`yoga`) |
| **Day** | Tiki bar, food truck line, volleyball (north beach, all sand), DJ and dancers, waiters, arm-wrestling, push-up class, sandcastle builders (a wave always flattens it), fishing off the end of Launch's Pier |
| **Day, every 2 to 4 min** | **Pool visit at Flo's**: 1 or 2 crew bots walk the boardwalk, hop into the plunge pool, one floats in a pink floatie with a drink and one doggy-paddles with splashy jumps, then they climb out, shake off like wet dogs and leave. First visit 40 to 110 s after load (`pool`) |
| **Day, every order** | Byte Bites: every other order is a Buck Taco ("ORDER UP! BUCK TACO!" pops over the window). About 1 order in 24 is a **Rainbow Shave Ice** carried off held high with a skip (`shaveice`) |
| **Dusk to 9 PM** | **Night concert** at the DJ booth: colored spotlights sweep the floor, the **Bot Band** (guitar, keytar, drums) plays on the stage, and crew bots gather to watch with glowsticks (`concert`) |
| **9 PM to 6 AM** | **Bedtime**: idle bots sleep in hammocks with ZZZs; working bots gather at the **campfire**. Only one band member, a busker, stays strumming on the stage edge |
| **Night** | **Campfire stories**: parchment speech bubbles showing what each bot accomplished ("Saved 12 min: Drafted the newsletter"). 2 at the default zoom (4 zoomed in), rotating every 5.5 s; the speaker gestures and nods (`?hour=21`) |

### Conga line (when "Conga!" plays)
- Play **"Conga!"** (Gloria Estefan & Miami Sound Machine) in the DJ booth's Spotify player and **every bot drops what it's doing and forms a conga line**. The player tells the island which track is on, through Spotify's iFrame API.
- **Bot of the Day leads**, crown on, shaking a red and a green **maraca**. Everyone else follows with hands on the shoulders of the bot ahead, stepping 1, 2, 3 and kicking on 4.
- The line dances around the ring at the foot of Chief's Tower and out and back along every zone's sand path, like the petals of a flower.
- **When the song ends** (the next track starts, or it's paused for 3 s, or the player closes), everybody scatters back to their spots.
- **Work keeps running:** the feed, statuses, "+X min" cheers and handoffs carry on. A bot with a handoff to deliver leaves the line, delivers it and dances back in.
- Logged-out visitors only get Spotify's 30-second preview, so their conga is a short one.
- `?test=conga` starts a one-minute conga 6 s after load, then one every 2.5 minutes.

### Bot antics (day, chillin' bots)
- One big antic somewhere every 20 to 40 s:
  - a high-five
  - a selfie (solo, duo or trio)
  - a trip and a faceplant, with a buddy pulling them up
- Plus quick push-up sets (`highfive`, `selfie`, `trip`, `pushups`, `antics`).
- A courier bot handing over a glowing package gets a high-five.
- Two chillin' bots standing together clink drinks now and then.

### Every day
- **Bot of the Day.** One bot (picked by the Pacific-time date, same for everyone, changes at midnight) wears a **gold crown with a ruby** and stands in a gold glow. The Visitor Center board shows its stats; tap it for the full card.
- **Treasure chest** moves to a new spot.

---

## Speech bubbles

- **Never overlapping:** "+X min" floats, campfire story bubbles and name tags never cover each other. Bubbles are laid out on screen by priority each frame.
- **Priority:** floats come first and never hide. Stories nudge up or sideways, or wait their turn.
- **Name tags:**
  - Selected and hovered tags are obstacles that bubbles avoid.
  - Zone tags and close-zoom name tags step aside under a bubble.

---

## All `?test=` switches

`all`, `antics`, `armwrestle`, `aurora`, `bigfoot`, `bottle`, `byob`, `camjet`, `camjetboat`, `camrival`, `camsail`, `camtour`, `camtug`, `concert`, `conga`, `dolphins`, `drop`, `fireworks`, `fish`, `fishing`, `heli`, `highfive`, `jetboat`, `jetski`, `meteors`, `nessie`, `pelicans`, `plane2`, `pool`, `pushups`, `race`, `rainbow`, `sandcastle`, `selfie`, `shaveice`, `stars`, `tide`, `tour`, `trip`, `tug`, `turtles`, `ufo`, `vane`, `wake`, `whale`, `yoga`

Other switches: `?hour=N`, `?weather=test`, `?claude=test`, `?plane=test`, `?surf=test`, `?reduced=1`, `?lite=1`, `?safe=0`, `?demo=1`, `?kiosk=1`.

## Remembered in the browser (localStorage)
- `bah-bottle-seen`, `bah-bottle-n`: which bottle notes you've read.
- `bah-bigfoot-sightings`: your Bigfoot count.
- `bah-tide-fact`: next tide-pool fact.
- `bah-data-mode`, `bah-kiosk`: demo/live and kiosk.
