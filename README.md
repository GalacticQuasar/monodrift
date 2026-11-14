# Monodrift

[![Monodrift: a car drifting around a bend between pixel-art trees](public/og.png)](https://monodrift.galacticquasar.dev)

A minimal top-down drift game for desktop and mobile. Stay on the road; the
car speeds up the longer you survive. Zen mode turns off crashes and scoring.
Switch **Road** to *Daily* to race everyone on the same road (new one at midnight
UTC), and pick a name to get on the **leaderboard** (today and all-time).

**Play it:** [monodrift.galacticquasar.dev](https://monodrift.galacticquasar.dev). After the first
visit it also works offline, and it can be added to a phone's home screen.

## Controls

- **Desktop:** ← → or A/D to steer; any key (or a click) starts or retries.
- **Mobile:** hold the left/right side to steer, or switch to *Slide* mode and
  drag to aim. Tap to start.

## Develop

```bash
npm install
npm run dev        # dev server with hot reload
npm test           # unit tests (sim + scenery, no browser needed)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build locally
npm run api        # leaderboard API locally (after a build); npm run dev proxies /api to it
```

The leaderboard API needs a `.dev.vars` file with `TICKET_SECRET=anything` for
local runs (it signs run tickets; production uses a Wrangler secret).

It's deployed to Cloudflare Workers (see `wrangler.jsonc`), which builds and
publishes every push to `main`: the static game from `dist/`, plus a small Worker
(`worker/`) for the leaderboard API at `/api/*`, backed by a D1 database. Schema
changes in `migrations/` are applied with
`npx wrangler d1 migrations apply monodrift --remote`.

### Leaderboard checks

There's no server-side replay (it would need more CPU than Cloudflare's free plan
allows). Instead, starting a run fetches a signed *run ticket* recording the start
time, and the server only accepts a score that's possible in the time since
(`maxScoreAfter`, using the car's top speed and a corner-cutting allowance). Each
ticket works once, submissions are rate-limited per player, and names are claimed
with a secret stored on the device.

## Debugging performance

Open the game with `?debug` (e.g. `http://localhost:5173/?debug`) for a frame
timing panel. **Copy report** gives a plain-text summary: frame-time spread,
each hitch with context (sim/draw time, new scenery cells, heap drops, last
game event) and Chrome's long-animation-frame breakdown.

Add `&render=…` to switch drawing layers off and isolate a problem:
`render=bg` (background only), `render=none`, `render=-trees,-skids`
(everything except these), or `render=road,car` (only these).

## Layout

```
src/
  main.ts          wiring: creates everything and starts the loop
  config.ts        every tuning constant
  loop.ts          fixed-timestep loop (120 Hz sim, interpolated rendering)
  sw.js            offline service worker template (filled in by vite.config.ts)
  sim/             the game itself: pure, deterministic, no DOM
    game.ts        GameState, phases, step(state, intent, dt, rules)
    track.ts       seeded road generation + nearest-point lookup
    car.ts         car physics
    skids.ts       skid mark emission
    scoring.ts     score rules, and the max score possible in a given time
    daily.ts       daily road seed (same road for everyone per UTC day)
    rng.ts         seeded RNG (mulberry32)
  input/           pointer + keyboard → SteerIntent
  render/          canvas drawing (reads state, never writes it)
    renderer.ts    draws the layers: background, road, skids, car, trees
    camera.ts      follows the car
    scenery.ts     seeded tree placement on a world grid, kept off the road
    sprites.ts     pixel-art tree sprites + the device-scaled atlas
  ui/              DOM: HUD, settings buttons, cursor auto-hide, install card,
                   leaderboard panel + name card, ?debug panel
  lib/             helpers: guarded localStorage, leaderboard API client, name rules
worker/            Cloudflare Worker: leaderboard API (/api/*), run tickets
migrations/        D1 database schema
tests/             Vitest tests for sim/, scenery and leaderboard rules
docs/
  art-style.md     pixel art rules and how to add new visual assets
```

**Rule of thumb:** `sim/` never touches the DOM, the clock, or `Math.random`.
Same seed + same inputs = same run, which is what makes daily roads, ghosts and
replays possible. Scenery is seeded too, so a road always gets the same forest.

Adding visual assets? Read [`docs/art-style.md`](docs/art-style.md) first.
