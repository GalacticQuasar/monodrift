// HTTP routes for multiplayer rooms (/api/rooms...). Each room code maps to one Room
// Durable Object (worker/room.ts).

import { CODE_ALPHABET, isRoomCode, normalizeCode, ROOM } from '../src/lib/room-protocol';
import type { Env } from './env';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM.codeLength));
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}

const roomFor = (env: Env, code: string) => env.ROOMS.get(env.ROOMS.idFromName(code));

export async function roomRoute(req: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === '/api/rooms') {
    if (req.method !== 'POST') return json({ error: 'not found' }, 404);
    // ~900k codes: a clash with a live room is rare, and just means another try
    for (let tries = 0; tries < 5; tries++) {
      const code = randomCode();
      if (await roomFor(env, code).create(code)) return json({ code }, 201);
    }
    return json({ error: 'no free room code, try again' }, 503);
  }

  const m = /^\/api\/rooms\/([A-Za-z0-9]+)(\/ws)?$/.exec(url.pathname);
  const code = m ? normalizeCode(m[1]) : '';
  if (!m || !isRoomCode(code) || req.method !== 'GET') return json({ error: 'not found' }, 404);
  const room = roomFor(env, code);
  if (m[2]) return room.fetch(req); // the WebSocket upgrade
  return json(await room.info());
}
