import { describe, expect, it } from 'vitest';
import { CAR, TRACK, UNCAPPED } from '../src/config';
import { crashedAtStart, createGame, speedOf, step, type GameState, type SteerIntent } from '../src/sim/game';
import { bendScale, extendTrack } from '../src/sim/track';

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

  /** A good autopilot: aims ahead by time (further at speed) and allows for the slide. */
  const pilot = (g: GameState): SteerIntent => {
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const v = Math.hypot(g.car.vx, g.car.vy) || 1;
    const tgt = g.track.pts[g.trackIndex + Math.max(2, Math.round((v * 0.35) / 20))];
    const want = Math.atan2(tgt.y - g.car.y, tgt.x - g.car.x);
    const travel = Math.atan2(g.car.vy, g.car.vx);
    return { kind: 'rate', rate: Math.max(-1, Math.min(1, wrap(want + wrap(want - travel) * 0.8 - g.car.h) * 5)) };
  };

  it('uncapped: the car keeps accelerating at the same rate, and booms once at the boom speed', () => {
    const drive = (uncapped: boolean, seconds: number) => {
      const g = createGame(4, 'run', 0, uncapped);
      const booms: number[] = [];
      for (let i = 0; i < 120 * seconds; i++) if (step(g, pilot(g), DT, { crash: false, uncapped }) === 'boom') booms.push(speedOf(g));
      return { g, booms };
    };
    const capped = drive(false, 70);
    expect(capped.g.car.speed).toBe(CAR.maxSpeed);
    expect(capped.booms).toEqual([]);
    const { g, booms } = drive(true, 70);
    expect(g.car.speed).toBeCloseTo(CAR.startSpeed + CAR.accel * 70, 0); // linear, no cap
    expect(booms).toHaveLength(1);
    expect(booms[0]).toBeGreaterThanOrEqual(UNCAPPED.boomSpeed);
    expect(booms[0]).toBeLessThan(UNCAPPED.boomSpeed + 1);
  });

  it('uncapped road: the normal road until top speed, then bends ease off with distance', () => {
    const normal = createGame(9).track, unc = createGame(9, 'ready', 0, true).track;
    extendTrack(normal, 3000);
    extendTrack(unc, 3000);
    const sharp = TRACK.maxCurvature + 1e-9;
    const turn = (pts: { x: number; y: number }[], i: number) => {
      const a = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
      const b = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
      return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
    };
    let firstScaled = 0;
    while (bendScale(firstScaled) === 1) firstScaled++;
    expect(firstScaled).toBeGreaterThan(400); // about score 180
    expect(unc.pts.slice(0, firstScaled)).toEqual(normal.pts.slice(0, firstScaled));
    for (let i = firstScaled + 1; i < 2999; i++) expect(turn(unc.pts, i)).toBeLessThanOrEqual(sharp * bendScale(i - 1) + 1e-6);
  });

  it('uncapped road: a good driver gets past the sonic boom (on the normal road, mostly not)', () => {
    const run = (seed: number, gentle: boolean) => {
      const g = createGame(seed, 'run', 0, gentle);
      for (let t = 0; t < 150 && g.phase === 'run'; t += DT) step(g, pilot(g), DT, { crash: true, uncapped: true });
      return g.boomed;
    };
    for (const seed of [1, 2, 3, 4, 5]) expect(run(seed, true)).toBe(true);
    expect([1, 2, 3, 4, 5].filter(seed => run(seed, false)).length).toBeLessThan(3);
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
