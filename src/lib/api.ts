// Client for the leaderboard API (worker/index.ts). Every call can fail (offline,
// server down); callers treat a failure as "no leaderboard right now".

import { KEYS, storage } from './storage';

export interface Player {
  id: string;
  token: string;
  name: string;
}

export interface Rank {
  rank: number;
  score: number;
}

export interface SubmitResult {
  all: Rank | null;
  /** Only for runs on the daily road. */
  day?: Rank & { day: string };
}

export interface Board {
  board: 'today' | 'all';
  day: string;
  top: { rank: number; name: string; score: number; me: boolean }[];
  me: (Rank & { name: string }) | null;
}

/** A failed call; `message` is safe to show the player. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function player(): Player | null {
  try {
    const p = JSON.parse(storage.get(KEYS.player) ?? 'null') as Player | null;
    return p && p.id && p.token ? p : null;
  } catch {
    return null;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const me = player();
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(me ? { authorization: `Bearer ${me.id}.${me.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "can't reach the leaderboard");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'something went wrong');
  return data;
}

export const api = {
  /** At the start of a run; the ticket is needed to submit its score. */
  async ticket(seed: number, daily: boolean): Promise<string> {
    return (await call<{ ticket: string }>('POST', 'tickets', { seed, daily })).ticket;
  },
  async register(name: string): Promise<Player> {
    const p = await call<Player>('POST', 'players', { name });
    storage.set(KEYS.player, JSON.stringify(p));
    return p;
  },
  async rename(name: string): Promise<void> {
    const me = player();
    const r = await call<{ name: string }>('PATCH', 'players/me', { name });
    if (me) storage.set(KEYS.player, JSON.stringify({ ...me, name: r.name }));
  },
  submit(ticket: string, score: number): Promise<SubmitResult> {
    return call<SubmitResult>('POST', 'scores', { ticket, score });
  },
  board(which: 'today' | 'all'): Promise<Board> {
    return call<Board>('GET', `leaderboard?board=${which}`);
  },
};
