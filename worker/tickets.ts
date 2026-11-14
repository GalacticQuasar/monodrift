// Run tickets: issued when a run starts, signed so the server needn't store them.
// Submitting a score needs the ticket, and the time since it was issued caps the score.

export interface Ticket {
  /** Random id; each ticket can be used for one submission. */
  id: string;
  seed: number;
  /** UTC day of the daily road this run is on, or null for a random road. */
  day: string | null;
  /** Issue time (ms). */
  t: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

const keys = new Map<string, Promise<CryptoKey>>();
function key(secret: string): Promise<CryptoKey> {
  let k = keys.get(secret);
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    keys.set(secret, k);
  }
  return k;
}

export function randomId(bytes = 16): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function signTicket(ticket: Ticket, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(ticket)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** The ticket if the signature is valid, else null. */
export async function verifyTicket(token: string, secret: string): Promise<Ticket | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const t = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Ticket;
    return typeof t.id === 'string' && typeof t.t === 'number' && typeof t.seed === 'number' ? t : null;
  } catch {
    return null;
  }
}

export async function sha256(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return Array.from(d, b => b.toString(16).padStart(2, '0')).join('');
}
