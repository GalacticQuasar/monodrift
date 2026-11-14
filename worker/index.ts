// Leaderboard API (Cloudflare Worker). Only /api/* reaches this code; everything
// else is the static game, served straight from dist/ (see wrangler.jsonc).
//
//   POST  /api/tickets      {seed, daily}   -> {ticket, day}       at the start of a run
//   POST  /api/players      {name}          -> {id, token, name}   pick a name
//   PATCH /api/players/me   {name}          -> {name}              rename (auth)
//   POST  /api/scores       {ticket, score} -> {all, day?}         end of a run (auth)
//   GET   /api/leaderboard?board=all|today  -> {board, day, top, me}
//
// Auth: "Authorization: Bearer <id>.<token>", the secret the device got with its name.

import { dailySeed, utcDay } from '../src/sim/daily';
import { maxScoreAfter } from '../src/sim/scoring';
import { cleanName, nameProblem } from '../src/lib/names';
import { randomId, sha256, signTicket, verifyTicket, type Ticket } from './tickets';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** HMAC key for run tickets (wrangler secret / .dev.vars). */
  TICKET_SECRET: string;
}

/** Added to the measured run time: network delay before the ticket was issued. */
const SLACK_S = 3;
/** Tickets older than this can't be submitted. */
const TICKET_MAX_AGE_MS = 3 * 60 * 60 * 1000;
/** Minimum time between one player's submissions. */
const SUBMIT_GAP_MS = 2000;
const TOP_N = 50;

type Json = Record<string, unknown>;

const json = (body: Json, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const fail = (status: number, error: string) => json({ error }, status);

async function body(req: Request): Promise<Json> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Json) : {};
  } catch {
    return {};
  }
}

interface Player {
  id: string;
  name: string;
  last_submit_at: number;
}

async function auth(req: Request, env: Env): Promise<Player | null> {
  const m = /^Bearer ([\w-]+)\.([\w-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!m) return null;
  const p = await env.DB.prepare('SELECT id, name, token_hash, last_submit_at FROM players WHERE id = ?')
    .bind(m[1])
    .first<Player & { token_hash: string }>();
  return p && p.token_hash === (await sha256(m[2])) ? p : null;
}

async function rankOf(env: Env, board: string, playerId: string): Promise<{ rank: number; score: number } | null> {
  return env.DB.prepare(
    `SELECT s.score AS score, (SELECT COUNT(*) FROM scores o WHERE o.board = s.board AND o.score > s.score) + 1 AS rank
     FROM scores s WHERE s.board = ? AND s.player_id = ?`,
  )
    .bind(board, playerId)
    .first<{ rank: number; score: number }>();
}

async function issueTicket(req: Request, env: Env): Promise<Response> {
  const b = await body(req);
  const seed = Number(b.seed);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return fail(400, 'bad seed');
  const now = Date.now();
  // daily runs count for the day whose road it is (the device clock may be off)
  const today = utcDay(now);
  const day = b.daily === true && seed === dailySeed(today) ? today : null;
  const ticket: Ticket = { id: randomId(), seed, day, t: now };
  return json({ ticket: await signTicket(ticket, env.TICKET_SECRET), day });
}

async function register(req: Request, env: Env): Promise<Response> {
  const name = cleanName(String((await body(req)).name ?? ''));
  const problem = nameProblem(name);
  if (problem) return fail(400, problem);
  const id = randomId(9);
  const token = randomId(32);
  try {
    await env.DB.prepare('INSERT INTO players (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, name, await sha256(token), Date.now())
      .run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) return fail(409, 'name taken');
    throw e;
  }
  return json({ id, token, name }, 201);
}

async function rename(req: Request, env: Env): Promise<Response> {
  const player = await auth(req, env);
  if (!player) return fail(401, 'unknown player');
  const name = cleanName(String((await body(req)).name ?? ''));
  const problem = nameProblem(name);
  if (problem) return fail(400, problem);
  try {
    await env.DB.prepare('UPDATE players SET name = ? WHERE id = ?').bind(name, player.id).run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) return fail(409, 'name taken');
    throw e;
  }
  return json({ name });
}

async function submit(req: Request, env: Env): Promise<Response> {
  const player = await auth(req, env);
  if (!player) return fail(401, 'unknown player');
  const b = await body(req);
  const ticket = await verifyTicket(String(b.ticket ?? ''), env.TICKET_SECRET);
  if (!ticket) return fail(400, 'bad ticket');
  const score = Number(b.score);
  if (!Number.isInteger(score) || score < 1 || score > 10_000_000) return fail(400, 'bad score');

  const now = Date.now();
  if (now - ticket.t > TICKET_MAX_AGE_MS) return fail(400, 'ticket expired');
  if (now - player.last_submit_at < SUBMIT_GAP_MS) return fail(429, 'too many submissions');
  const seconds = (now - ticket.t) / 1000;
  if (score > maxScoreAfter(seconds + SLACK_S)) return fail(422, 'score not possible in that time');

  const boards = ticket.day ? ['all', ticket.day] : ['all'];
  const best = env.DB.prepare(
    `INSERT INTO scores (board, player_id, score, at) VALUES (?, ?, ?, ?)
     ON CONFLICT (board, player_id) DO UPDATE SET score = excluded.score, at = excluded.at WHERE excluded.score > scores.score`,
  );
  try {
    await env.DB.batch([
      // the run log's primary key makes each ticket single-use; a reused one fails the whole batch
      env.DB.prepare('INSERT INTO runs (ticket_id, player_id, seed, day, score, seconds, at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
        ticket.id,
        player.id,
        ticket.seed,
        ticket.day,
        score,
        seconds,
        now,
      ),
      env.DB.prepare('UPDATE players SET last_submit_at = ? WHERE id = ?').bind(now, player.id),
      ...boards.map(board => best.bind(board, player.id, score, now)),
    ]);
  } catch (e) {
    if (String(e).includes('UNIQUE')) return fail(409, 'ticket already used');
    throw e;
  }

  const result: Json = { all: await rankOf(env, 'all', player.id) };
  if (ticket.day) result.day = { day: ticket.day, ...(await rankOf(env, ticket.day, player.id)) };
  return json(result);
}

async function leaderboard(req: Request, env: Env, url: URL): Promise<Response> {
  const which = url.searchParams.get('board') === 'today' ? 'today' : 'all';
  const day = utcDay(Date.now());
  const board = which === 'today' ? day : 'all';
  const player = await auth(req, env);
  const { results } = await env.DB.prepare(
    `SELECT p.id AS id, p.name AS name, s.score AS score
     FROM scores s JOIN players p ON p.id = s.player_id
     WHERE s.board = ? ORDER BY s.score DESC, s.at ASC LIMIT ?`,
  )
    .bind(board, TOP_N)
    .all<{ id: string; name: string; score: number }>();
  // tied scores share a rank
  let rank = 0, prev = -1;
  const top = results.map((r, i) => {
    if (r.score !== prev) rank = i + 1;
    prev = r.score;
    return { rank, name: r.name, score: r.score, me: r.id === player?.id };
  });
  const me = player ? await rankOf(env, board, player.id) : null;
  return json({ board: which, day, top, me: me && { ...me, name: player!.name } });
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      const route = `${req.method} ${url.pathname}`;
      switch (route) {
        case 'POST /api/tickets':
          return await issueTicket(req, env);
        case 'POST /api/players':
          return await register(req, env);
        case 'PATCH /api/players/me':
          return await rename(req, env);
        case 'POST /api/scores':
          return await submit(req, env);
        case 'GET /api/leaderboard':
          return await leaderboard(req, env, url);
        default:
          return fail(404, 'not found');
      }
    } catch (e) {
      console.error(e);
      return fail(500, 'server error');
    }
  },
} satisfies ExportedHandler<Env>;
