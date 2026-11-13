import { TRACK } from '../config';
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
}

const UP = -Math.PI / 2;

export function createTrack(rng: Rng): Track {
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
  t.heading += t.curvature;

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
