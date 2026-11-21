// Multiplayer room protocol: the messages between the game and a room (the Room
// Durable Object, worker/room.ts) over a WebSocket, as JSON. Shared by both sides,
// so it has no DOM and no Worker APIs.
//
// The room only relays: each game simulates its own car and sends pose samples
// (lib/poses.ts packing); the room passes them on, and runs the lobby, the start of
// each round and the results.

/** Bump when messages change incompatibly: an older cached game is told to reload. */
export const PROTOCOL = 1;

export const ROOM = {
  maxPlayers: 2,
  /** Room codes: this many letters from CODE_ALPHABET. */
  codeLength: 4,
  /** Countdown before a round starts (each game counts down from receiving `start`). */
  countdownMs: 3000,
  /** Largest message accepted from a game (bytes of JSON). */
  maxMessageBytes: 4096,
  /** Messages per second accepted from one game; more are dropped. */
  maxMessagesPerSecond: 40,
  /** A room nobody has been connected to for this long is deleted. */
  idleMs: 30 * 60 * 1000,
} as const;

/** No look-alikes (0/O, 1/I/L) so codes survive being read out or typed. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const isRoomCode = (s: string): boolean =>
  s.length === ROOM.codeLength && [...s].every(c => CODE_ALPHABET.includes(c));

/** Room codes are case-insensitive to type; stored and shown upper case. */
export const normalizeCode = (s: string): string => s.trim().toUpperCase();

export type RoadKind = 'random' | 'daily';
/** lobby: waiting for everyone to be ready; racing: a round is on; results: it ended. */
export type RoomPhase = 'lobby' | 'racing' | 'results';
/** racing: driving this round; crashed: out of it; watching: joined mid-round, waits for the next. */
export type PlayerStatus = 'idle' | 'racing' | 'crashed' | 'watching';

export interface PlayerView {
  id: string;
  name: string;
  /** Wants the next round to start. */
  ready: boolean;
  status: PlayerStatus;
  /** Score in the latest round (0 before the first). */
  score: number;
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  /** Round number, counting from 1; 0 before the first. */
  round: number;
  road: RoadKind;
  /** The current/latest round's road seed (0 before the first). */
  seed: number;
  /** Whether that seed is the daily road (so a run on it can count for the daily board). */
  daily: boolean;
  players: PlayerView[];
}

// game -> room
export type ClientMsg =
  | { t: 'hello'; v: number; name: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'road'; road: RoadKind }
  /** Pose samples for round `r` (lib/poses.ts packPoses). */
  | { t: 'pose'; r: number; d: number[] }
  /** Crashed in round `r` at sim step `s` with `score`. */
  | { t: 'crash'; r: number; s: number; score: number };

export type ErrorCode = 'version' | 'full' | 'no-room' | 'bad-message';

// room -> game
export type ServerMsg =
  | { t: 'welcome'; you: string; room: RoomView }
  /** The room changed (players, readiness, phase, scores): the whole picture. */
  | { t: 'room'; room: RoomView }
  /** Round `r` starts on road `seed` in `inMs` (the countdown). */
  | { t: 'start'; r: number; seed: number; daily: boolean; inMs: number }
  | { t: 'pose'; id: string; r: number; d: number[] }
  | { t: 'crashed'; id: string; r: number; s: number; score: number }
  | { t: 'error'; code: ErrorCode };

const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** The message, if `raw` is a well-formed game -> room message; null otherwise. */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (typeof raw !== 'string' || raw.length > ROOM.maxMessageBytes) return null;
  let m: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    m = v as Record<string, unknown>;
  } catch {
    return null;
  }
  switch (m.t) {
    case 'hello':
      return isInt(m.v, 0, 1e6) && typeof m.name === 'string' ? { t: 'hello', v: m.v, name: m.name } : null;
    case 'ready':
      return typeof m.ready === 'boolean' ? { t: 'ready', ready: m.ready } : null;
    case 'road':
      return m.road === 'random' || m.road === 'daily' ? { t: 'road', road: m.road } : null;
    case 'pose':
      // contents are checked by whoever unpacks them; here just the shape
      return isInt(m.r, 1, 1e9) && Array.isArray(m.d) && m.d.length <= 500 && m.d.every(x => Number.isInteger(x))
        ? { t: 'pose', r: m.r, d: m.d as number[] }
        : null;
    case 'crash':
      return isInt(m.r, 1, 1e9) && isInt(m.s, 0, 1e9) && isInt(m.score, 0, 1e7) ? { t: 'crash', r: m.r, s: m.s, score: m.score } : null;
    default:
      return null;
  }
}
