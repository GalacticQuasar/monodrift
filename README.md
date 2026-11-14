# Monodrift

A minimal top-down drift game for desktop and mobile. Stay on the road; the
car speeds up the longer you survive. Zen mode turns off crashes and scoring.

## Controls

- **Desktop:** ← → to steer (or hold the left/right half of the screen); any
  key starts or retries.
- **Mobile:** hold the left/right side to steer, or switch to *Slide* mode and
  drag to aim. Tap to start.

## Develop

```bash
npm install
npm run dev        # dev server with hot reload
npm test           # unit tests (sim + scenery, no browser needed)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build locally
```

`dist/` is a static site: deploy it to any static host.

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
  sim/             the game itself: pure, deterministic, no DOM
    game.ts        GameState, phases, step(state, intent, dt, rules)
    track.ts       seeded road generation + nearest-point lookup
    car.ts         car physics
    skids.ts       skid mark emission
    scoring.ts     score rules
    rng.ts         seeded RNG (mulberry32)
  input/           pointer + keyboard → SteerIntent
  render/          canvas drawing (reads state, never writes it)
    renderer.ts    draws the layers: background, road, skids, car, trees
    camera.ts      follows the car
    scenery.ts     seeded tree placement on a world grid, kept off the road
    sprites.ts     pixel-art tree sprites + the device-scaled atlas
  ui/              DOM: HUD, settings buttons, ?debug panel
  lib/             small helpers (guarded localStorage)
tests/             Vitest tests for sim/ and scenery
docs/
  art-style.md     pixel art rules and how to add new visual assets
prototype/         the original single-file version, for reference
```

**Rule of thumb:** `sim/` never touches the DOM, the clock, or `Math.random`.
Same seed + same inputs = same run, which is what makes daily roads, ghosts and
replays possible. Scenery is seeded too, so a road always gets the same forest.

Adding visual assets? Read [`docs/art-style.md`](docs/art-style.md) first.
