Fixes:
- Fix jitters - but only seem to be present on windows laptops, mac laptop runs really smoothly

Features:
- Settings modal to change sensitivity, maybe turn on/off trees, etc.
  - adjust speed?
- Color themes
- Maps (like City mode, etc.)

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

