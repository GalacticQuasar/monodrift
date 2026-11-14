// Decorative trees. Placed on a world grid, seeded by the run's seed so a road
// always gets the same forest, and kept clear of the road. Render-only state.

import { SCENERY, TRACK } from '../config';
import type { GameState } from '../sim/game';
import { createRng } from '../sim/rng';
import type { Track } from '../sim/track';

export interface Tree {
  x: number;
  y: number;
  /** Canopy radius in world px. */
  r: number;
  /** Sprite index: size * variantsPerSize + variant (see sprites.ts). */
  sprite: number;
}

const SIZES = SCENERY.treeSizes;

interface Cell {
  cx: number;
  cy: number;
  trees: Tree[];
}

export interface Scenery {
  /**
   * Trees overlapping the given world-space rectangle, back to front.
   * The returned array is reused: valid until the next call.
   */
  visible(g: GameState, left: number, top: number, right: number, bottom: number): Tree[];
  /** Running totals, for debugging. */
  readonly stats: { cellsGenerated: number; cellsEvicted: number };
}

const CELL = SCENERY.cellSize;

function hash(seed: number, a: number, b: number): number {
  let h = seed ^ Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Smooth 0..1 value noise over coarse patches: forests and clearings. */
function density(seed: number, cx: number, cy: number): number {
  const s = seed ^ 0x51ed27;
  const fx = cx / SCENERY.patchCells, fy = cy / SCENERY.patchCells;
  const gx = Math.floor(fx), gy = Math.floor(fy);
  const ease = (t: number) => t * t * (3 - 2 * t);
  const tx = ease(fx - gx), ty = ease(fy - gy);
  const v = (x: number, y: number) => hash(s, x, y) / 4294967296;
  const top = v(gx, gy) + (v(gx + 1, gy) - v(gx, gy)) * tx;
  const bot = v(gx, gy + 1) + (v(gx + 1, gy + 1) - v(gx, gy + 1)) * tx;
  return top + (bot - top) * ty;
}

function clearOfRoad(track: Track, from: number, x: number, y: number, r: number): boolean {
  const min = (TRACK.halfWidth + r + SCENERY.roadMargin) ** 2;
  const pts = track.pts;
  for (let i = from; i < pts.length; i++) {
    if ((pts[i].x - x) ** 2 + (pts[i].y - y) ** 2 < min) return false;
  }
  return true;
}

function generateCell(g: GameState, cx: number, cy: number): Tree[] {
  const d = (density(g.seed, cx, cy) - SCENERY.clearing) / (1 - SCENERY.clearing);
  if (d <= 0) return [];
  const rng = createRng(hash(g.seed, cx, cy));
  const from = Math.max(0, g.trackIndex - SCENERY.checkBehind);
  const trees: Tree[] = [];
  // a few clumps per cell; denser patches get more, bigger clumps
  const clumps = Math.floor(d * SCENERY.maxClumpsPerCell + rng());
  for (let c = 0; c < clumps; c++) {
    const gx = (cx + rng()) * CELL, gy = (cy + rng()) * CELL;
    const size = 1 + Math.floor(rng() * SCENERY.maxClumpSize * d);
    for (let k = 0; k < size; k++) {
      const a = rng() * Math.PI * 2, dist = rng() * SCENERY.clumpSpread * Math.sqrt(size / SCENERY.maxClumpSize);
      const x = gx + Math.cos(a) * dist, y = gy + Math.sin(a) * dist;
      // denser patches grow bigger trees
      const sizeIdx = Math.min(SIZES.length - 1, Math.floor(rng() * SIZES.length * (0.5 + d / 2)));
      const sprite = sizeIdx * SCENERY.variantsPerSize + Math.floor(rng() * SCENERY.variantsPerSize);
      // clearance covers canopy, trunk and ground shadow below it
      const r = (SIZES[sizeIdx] * 1.8 + 2) * SCENERY.pixelScale;
      if (clearOfRoad(g.track, from, x, y, r)) trees.push({ x, y, r, sprite });
    }
  }
  return trees.sort((a, b) => a.y - b.y); // once per cell, so visible() is nearly sorted
}

export function createScenery(): Scenery {
  let owner: GameState | null = null;
  const cells = new Map<number, Cell>();
  const out: Tree[] = []; // reused every frame to avoid garbage
  const stats = { cellsGenerated: 0, cellsEvicted: 0 };

  return {
    stats,
    visible(g, left, top, right, bottom) {
      if (g !== owner) {
        owner = g; // new run: new forest
        cells.clear();
      }

      // biggest tree plus its shadow can poke into view from a neighbouring cell
      const pad = (SIZES[SIZES.length - 1] * 2 + 4) * SCENERY.pixelScale;
      const x0 = Math.floor((left - pad) / CELL), x1 = Math.floor((right + pad) / CELL);
      const y0 = Math.floor((top - pad) / CELL), y1 = Math.floor((bottom + pad) / CELL);

      // evict cells far from view (never the visible ones, so no regeneration hitch)
      if (cells.size > SCENERY.maxCachedCells) {
        const margin = 4;
        for (const [key, c] of cells) {
          if (c.cx < x0 - margin || c.cx > x1 + margin || c.cy < y0 - margin || c.cy > y1 + margin) {
            cells.delete(key);
            stats.cellsEvicted++;
          }
        }
      }

      // fill by index, then trim: `out.length = 0` would make V8 drop the backing
      // store and reallocate it every frame (~4 KB/frame of garbage)
      let n = 0;
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const key = cx * 1048576 + cy; // unique while |cy| < 2^19 cells (~84M px)
          let cell = cells.get(key);
          if (!cell) {
            cells.set(key, (cell = { cx, cy, trees: generateCell(g, cx, cy) }));
            stats.cellsGenerated++;
          }
          const trees = cell.trees;
          for (let i = 0; i < trees.length; i++) out[n++] = trees[i];
        }
      }
      out.length = n;
      // 3/4-view sprites: draw back to front so lower trees overlap higher ones.
      // Cells come row by row with their trees pre-sorted, so `out` is nearly sorted:
      // an in-place insertion sort is close to linear and allocates nothing.
      for (let i = 1; i < out.length; i++) {
        const t = out[i];
        let j = i - 1;
        while (j >= 0 && out[j].y > t.y) {
          out[j + 1] = out[j];
          j--;
        }
        out[j + 1] = t;
      }
      return out;
    },
  };
}
