Fixes:
- Start screen intuitiveness for first-time player
  - On desktop, show keyboard key looking elements for left/right or A/D instead of just the characters
  - On mobile, make left/right (sides mode) start screen show vertically centered arrows/chevrons on the sides of the screen
- Track: make straights more straight and less wiggly
  - Add tighter curves or more types of curves that appear later as you progress in the track
    - Maybe even near 180 turns
- Fix jitters - but only seem to be present on windows laptops, mac laptop runs really smoothly

Features:
- Sharing run result
  - People who click on shared run can race that run's ghost
- Keybinds changing
- Color themes
- Maps (like City mode, etc.)
- Race mode: set track for a day, whoever gets lowest time to finish wins)
- Track Mode (more complex driving mechanics (that wouldn't belong in the minimalistic normal mode, might not be on mobile):
  - Up arrow to boost/nitro/accelerate, Down arrow to brake/slow
  - Curbs around outer edge of turns- if you drift on them you get a speed boost (which helps accel into the next straight)
    - Could be styled white&grey alternating
- Art: Make cottages
- Art: pond with "cute fish jumping"

Autonomous Bots:
- RL train
- Fly brain

Leaderboard hardening (if cheating becomes a problem):
- Spot-check replays: re-simulate only top scores in the background, in chunks that fit the free CPU limit (needs deterministic sin/cos/exp/hypot so iPhone and server runs match)
- Cloudflare Turnstile (free, mostly invisible bot check) on name registration
- Per-IP limit on registrations and tickets
- Tighten the corner allowance (SCORE.maxProgressPerPx, now 1.4) using real data from the runs table

Getting players:
- Sharing (do first):
  - Share button on game over (navigator.share on phones, copy on desktop): date, score, today's rank, link
  - Challenge link (?vs=4812&name=...): friend sees a "beat X's score" target on the same daily road
  - Later: shareable score image (car + score + date drawn on a canvas)
- Come back daily:
  - Daily streak (localStorage, shown in share text)
  - Daily leaderboard that resets, next to all-time
- Before a big launch:
  - Fix the Windows jitter (most HN/Reddit players are on Windows)
  - Leaderboard hardening (Turnstile, per-IP limits above)
  - First run explains itself with no text (ghost car or a hint arrow)
  - Cloudflare Web Analytics (free, no cookies) to see which post brought players
- Where to post (in order):
  - Friends/group chats: watch 5-10 people play, fix what makes them quit in 30 s
  - Reddit: r/WebGames, r/playmygame, r/IndieGaming, r/pixelart (post a drift GIF, not a screenshot)
  - 10-15 s vertical clips on TikTok/Shorts/Reels ("daily drift road, can you beat my score?")
  - itch.io (upload dist/), CrazyGames, Poki
  - Show HN / lobste.rs (deterministic sim, no framework, signed tickets, offline)
  - Daily-game lists and newsletters
