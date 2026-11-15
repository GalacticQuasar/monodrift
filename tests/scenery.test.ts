import { describe, expect, it } from 'vitest';
import { CAMPFIRE, ROAD_EDGE, SCENERY } from '../src/config';
import { createScenery, type Prop } from '../src/render/scenery';
import { SPRITES } from '../src/render/sprites';
import { createGame, step } from '../src/sim/game';

const DT = 1 / 120;

/** Drive along the centreline (teleporting the car) and collect trees around it. */
function propsAlongRun(seed: number) {
  const g = createGame(seed, 'run');
  const scenery = createScenery();
  const seen = new Set<Prop>(); // cells are cached, so a prop seen twice is the same object
  for (let s = 0; s < 400; s++) {
    const p = g.track.pts[g.trackIndex + 3];
    g.car.x = p.x;
    g.car.y = p.y;
    step(g, { kind: 'rate', rate: 0 }, DT, { crash: false });
    for (const t of scenery.visible(g, g.car.x - 960, g.car.y - 700, g.car.x + 960, g.car.y + 400)) seen.add(t);
  }
  return { g, props: [...seen] };
}

describe('scenery', () => {
  it('never places a tree or campfire on the road', () => {
    const { g, props } = propsAlongRun(12345);
    expect(props.length).toBeGreaterThan(100);
    let closest = Infinity;
    for (const t of props) {
      for (const p of g.track.pts) closest = Math.min(closest, Math.hypot(p.x - t.x, p.y - t.y) - t.r);
    }
    expect(closest).toBeGreaterThanOrEqual(ROAD_EDGE + SCENERY.roadMargin - 1e-9);
  });

  it('gives the same forest for the same seed', () => {
    const a = propsAlongRun(7).props;
    const b = propsAlongRun(7).props;
    expect(a).toEqual(b);
  });

  it('puts campfires in forest clearings beside the road now and then, near it but not on it', () => {
    let fires = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const { g, props } = propsAlongRun(seed);
      for (const p of props.filter(p => p.sprite === SPRITES.campfire)) {
        fires++;
        const d = Math.min(...g.track.pts.map(q => Math.hypot(q.x - p.x, q.y - p.y)));
        const min = ROAD_EDGE + SCENERY.roadMargin + p.r + CAMPFIRE.roadMinGap;
        expect(d).toBeGreaterThanOrEqual(min - 1e-9);
        expect(d).toBeLessThanOrEqual(min + CAMPFIRE.roadGap + 1e-9);
        expect(p.frames).toBe(SPRITES.campfireFrames);
      }
      // trees keep out of the clearing around each fire
      for (const f of props.filter(p => p.sprite === SPRITES.campfire)) {
        for (const t of props.filter(p => p.sprite < SPRITES.campfire)) {
          expect(Math.hypot(t.x - f.x, t.y - f.y)).toBeGreaterThanOrEqual(CAMPFIRE.clearingRadius + t.space - 1e-9);
        }
      }
      // never two in neighbouring cells (one per clearing)
      const cells = props.filter(p => p.sprite === SPRITES.campfire).map(p => [Math.floor(p.x / SCENERY.cellSize), Math.floor(p.y / SCENERY.cellSize)]);
      for (const [i, a] of cells.entries()) {
        for (const b of cells.slice(i + 1)) expect(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))).toBeGreaterThan(1);
      }
    }
    expect(fires).toBeGreaterThan(0);
  });
});
