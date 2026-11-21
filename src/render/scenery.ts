// Decorative scenery: trees, and campfires in small forest clearings beside the road. Placed on
// a world grid, seeded by the run's seed so a road always gets the same forest, and
// kept clear of the road. Render-only state.

import { CAMPFIRE, ROAD_EDGE, SCENERY } from '../config';
import type { GameState } from '../sim/game';
import { createRng } from '../sim/rng';
import type { Track } from '../sim/track';
import { SPRITES, campfireReach, glowReach, treeReach } from './sprites';

/** A tree or campfire, at its anchor (canopy centre, base of a campfire). */
export interface Prop {
  x: number;
  y: number;
  /** Farthest painted pixel from (x, y), in world px: what's kept off the road. */
  r: number;
  /** Footprint radius (world px) other props keep their distance from. */
  space: number;
  /** First sprite index (see SPRITES in sprites.ts). */
  sprite: number;
  /** Animation frames after `sprite` (1 = still). */
  frames: number;
  /** Animation offset in frames, so neighbours don't flicker in sync. */
  phase: number;
  /** First glow sprite index (dark mode firelight), or -1 for none. */
  glow: number;
}

const SIZES = SCENERY.treeSizes;

interface Cell {
  cx: number;
  cy: number;
  props: Prop[];
}

export interface Scenery {
  /**
   * Props overlapping the given world-space rectangle, back to front.
   * The returned array is reused: valid until the next call.
   */
  /** `index`: the track point the view is around (the car in focus), for placing new trees. */
  visible(g: GameState, left: number, top: number, right: number, bottom: number, index?: number): Prop[];
  /** For debugging: running totals, and props returned by the last visible() call. */
  readonly stats: { cellsGenerated: number; cellsEvicted: number; trees: number };
}

const CELL = SCENERY.cellSize;
/** Map key for a cell: unique while |cy| < 2^19 cells (~84M px). */
const cellKey = (cx: number, cy: number) => cx * 1048576 + cy;
/** The biggest prop (or a campfire's glow) can poke into view from a neighbouring cell by this much (px). */
const VIEW_PAD = Math.max(treeReach(SIZES[SIZES.length - 1]), campfireReach, glowReach) * SCENERY.pixelScale;

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

/** Squared distance from (x, y) to the nearest road centreline point from `from` on. */
function roadDistSq(track: Track, from: number, x: number, y: number): number {
  let min = Infinity;
  const pts = track.pts;
  for (let i = from; i < pts.length; i++) min = Math.min(min, (pts[i].x - x) ** 2 + (pts[i].y - y) ** 2);
  return min;
}

/** Closest a prop reaching `r` px may be to the road's centreline. */
const roadClearance = (r: number) => ROAD_EDGE + r + SCENERY.roadMargin;

function clearOfRoad(track: Track, from: number, x: number, y: number, r: number): boolean {
  return roadDistSq(track, from, x, y) >= roadClearance(r) ** 2;
}

/** True if a prop with footprint `space` at (x, y) keeps its distance from the props already placed. */
function spacedOut(props: readonly Prop[], x: number, y: number, space: number): boolean {
  for (const p of props) {
    const min = (space + p.space) * SCENERY.treeSpacing;
    if ((p.x - x) ** 2 + (p.y - y) ** 2 < min * min) return false;
  }
  return true;
}

const CAMPFIRE_R = campfireReach * SCENERY.pixelScale;

/** Forest (tree) density of a cell, 0 in a clearing, up to 1. */
const forest = (seed: number, cx: number, cy: number) => (density(seed, cx, cy) - SCENERY.clearing) / (1 - SCENERY.clearing);

/** True if a cell and most of its 8 neighbours are proper forest (not thin scattered trees). */
function deepInForest(seed: number, cx: number, cy: number): boolean {
  if (forest(seed, cx, cy) < CAMPFIRE.forestDensity) return false;
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && forest(seed, cx + dx, cy + dy) >= CAMPFIRE.forestDensity) n++;
  }
  return n >= CAMPFIRE.minForestNeighbours;
}

/**
 * A cell's claim to a campfire: a random priority (> 0) if it's deep in a forest and
 * won the chance roll, else 0. Pure (no road involved), so neighbours can compare claims.
 */
function campfireClaim(seed: number, cx: number, cy: number): number {
  if (!deepInForest(seed, cx, cy)) return 0;
  const roll = hash(seed ^ 0xf1e1d, cx, cy) / 4294967296;
  return roll < CAMPFIRE.chance ? 1 + roll : 0;
}

/**
 * The campfire in a cell, if any: in a forest, near the road but clear of it. Trees
 * keep out of a small clearing around it (see generateCell), so it sits in a forest
 * clearing by the road.
 */
function generateCampfire(g: GameState, cx: number, cy: number, from: number): Prop | null {
  const claim = campfireClaim(g.seed, cx, cy);
  if (!claim) return null;
  // one campfire per neighbourhood: a neighbouring cell with a stronger claim takes it
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && campfireClaim(g.seed, cx + dx, cy + dy) > claim) return null;
  }
  const rng = createRng(hash(g.seed ^ 0xca3f17e, cx, cy));
  const min = roadClearance(CAMPFIRE_R) + CAMPFIRE.roadMinGap, max = min + CAMPFIRE.roadGap;
  for (let t = 0; t < CAMPFIRE.tries; t++) {
    const x = (cx + rng()) * CELL, y = (cy + rng()) * CELL;
    const d = roadDistSq(g.track, from, x, y);
    if (d >= min * min && d <= max * max) {
      const phase = Math.floor(rng() * SPRITES.campfireFrames);
      return { x, y, r: CAMPFIRE_R, space: CAMPFIRE_R * 0.5, sprite: SPRITES.campfire, frames: SPRITES.campfireFrames, phase, glow: SPRITES.glow };
    }
  }
  return null;
}

/** Looks up the campfire of a cell (null for none); remembered, so neighbours agree. */
type FireAt = (cx: number, cy: number) => Prop | null;

function generateCell(g: GameState, focus: number, cx: number, cy: number, fireAt: FireAt): Prop[] {
  const d = forest(g.seed, cx, cy);
  if (d <= 0) return [];
  const from = Math.max(0, focus - SCENERY.checkBehind);
  const rng = createRng(hash(g.seed, cx, cy));
  // campfires here or next door: trees keep a clearing around them
  const fires: Prop[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const f = fireAt(cx + dx, cy + dy);
      if (f) fires.push(f);
    }
  }
  const props: Prop[] = [];
  const own = fireAt(cx, cy);
  if (own) {
    props.push(own);
    ringOfTrees(g, own, from, rng, props);
  }
  // a few clumps per cell; denser patches get more, bigger clumps
  const clumps = Math.floor(d * SCENERY.maxClumpsPerCell + rng());
  for (let c = 0; c < clumps; c++) {
    const gx = (cx + rng()) * CELL, gy = (cy + rng()) * CELL;
    const size = 1 + Math.floor(rng() * SCENERY.maxClumpSize * d);
    const spread = SCENERY.clumpSpread * Math.sqrt(size / SCENERY.maxClumpSize);
    for (let k = 0; k < size; k++) {
      // denser patches grow bigger trees
      const sizeIdx = Math.min(SIZES.length - 1, Math.floor(rng() * SIZES.length * (0.5 + d / 2)));
      for (let t = 0; t < SCENERY.placementTries; t++) {
        const a = rng() * Math.PI * 2, dist = Math.sqrt(rng()) * spread; // uniform over the disc
        if (tryTree(g, from, rng, props, fires, sizeIdx, gx + Math.cos(a) * dist, gy + Math.sin(a) * dist)) break;
      }
    }
  }
  return props.sort((a, b) => a.y - b.y); // once per cell, so visible() is nearly sorted
}

/** A tree with sprite size `sizeIdx` at (x, y), if it fits: off the road, apart from the others, out of fire clearings. */
function tryTree(g: GameState, from: number, rng: () => number, props: Prop[], fires: readonly Prop[], sizeIdx: number, x: number, y: number): boolean {
  const space = SIZES[sizeIdx] * SCENERY.pixelScale; // canopy radius
  // clearance covers canopy, trunk and ground shadow below it
  const r = treeReach(SIZES[sizeIdx]) * SCENERY.pixelScale;
  if (!spacedOut(props, x, y, space)) return false;
  if (clearOfRoad(g.track, from, x, y, r) && clearOfFires(fires, x, y, space)) {
    const sprite = sizeIdx * SCENERY.variantsPerSize + Math.floor(rng() * SCENERY.variantsPerSize);
    props.push({ x, y, r, space, sprite, frames: 1, phase: 0, glow: -1 });
  }
  return true;
}

/** Trees all round a campfire's clearing (where the road allows), so it sits in a grove. */
function ringOfTrees(g: GameState, fire: Prop, from: number, rng: () => number, props: Prop[]) {
  const n = CAMPFIRE.ringTrees;
  const turn = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const sizeIdx = 1 + Math.floor(rng() * (SIZES.length - 1));
    const a = turn + ((i + (rng() - 0.5) * 0.5) / n) * Math.PI * 2;
    const dist = CAMPFIRE.clearingRadius + SIZES[sizeIdx] * SCENERY.pixelScale + rng() * 16;
    tryTree(g, from, rng, props, [fire], sizeIdx, fire.x + Math.cos(a) * dist, fire.y + Math.sin(a) * dist);
  }
}

/** True if a tree canopy of radius `space` at (x, y) stays out of every campfire's clearing. */
function clearOfFires(fires: readonly Prop[], x: number, y: number, space: number): boolean {
  for (const f of fires) {
    const min = CAMPFIRE.clearingRadius + space;
    if ((f.x - x) ** 2 + (f.y - y) ** 2 < min * min) return false;
  }
  return true;
}

export function createScenery(): Scenery {
  let owner: GameState | null = null;
  const cells = new Map<number, Cell>();
  // campfire per cell (null: none), worked out once so a cell and its neighbours agree
  const fires = new Map<number, Prop | null>();
  let game: GameState | null = null;
  let focus = 0;
  const fireAt: FireAt = (cx, cy) => {
    const key = cellKey(cx, cy);
    let f = fires.get(key);
    if (f === undefined) {
      f = generateCampfire(game!, cx, cy, Math.max(0, focus - SCENERY.checkBehind));
      fires.set(key, f);
    }
    return f;
  };
  const out: Prop[] = []; // reused every frame to avoid garbage
  const stats = { cellsGenerated: 0, cellsEvicted: 0, trees: 0 };

  return {
    stats,
    visible(g, left, top, right, bottom, index = g.trackIndex) {
      if (g !== owner) {
        owner = g; // new run: new forest
        cells.clear();
        fires.clear();
      }
      game = g;
      focus = index;

      const x0 = Math.floor((left - VIEW_PAD) / CELL), x1 = Math.floor((right + VIEW_PAD) / CELL);
      const y0 = Math.floor((top - VIEW_PAD) / CELL), y1 = Math.floor((bottom + VIEW_PAD) / CELL);

      // evict cells far from view (never the visible ones, so no regeneration hitch)
      if (cells.size > SCENERY.maxCachedCells) {
        const margin = 4;
        for (const [key, c] of cells) {
          if (c.cx < x0 - margin || c.cx > x1 + margin || c.cy < y0 - margin || c.cy > y1 + margin) {
            cells.delete(key);
            stats.cellsEvicted++;
          }
        }
        if (fires.size > SCENERY.maxCachedCells * 2) {
          for (const key of fires.keys()) if (!cells.has(key)) fires.delete(key);
        }
      }

      // fill by index, then trim: `out.length = 0` would make V8 drop the backing
      // store and reallocate it every frame (~4 KB/frame of garbage)
      let n = 0;
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const key = cellKey(cx, cy);
          let cell = cells.get(key);
          if (!cell) {
            cells.set(key, (cell = { cx, cy, props: generateCell(g, focus, cx, cy, fireAt) }));
            stats.cellsGenerated++;
          }
          const props = cell.props;
          for (let i = 0; i < props.length; i++) out[n++] = props[i];
        }
      }
      out.length = n;
      stats.trees = n;
      // 3/4-view sprites: draw back to front so lower props overlap higher ones.
      // Cells come row by row with their props pre-sorted, so `out` is nearly sorted:
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
