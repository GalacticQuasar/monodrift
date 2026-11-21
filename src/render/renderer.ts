// Draws a GameState. Read-only: never modifies the state.

import { CAMPFIRE, CAR, NET, ROAD_EDGE, SCENERY, SKIDS, TRACK, VIEW, type Palette } from '../config';
import type { Rival } from '../net/rivals';
import type { GameState } from '../sim/game';
import { distanceScore } from '../sim/scoring';
import { followCar } from './camera';
import { createScenery, type Prop, type Scenery } from './scenery';
import { SPRITES, buildAtlas, buildSprites, type Atlas } from './sprites';

/** Drawing layers; debug mode can switch them off to isolate rendering problems. 'trees' is all scenery (campfires too). */
export type Layer = 'bg' | 'road' | 'skids' | 'car' | 'trees';
export const ALL_LAYERS: readonly Layer[] = ['bg', 'road', 'skids', 'car', 'trees'];

/** Other cars to draw besides the player's (reuse one object; read-only here). */
export interface View {
  rivals: readonly Rival[];
  /** Camera follows this rival instead of the player's car (spectating after a crash). */
  follow: Rival | null;
}

const NO_VIEW: View = { rivals: [], follow: null };

export interface Renderer {
  /**
   * `alpha` (0..1) blends between the previous and current sim step; `now` (ms, any
   * clock) drives scenery animation (campfire flames).
   */
  draw(g: GameState, alpha: number, now?: number, view?: View): void;
  /** For debugging (updated in place): trees drawn last frame, scenery running totals. */
  readonly stats: Scenery['stats'];
  /** Switch colours (theme change): regenerates the tree sprites, so not per frame. */
  setPalette(colors: Palette): void;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Rival name labels and gap numbers: CSS px (Silkscreen is a pixel font: keep to multiples of 8). */
const LABEL_PX = 16;

/**
 * A line of text drawn once into its own small transparent canvas, redrawn only when
 * the text, colour or pixel ratio changes. Text drawn straight onto the opaque game
 * canvas gets coloured subpixel fringes; this keeps it grayscale, and layout-free per frame.
 */
interface TextSprite {
  text: string;
  color: string;
  dpr: number;
  canvas: HTMLCanvasElement;
}

const newTextSprite = (): TextSprite => ({ text: '', color: '', dpr: 0, canvas: document.createElement('canvas') });

function renderText(t: TextSprite, text: string, color: string, dpr: number): HTMLCanvasElement {
  if (t.text === text && t.color === color && t.dpr === dpr) return t.canvas;
  t.text = text;
  t.color = color;
  t.dpr = dpr;
  const c = t.canvas.getContext('2d')!;
  const px = Math.round(LABEL_PX * dpr);
  const font = `${px}px Silkscreen, monospace`;
  c.font = font;
  t.canvas.width = Math.max(1, Math.ceil(c.measureText(text).width));
  t.canvas.height = px;
  c.font = font; // resizing resets the context
  c.textBaseline = 'top';
  c.fillStyle = color;
  c.fillText(text, 0, 0);
  return t.canvas;
}

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
  // per rival: name label, and off-screen arrow gap (string rebuilt only when it changes)
  const texts = new Map<Rival, { name: TextSprite; gap: TextSprite; gapValue: number; gapText: string }>();
  const textsOf = (r: Rival) => {
    let t = texts.get(r);
    if (!t) texts.set(r, (t = { name: newTextSprite(), gap: newTextSprite(), gapValue: NaN, gapText: '' }));
    return t;
  };
  // a label drawn before Silkscreen arrived used the fallback font: redraw them all
  document.fonts?.addEventListener('loadingdone', () => texts.clear());

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
    draw(g, alpha, now = 0, view = NO_VIEW) {
      const { car } = g;
      const cx = lerp(car.prevX, car.x, alpha);
      const cy = lerp(car.prevY, car.y, alpha);
      const ch = lerp(car.prevH, car.h, alpha);
      const { rivals, follow } = view;
      // what the camera is on: the player's car, or the rival being spectated
      const fx = follow ? follow.pose.x : cx, fy = follow ? follow.pose.y : cy;
      const focusIndex = follow ? follow.pose.i : g.trackIndex;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (layers.has('bg')) {
        ctx.fillStyle = colors.ground;
        ctx.fillRect(0, 0, W, H);
      }
      const cam = followCar(fx, fy, W, H);
      ctx.translate(cam.x, cam.y);

      const props = layers.has('trees') ? scenery.visible(g, -cam.x, -cam.y, W - cam.x, H - cam.y, focusIndex) : null;
      const frame = Math.floor(now / CAMPFIRE.frameMs);
      if (layers.has('road')) drawRoad(g, focusIndex);
      if (layers.has('skids')) drawSkids(g);
      // firelight on the ground and road, under the car (dark mode only)
      if (props && colors.glow) drawProps(props, cam, frame, true);
      if (layers.has('car')) {
        drawRivals(rivals); // under the player's own car
        drawCar(cx, cy, ch, colors.car, colors.windshield);
      }
      // scenery last, so an off-road car (zen) drives under trees
      if (props) drawProps(props, cam, frame, false);
      if (rivals.length && layers.has('car')) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); // text sprites: whole device pixels
        drawLabels(rivals, cam);
        drawArrows(rivals, follow, cam, fx, fy, focusIndex);
      }
    },
  };

  function drawRoad(g: GameState, index: number) {
    const pts = g.track.pts;
    const a = Math.min(pts.length - 1, Math.max(0, index - VIEW.drawBehind));
    const b = Math.min(pts.length, index + VIEW.drawAhead);
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

  function drawCar(x: number, y: number, h: number, body: string, windshield: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(h);
    ctx.fillStyle = body;
    const l = CAR.length, w = CAR.width;
    ctx.beginPath();
    if ('roundRect' in ctx) ctx.roundRect(-l / 2, -w / 2, l, w, 3);
    else (ctx as CanvasRenderingContext2D).rect(-l / 2, -w / 2, l, w);
    ctx.fill();
    ctx.fillStyle = windshield;
    ctx.fillRect(4, -5, 4, 10);
    ctx.restore();
  }

  /** Other players' cars; a crashed one stays where it went off, faded. */
  function drawRivals(rivals: readonly Rival[]) {
    for (let i = 0; i < rivals.length; i++) {
      const r = rivals[i];
      if (r.state === 'waiting' || r.state === 'gone') continue;
      ctx.globalAlpha = r.state === 'crashed' ? 0.4 : 1;
      drawCar(r.pose.x, r.pose.y, r.pose.h, colors.rivalCar, colors.rivalWindshield);
    }
    ctx.globalAlpha = 1;
  }

  /** Name above each rival car, upright. Device space. */
  function drawLabels(rivals: readonly Rival[], cam: { x: number; y: number }) {
    for (let i = 0; i < rivals.length; i++) {
      const r = rivals[i];
      if (r.state !== 'racing' && r.state !== 'crashed') continue;
      const img = renderText(textsOf(r).name, r.name, colors.rivalLabel, dpr);
      ctx.globalAlpha = r.state === 'crashed' ? 0.5 : 1;
      const x = Math.round((r.pose.x + cam.x) * dpr - img.width / 2);
      const y = Math.round((r.pose.y + cam.y - CAR.length * 0.7) * dpr - img.height);
      ctx.drawImage(img, x, y);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * A rival out of view gets an arrow at the screen edge, pointing at them from the
   * car in focus, with how far ahead (+) or behind (-) they are in points. Device space.
   */
  function drawArrows(rivals: readonly Rival[], follow: Rival | null, cam: { x: number; y: number }, fx: number, fy: number, focusIndex: number) {
    const inset = NET.arrowInset;
    // screen point the arrows radiate from: the car in focus
    const ox = fx + cam.x, oy = fy + cam.y;
    ctx.fillStyle = colors.rivalLabel;
    for (let i = 0; i < rivals.length; i++) {
      const r = rivals[i];
      if (r === follow || r.state !== 'racing') continue;
      const sx = r.pose.x + cam.x, sy = r.pose.y + cam.y;
      if (sx >= inset && sx <= W - inset && sy >= inset && sy <= H - inset) continue;
      // walk from the focus toward the rival until the inset box's edge
      const dx = sx - ox, dy = sy - oy;
      let t = 1;
      if (dx > 0) t = Math.min(t, (W - inset - ox) / dx);
      if (dx < 0) t = Math.min(t, (inset - ox) / dx);
      if (dy > 0) t = Math.min(t, (H - inset - oy) / dy);
      if (dy < 0) t = Math.min(t, (inset - oy) / dy);
      const ax = ox + dx * t, ay = oy + dy * t;
      const a = Math.atan2(dy, dx);
      const c = Math.cos(a), s = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(Math.round((ax + c * 9) * dpr), Math.round((ay + s * 9) * dpr));
      ctx.lineTo(Math.round((ax - c * 6 - s * 8) * dpr), Math.round((ay - s * 6 + c * 8) * dpr));
      ctx.lineTo(Math.round((ax - c * 6 + s * 8) * dpr), Math.round((ay - s * 6 - c * 8) * dpr));
      ctx.closePath();
      ctx.fill();
      // gap, centred a little inside the arrow
      const tx = textsOf(r);
      const value = distanceScore(r.pose.i) - distanceScore(focusIndex);
      if (tx.gapValue !== value) {
        tx.gapValue = value;
        tx.gapText = value > 0 ? `+${value}` : value < 0 ? `-${-value}` : '0';
      }
      const img = renderText(tx.gap, tx.gapText, colors.rivalLabel, dpr);
      const gx = (ax - c * 18) * dpr - (img.width / 2) * (1 + c);
      const gy = (ay - s * 18) * dpr - (img.height / 2) * (1 + s);
      ctx.drawImage(img, Math.round(gx), Math.round(gy));
    }
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
