// Records the player's run as pose samples (every NET.sampleEvery sim steps), for
// sending to a room and, later, for saving ghosts. Allocation-free once warmed up.

import { NET } from '../config';
import type { GameState } from '../sim/game';
import { PoseLog } from './poses';

export interface RunRecorder {
  readonly log: PoseLog;
  /** Sim steps since the run started. */
  readonly steps: number;
  /** New run: clear, and take the starting pose as sample 0. */
  start(g: GameState): void;
  /** Call after every sim step of the run; `final` forces a sample (the crash). */
  record(g: GameState, final?: boolean): void;
}

export function createRunRecorder(): RunRecorder {
  // ~10 minutes of samples before the log has to grow
  const log = new PoseLog(Math.ceil((600 * 120) / NET.sampleEvery));
  let steps = 0;
  const take = (g: GameState) => log.push(steps, g.car.x, g.car.y, g.car.h, g.trackIndex);
  return {
    log,
    get steps() {
      return steps;
    },
    start(g) {
      log.clear();
      steps = 0;
      take(g);
    },
    record(g, final = false) {
      steps++;
      if (final || steps % NET.sampleEvery === 0) take(g);
    },
  };
}
