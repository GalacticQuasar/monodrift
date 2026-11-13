# Drift

A minimal top-down drift game for desktop and mobile.

## Develop

```bash
npm install
npm run dev        # dev server with hot reload
npm test           # unit tests (simulation only, no browser needed)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build locally
```

`dist/` is a static site: deploy it to any static host.

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
  render/          canvas drawing + camera (reads state, never writes it)
  ui/              DOM HUD and settings buttons
  lib/             small helpers (guarded localStorage)
tests/             Vitest tests for sim/
prototype/         the original single-file version, for reference
```

**Rule of thumb:** `sim/` never touches the DOM, the clock, or `Math.random`.
Same seed + same inputs = same run, which is what makes daily roads, ghosts and
replays possible.
