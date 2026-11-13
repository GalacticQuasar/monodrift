import { describe, expect, it } from 'vitest';
import { SCENERY, TRACK } from '../src/config';
import { createScenery, type Tree } from '../src/render/scenery';
import { createGame, step } from '../src/sim/game';

const DT = 1 / 120;

/** Drive along the centreline (teleporting the car) and collect trees around it. */
function treesAlongRun(seed: number) {
  const g = createGame(seed, 'run');
  const scenery = createScenery();
  const seen = new Set<Tree>(); // cells are cached, so a tree seen twice is the same object
  for (let s = 0; s < 400; s++) {
    const p = g.track.pts[g.trackIndex + 3];
    g.car.x = p.x;
    g.car.y = p.y;
    step(g, { kind: 'rate', rate: 0 }, DT, { crash: false });
    for (const t of scenery.visible(g, g.car.x - 960, g.car.y - 700, g.car.x + 960, g.car.y + 400)) seen.add(t);
  }
  return { g, trees: [...seen] };
}

describe('scenery', () => {
  it('never places a tree on the road', () => {
    const { g, trees } = treesAlongRun(12345);
    expect(trees.length).toBeGreaterThan(100);
    let closest = Infinity;
    for (const t of trees) {
      for (const p of g.track.pts) closest = Math.min(closest, Math.hypot(p.x - t.x, p.y - t.y) - t.r);
    }
    expect(closest).toBeGreaterThanOrEqual(TRACK.halfWidth + SCENERY.roadMargin - 1e-9);
  });

  it('gives the same forest for the same seed', () => {
    const a = treesAlongRun(7).trees;
    const b = treesAlongRun(7).trees;
    expect(a).toEqual(b);
  });
});
