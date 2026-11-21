import { describe, expect, it } from 'vitest';
import { isRoomCode, parseClientMsg, PROTOCOL, ROOM, type ClientMsg, type ServerMsg } from '../src/lib/room-protocol';
import { dailySeed, utcDay } from '../src/sim/daily';
import { createRoomState, DEFAULT_NAME, handle, join, leave, type Ctx, type Out, type RoomState } from '../worker/room-logic';

const NOW = Date.UTC(2026, 10, 21, 12);
const ctx: Ctx = { now: NOW, random: () => 12345 };

function newRoom(): RoomState {
  const s = createRoomState('ABCD');
  s.created = true;
  return s;
}

function joined(s: RoomState, id: string, name = id): Out[] {
  const res = join(s, id, name, PROTOCOL);
  if ('error' in res) throw new Error(res.error);
  return res.out;
}

const send = (s: RoomState, id: string, msg: ClientMsg) => handle(s, id, msg, ctx);
/** Messages of type `t` in `out`. */
const of = <T extends ServerMsg['t']>(out: Out[], t: T) => out.filter(o => o.msg.t === t) as (Out & { msg: Extract<ServerMsg, { t: T }> })[];

/** Two players in, round 1 started. */
function racing() {
  const s = newRoom();
  joined(s, 'a', 'Ann');
  joined(s, 'b', 'Ben');
  send(s, 'a', { t: 'ready', ready: true });
  const { out } = send(s, 'b', { t: 'ready', ready: true });
  return { s, out };
}

describe('room: joining', () => {
  it('welcomes a player and tells the others', () => {
    const s = newRoom();
    joined(s, 'a', 'Ann');
    const out = joined(s, 'b', 'Ben');
    expect(of(out, 'welcome')).toEqual([{ only: 'b', msg: expect.objectContaining({ you: 'b' }) }]);
    expect(of(out, 'room')[0].except).toBe('b');
    expect(s.players.map(p => p.name)).toEqual(['Ann', 'Ben']);
  });

  it('turns players away from a room that was never made, a full room, or an old game', () => {
    expect(join(createRoomState('ABCD'), 'a', 'Ann', PROTOCOL)).toEqual({ error: 'no-room' });
    const s = newRoom();
    expect(join(s, 'a', 'Ann', PROTOCOL - 1)).toEqual({ error: 'version' });
    for (let i = 0; i < ROOM.maxPlayers; i++) joined(s, `p${i}`);
    expect(join(s, 'x', 'Xan', PROTOCOL)).toEqual({ error: 'full' });
  });

  it('cleans names: bad ones become the default, repeats get a number', () => {
    const s = newRoom();
    joined(s, 'a', '  Sam  ');
    joined(s, 'b', 'sam');
    expect(s.players.map(p => p.name)).toEqual(['Sam', 'sam 2']);
    const t = newRoom();
    joined(t, 'a', '<script>');
    expect(t.players[0].name).toBe(DEFAULT_NAME);
  });

  it('keeps each player\'s car colour, and passes on a change', () => {
    const s = newRoom();
    expect('error' in join(s, 'a', 'Ann', PROTOCOL, 'teal')).toBe(false);
    joined(s, 'b', 'Ben'); // a game from before colours: no colour
    expect(s.players.map(p => p.color)).toEqual(['teal', null]);
    const { out, changed } = send(s, 'b', { t: 'color', color: 'pink' });
    expect(changed).toBe(true);
    expect(of(out, 'room')[0].msg.room.players[1].color).toBe('pink');
    expect(send(s, 'b', { t: 'color', color: 'pink' }).changed).toBe(false);
  });

  it('a player joining mid-round watches until the next', () => {
    const s = newRoom();
    joined(s, 'a');
    send(s, 'a', { t: 'ready', ready: true });
    expect(s.phase).toBe('racing');
    joined(s, 'b');
    expect(s.players[1].status).toBe('watching');
    // their poses aren't relayed
    expect(send(s, 'b', { t: 'pose', r: 1, d: [] }).out).toEqual([]);
  });
});

describe('room: rounds', () => {
  it('starts when everyone is ready, on a random road', () => {
    const s = newRoom();
    joined(s, 'a');
    joined(s, 'b');
    expect(of(send(s, 'a', { t: 'ready', ready: true }).out, 'start')).toEqual([]);
    const { out } = send(s, 'b', { t: 'ready', ready: true });
    expect(of(out, 'start')).toEqual([{ msg: { t: 'start', r: 1, seed: 12345, daily: false, inMs: ROOM.countdownMs } }]);
    expect(s.phase).toBe('racing');
    expect(s.players.every(p => p.status === 'racing' && !p.ready)).toBe(true);
  });

  it('can use the daily road', () => {
    const s = newRoom();
    joined(s, 'a');
    send(s, 'a', { t: 'road', road: 'daily' });
    const { out } = send(s, 'a', { t: 'ready', ready: true });
    expect(of(out, 'start')[0].msg).toMatchObject({ seed: dailySeed(utcDay(NOW)), daily: true });
  });

  it('relays poses of the current round to the others only', () => {
    const { s } = racing();
    expect(send(s, 'a', { t: 'pose', r: 1, d: [1, 2, 3, 4, 5] }).out).toEqual([{ except: 'a', msg: { t: 'pose', id: 'a', r: 1, d: [1, 2, 3, 4, 5] } }]);
    expect(send(s, 'a', { t: 'pose', r: 0, d: [] }).out).toEqual([]); // an old round
  });

  it('ends the round when everyone has crashed, then starts again when all are ready', () => {
    const { s } = racing();
    const first = send(s, 'a', { t: 'crash', r: 1, s: 900, score: 40 });
    expect(of(first.out, 'crashed')).toEqual([{ except: 'a', msg: { t: 'crashed', id: 'a', r: 1, s: 900, score: 40 } }]);
    expect(s.phase).toBe('racing');
    // a crashed player can't keep sending poses, but can ready up for the next round
    expect(send(s, 'a', { t: 'pose', r: 1, d: [] }).out).toEqual([]);
    send(s, 'a', { t: 'ready', ready: true });
    // can't change the road mid-round
    expect(send(s, 'a', { t: 'road', road: 'daily' }).changed).toBe(false);

    send(s, 'b', { t: 'crash', r: 1, s: 1500, score: 75 });
    expect(s.phase).toBe('results');
    expect(s.players.map(p => p.score)).toEqual([40, 75]);
    const { out } = send(s, 'b', { t: 'ready', ready: true });
    expect(of(out, 'start')[0].msg.r).toBe(2);
    expect(s.players.map(p => p.score)).toEqual([0, 0]);
  });

  it('a full room of four: poses go to the other three, the round ends after the last crash', () => {
    expect(ROOM.maxPlayers).toBe(4);
    const s = newRoom();
    const ids = ['a', 'b', 'c', 'd'];
    for (const id of ids) joined(s, id);
    for (const id of ids) send(s, id, { t: 'ready', ready: true });
    expect(s.phase).toBe('racing');
    expect(send(s, 'c', { t: 'pose', r: 1, d: [] }).out).toEqual([{ except: 'c', msg: { t: 'pose', id: 'c', r: 1, d: [] } }]);
    ids.forEach((id, k) => {
      expect(s.phase).toBe('racing');
      send(s, id, { t: 'crash', r: 1, s: 100 * k, score: 10 * k });
    });
    expect(s.phase).toBe('results');
    expect(s.players.map(p => p.score)).toEqual([0, 10, 20, 30]);
  });

  it('a player leaving mid-round ends it if nobody else is driving', () => {
    const { s } = racing();
    send(s, 'a', { t: 'crash', r: 1, s: 900, score: 40 });
    const out = leave(s, 'b', ctx);
    expect(s.phase).toBe('results');
    expect(of(out, 'room')[0].msg.room.players.map(p => p.id)).toEqual(['a']);
  });

  it('leaving can start the round, if everyone left is ready', () => {
    const s = newRoom();
    joined(s, 'a');
    joined(s, 'b');
    send(s, 'a', { t: 'ready', ready: true });
    expect(of(leave(s, 'b', ctx), 'start')).toHaveLength(1);
  });

  it('an empty room goes back to the lobby', () => {
    const { s } = racing();
    leave(s, 'a', ctx);
    leave(s, 'b', ctx);
    expect(s.phase).toBe('lobby');
  });

  it('ignores messages from players not in the room', () => {
    const { s } = racing();
    expect(send(s, 'zz', { t: 'crash', r: 1, s: 1, score: 1 })).toEqual({ out: [], changed: false });
  });
});

describe('room protocol', () => {
  it('parses good messages and rejects bad ones', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'hello', v: 1, name: 'Sam' }))).toEqual({ t: 'hello', v: 1, name: 'Sam', color: null });
    expect(parseClientMsg(JSON.stringify({ t: 'hello', v: 1, name: 'Sam', color: 'teal' }))).toMatchObject({ color: 'teal' });
    // a colour that isn't a short word is dropped (default), not an error
    expect(parseClientMsg(JSON.stringify({ t: 'color', color: '#ff0000' }))).toEqual({ t: 'color', color: null });
    expect(parseClientMsg(JSON.stringify({ t: 'pose', r: 1, d: [1, -2] }))).toEqual({ t: 'pose', r: 1, d: [1, -2] });
    for (const bad of ['', 'nope', '[]', '{}', '{"t":"pose","r":1,"d":[0.5]}', '{"t":"crash","r":1,"s":-1,"score":3}', '{"t":"road","road":"moon"}', 'x'.repeat(5000)]) {
      expect(parseClientMsg(bad)).toBeNull();
    }
    expect(parseClientMsg(new ArrayBuffer(4))).toBeNull();
  });

  it('room codes use the unambiguous alphabet', () => {
    expect(isRoomCode('K7QX')).toBe(true);
    expect(isRoomCode('K0QX')).toBe(false);
    expect(isRoomCode('K7Q')).toBe(false);
  });
});
