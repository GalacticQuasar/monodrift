// Car poses over a run: recorded every few sim steps, packed small to send or store,
// and played back with interpolation. Shared by live rivals (multiplayer rooms) and,
// later, recorded ghosts. Pure: no DOM, no clock.

/** Where a car is: position (world px), heading (rad), and the track point it's nearest. */
export interface Pose {
  x: number;
  y: number;
  h: number;
  /** Track index (progress along the road). */
  i: number;
}

/** Packing precision: x/y to half a pixel, heading to a milliradian. */
const XY_Q = 2;
const H_Q = 1000;
/** Numbers per sample in a packed array. */
const FIELDS = 5;

/**
 * Growable column store of pose samples, in step order. `s` is the sim step the
 * sample was taken at (steps since the run started).
 */
export class PoseLog {
  s: Int32Array;
  x: Float32Array;
  y: Float32Array;
  h: Float32Array;
  i: Int32Array;
  length = 0;

  constructor(capacity = 1024) {
    this.s = new Int32Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.h = new Float32Array(capacity);
    this.i = new Int32Array(capacity);
  }

  clear(): void {
    this.length = 0;
  }

  push(s: number, x: number, y: number, h: number, i: number): void {
    if (this.length === this.s.length) this.grow();
    const n = this.length++;
    this.s[n] = s;
    this.x[n] = x;
    this.y[n] = y;
    this.h[n] = h;
    this.i[n] = i;
  }

  /** Step of the last sample, or -1 when empty. */
  get lastStep(): number {
    return this.length ? this.s[this.length - 1] : -1;
  }

  private grow() {
    const cap = this.s.length * 2;
    const g = <T extends Int32Array | Float32Array>(a: T): T => {
      const b = new (a.constructor as new (n: number) => T)(cap);
      b.set(a);
      return b;
    };
    this.s = g(this.s);
    this.x = g(this.x);
    this.y = g(this.y);
    this.h = g(this.h);
    this.i = g(this.i);
  }
}

/**
 * Pack samples [from, to) of `log` into a flat array of whole numbers (JSON-friendly):
 * the first sample absolute, the rest as deltas from the one before. Each packed
 * array stands alone, so a lost message doesn't spoil later ones.
 */
export function packPoses(log: PoseLog, from = 0, to = log.length): number[] {
  const out: number[] = [];
  let ps = 0, px = 0, py = 0, ph = 0, pi = 0;
  for (let k = from; k < to; k++) {
    const s = log.s[k], x = Math.round(log.x[k] * XY_Q), y = Math.round(log.y[k] * XY_Q);
    const h = Math.round(log.h[k] * H_Q), i = log.i[k];
    out.push(s - ps, x - px, y - py, h - ph, i - pi);
    ps = s;
    px = x;
    py = y;
    ph = h;
    pi = i;
  }
  return out;
}

/**
 * Append packed samples to `log`, skipping any at or before its last step (repeats,
 * or messages arriving out of order). Returns false if `packed` isn't valid.
 */
export function unpackPoses(packed: unknown, log: PoseLog): boolean {
  if (!Array.isArray(packed) || packed.length % FIELDS !== 0) return false;
  for (const v of packed) if (!Number.isInteger(v)) return false;
  let s = 0, x = 0, y = 0, h = 0, i = 0;
  for (let k = 0; k < packed.length; k += FIELDS) {
    s += packed[k];
    x += packed[k + 1];
    y += packed[k + 2];
    h += packed[k + 3];
    i += packed[k + 4];
    if (s > log.lastStep) log.push(s, x / XY_Q, y / XY_Q, h / H_Q, i);
  }
  return true;
}

/**
 * The pose at sim step `t` (may be fractional), written into `out`: interpolated
 * between samples, extrapolated past the last one for at most `maxAhead` steps
 * (then held). Before the first sample, the first. Returns false if `log` is empty.
 * `hint` speeds up the search when `t` only moves forward (pass the last return of
 * `sampleIndex`); it's only a starting point, so any value is safe.
 */
export function samplePose(log: PoseLog, t: number, out: Pose, maxAhead = 0, hint = 0): boolean {
  const n = log.length;
  if (!n) return false;
  const k = sampleIndex(log, t, hint);
  if (k < 0) return copyPose(log, 0, out);
  let a = k, b = k + 1;
  if (b >= n) {
    if (n < 2) return copyPose(log, n - 1, out);
    // past the end: continue the last movement a little, then hold
    a = n - 2;
    b = n - 1;
    t = Math.min(t, log.s[b] + maxAhead);
  }
  const f = (t - log.s[a]) / (log.s[b] - log.s[a] || 1);
  out.x = log.x[a] + (log.x[b] - log.x[a]) * f;
  out.y = log.y[a] + (log.y[b] - log.y[a]) * f;
  out.h = log.h[a] + (log.h[b] - log.h[a]) * f;
  out.i = Math.round(log.i[a] + (log.i[b] - log.i[a]) * f);
  return true;
}

/** Index of the last sample at or before step `t` (-1 if none), searching from `hint`. */
export function sampleIndex(log: PoseLog, t: number, hint = 0): number {
  let k = Math.min(Math.max(hint, 0), log.length - 1);
  while (k > 0 && log.s[k] > t) k--;
  while (k + 1 < log.length && log.s[k + 1] <= t) k++;
  return log.s[k] <= t ? k : -1;
}

function copyPose(log: PoseLog, k: number, out: Pose): boolean {
  out.x = log.x[k];
  out.y = log.y[k];
  out.h = log.h[k];
  out.i = log.i[k];
  return true;
}
