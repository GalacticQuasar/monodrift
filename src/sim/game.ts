// The whole simulation. No DOM, no clock, no Math.random: the same seed and the
// same sequence of intents always produce the same run.

import { CAR, ROAD_EDGE, TRACK } from '../config';
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
   * Uncapped: once the car reaches its top speed, the game keeps speeding up (see
   * GameState.pace) instead of holding it, so the car gets faster forever while still
   * turning through the same lines.
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
  /**
   * Uncapped's extra speed-up (1 = none): everything the car does runs this much faster.
   * Grows by CAR.accel / CAR.maxSpeed per second at top speed, as if the car kept
   * accelerating, with steering and grip keeping up (same curves, just quicker).
   */
  pace: number;
}

export type StepEvent = 'crash';

/** `startX`: sideways start position (multiplayer rooms put each car in its own lane; 0 = centre). */
export function createGame(seed: number, phase: Phase = 'ready', startX = 0): GameState {
  return {
    phase,
    seed,
    track: createTrack(createRng(seed)),
    car: createCar(startX),
    trackIndex: TRACK.startIndex,
    skids: createSkids(),
    score: 0,
    aim: null,
    pace: 1,
  };
}

/** Advance the game by `dt` seconds. Mutates `g`; returns an event if one happened. */
export function step(g: GameState, intent: SteerIntent, dt: number, rules: Rules): StepEvent | null {
  if (g.phase !== 'run') return null;
  dt *= rules.speed ?? 1;
  if (rules.uncapped && g.car.speed >= CAR.maxSpeed) g.pace += (CAR.accel / CAR.maxSpeed) * dt;
  dt *= g.pace;

  updateCar(g.car, resolveSteer(g, intent), dt);

  const near = nearestPoint(g.track, g.car.x, g.car.y, g.trackIndex - TRACK.searchBehind);
  g.trackIndex = near.index;
  extendTrack(g.track, g.trackIndex + TRACK.pointsAhead);
  g.score = Math.max(g.score, distanceScore(g.trackIndex));

  emitSkids(g.skids, g.car, slipOf(g.car));

  if (rules.crash && near.distSq > ROAD_EDGE ** 2) {
    g.phase = 'over';
    return 'crash';
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
