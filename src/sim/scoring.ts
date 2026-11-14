import { CAR, SCORE, TRACK } from '../config';

/** Points for reaching a given track index. */
export function distanceScore(trackIndex: number): number {
  return Math.floor(((trackIndex - TRACK.startIndex) * TRACK.segmentLength) / SCORE.pxPerPoint);
}

/**
 * The highest score a real run could have after `seconds` of driving: flat out from
 * the start, at the car's top speed, cutting every bend. The leaderboard server
 * rejects scores above this for the time it measured.
 */
export function maxScoreAfter(seconds: number): number {
  const t = Math.max(0, seconds);
  const tTop = (CAR.maxSpeed - CAR.startSpeed) / CAR.accel; // time to reach top speed
  const a = Math.min(t, tTop);
  const px = CAR.startSpeed * a + 0.5 * CAR.accel * a * a + CAR.maxSpeed * (t - a);
  return Math.floor((px * SCORE.maxProgressPerPx) / SCORE.pxPerPoint);
}
