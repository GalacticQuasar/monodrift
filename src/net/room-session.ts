// The game's side of a multiplayer room: the WebSocket to the Room Durable Object
// (protocol in lib/room-protocol.ts), a live rival per other player, and sending the
// player's own pose samples. main.ts drives runs; ui/room.ts shows the room.

import { packPoses, type PoseLog } from '../lib/poses';
import { PROTOCOL, type ClientMsg, type ErrorCode, type RoadKind, type RoomView, type ServerMsg } from '../lib/room-protocol';
import { createLiveRival, type LiveRival } from './rivals';

/** connecting: first connection; open: in the room; reconnecting: lost it, trying again; failed: gave up (see `error`). */
export type SessionStatus = 'connecting' | 'open' | 'reconnecting' | 'failed';
export type SessionError = ErrorCode | 'offline';

export interface RoomSession {
  readonly code: string;
  readonly status: SessionStatus;
  readonly error: SessionError | null;
  /** This player's id in the room (changes after a reconnect). */
  readonly you: string | null;
  readonly room: RoomView | null;
  /** The other players' cars (same array throughout; updated in place). */
  readonly rivals: LiveRival[];
  setReady(ready: boolean): void;
  setRoad(road: RoadKind): void;
  /** The player's run for round `round` started: poses from `log` go out from sample 0. */
  beginRun(round: number): void;
  /** Send samples of `log` not sent yet (call after each recorded step). */
  sendPoses(log: PoseLog): void;
  /** The player crashed at sim step `step` with `score`. */
  crashed(step: number, score: number): void;
  /** Advance rival playback; call once per frame. */
  update(nowMs: number): void;
  close(): void;
}

export interface SessionEvents {
  /** Status, room or error changed: redraw the room UI. */
  onChange(): void;
  /** Round `round` starts on road `seed` after `inMs` (the countdown). */
  onStart(round: number, seed: number, daily: boolean, inMs: number): void;
}

/** Waits between reconnect attempts (ms); after the last, give up. */
const RETRY_MS = [500, 1000, 2000, 4000, 8000];

export function createRoomSession(code: string, name: string, events: SessionEvents): RoomSession {
  let ws: WebSocket | null = null;
  let status: SessionStatus = 'connecting';
  let error: SessionError | null = null;
  let you: string | null = null;
  let room: RoomView | null = null;
  let attempt = 0;
  let retryTimer = 0;
  let closed = false;
  /** Round the player is driving (0: none) and how many of its samples went out. */
  let runRound = 0;
  let sent = 0;
  const rivals: LiveRival[] = [];

  const url = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${code}/ws`;

  function send(msg: ClientMsg) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function connect() {
    const sock = new WebSocket(url());
    ws = sock;
    let opened = false;
    sock.onopen = () => {
      opened = true;
      sock.send(JSON.stringify({ t: 'hello', v: PROTOCOL, name } satisfies ClientMsg));
    };
    sock.onmessage = e => {
      if (sock !== ws) return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data)) as ServerMsg;
      } catch {
        return;
      }
      receive(msg);
    };
    sock.onclose = e => {
      if (sock !== ws || closed) return;
      ws = null;
      if (error && error !== 'offline') return fail(error); // turned away (full, closed, old game)
      if (e.code >= 4000 && e.code < 5000) return fail('bad-message');
      // network trouble: try again a few times
      if (opened) attempt = 0;
      if (attempt >= RETRY_MS.length) return fail('offline');
      status = you ? 'reconnecting' : 'connecting';
      you = null;
      runRound = 0; // a run in progress is lost: the room counts us as gone
      events.onChange();
      retryTimer = window.setTimeout(connect, RETRY_MS[attempt++]);
    };
  }

  function fail(e: SessionError) {
    status = 'failed';
    error = e;
    events.onChange();
  }

  function receive(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome':
        you = msg.you;
        status = 'open';
        error = null;
        attempt = 0;
        setRoom(msg.room);
        break;
      case 'room':
        setRoom(msg.room);
        break;
      case 'start':
        for (const r of rivals) r.reset();
        events.onStart(msg.r, msg.seed, msg.daily, msg.inMs);
        break;
      case 'pose':
        if (room && msg.r === room.round) rivals.find(r => r.id === msg.id)?.receive(msg.d, performance.now());
        break;
      case 'crashed':
        if (room && msg.r === room.round) rivals.find(r => r.id === msg.id)?.crash(msg.s, msg.score);
        break;
      case 'error':
        error = msg.code;
        break;
    }
  }

  /** New picture of the room: keep a rival per other player, in room order. */
  function setRoom(next: RoomView) {
    room = next;
    const others = next.players.filter(p => p.id !== you);
    for (let i = rivals.length - 1; i >= 0; i--) {
      if (!others.some(p => p.id === rivals[i].id)) {
        rivals[i].state = 'gone';
        rivals.splice(i, 1);
      }
    }
    for (const p of others) {
      const r = rivals.find(r => r.id === p.id);
      if (r) r.name = p.name;
      else rivals.push(createLiveRival(p.id, p.name));
    }
    events.onChange();
  }

  connect();

  return {
    code,
    get status() {
      return status;
    },
    get error() {
      return error;
    },
    get you() {
      return you;
    },
    get room() {
      return room;
    },
    rivals,
    setReady(ready) {
      send({ t: 'ready', ready });
    },
    setRoad(road) {
      send({ t: 'road', road });
    },
    beginRun(round) {
      runRound = round;
      sent = 0;
    },
    sendPoses(log) {
      if (!runRound || log.length <= sent) return;
      send({ t: 'pose', r: runRound, d: packPoses(log, sent) });
      sent = log.length;
    },
    crashed(step, score) {
      if (!runRound) return;
      send({ t: 'crash', r: runRound, s: step, score });
      runRound = 0;
    },
    update(nowMs) {
      for (let i = 0; i < rivals.length; i++) rivals[i].update(nowMs);
    },
    close() {
      closed = true;
      clearTimeout(retryTimer);
      ws?.close(1000, 'left');
      ws = null;
      for (const r of rivals) r.state = 'gone';
      rivals.length = 0;
    },
  };
}
