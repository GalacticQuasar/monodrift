// Debug rival (?debug&bot): an autopilot drives its own copy of the game on the
// player's road, and its poses reach a live rival through a fake network (delay +
// jitter), exactly as a friend's would. For tuning rival drawing without a server.

import { NET } from '../config';
import { packPoses } from '../lib/poses';
import { createRunRecorder } from '../lib/run-recorder';
import { createGame, step, type GameState, type Rules, type SteerIntent } from '../sim/game';
import { createLiveRival, type LiveRival } from './rivals';

/** Steers toward a point a few track points ahead, weaving a little so it isn't perfect. */
export function autopilot(g: GameState, steps: number, out: { kind: 'rate'; rate: number }): SteerIntent {
  const look = 5;
  const a = g.track.pts[g.trackIndex + look], b = g.track.pts[g.trackIndex + look + 1];
  // aim off the centreline, sideways to the road, drifting from side to side
  const side = Math.sin(steps / 170) * 30;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const tx = a.x - ((b.y - a.y) / len) * side, ty = a.y + ((b.x - a.x) / len) * side;
  let d = Math.atan2(ty - g.car.y, tx - g.car.x) - g.car.h;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  out.rate = Math.max(-1, Math.min(1, d * 5));
  return out;
}

export interface Bot {
  readonly rival: LiveRival;
  /** New run on road `seed` (the player's). */
  start(seed: number, uncapped?: boolean): void;
  /** Off the road for good (back to the start screen). */
  stop(): void;
  /** One sim step, alongside the player's. */
  tick(dt: number, rules: Rules): void;
  /** Call once per frame. */
  update(nowMs: number): void;
}

export function createBot(): Bot {
  const rival = createLiveRival('bot', 'Bot');
  const rec = createRunRecorder();
  const intent = { kind: 'rate' as const, rate: 0 };
  let game: GameState | null = null;
  let sent = 0;
  let run = 0;

  /** Deliver after a fake network delay, unless a newer run started meanwhile. */
  const later = (fn: () => void) => {
    const r = run;
    setTimeout(() => r === run && fn(), NET.botLatencyMs + Math.random() * NET.botJitterMs);
  };
  const send = () => {
    const packed = packPoses(rec.log, sent);
    sent = rec.log.length;
    later(() => rival.receive(packed, performance.now()));
  };

  return {
    rival,
    start(seed, uncapped = false) {
      run++;
      rival.reset();
      game = createGame(seed, 'run', 0, uncapped);
      rec.start(game);
      sent = 0;
      send();
    },
    stop() {
      run++;
      game = null;
      rival.reset();
    },
    tick(dt, rules) {
      if (!game || game.phase !== 'run') return;
      const crashed = step(game, autopilot(game, rec.steps, intent), dt, rules) === 'crash';
      rec.record(game, crashed);
      if (rec.log.length > sent) send();
      if (crashed) {
        const { steps } = rec, score = game.score;
        later(() => rival.crash(steps, score));
      }
    },
    update(nowMs) {
      rival.update(nowMs);
    },
  };
}
