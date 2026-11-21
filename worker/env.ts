import type { Room } from './room';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Multiplayer rooms, one Durable Object per room code (worker/room.ts). */
  ROOMS: DurableObjectNamespace<Room>;
  /** HMAC key for run tickets (wrangler secret / .dev.vars). */
  TICKET_SECRET: string;
}
