// The daily road: everyone gets the same seed for a given UTC day. Pure: the caller
// supplies the day, so the sim still never reads the clock.

/** 'YYYY-MM-DD' (UTC) for a timestamp in ms. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Seed for a day string like '2026-11-14' (FNV-1a, then a final mix). */
export function dailySeed(day: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
