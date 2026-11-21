// Other cars on the road: drawn by the renderer from pose samples, never simulated.
// A live rival (multiplayer room) plays back samples as they arrive over the network,
// a little behind real time so it moves smoothly; a recorded ghost will play back by
// the player's own sim step instead.

import { NET, SIM_HZ } from '../config';
import { PoseLog, sampleIndex, samplePose, unpackPoses, type Pose } from '../lib/poses';

export type RivalState = 'waiting' | 'racing' | 'crashed' | 'gone';

/** What the renderer reads (updated in place, no per-frame garbage). */
export interface Rival {
  readonly id: string;
  name: string;
  /** Car colour id (config.ts CAR_COLORS), or null: drawn in the palette's rivalCar grey. */
  color: string | null;
  /** Current pose to draw. */
  readonly pose: Pose;
  state: RivalState;
  /** Score when they crashed (state 'crashed'). */
  score: number;
}

const STEP_MS = 1000 / SIM_HZ;

export interface LiveRival extends Rival {
  /** New run for this rival: drop the old samples. */
  reset(): void;
  /** Packed samples from the network, received at `nowMs` (performance.now()). */
  receive(packed: unknown, nowMs: number): void;
  /** They crashed at sim step `step` with `score`: shown once playback gets there. */
  crash(step: number, score: number): void;
  /** Advance playback to `nowMs`; call once per frame. */
  update(nowMs: number): void;
}

export function createLiveRival(id: string, name: string): LiveRival {
  const log = new PoseLog();
  /**
   * Local time minus remote run time, for the least-delayed sample seen. Playing back
   * at `now - offset - bufferMs` keeps samples arriving a little before they're needed.
   */
  let offset = NaN;
  let lastNow = 0;
  let hint = 0;
  let crashStep = -1;
  let crashScore = 0;

  const rival: LiveRival = {
    id,
    name,
    color: null,
    pose: { x: 0, y: 0, h: 0, i: 0 },
    state: 'waiting',
    score: 0,
    reset() {
      log.clear();
      offset = NaN;
      hint = 0;
      crashStep = -1;
      rival.state = 'waiting';
      rival.score = 0;
    },
    receive(packed, nowMs) {
      const before = log.lastStep;
      if (!unpackPoses(packed, log) || log.lastStep === before) return;
      // offset from the newest sample: drops instantly to a faster arrival, creeps up
      // slowly (a slower network, or their device running the sim behind real time)
      const o = nowMs - log.lastStep * STEP_MS;
      if (Number.isNaN(offset) || o < offset) offset = o;
      else offset += Math.min(o - offset, (nowMs - lastNow) * NET.offsetCreep);
      lastNow = nowMs;
      if (rival.state === 'waiting') rival.state = 'racing';
    },
    crash(step, score) {
      crashStep = step;
      crashScore = score;
    },
    update(nowMs) {
      if (!log.length || rival.state === 'gone') return;
      const t = (nowMs - offset - NET.bufferMs) / STEP_MS;
      hint = Math.max(0, sampleIndex(log, t, hint));
      // once crashed, stay where the crash happened (no extrapolating past it)
      const ahead = crashStep >= 0 ? 0 : NET.maxExtrapolateMs / STEP_MS;
      samplePose(log, crashStep >= 0 ? Math.min(t, crashStep) : t, rival.pose, ahead, hint);
      if (crashStep >= 0 && t >= crashStep && rival.state === 'racing') {
        rival.state = 'crashed';
        rival.score = crashScore;
      }
    },
  };
  return rival;
}
