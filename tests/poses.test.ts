import { describe, expect, it } from 'vitest';
import { NET } from '../src/config';
import { PoseLog, packPoses, samplePose, sampleIndex, unpackPoses, type Pose } from '../src/lib/poses';
import { createRunRecorder } from '../src/lib/run-recorder';
import { autopilot } from '../src/net/bot';
import { createLiveRival } from '../src/net/rivals';
import { createGame, step } from '../src/sim/game';

const DT = 1 / 120;
const STEP_MS = 1000 / 120;

/** Drive a bot run, recording it. */
function botRun(seed: number, maxSteps = 120 * 60) {
  const g = createGame(seed, 'run');
  const rec = createRunRecorder();
  const intent = { kind: 'rate' as const, rate: 0 };
  rec.start(g);
  while (g.phase === 'run' && rec.steps < maxSteps) {
    const crashed = step(g, autopilot(g, rec.steps, intent), DT, { crash: true }) === 'crash';
    rec.record(g, crashed);
  }
  return { g, rec };
}

describe('pose packing', () => {
  it('round-trips to within half a pixel and a milliradian', () => {
    const { rec } = botRun(7, 120 * 20);
    const log = rec.log;
    const back = new PoseLog(4);
    expect(unpackPoses(packPoses(log), back)).toBe(true);
    expect(back.length).toBe(log.length);
    for (let k = 0; k < log.length; k++) {
      expect(back.s[k]).toBe(log.s[k]);
      expect(back.i[k]).toBe(log.i[k]);
      expect(Math.abs(back.x[k] - log.x[k])).toBeLessThanOrEqual(0.26);
      expect(Math.abs(back.y[k] - log.y[k])).toBeLessThanOrEqual(0.26);
      expect(Math.abs(back.h[k] - log.h[k])).toBeLessThanOrEqual(0.0006);
    }
  });

  it('packs in chunks that each stand alone, and skips repeats', () => {
    const { rec } = botRun(7, 120 * 5);
    const log = rec.log;
    const back = new PoseLog();
    for (let k = 0; k < log.length; k += 3) unpackPoses(packPoses(log, k, Math.min(log.length, k + 3)), back);
    unpackPoses(packPoses(log, 0, 6), back); // a stale repeat
    expect(back.length).toBe(log.length);
    expect(back.s[back.length - 1]).toBe(log.lastStep);
  });

  it('rejects junk', () => {
    const log = new PoseLog();
    expect(unpackPoses('nope', log)).toBe(false);
    expect(unpackPoses([1, 2, 3], log)).toBe(false);
    expect(unpackPoses([1, 2, 3, 4, 0.5], log)).toBe(false);
    expect(log.length).toBe(0);
  });

  it('samples every NET.sampleEvery steps, plus the crash', () => {
    const { g, rec } = botRun(3);
    expect(g.phase).toBe('over'); // the bot isn't perfect
    const { log } = rec;
    expect(log.s[0]).toBe(0);
    expect(log.s[1]).toBe(NET.sampleEvery);
    expect(log.lastStep).toBe(rec.steps);
    expect(log.x[log.length - 1]).toBe(Math.fround(g.car.x));
  });
});

describe('samplePose', () => {
  const log = new PoseLog();
  log.push(0, 0, 0, 0, 4);
  log.push(8, 80, -40, 0.4, 6);
  log.push(16, 160, -80, 0.8, 8);
  const out: Pose = { x: 0, y: 0, h: 0, i: 0 };

  it('interpolates between samples', () => {
    samplePose(log, 4, out);
    expect(out).toMatchObject({ x: 40, y: -20, i: 5 });
    expect(out.h).toBeCloseTo(0.2);
  });

  it('holds the first sample before the start', () => {
    samplePose(log, -10, out);
    expect(out).toMatchObject({ x: 0, y: 0 });
  });

  it('extrapolates past the end for a while, then holds', () => {
    samplePose(log, 20, out, 8);
    expect(out.x).toBeCloseTo(200);
    samplePose(log, 100, out, 8);
    expect(out.x).toBeCloseTo(240);
  });

  it('finds the sample from any hint', () => {
    for (const hint of [-5, 0, 1, 2, 99]) {
      expect(sampleIndex(log, 9, hint)).toBe(1);
      expect(sampleIndex(log, -1, hint)).toBe(-1);
    }
  });
});

describe('live rival', () => {
  it('follows the real car closely through network jitter', () => {
    const { rec } = botRun(11, 120 * 30);
    const { log } = rec;
    const rival = createLiveRival('r', 'R');
    // samples sent as taken, arriving 60-110 ms later (some out of order)
    const latency = (k: number) => 60 + ((k * 37) % 50);
    const arrivals = Array.from({ length: log.length }, (_, k) => ({ k, at: log.s[k] * STEP_MS + latency(k) }));
    arrivals.sort((a, b) => a.at - b.at);
    let next = 0;
    let worst = 0;
    for (let now = 0; now < log.lastStep * STEP_MS; now += 16) {
      while (next < arrivals.length && arrivals[next].at <= now) {
        const { k } = arrivals[next++];
        rival.receive(packPoses(log, k, k + 1), now);
      }
      rival.update(now);
      if (now < 500) continue; // settling in
      expect(rival.state).toBe('racing');
      // compare with where the car really was, a playback delay ago
      const truth: Pose = { x: 0, y: 0, h: 0, i: 0 };
      const delay = 60 + NET.bufferMs; // fastest arrival + buffer
      samplePose(log, (now - delay) / STEP_MS, truth);
      worst = Math.max(worst, Math.hypot(truth.x - rival.pose.x, truth.y - rival.pose.y));
    }
    expect(worst).toBeLessThan(25); // under a car length off, at worst
  });

  it('shows the crash once playback reaches it, and stays there', () => {
    const { g, rec } = botRun(3);
    const rival = createLiveRival('r', 'R');
    const end = rec.steps * STEP_MS;
    rival.receive(packPoses(rec.log), end); // everything, instantly
    rival.crash(rec.steps, g.score);
    rival.update(end - NET.bufferMs - 100); // not there yet
    expect(rival.state).toBe('racing');
    rival.update(end + 5000);
    expect(rival.state).toBe('crashed');
    expect(rival.score).toBe(g.score);
    expect(rival.pose.x).toBeCloseTo(g.car.x, 0);
  });
});
