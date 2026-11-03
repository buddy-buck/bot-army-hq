# Changelog

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
