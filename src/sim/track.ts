import { CAR, TRACK } from '../config';
import type { Rng } from './rng';

export interface Point {
  x: number;
  y: number;
}

/** The road centreline, generated lazily ahead of the car. */
export interface Track {
  pts: Point[];
  heading: number;
  curvature: number;
  targetCurvature: number;
  segmentsLeft: number;
  rng: Rng;
  /** An Uncapped road: bends ease off with distance (see bendScale). */
  uncapped: boolean;
}

const UP = -Math.PI / 2;

/**
 * Uncapped roads: how much of each bend to keep at track point `index`. The car keeps
 * accelerating, so by then it's doing about sqrt(v0² + 2·a·distance); with the same
 * steering, its tightest turn widens in proportion to its speed, so bends are scaled
 * down by top speed / that speed. 1 until the car would pass Normal's top speed (about
 * score 180), so up to there the road is the same as the normal one (same random draws).
 */
export function bendScale(index: number): number {
  const d = Math.max(0, index - TRACK.startIndex) * TRACK.segmentLength;
  const v = Math.sqrt(CAR.startSpeed ** 2 + 2 * CAR.accel * d);
  return Math.min(1, CAR.maxSpeed / v);
}

export function createTrack(rng: Rng, uncapped = false): Track {
  const pts: Point[] = [];
  for (let i = 0; i <= TRACK.straightSegments; i++) {
    pts.push({ x: 0, y: TRACK.startY - i * TRACK.segmentLength });
  }
  const track: Track = {
    pts,
    heading: UP,
    curvature: 0,
    targetCurvature: 0,
    segmentsLeft: TRACK.firstBendAfter,
    rng,
    uncapped,
  };
  extendTrack(track, TRACK.initialPoints);
  return track;
}

/** Generate points until the track has at least `length` of them. */
export function extendTrack(track: Track, length: number): void {
  while (track.pts.length < length) addPoint(track);
}

function addPoint(t: Track): void {
  if (--t.segmentsLeft <= 0) {
    t.targetCurvature = (t.rng() * 2 - 1) * TRACK.maxCurvature;
    t.segmentsLeft = Math.floor(TRACK.bendMinSegments + t.rng() * TRACK.bendExtraSegments);
  }
  t.curvature += (t.targetCurvature - t.curvature) * TRACK.curvatureEase;
  t.heading += t.uncapped ? t.curvature * bendScale(t.pts.length) : t.curvature;

  // keep the road heading broadly upward, bouncing bends off the limits
  const lim = TRACK.headingLimit;
  if (t.heading < UP - lim) {
    t.heading = UP - lim;
    t.targetCurvature = Math.abs(t.targetCurvature);
  }
  if (t.heading > UP + lim) {
    t.heading = UP + lim;
    t.targetCurvature = -Math.abs(t.targetCurvature);
  }

  const p = t.pts[t.pts.length - 1];
  t.pts.push({
    x: p.x + Math.cos(t.heading) * TRACK.segmentLength,
    y: p.y + Math.sin(t.heading) * TRACK.segmentLength,
  });
}

/**
 * Nearest track point to (x, y), searching from `from` to the end of the
 * generated track (so cutting back onto the road further ahead still counts).
 */
export function nearestPoint(
  track: Track,
  x: number,
  y: number,
  from: number,
): { index: number; distSq: number } {
  let index = Math.max(0, from);
  let distSq = Infinity;
  for (let i = Math.max(0, from); i < track.pts.length; i++) {
    const p = track.pts[i];
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < distSq) {
      distSq = d;
      index = i;
    }
  }
  return { index, distSq };
}
