import { describe, expect, it } from 'vitest';
import { createGame, step, type SteerIntent } from '../src/sim/game';

const DT = 1 / 120;
const ON = { crash: true };
const OFF = { crash: false };

/** A scripted wiggle, standing in for recorded player input. */
const scripted = (i: number): SteerIntent =>
  i % 240 < 80 ? { kind: 'rate', rate: Math.sin(i / 20) } : { kind: 'aim', offset: Math.cos(i / 30) * 0.5, gesture: Math.floor(i / 240) };

describe('game', () => {
  it('does nothing until the run starts', () => {
    const g = createGame(1);
    const before = structuredClone({ car: g.car, score: g.score });
    expect(step(g, { kind: 'rate', rate: 1 }, DT, ON)).toBeNull();
    expect({ car: g.car, score: g.score }).toEqual(before);
  });

  it('is deterministic: same seed + same inputs = same run', () => {
    const run = () => {
      const g = createGame(99, 'run');
      for (let i = 0; i < 1200; i++) step(g, scripted(i), DT, OFF);
      return { car: g.car, score: g.score, trackIndex: g.trackIndex, skids: g.skids.marks.length };
    };
    expect(run()).toEqual(run());
  });

  it('scores distance travelled on a straight', () => {
    const g = createGame(5, 'run');
    for (let i = 0; i < 60; i++) step(g, { kind: 'rate', rate: 0 }, DT, ON);
    expect(g.phase).toBe('run');
    expect(g.score).toBeGreaterThan(0);
  });

  it('crashes off-road only when crash is on', () => {
    const on = createGame(5, 'run');
    on.car.x = 500;
    expect(step(on, { kind: 'rate', rate: 0 }, DT, ON)).toBe('crash');
    expect(on.phase).toBe('over');

    const off = createGame(5, 'run');
    off.car.x = 500;
    expect(step(off, { kind: 'rate', rate: 0 }, DT, OFF)).toBeNull();
    expect(off.phase).toBe('run');
  });
});
