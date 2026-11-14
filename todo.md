Fixes:
- Track: make straights more straight and less wiggly, maybe add tighter curves or more types of curves
- Fix jitters - but only seem to be present on windows laptops, mac laptop runs really smoothly

Features:
- Keybinds changing
- Color themes
- Maps (like City mode, etc.)
- Track Mode (set track for a day, whoever gets lowest time to finish wins)
- Curbs around outer edge of turns- if you drift on them you get a speed boost (which helps accel into the next straight)
  - Could be styled white&grey alternating
- Curbs in general? Serves as visual indicator you are going out of bounds, only if you go past it you end run
- Art: Make cottages / campfires

Autonomous Bots:
- RL train
- Fly brain

Leaderboard hardening (if cheating becomes a problem):
- Spot-check replays: re-simulate only top scores in the background, in chunks that fit the free CPU limit (needs deterministic sin/cos/exp/hypot so iPhone and server runs match)
- Cloudflare Turnstile (free, mostly invisible bot check) on name registration
- Per-IP limit on registrations and tickets
- Tighten the corner allowance (SCORE.maxProgressPerPx, now 1.4) using real data from the runs table

