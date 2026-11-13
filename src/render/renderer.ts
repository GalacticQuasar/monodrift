// Draws a GameState. Read-only: never modifies the state.

import { CAR, COLORS, TRACK, VIEW } from '../config';
import type { GameState } from '../sim/game';
import { followCar } from './camera';

export interface Renderer {
  /** `alpha` (0..1) blends between the previous and current sim step. */
  draw(g: GameState, alpha: number): void;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d')!;
  let W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, VIEW.maxDpr);
    W = innerWidth;
    H = innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
  }
  addEventListener('resize', resize);
  resize();

  return {
    draw(g, alpha) {
      const { car, track } = g;
      const cx = lerp(car.prevX, car.x, alpha);
      const cy = lerp(car.prevY, car.y, alpha);
      const ch = lerp(car.prevH, car.h, alpha);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COLORS.ground;
      ctx.fillRect(0, 0, W, H);
      const cam = followCar(cx, cy, W, H);
      ctx.translate(cam.x, cam.y);

      // road
      const pts = track.pts;
      const a = Math.max(0, g.trackIndex - VIEW.drawBehind);
      const b = Math.min(pts.length, g.trackIndex + VIEW.drawAhead);
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      for (let i = a + 1; i < b; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = COLORS.road;
      ctx.lineWidth = TRACK.halfWidth * 2;
      ctx.stroke();

      // skids
      for (const m of g.skids.marks) {
        ctx.fillStyle = `rgba(${COLORS.skid},${m.alpha})`;
        ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
      }

      // car
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ch);
      ctx.fillStyle = COLORS.car;
      const l = CAR.length, w = CAR.width;
      ctx.beginPath();
      if ('roundRect' in ctx) ctx.roundRect(-l / 2, -w / 2, l, w, 3);
      else (ctx as CanvasRenderingContext2D).rect(-l / 2, -w / 2, l, w);
      ctx.fill();
      ctx.fillStyle = COLORS.windshield;
      ctx.fillRect(4, -5, 4, 10);
      ctx.restore();
    },
  };
}
