import { describe, expect, it } from 'vitest';
import { CAR, UNCAPPED } from '../src/config';
import { crashedAtStart, createGame, speedOf, step, uncappedSpeed, type SteerIntent } from '../src/sim/game';

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

  it('can start off-centre (room lanes) without changing anything else', () => {
    const a = createGame(5), b = createGame(5, 'ready', 18);
    expect(b.car.x).toBe(18);
    expect(b.car.prevX).toBe(18);
    expect({ ...b.car, x: 0, prevX: 0 }).toEqual(a.car);
    expect(b.track.pts).toEqual(a.track.pts);
  });

  it('uncapped: speed is a cubic of distance, level at the sound barrier', () => {
    expect(uncappedSpeed(0)).toBeCloseTo(CAR.startSpeed);
    expect(uncappedSpeed(UNCAPPED.boomScore)).toBe(UNCAPPED.boomSpeed);
    // flat around the barrier, steep away from it
    const slope = (s: number) => uncappedSpeed(s + 1) - uncappedSpeed(s);
    expect(slope(UNCAPPED.boomScore)).toBeLessThan(0.01);
    expect(slope(0)).toBeGreaterThan(3);
    expect(slope(2 * UNCAPPED.boomScore)).toBeGreaterThan(3);
  });

  it('uncapped: the car follows the curve and booms once, near the boom score', () => {
    const run = (uncapped: boolean) => {
      const g = createGame(4, 'run');
      const events: { t: number; score: number; speed: number }[] = [];
      for (let i = 0; i < 120 * 70; i++) {
        // autopilot (zen, so a slip doesn't end it): keeps the car on the road, so distance grows
        const tgt = g.track.pts[g.trackIndex + 4];
        let d = Math.atan2(tgt.y - g.car.y, tgt.x - g.car.x) - g.car.h;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (step(g, { kind: 'rate', rate: Math.max(-1, Math.min(1, d * 6)) }, DT, { crash: false, uncapped }) === 'boom')
          events.push({ t: i * DT, score: g.score, speed: speedOf(g) });
      }
      return { g, events };
    };
    const capped = run(false);
    expect(capped.g.pace).toBe(1); // never moves outside Uncapped
    expect(capped.events).toEqual([]);
    const { g, events } = run(true);
    expect(events).toHaveLength(1);
    expect(events[0].speed).toBeGreaterThanOrEqual(UNCAPPED.boomSpeed);
    expect(Math.abs(events[0].score - UNCAPPED.boomScore)).toBeLessThan(20);
    expect(g.boomed).toBe(true);
    expect(speedOf(g)).toBeGreaterThan(UNCAPPED.boomSpeed); // and faster since
  });

  it('uncapped: at double pace the car traces the same curve in half the time', () => {
    const circle = (pace: number, seconds: number) => {
      const g = createGame(4, 'run');
      g.pace = pace;
      for (let t = 0; t < seconds - 1e-9; t += DT) step(g, { kind: 'rate', rate: 1 }, DT, OFF);
      return g.car;
    };
    const slow = circle(1, 2), fast = circle(2, 1);
    expect(Math.hypot(slow.x - fast.x, slow.y - fast.y)).toBeLessThan(3);
    expect(fast.h).toBeCloseTo(slow.h, 1);
  });

  it('is deterministic: same seed + same inputs = same run', () => {
    const run = () => {
      const g = createGame(99, 'run');
      for (let i = 0; i < 1200; i++) step(g, scripted(i), DT, OFF);
      return { car: g.car, score: g.score, trackIndex: g.trackIndex, skids: g.skids.marks.length };
    };
    expect(run()).toEqual(run());
  });

  it('speed scales game time: a step at speed 1.25 = a step 1.25x as long', () => {
    const run = (dt: number, speed?: number) => {
      const g = createGame(7, 'run');
      for (let i = 0; i < 600; i++) step(g, scripted(i), dt, { crash: false, speed });
      return { car: g.car, score: g.score, trackIndex: g.trackIndex };
    };
    expect(run(DT, 1.25)).toEqual(run(DT * 1.25));
    expect(run(DT, 1)).toEqual(run(DT));
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

  it('spots a crash into the start of the road (easter egg)', () => {
    const run = (setup: (g: ReturnType<typeof createGame>) => void) => {
      const g = createGame(5, 'run');
      setup(g);
      for (let i = 0; i < 600 && g.phase === 'run'; i++) step(g, { kind: 'rate', rate: 0 }, DT, ON);
      expect(g.phase).toBe('over');
      return crashedAtStart(g);
    };
    // turned around: straight back down the road, off its rounded start
    expect(run(g => Object.assign(g.car, { h: Math.PI / 2, vy: 200 }))).toBe(true);
    // off the side near the start, or a normal crash further on: no egg
    expect(run(g => Object.assign(g.car, { h: 0, vx: 200, vy: 0 }))).toBe(false);
    const g = createGame(5, 'run');
    g.car.x = 500;
    step(g, { kind: 'rate', rate: 0 }, DT, ON);
    expect(crashedAtStart(g)).toBe(false);
  });
});
