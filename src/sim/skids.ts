import { SKIDS } from '../config';
import type { Car } from './car';

export interface SkidMark {
  x: number;
  y: number;
  alpha: number;
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
  for (const side of [-1, 1]) {
    skids.marks.push({
      x: car.x - c * SKIDS.wheelBack - s * side * SKIDS.wheelSide,
      y: car.y - s * SKIDS.wheelBack + c * side * SKIDS.wheelSide,
      alpha,
    });
  }
  if (skids.marks.length > SKIDS.max) skids.marks.splice(0, SKIDS.trim);
}
