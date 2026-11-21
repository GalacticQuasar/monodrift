// The rules of a multiplayer room, as a plain state machine: no sockets, no storage,
// no clock (time and randomness come in as arguments), so it's unit-tested in Node.
// worker/room.ts (the Durable Object) feeds it events and sends what it returns.

import { cleanName, nameProblem, NAME_MAX } from '../src/lib/names';
import {
  PROTOCOL,
  ROOM,
  type ClientMsg,
  type ErrorCode,
  type PlayerView,
  type RoadKind,
  type RoomPhase,
  type RoomView,
  type ServerMsg,
} from '../src/lib/room-protocol';
import { dailySeed, utcDay } from '../src/sim/daily';

export interface RoomState {
  code: string;
  /** Made by POST /api/rooms; a socket to a room that wasn't is turned away. */
  created: boolean;
  phase: RoomPhase;
  round: number;
  road: RoadKind;
  seed: number;
  daily: boolean;
  players: PlayerView[];
}

/** A message to send: to player `only`, or else to everyone (but `except`). */
export interface Out {
  msg: ServerMsg;
  only?: string;
  except?: string;
}

export interface Ctx {
  /** ms since the epoch. */
  now: number;
  /** A random whole number in [0, 2^32). */
  random: () => number;
}

export const DEFAULT_NAME = 'Driver';

export function createRoomState(code: string): RoomState {
  return { code, created: false, phase: 'lobby', round: 0, road: 'random', seed: 0, daily: false, players: [] };
}

export function view(s: RoomState): RoomView {
  return { code: s.code, phase: s.phase, round: s.round, road: s.road, seed: s.seed, daily: s.daily, players: s.players.map(p => ({ ...p })) };
}

const snapshot = (s: RoomState): Out => ({ msg: { t: 'room', room: view(s) } });

/** A player joins (their `hello`). On failure, the error to send before closing. */
export function join(s: RoomState, id: string, name: string, version: number): { out: Out[] } | { error: ErrorCode } {
  if (!s.created) return { error: 'no-room' };
  if (version !== PROTOCOL) return { error: 'version' };
  if (s.players.length >= ROOM.maxPlayers) return { error: 'full' };
  s.players.push({
    id,
    name: uniqueName(s, cleanName(name)),
    ready: false,
    // arriving mid-round: watch it, drive the next one
    status: s.phase === 'racing' ? 'watching' : 'idle',
    score: 0,
  });
  return { out: [{ only: id, msg: { t: 'welcome', you: id, room: view(s) } }, { except: id, msg: { t: 'room', room: view(s) } }] };
}

/** A player's socket closed. */
export function leave(s: RoomState, id: string, ctx: Ctx): Out[] {
  const i = s.players.findIndex(p => p.id === id);
  if (i < 0) return [];
  s.players.splice(i, 1);
  if (!s.players.length) {
    s.phase = 'lobby';
    return [];
  }
  return [...endRoundIfDone(s), ...maybeStart(s, ctx), snapshot(s)];
}

/**
 * A message from a joined player. `changed`: the room state changed (persist it);
 * relayed poses don't change it.
 */
export function handle(s: RoomState, id: string, msg: ClientMsg, ctx: Ctx): { out: Out[]; changed: boolean } {
  const p = s.players.find(p => p.id === id);
  if (!p) return { out: [], changed: false };
  switch (msg.t) {
    case 'pose':
      if (s.phase !== 'racing' || msg.r !== s.round || p.status !== 'racing') break;
      return { out: [{ except: id, msg: { t: 'pose', id, r: msg.r, d: msg.d } }], changed: false };

    case 'crash': {
      if (s.phase !== 'racing' || msg.r !== s.round || p.status !== 'racing') break;
      p.status = 'crashed';
      p.score = msg.score;
      const out: Out[] = [{ except: id, msg: { t: 'crashed', id, r: msg.r, s: msg.s, score: msg.score } }];
      return { out: [...out, ...endRoundIfDone(s), ...maybeStart(s, ctx), snapshot(s)], changed: true };
    }

    case 'ready':
      // not while driving; a crashed player may ready up for the next round already
      if (p.status === 'racing' || p.ready === msg.ready) break;
      p.ready = msg.ready;
      return { out: [...maybeStart(s, ctx), snapshot(s)], changed: true };

    case 'road':
      if (s.phase === 'racing' || s.road === msg.road) break;
      s.road = msg.road;
      return { out: [snapshot(s)], changed: true };

    case 'hello': // already joined
      break;
  }
  return { out: [], changed: false };
}

/** Everyone still driving has crashed (or left): show the results. */
function endRoundIfDone(s: RoomState): Out[] {
  if (s.phase !== 'racing' || s.players.some(p => p.status === 'racing')) return [];
  s.phase = 'results';
  return [];
}

/** Between rounds, once everyone is ready: start the next one. */
function maybeStart(s: RoomState, ctx: Ctx): Out[] {
  if (s.phase === 'racing' || !s.players.length || !s.players.every(p => p.ready)) return [];
  s.round++;
  s.daily = s.road === 'daily';
  s.seed = s.daily ? dailySeed(utcDay(ctx.now)) : ctx.random() >>> 0;
  s.phase = 'racing';
  for (const p of s.players) {
    p.ready = false;
    p.status = 'racing';
    p.score = 0;
  }
  return [{ msg: { t: 'start', r: s.round, seed: s.seed, daily: s.daily, inMs: ROOM.countdownMs } }];
}

/** A valid name, not already used in the room ("Sam" -> "Sam 2"). */
function uniqueName(s: RoomState, name: string): string {
  const base = nameProblem(name) ? DEFAULT_NAME : name;
  const taken = (n: string) => s.players.some(p => p.name.toLowerCase() === n.toLowerCase());
  if (!taken(base)) return base;
  for (let k = 2; ; k++) {
    const suffix = ` ${k}`;
    const n = base.slice(0, NAME_MAX - suffix.length) + suffix;
    if (!taken(n)) return n;
  }
}
