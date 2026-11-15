Fixes:
- Wider track? Received feedback that the track is too thin, this could also be fixed by curbs
- Track: make straights more straight and less wiggly
  - Add tighter curves or more types of curves that appear later as you progress in the track
    - Maybe even near 180 turns
- Fix jitters - but only seem to be present on windows laptops, mac laptop runs really smoothly

Features:
- Keybinds changing
- Color themes
- Maps (like City mode, etc.)
- Race mode: set track for a day, whoever gets lowest time to finish wins)
- Track Mode (more complex driving mechanics (that wouldn't belong in the minimalistic normal mode, might not be on mobile):
  - Up arrow to boost/nitro/accelerate, Down arrow to brake/slow
  - Curbs around outer edge of turns- if you drift on them you get a speed boost (which helps accel into the next straight)
    - Could be styled white&grey alternating
- Curbs in general? Serves as visual indicator you are going out of bounds, only if you go past it you end run
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

