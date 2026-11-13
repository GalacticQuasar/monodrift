import { SCORE, TRACK } from '../config';

/** Points for reaching a given track index. */
export function distanceScore(trackIndex: number): number {
  return Math.floor(((trackIndex - TRACK.startIndex) * TRACK.segmentLength) / SCORE.pxPerPoint);
}
