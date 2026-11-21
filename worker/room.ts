// A multiplayer room: one Durable Object per room code, holding its players'
// WebSockets. It runs the rules in room-logic.ts and relays pose samples; it never
// simulates anything. Uses the hibernation API, so an idle room (lobby, results)
// costs nothing while its sockets stay open; the room state is kept in storage so it
// survives hibernation.

import { DurableObject } from 'cloudflare:workers';
import { parseClientMsg, ROOM, type ErrorCode, type ServerMsg } from '../src/lib/room-protocol';
import type { Env } from './env';
import { createRoomState, handle, join, leave, view, type Ctx, type Out, type RoomState } from './room-logic';
import { randomId } from './tickets';

/** Kept on each socket (survives hibernation): the player it belongs to, once they've said hello. */
interface Attachment {
  id: string | null;
}

/** Close codes sent with an error (4000-4999 are for applications). */
const CLOSE: Record<ErrorCode, number> = { 'bad-message': 4000, version: 4001, full: 4002, 'no-room': 4003 };

const ctxNow = (): Ctx => ({ now: Date.now(), random: () => crypto.getRandomValues(new Uint32Array(1))[0] });

export class Room extends DurableObject<Env> {
  private room: RoomState | null = null;
  /** Message counts per socket for rate limiting (in memory only; resets on wake, which is fine). */
  private rates = new Map<WebSocket, { second: number; count: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomState>('room')) ?? null;
    });
  }

  /** Called by POST /api/rooms. False if the code is already in use. */
  async create(code: string): Promise<boolean> {
    if (this.room?.created) return false;
    this.room = createRoomState(code);
    this.room.created = true;
    await this.save();
    await this.ctx.storage.setAlarm(Date.now() + ROOM.idleMs);
    return true;
  }

  /** Called by GET /api/rooms/:code. */
  async info(): Promise<{ open: boolean; players: number; full: boolean }> {
    const players = this.room?.players.length ?? 0;
    return { open: !!this.room?.created, players, full: players >= ROOM.maxPlayers };
  }

  /** The WebSocket upgrade (GET /api/rooms/:code/ws, forwarded by the Worker). */
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: null } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (this.overRate(ws)) return;
    const msg = parseClientMsg(data);
    const att = ws.deserializeAttachment() as Attachment;
    const room = this.room;
    if (!msg || !room) return this.reject(ws, room ? 'bad-message' : 'no-room');

    if (att.id === null) {
      // the first message must be hello
      if (msg.t !== 'hello') return this.reject(ws, 'bad-message');
      const id = randomId(8);
      const res = join(room, id, msg.name, msg.v);
      if ('error' in res) return this.reject(ws, res.error);
      ws.serializeAttachment({ id } satisfies Attachment);
      await this.save();
      return this.send(res.out);
    }

    const { out, changed } = handle(room, att.id, msg, ctxNow());
    if (changed) await this.save();
    this.send(out);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.gone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.gone(ws);
  }

  /** Idle check: delete a room nobody is in. */
  async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM.idleMs);
      return;
    }
    this.room = null;
    await this.ctx.storage.deleteAll();
  }

  private async gone(ws: WebSocket) {
    this.rates.delete(ws);
    const { id } = ws.deserializeAttachment() as Attachment;
    try {
      ws.close(1000, 'bye');
    } catch {
      // already closed
    }
    if (!id || !this.room) return;
    const out = leave(this.room, id, ctxNow());
    await this.save();
    this.send(out);
    if (!this.room.players.length) await this.ctx.storage.setAlarm(Date.now() + ROOM.idleMs);
  }

  private reject(ws: WebSocket, code: ErrorCode) {
    this.sendTo(ws, { t: 'error', code });
    ws.close(CLOSE[code], code);
  }

  private send(out: Out[]) {
    if (!out.length) return;
    const sockets = this.ctx.getWebSockets();
    for (const o of out) {
      const text = JSON.stringify(o.msg);
      for (const ws of sockets) {
        const { id } = ws.deserializeAttachment() as Attachment;
        if (!id) continue;
        if (o.only ? id === o.only : id !== o.except) {
          try {
            ws.send(text);
          } catch {
            // closing; its close handler cleans up
          }
        }
      }
    }
  }

  private sendTo(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // closing
    }
  }

  private overRate(ws: WebSocket): boolean {
    const second = Math.floor(Date.now() / 1000);
    let r = this.rates.get(ws);
    if (!r || r.second !== second) this.rates.set(ws, (r = { second, count: 0 }));
    return ++r.count > ROOM.maxMessagesPerSecond;
  }

  private async save() {
    if (this.room) await this.ctx.storage.put('room', this.room);
  }

  /** For debugging/tests: the room as players see it. */
  async peek() {
    return this.room && view(this.room);
  }
}
