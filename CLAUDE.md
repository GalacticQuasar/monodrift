# Monodrift

Minimal top-down drift game for desktop and mobile browsers. Vite + TypeScript,
no framework, canvas 2D. See `README.md` for the file layout.

## Commands

- `npm run dev`: dev server · `npm test`: Vitest (sim + scenery, no browser)
- `npm run build`: typecheck + production build into `dist/` (static site)
- `npx tsc`: typecheck only

## Architecture rules

- `src/sim/` is the game itself: **no DOM, no clock, no `Math.random`**. Same
  seed + same inputs = same run (tested). Randomness comes from `sim/rng.ts`.
- `src/render/` reads game state and never changes it. Scenery is render-only
  and also seeded.
- `src/input/` turns events into a `SteerIntent`; `src/ui/` is DOM (HUD,
  settings, debug panel). `src/main.ts` wires them together.
- All tuning numbers live in `src/config.ts`.
- Offline: `src/sw.js` is a service worker template; the plugin in
  `vite.config.ts` fills in the file list and version at build time. It only runs
  in production builds (test offline with `npm run build && npm run preview`).

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

- Run `npx tsc` and `npm test` after code changes.
- For anything visual or input-related, check it in a real browser
  (playwright-cli is available), including a phone-sized viewport.
- Conventional Commits for commit messages.
