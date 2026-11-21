// The whole simulation. No DOM, no clock, no Math.random: the same seed and the
// same sequence of intents always produce the same run.

import { ROAD_EDGE, TRACK, UNCAPPED } from '../config';
import { createCar, slipOf, updateCar, type Car, type Steer } from './car';
import { createRng } from './rng';
import { distanceScore } from './scoring';
import { createSkids, emitSkids, type Skids } from './skids';
import { createTrack, extendTrack, nearestPoint, type Track } from './track';

export type Phase = 'ready' | 'run' | 'over';

/**
 * What the player wants this step, independent of device.
 * `aim` is a heading offset from wherever the car pointed when gesture `gesture` began.
 */
export type SteerIntent =
  | { kind: 'rate'; rate: number }
  | { kind: 'aim'; offset: number; gesture: number };

export interface Rules {
  /** When false, leaving the road doesn't end the run. */
  crash: boolean;
  /** Game-speed multiplier (Speed setting); 1 when left out. */
  speed?: number;
  /**
   * Uncapped: no top speed, the car keeps accelerating (sonic boom at
   * UNCAPPED.boomSpeed). Needs a game made with createGame(…, uncapped = true), whose
   * road eases its bends to match.
   */
  uncapped?: boolean;
}

export interface GameState {
  phase: Phase;
  seed: number;
  track: Track;
  car: Car;
  trackIndex: number;
  skids: Skids;
  score: number;
  aim: { gesture: number; anchor: number } | null;
  /** Uncapped: the sonic boom has happened this run. */
  boomed: boolean;
}

/** The car's speed (px/s). */
export const speedOf = (g: GameState): number => g.car.speed;

/** crash: the run ended; boom: Uncapped broke the sound barrier (once per run). */
export type StepEvent = 'crash' | 'boom';

/**
 * `startX`: sideways start position (multiplayer rooms put each car in its own lane; 0 = centre).
 * `uncapped`: an Uncapped road, its bends easing off with distance (run it with Rules.uncapped).
 */
export function createGame(seed: number, phase: Phase = 'ready', startX = 0, uncapped = false): GameState {
  return {
    phase,
    seed,
    track: createTrack(createRng(seed), uncapped),
    car: createCar(startX),
    trackIndex: TRACK.startIndex,
    skids: createSkids(),
    score: 0,
    aim: null,
    boomed: false,
  };
}

/** Advance the game by `dt` seconds. Mutates `g`; returns an event if one happened. */
export function step(g: GameState, intent: SteerIntent, dt: number, rules: Rules): StepEvent | null {
  if (g.phase !== 'run') return null;
  dt *= rules.speed ?? 1;

  updateCar(g.car, resolveSteer(g, intent), dt, rules.uncapped ? Infinity : undefined);

  const near = nearestPoint(g.track, g.car.x, g.car.y, g.trackIndex - TRACK.searchBehind);
  g.trackIndex = near.index;
  extendTrack(g.track, g.trackIndex + TRACK.pointsAhead);
  g.score = Math.max(g.score, distanceScore(g.trackIndex));

  emitSkids(g.skids, g.car, slipOf(g.car));

  if (rules.crash && near.distSq > ROAD_EDGE ** 2) {
    g.phase = 'over';
    return 'crash';
  }
  if (rules.uncapped && !g.boomed && speedOf(g) >= UNCAPPED.boomSpeed) {
    g.boomed = true;
    return 'boom';
  }
  return null;
}

/**
 * Easter egg (Ready Player One's backwards race): the run ended by turning around
 * and driving off the very start of the road, through the rounded end behind the spawn.
 */
export function crashedAtStart(g: GameState): boolean {
  if (g.phase !== 'over' || g.trackIndex !== 0) return false;
  const [a, b] = g.track.pts;
  // behind the first point, looking back along the road
  return (g.car.x - a.x) * (a.x - b.x) + (g.car.y - a.y) * (a.y - b.y) > 0;
}

function resolveSteer(g: GameState, intent: SteerIntent): Steer {
  if (intent.kind === 'rate') return { rate: intent.rate };
  // a new gesture anchors to the current heading
  if (g.aim?.gesture !== intent.gesture) g.aim = { gesture: intent.gesture, anchor: g.car.h };
  return { target: g.aim.anchor + intent.offset };
}
