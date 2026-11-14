# Monodrift

Minimal top-down drift game for desktop and mobile browsers. Vite + TypeScript,
no framework, canvas 2D. See `README.md` for the file layout.

## Commands

- `npm run dev`: dev server · `npm test`: Vitest (sim, scenery, leaderboard rules; no browser)
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
  settings, leaderboard, install card, debug panel). `src/main.ts` wires them together.
- All tuning numbers live in `src/config.ts`.
- Leaderboard: `worker/` is the Cloudflare Worker for `/api/*` (D1 database,
  schema in `migrations/`). It shares pure code with the game (`sim/daily.ts`,
  `sim/scoring.ts` `maxScoreAfter`, `lib/names.ts`). No replays: a signed run ticket
  times each run and caps the score (see `SCORE.maxProgressPerPx`).
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
- Never write test data to the live API/database (no test players or scores); test
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
- Two top buttons only: Leaderboard and Settings. Road, Zen, Steering, Sensitivity
  and Trees live in the Settings panel (`ui/settings.ts`); changing Road or Zen
  starts over. Sensitivity scales steering in `input/`, never in the sim.
- UI style: pixel/retro to match the art. Silkscreen (self-hosted in `src/fonts/`)
  for buttons, titles and the score; system sans for body text. Buttons and panels
  use the notched pixel frame (`--frame` in `style.css`), square corners and hard
  shadows. Everything must fit a 320 px wide phone.
- `todo.md` is the user's own list (in the repo): edit it only when asked, and let
  the user tick items off.

## Patch notes

For player-facing update notes ("what's new" to share with friends), use the
`patch-notes` skill (`.claude/skills/patch-notes/`): same page template every time,
and a log in `docs/patch-notes.md` that marks where the next notes start.

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
placement pipeline.

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
