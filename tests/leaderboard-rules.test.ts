import { describe, expect, it } from 'vitest';
import { dailySeed, utcDay } from '../src/sim/daily';
import { createGame, step } from '../src/sim/game';
import { maxScoreAfter } from '../src/sim/scoring';

const DT = 1 / 120;

describe('daily road', () => {
  it('uses the UTC date', () => {
    expect(utcDay(Date.UTC(2026, 10, 14, 23, 59))).toBe('2026-11-14');
    expect(utcDay(Date.UTC(2026, 10, 15, 0, 1))).toBe('2026-11-15');
  });
  it('gives a stable seed per day, different between days', () => {
    expect(dailySeed('2026-11-14')).toBe(dailySeed('2026-11-14'));
    expect(dailySeed('2026-11-14')).not.toBe(dailySeed('2026-11-15'));
  });
});

describe('maxScoreAfter', () => {
  it('grows with time', () => {
    expect(maxScoreAfter(0)).toBe(0);
    expect(maxScoreAfter(60)).toBeGreaterThan(maxScoreAfter(30));
  });

  it('is never beaten by a run that hugs the inside of every bend', () => {
    // autopilot aiming a little ahead on the road, steering hard: cuts corners as much
    // as the road allows while staying on it (crashes end the run, like a real one)
    for (const seed of [1, 42, 1234, 99999, 424242]) {
      for (const look of [2, 4, 8]) {
        const g = createGame(seed, 'run');
        let t = 0;
        while (g.phase === 'run' && t < 180) {
          const tgt = g.track.pts[g.trackIndex + look];
          let d = Math.atan2(tgt.y - g.car.y, tgt.x - g.car.x) - g.car.h;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          step(g, { kind: 'rate', rate: Math.max(-1, Math.min(1, d * 6)) }, DT, { crash: true });
          t += DT;
          expect(g.score).toBeLessThanOrEqual(maxScoreAfter(t));
        }
      }
    }
  });
});
