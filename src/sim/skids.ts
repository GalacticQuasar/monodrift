import { SKIDS } from '../config';
import type { Car } from './car';

export interface SkidMark {
  /** Whole world pixels: integers draw without per-call number boxing (no garbage). */
  x: number;
  y: number;
  /** Darkness, 1..SKIDS.levels (quantised so the renderer can batch by level). */
  level: number;
}

export interface Skids {
  marks: SkidMark[];
  /** Car position at the last emission, for distance-based spacing. */
  lastX: number;
  lastY: number;
}

export function createSkids(): Skids {
  return { marks: [], lastX: NaN, lastY: NaN };
}

export function emitSkids(skids: Skids, car: Car, slip: number): void {
  if (slip <= SKIDS.slipThreshold) {
    skids.lastX = NaN; // start a fresh trail next time
    return;
  }
  if (Math.hypot(car.x - skids.lastX, car.y - skids.lastY) < SKIDS.spacing) return;
  skids.lastX = car.x;
  skids.lastY = car.y;

  const c = Math.cos(car.h), s = Math.sin(car.h);
  const alpha = Math.min(SKIDS.maxAlpha, slip * SKIDS.alphaPerSlip);
  const level = Math.max(1, Math.round((alpha / SKIDS.maxAlpha) * SKIDS.levels));
  const bx = car.x - c * SKIDS.wheelBack, by = car.y - s * SKIDS.wheelBack;
  const ox = s * SKIDS.wheelSide, oy = c * SKIDS.wheelSide;
  skids.marks.push(
    { x: Math.round(bx + ox), y: Math.round(by - oy), level },
    { x: Math.round(bx - ox), y: Math.round(by + oy), level },
  );
  if (skids.marks.length > SKIDS.max) skids.marks.splice(0, SKIDS.trim);
}
