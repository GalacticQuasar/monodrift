# Monodrift

Minimal top-down drift game for desktop and mobile browsers. Vite + TypeScript,
no framework, canvas 2D. See `README.md` for the file layout.

## Commands

- `npm run dev`: dev server · `npm test`: Vitest (sim, scenery, leaderboard and room rules; no browser)
- `npm run build`: typecheck + production build into `dist/` (static site)
- `npm run typecheck`: typecheck the game (`tsc`) and the Worker (`tsc -p worker`)
- `npm run api`: leaderboard API locally (local Worker + local D1 database on :8787;
  build first, `npm run dev` proxies `/api` to it). Needs `.dev.vars` with
  `TICKET_SECRET=...` (gitignored)

## Architecture rules

- `src/sim/` is the game itself: **no DOM, no clock, no `Math.random`**. Same
  seed + same inputs = same run (tested). Randomness comes from `sim/rng.ts`.
- `src/render/` reads game state and never changes it. Scenery is render-only
  and also seeded.
- `src/input/` turns events into a `SteerIntent`; `src/ui/` is DOM (HUD,
  settings, leaderboard, install card, room card, debug panel). `src/main.ts` wires them together.
- All tuning numbers live in `src/config.ts`.
- Leaderboard: `worker/` is the Cloudflare Worker for `/api/*` (D1 database,
  schema in `migrations/`). It shares pure code with the game (`sim/daily.ts`,
  `sim/scoring.ts` `maxScoreAfter`, `lib/names.ts`). No replays: a signed run ticket
  times each run and caps the score (see `SCORE.maxProgressPerPx`).
- Multiplayer rooms: one `Room` Durable Object per 4-letter code (`worker/room.ts`,
  WebSocket hibernation; routes in `worker/rooms.ts`) only relays pose samples and runs
  lobby/countdown/results; rules are the pure `worker/room-logic.ts` (tested), messages
  in `lib/room-protocol.ts` (bump `PROTOCOL` on incompatible changes). The game side is
  `src/net/` (session, rivals) and `ui/room.ts`. Other cars are *rivals* drawn from pose
  samples (`lib/poses.ts`, never simulated); every run is recorded by
  `lib/run-recorder.ts`, meant for ghost races later too. `?debug&bot` adds a local
  autopilot rival.
- Offline: `src/sw.js` is a service worker template; the plugin in
  `vite.config.ts` fills in the file list and version at build time. It only runs
  in production builds (test offline with `npm run build && npm run preview`).

## Deployment and production data

- Pushing to `main` **is** deploying: Cloudflare Workers Builds runs `npm run build`
  and `npx wrangler deploy` (static game + `worker/`) to
  https://monodrift.galacticquasar.dev. Commit/push only when asked.
- Production: D1 database `monodrift` (ID in `wrangler.jsonc`), Worker secret
  `TICKET_SECRET`. Schema changes go in a new `migrations/NNNN_*.sql`, applied with
  `npx wrangler d1 migrations apply monodrift --remote` (needs `npx wrangler login`)
  **before** pushing code that depends on them.
- Never write test data to the live API/database (no test players, scores or rooms); test
  against `npm run api`. Read-only checks on live are fine (`GET /api/leaderboard`,
  `POST /api/tickets`, a rejected `POST /api/scores`).
- After a deploy the service worker can serve the previous version for one load:
  reload twice when checking the live site.

## Behaviour to keep

- Desktop (`lib/device.ts`: hover + fine pointer) steers with the **keyboard only**
  (← → or A/D); the Steering (Sides/Slide) row is left out of Settings and a click
  only starts or retries. Phones steer by touch (Sides or Slide mode).
- The daily road seed comes from the UTC date (`sim/daily.ts`). Starting a run from
  the start screen keeps the road already on screen; retries get a new one.
- Settings and identity live in localStorage under `monodrift-*` (`lib/storage.ts`).
- Two top buttons only: Leaderboard and Settings (icons on phones). "Drive with a friend"
  is a link under the start/game-over message plus a Friends row in Settings (Play); both
  open the room card's start: join by code (or pasted link) or make a New room. Road, Zen, Speed,
  Steering, Sensitivity, Trees and Dark live in the Settings panel (`ui/settings.ts`); changing Road, Zen
  or Speed starts over. Opening Settings mid-run pauses the run; after closing it, the next
  tap/key resumes (not in a room, see below). Sensitivity scales steering in `input/`, never in the sim.
- Speed (Slow/Normal/Fast/Uncapped, `SPEED` in `config.ts`) scales game time via the sim's
  `speed` rule. Uncapped (sim `uncapped` rule): no top speed, the car keeps
  accelerating at `CAR.accel` with the same steering. To keep it drivable the road's
  bends ease off with distance (`bendScale` in `track.ts`, games made with
  `createGame(…, uncapped = true)`): the same road as Normal until its top speed, then
  bends scaled by top speed / the speed you'd have there. Deterministic per seed, so
  everyone in an Uncapped room gets the same road. A vapor cone shows from 650 px/s; at
  750 (~59 s) the sim returns a `boom` event (shockwave ring and screen shake, no text).
  Rooms can pick Uncapped too (room Speed setting); those rounds aren't ranked. Only Normal runs are ranked (no ticket otherwise; a note under the
  picker says so), and each speed keeps its own local best.
- In a room (`?room=CODE`): rounds start from the room (countdown), not a tap; they're
  Normal pace (or Uncapped if the room says so) with crashes on (Road/Zen/Speed locked in Settings), each car in its
  own lane (`NET.startSpread`). Settings doesn't pause a room run. A hidden tab stops the
  game loop, so hiding it counts as a crash mid-run, sits you out (0) in the countdown,
  and un-readies you between rounds. After crashing you watch a rival (the leader; a tap/key switches to
  the next one still driving). Room runs are ranked like solo
  Normal runs; players without a leaderboard name are offered their room name on the
  results card. Max 4 players (`ROOM.maxPlayers`).
- Room win rule (room card, between rounds): Furthest (top score wins at the results; a
  tie crowns nobody) or Last standing (the last car left wins the moment the others are
  out; the room picks whether it Stops or Drives on). Rounds driven alone crown nobody. Zen (room setting):
  no crashes, no score or winner, not ranked, Win rows hidden; a "Done" button
  (`#done`, bottom centre) during the round, and it ends (back to the lobby) once
  everyone still driving has tapped it.
  The winner gets the trophy (`ui/win.ts`, art in `src/art/trophy.json`, grey
  `--trophy-*` tokens) and the results card waits `UI.winShowMs`; others get a banner and
  the card title. Games send a keep-alive ping; the room drops connections silent for
  `ROOM.staleMs` (when someone joins or readies), and games close theirs on pagehide.
- Car colour (Settings > Car, `CAR_COLORS` in `config.ts`): default (black, white at
  night) or a muted colour, each with light/dark values; the only colour besides the
  copper key. In a room others see it (`hello`/`color` messages); rivals who keep the
  default are drawn grey (`rivalCar`) so they don't look like your car. "Vik green" is
  a friend's pick; tapping its swatch `UI.vikTaps` times quickly shows "f l o r i d a".
- Dark mode: the Dark setting (Off by default / On / Auto follows the device) sets
  `data-theme` on `<html>` (`ui/theme.ts`; an inline script in `index.html` does it
  before first paint). The canvas uses `COLORS.light`/`COLORS.dark`, the DOM uses the
  CSS tokens in `style.css`: new colours need both values, never hardcode one.
- UI style: pixel/retro to match the art. Silkscreen (self-hosted in `src/fonts/`)
  for buttons, titles and the score; system sans for body text. Buttons and panels
  use the notched pixel frame (`--frame` in `style.css`), square corners and hard
  shadows. Everything must fit a 320 px wide phone.
- `TODO.md` is the user's own list (in the repo): edit it only when asked, and let
  the user tick items off.

## Next steps

`docs/next-steps.md`: the ghost-race plan (not started), things not yet checked on the
live site, and known small bugs. Update it when one of those is done.

## Patch notes

For player-facing update notes ("what's new" to share with friends), use the
`patch-notes` skill (`.claude/skills/patch-notes/`). The log `docs/patch-notes.md` is
the source of the `/updates` page (`updates.html`, filled in at build time by
`vite.config.ts` via `lib/patch-notes.ts`) and of the one-time "Monodrift was updated"
card for returning players (`ui/news.ts`, newest entry id vs `monodrift-notes-seen`).
Keep its entry format; pushing a new entry publishes it.

## Performance rules

- **No per-frame garbage** in the loop: reuse arrays/objects, pass whole numbers
  to canvas calls (fractional args get boxed), no closures created per frame.
- Draw sprites from the shared atlas (`render/sprites.ts`), never from many
  small canvases.
- To investigate lag, use `/?debug` (frame report with Copy button) and
  `?debug&render=bg|none|-trees,...` to switch layers off. Known: on some
  Windows setups the browser/OS drops frames even with only the background
  drawn; `MAX_FRAME_TIME` keeps that from making the car jump.

## Visual assets

When adding or changing any visual asset (trees, buildings, rocks, …), follow
`docs/art-style.md`: grayscale pixel art, 3/4 view, light from the top-left,
silhouette-only outlines, flat tones, baked shadows, and the sprite/atlas/
placement pipeline. Hand-drawn assets (e.g. the copper key; cottages, campfires)
are `src/art/*.json` character grids with a palette from `src/art/palettes.ts`, so
the user can edit them in the pixel editor (`npm run dev`, `/tools/pixel-editor/`,
dev only). Write new hand-drawn art in that format rather than inline in code.

## Verifying changes

- Run `npm run typecheck` and `npm test` after code changes.
- For anything visual or input-related, check it in a real browser
  (playwright-cli is available), including a phone-sized viewport.
- Conventional Commits for commit messages.
- Driving in a browser test: real key presses quickly run the car off the road.
  Instead, in `page.evaluate`, dynamic-import `/src/sim/game.ts` and
  `/src/render/renderer.ts` (dev server) and drive with an autopilot that steers
  toward `track.pts[trackIndex + n]` (also how `public/og.png` was made). In Node
  tests, the same autopilot works without a browser.
- Chrome's `beforeinstallprompt` never fires in test browsers: dispatch a fake
  `Event('beforeinstallprompt')` with `prompt`/`userChoice` to test the install card.
