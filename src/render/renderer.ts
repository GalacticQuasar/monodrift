// Draws a GameState. Read-only: never modifies the state.

import { CAMPFIRE, CAR, ROAD_EDGE, SCENERY, SKIDS, TRACK, VIEW, type Palette } from '../config';
import type { GameState } from '../sim/game';
import { followCar } from './camera';
import { createScenery, type Prop, type Scenery } from './scenery';
import { SPRITES, buildAtlas, buildSprites, type Atlas } from './sprites';

/** Drawing layers; debug mode can switch them off to isolate rendering problems. 'trees' is all scenery (campfires too). */
export type Layer = 'bg' | 'road' | 'skids' | 'car' | 'trees';
export const ALL_LAYERS: readonly Layer[] = ['bg', 'road', 'skids', 'car', 'trees'];

export interface Renderer {
  /**
   * `alpha` (0..1) blends between the previous and current sim step; `now` (ms, any
   * clock) drives scenery animation (campfire flames).
   */
  draw(g: GameState, alpha: number, now?: number): void;
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
  let sprites = buildSprites(colors);
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
      sprites = buildSprites(colors);
      if (atlas) atlas = buildAtlas(sprites, atlas.scale);
    },
    draw(g, alpha, now = 0) {
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

      const props = layers.has('trees') ? scenery.visible(g, -cam.x, -cam.y, W - cam.x, H - cam.y) : null;
      const frame = Math.floor(now / CAMPFIRE.frameMs);
      if (layers.has('road')) drawRoad(g);
      if (layers.has('skids')) drawSkids(g);
      // firelight on the ground and road, under the car (dark mode only)
      if (props && colors.glow) drawProps(props, cam, frame, true);
      if (layers.has('car')) drawCar(cx, cy, ch);
      // scenery last, so an off-road car (zen) drives under trees
      if (props) drawProps(props, cam, frame, false);
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
    // curb: a wider stroke under the road
    ctx.strokeStyle = colors.curb;
    ctx.lineWidth = ROAD_EDGE * 2;
    ctx.stroke();
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
   * Draw prop sprites (or, with `glows`, their firelight) from the atlas as 1:1 copies
   * in device-pixel space. Every argument is a whole number, so the calls are exact
   * and create no garbage. `frame` counts animation frames since the clock's start.
   */
  function drawProps(props: Prop[], cam: { x: number; y: number }, frame: number, glows: boolean) {
    const { image, rects, scale } = atlas!;
    const k = scale / dpr; // CSS px per art pixel
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false; // resets whenever the canvas is resized
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      let index: number;
      if (glows) {
        if (p.glow < 0) continue;
        index = p.glow + ((frame + p.phase) % SPRITES.glowFrames); // flickers with the flames
      } else {
        index = p.frames > 1 ? p.sprite + ((frame + p.phase) % p.frames) : p.sprite;
      }
      const s = sprites[index], r = rects[index];
      const x = Math.round((p.x - s.cx * k + cam.x) * dpr);
      const y = Math.round((p.y - s.cy * k + cam.y) * dpr);
      ctx.drawImage(image, r.x, r.y, r.w, r.h, x, y, r.w, r.h);
    }
    // back to world space for the car, drawn after the glows
    if (glows) ctx.setTransform(dpr, 0, 0, dpr, cam.x * dpr, cam.y * dpr);
  }
}
