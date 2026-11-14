Fixes:
- Fix jitters - but only seem to be present on windows laptops, mac laptop runs really smoothly

Features:
- Dark Mode
- Settings modal to change sensitivity, maybe turn on/off trees, etc.
  - adjust speed?
- Color themes
- Maps (like City mode, etc.)
- Track Mode (set track for a day, whoever gets lowest time to finish wins)
- Curbs around outer edge of turns- if you drift on them you get a speed boost (which helps accel into the next straight)
  - Could be styled white&grey alternating

Art:
- Make cottages / campfires

Autonomous Bots:
- RL train
- Fly brain

Leaderboard hardening (if cheating becomes a problem):
- Spot-check replays: re-simulate only top scores in the background, in chunks that fit the free CPU limit (needs deterministic sin/cos/exp/hypot so iPhone and server runs match)
- Cloudflare Turnstile (free, mostly invisible bot check) on name registration
- Per-IP limit on registrations and tickets
- Tighten the corner allowance (SCORE.maxProgressPerPx, now 1.4) using real data from the runs table

