// Draws a GameState. Read-only: never modifies the state.

import { CAR, SCENERY, SKIDS, TRACK, VIEW, type Palette } from '../config';
import type { GameState } from '../sim/game';
import { followCar } from './camera';
import { createScenery, type Scenery, type Tree } from './scenery';
import { buildAtlas, buildTreeSprites, type Atlas } from './sprites';

/** Drawing layers; debug mode can switch them off to isolate rendering problems. */
export type Layer = 'bg' | 'road' | 'skids' | 'car' | 'trees';
export const ALL_LAYERS: readonly Layer[] = ['bg', 'road', 'skids', 'car', 'trees'];

export interface Renderer {
  /** `alpha` (0..1) blends between the previous and current sim step. */
  draw(g: GameState, alpha: number): void;
  /** For debugging (updated in place): trees drawn last frame, scenery running totals. */
  readonly stats: Scenery['stats'];
  /** Switch colours (theme change): regenerates the tree sprites, so not per frame. */
  setPalette(colors: Palette): void;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Skid opacity per darkness level (index 0 unused). */
const skidAlphas = (colors: Palette) => Array.from({ length: SKIDS.levels + 1 }, (_, i) => Math.min(1, (i / SKIDS.levels) * SKIDS.maxAlpha * colors.skidStrength));

export function createRenderer(canvas: HTMLCanvasElement, colors: Palette, layers: ReadonlySet<Layer> = new Set(ALL_LAYERS)): Renderer {
  // opaque: we paint every pixel each frame, so the browser needn't blend with the page
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const scenery = createScenery();
  let sprites = buildTreeSprites(colors);
  let alphas = skidAlphas(colors);
  let atlas: Atlas | null = null;
  let W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, VIEW.maxDpr);
    W = innerWidth;
    H = innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    // trees are pre-scaled to whole device pixels; rebuild only if that changes
    const scale = Math.max(1, Math.round(SCENERY.pixelScale * dpr));
    if (atlas?.scale !== scale) atlas = buildAtlas(sprites, scale);
  }
  addEventListener('resize', resize);
  resize();

  return {
    stats: scenery.stats,
    setPalette(next) {
      if (next === colors) return;
      colors = next;
      alphas = skidAlphas(colors);
      sprites = buildTreeSprites(colors);
      if (atlas) atlas = buildAtlas(sprites, atlas.scale);
    },
    draw(g, alpha) {
      const { car } = g;
      const cx = lerp(car.prevX, car.x, alpha);
      const cy = lerp(car.prevY, car.y, alpha);
      const ch = lerp(car.prevH, car.h, alpha);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (layers.has('bg')) {
        ctx.fillStyle = colors.ground;
        ctx.fillRect(0, 0, W, H);
      }
      const cam = followCar(cx, cy, W, H);
      ctx.translate(cam.x, cam.y);

      if (layers.has('road')) drawRoad(g);
      if (layers.has('skids')) drawSkids(g);
      if (layers.has('car')) drawCar(cx, cy, ch);
      // trees last, so an off-road car (zen) drives under them
      if (layers.has('trees')) drawTrees(scenery.visible(g, -cam.x, -cam.y, W - cam.x, H - cam.y), cam);
    },
  };

  function drawRoad(g: GameState) {
    const pts = g.track.pts;
    const a = Math.max(0, g.trackIndex - VIEW.drawBehind);
    const b = Math.min(pts.length, g.trackIndex + VIEW.drawAhead);
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    for (let i = a + 1; i < b; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = colors.road;
    ctx.lineWidth = TRACK.halfWidth * 2;
    ctx.stroke();
  }

  /**
   * One pass per darkness level, integer coordinates only. Fractional numbers
   * passed to canvas calls get boxed, which made ~1 MB/s of garbage.
   */
  function drawSkids(g: GameState) {
    ctx.fillStyle = colors.skid;
    const marks = g.skids.marks;
    for (let level = 1; level <= SKIDS.levels; level++) {
      ctx.globalAlpha = alphas[level];
      for (let i = 0; i < marks.length; i++) {
        const m = marks[i];
        if (m.level === level) ctx.fillRect(m.x - 1, m.y - 1, 3, 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawCar(x: number, y: number, h: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(h);
    ctx.fillStyle = colors.car;
    const l = CAR.length, w = CAR.width;
    ctx.beginPath();
    if ('roundRect' in ctx) ctx.roundRect(-l / 2, -w / 2, l, w, 3);
    else (ctx as CanvasRenderingContext2D).rect(-l / 2, -w / 2, l, w);
    ctx.fill();
    ctx.fillStyle = colors.windshield;
    ctx.fillRect(4, -5, 4, 10);
    ctx.restore();
  }

  /**
   * Draw tree sprites from the atlas as 1:1 copies in device-pixel space. Every
   * argument is a whole number, so the calls are exact and create no garbage.
   */
  function drawTrees(trees: Tree[], cam: { x: number; y: number }) {
    const { image, rects, scale } = atlas!;
    const k = scale / dpr; // CSS px per art pixel
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false; // resets whenever the canvas is resized
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i], s = sprites[t.sprite], r = rects[t.sprite];
      const x = Math.round((t.x - s.cx * k + cam.x) * dpr);
      const y = Math.round((t.y - s.cy * k + cam.y) * dpr);
      ctx.drawImage(image, r.x, r.y, r.w, r.h, x, y, r.w, r.h);
    }
  }
}
