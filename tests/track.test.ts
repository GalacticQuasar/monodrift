import { describe, expect, it } from 'vitest';
import { TRACK } from '../src/config';
import { createRng } from '../src/sim/rng';
import { createTrack, extendTrack, nearestPoint } from '../src/sim/track';

describe('track', () => {
  it('is identical for the same seed', () => {
    const a = createTrack(createRng(42));
    const b = createTrack(createRng(42));
    extendTrack(a, 1000);
    extendTrack(b, 1000);
    expect(a.pts).toEqual(b.pts);
  });

  it('differs between seeds', () => {
    const a = createTrack(createRng(1));
    const b = createTrack(createRng(2));
    expect(a.pts).not.toEqual(b.pts);
  });

  it('starts straight and always heads upward within the heading limit', () => {
    const t = createTrack(createRng(7));
    extendTrack(t, 5000);
    for (let i = 0; i <= TRACK.straightSegments; i++) expect(t.pts[i].x).toBe(0);

    const UP = -Math.PI / 2;
    for (let i = 1; i < t.pts.length; i++) {
      const dx = t.pts[i].x - t.pts[i - 1].x;
      const dy = t.pts[i].y - t.pts[i - 1].y;
      expect(Math.hypot(dx, dy)).toBeCloseTo(TRACK.segmentLength, 6);
      expect(Math.abs(Math.atan2(dy, dx) - UP)).toBeLessThanOrEqual(TRACK.headingLimit + 1e-9);
    }
  });

  it('finds the nearest point', () => {
    const t = createTrack(createRng(3));
    const p = t.pts[50];
    expect(nearestPoint(t, p.x + 1, p.y, 0)).toEqual({ index: 50, distSq: 1 });
  });
});
