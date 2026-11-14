// Frame-timing debugger, enabled with ?debug in the URL.
//
// Records every frame into preallocated typed arrays (so the debugger itself
// creates no per-frame garbage), flags "hitches" (frames much longer than the
// typical frame), and builds a plain-text report that can be copied and pasted.

import { ALL_LAYERS, type Layer } from '../render/renderer';

const N = 60 * 180; // ring buffer: ~3 minutes at 60 Hz
const MAX_HITCHES = 400;
const GC_DROP_BYTES = 256 * 1024; // a heap drop this big between frames = a GC ran

export interface FrameCounters {
  /** Sim steps run this frame, and time spent in them. */
  steps: number;
  simMs: number;
  /** Time spent drawing (our JS; the browser rasterises later). */
  drawMs: number;
  /** Running totals from the renderer. */
  trees: number;
  cellsGenerated: number;
  cellsEvicted: number;
  skids: number;
}

export interface Debug {
  frame(now: number, c: FrameCounters): void;
  /** Mark a game event (start, crash, ...) on the timeline. */
  event(name: string): void;
}

/** Chrome's Long Animation Frame entry (frames > 50 ms), with the fields we use. */
interface LoafEntry extends PerformanceEntry {
  blockingDuration: number;
  styleAndLayoutStart: number;
  scripts: { invoker: string; sourceURL: string; sourceFunctionName: string; duration: number; forcedStyleAndLayoutDuration: number }[];
}

/**
 * Which layers to draw, from ?render=… (debug only, to isolate rendering problems):
 *   none            draw nothing at all
 *   bg              only the background
 *   -trees,-skids   everything except these
 *   road,car        only these
 */
export function debugLayers(): Set<Layer> | undefined {
  const spec = new URLSearchParams(location.search).get('render');
  if (!spec) return undefined;
  if (spec === 'none') return new Set();
  const parts = spec.split(',').map(s => s.trim()).filter(Boolean);
  const valid = (s: string): s is Layer => (ALL_LAYERS as readonly string[]).includes(s);
  if (parts.every(p => p.startsWith('-'))) {
    const drop = new Set(parts.map(p => p.slice(1)));
    return new Set(ALL_LAYERS.filter(l => !drop.has(l)));
  }
  return new Set(parts.filter(valid));
}

// Chrome-only, non-standard
const heapUsed = (): number => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? NaN;

function ring(n: number) {
  return {
    t: new Float64Array(n), delta: new Float32Array(n), steps: new Uint8Array(n),
    sim: new Float32Array(n), draw: new Float32Array(n), newCells: new Uint16Array(n),
    evicted: new Uint16Array(n), trees: new Uint16Array(n), skids: new Uint16Array(n), heap: new Float32Array(n),
  };
}

export function createDebug(): Debug | null {
  const params = new URLSearchParams(location.search);
  if (!params.has('debug') && !params.has('fps')) return null;

  const f = ring(N); // all frames
  const h = ring(MAX_HITCHES); // hitch frames only
  const hPrev = new Float32Array(MAX_HITCHES);
  let count = 0, hitchCount = 0, gcCount = 0, gcOnHitch = 0;
  let lastNow = 0, lastCells = 0, lastEvicted = 0, lastHeap = heapUsed(), startT = 0;
  let typical = 1000 / 60; // running median of frame time
  let lastPanel = 0, secFrames = 0, secWorst = 0, lastHitchT = -1, hiddenGap = false;
  const gcTimes: number[] = [];
  const events: { t: number; name: string }[] = []; // t = performance.now()
  const loafs: LoafEntry[] = [];
  const loafSupported = PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame') ?? false;
  if (loafSupported) {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        loafs.push(e as LoafEntry);
        if (loafs.length > 60) loafs.shift();
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  }

  document.addEventListener('visibilitychange', () => {
    hiddenGap = true;
    events.push({ t: performance.now(), name: `tab ${document.visibilityState}` });
  });

  // ---- overlay ----
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed', left: '10px', bottom: '10px', zIndex: '5', maxWidth: 'calc(100vw - 20px)',
    font: '12px/1.45 ui-monospace, Menlo, Consolas, monospace', color: '#111',
    background: 'rgba(255,255,255,0.88)', border: '1px solid #ccc', borderRadius: '6px', padding: '6px 8px',
  });
  const text = document.createElement('div');
  text.style.whiteSpace = 'pre';
  text.textContent = 'debug on · collecting…';
  const buttons = document.createElement('div');
  buttons.style.marginTop = '4px';
  const btn = (label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, { font: 'inherit', marginRight: '6px', padding: '2px 8px', cursor: 'pointer' });
    b.addEventListener('click', () => { onClick(); b.blur(); });
    buttons.append(b);
    return b;
  };
  const copyBtn = btn('Copy report', async () => {
    const r = report();
    console.log(r);
    try {
      await navigator.clipboard.writeText(r);
      copyBtn.textContent = 'Copied ✓';
    } catch {
      fallbackCopy(r);
      copyBtn.textContent = 'Copied (fallback) ✓';
    }
    setTimeout(() => (copyBtn.textContent = 'Copy report'), 1500);
  });
  btn('Reset', () => {
    count = hitchCount = gcCount = gcOnHitch = 0;
    gcTimes.length = events.length = loafs.length = 0;
    lastNow = 0;
    lastHitchT = -1;
  });
  box.append(text, buttons);
  document.body.append(box);
  (window as unknown as { driftReport: () => string }).driftReport = () => report();

  function updatePanel(now: number) {
    const secs = (now - lastPanel) / 1000;
    const fps = secFrames / secs;
    const since = lastHitchT < 0 ? '–' : `${((now - lastHitchT) / 1000).toFixed(1)}s ago`;
    let last = '';
    if (hitchCount) {
      const i = (hitchCount - 1) % MAX_HITCHES;
      last = `\nlast hitch: ${h.delta[i].toFixed(1)}ms (our JS ${(h.sim[i] + h.draw[i]).toFixed(1)}ms, ` +
        `${h.steps[i]} steps, ${h.newCells[i]} new cells${isNaN(h.heap[i]) ? '' : `, heap ${(h.heap[i] / 1024).toFixed(0)}KB`})`;
    }
    text.textContent =
      `${fps.toFixed(0)} fps · worst ${secWorst.toFixed(1)}ms · typical ${typical.toFixed(1)}ms · ${devicePixelRatio}x\n` +
      `hitches ${hitchCount} (last ${since}) · GCs seen ${isNaN(lastHeap) ? 'n/a' : gcCount}` + last;
    lastPanel = now;
    secFrames = 0;
    secWorst = 0;
  }

  return {
    event(name) {
      events.push({ t: performance.now(), name });
      if (events.length > 200) events.shift();
    },
    frame(now, c) {
      const heap = heapUsed();
      if (!lastNow || hiddenGap) {
        // first frame, or coming back from a hidden tab: don't count the gap
        lastNow = now;
        if (!count) startT = now;
        lastCells = c.cellsGenerated;
        lastEvicted = c.cellsEvicted;
        lastHeap = heap;
        lastPanel = lastPanel || now;
        hiddenGap = false;
        return;
      }
      const delta = now - lastNow;
      const heapDelta = heap - lastHeap;
      const i = count % N;
      f.t[i] = now - startT;
      f.delta[i] = delta;
      f.steps[i] = c.steps;
      f.sim[i] = c.simMs;
      f.draw[i] = c.drawMs;
      f.newCells[i] = c.cellsGenerated - lastCells;
      f.evicted[i] = c.cellsEvicted - lastEvicted;
      f.trees[i] = c.trees;
      f.skids[i] = c.skids;
      f.heap[i] = heapDelta;
      count++;

      const gc = heapDelta < -GC_DROP_BYTES;
      if (gc) {
        gcCount++;
        gcTimes.push(f.t[i]);
        if (gcTimes.length > 200) gcTimes.shift();
      }

      // running median: nudge toward each sample (robust to outliers)
      typical += delta > typical ? 0.05 : -0.05;
      const hitch = count > 30 && delta > Math.max(typical * 1.5, typical + 6);
      if (hitch) {
        const j = hitchCount % MAX_HITCHES;
        for (const k of Object.keys(f) as (keyof typeof f)[]) h[k][j] = f[k][i];
        hPrev[j] = f.delta[(i - 1 + N) % N];
        hitchCount++;
        if (gc) gcOnHitch++;
        lastHitchT = now;
      }

      secFrames++;
      secWorst = Math.max(secWorst, delta);
      if (now - lastPanel >= 1000) updatePanel(now);

      lastNow = now;
      lastCells = c.cellsGenerated;
      lastEvicted = c.cellsEvicted;
      lastHeap = heap;
    },
  };

  function report(): string {
    const n = Math.min(count, N);
    const deltas = Array.from(f.delta.subarray(0, n)).sort((a, b) => a - b);
    const pct = (p: number) => (n ? deltas[Math.min(n - 1, Math.floor(n * p))].toFixed(1) : '–');
    const dur = n ? (f.t[(count - 1) % N] - f.t[count > N ? count % N : 0]) / 1000 : 0;
    const buckets: [string, number, number][] = [
      ['<12', 0, 12], ['12-18', 12, 18], ['18-25', 18, 25], ['25-34', 25, 34], ['34-50', 34, 50], ['50+', 50, Infinity],
    ];
    const hist = buckets.map(([label, lo, hi]) => `${label}:${deltas.filter(d => d >= lo && d < hi).length}`).join('  ');
    const sumSim = f.sim.subarray(0, n).reduce((a, b) => a + b, 0), sumDraw = f.draw.subarray(0, n).reduce((a, b) => a + b, 0);

    const hn = Math.min(hitchCount, MAX_HITCHES);
    const order = Array.from({ length: hn }, (_, k) => (hitchCount > MAX_HITCHES ? (hitchCount + k) % MAX_HITCHES : k));
    const gaps = order.slice(1).map((j, k) => (h.t[j] - h.t[order[k]]) / 1000);
    const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)].toFixed(2) : '–');
    const gcGaps = gcTimes.slice(1).map((t, k) => (t - gcTimes[k]) / 1000);

    // the last game event at or before an absolute time, as "crash +120ms"
    const after = (abs: number) => {
      let e: { t: number; name: string } | undefined;
      for (const x of events) if (x.t <= abs) e = x;
      return e ? `${e.name} +${(abs - e.t).toFixed(0)}ms` : '';
    };
    const rel = (abs: number) => ((abs - startT) / 1000).toFixed(2);

    const rows = order.slice(-40).map(j =>
      [
        (h.t[j] / 1000).toFixed(2).padStart(7), h.delta[j].toFixed(1).padStart(6), hPrev[j].toFixed(1).padStart(6),
        String(h.steps[j]).padStart(3), h.sim[j].toFixed(2).padStart(6), h.draw[j].toFixed(2).padStart(6),
        String(h.newCells[j]).padStart(4), String(h.evicted[j]).padStart(4), String(h.trees[j]).padStart(5),
        String(h.skids[j]).padStart(5), (isNaN(h.heap[j]) ? '   n/a' : (h.heap[j] / 1024).toFixed(0).padStart(6)),
        // the hitch frame's delta ended at h.t, so it started at h.t - delta
        ' ' + after(startT + h.t[j] - h.delta[j]),
      ].join(' '),
    );

    const loafRows = loafs
      .filter(e => e.startTime >= startT)
      .map(e => {
        const end = e.startTime + e.duration;
        const scriptMs = e.scripts.reduce((a, s) => a + s.duration, 0);
        const layoutMs = e.styleAndLayoutStart ? end - e.styleAndLayoutStart : 0;
        const top = [...e.scripts].sort((a, b) => b.duration - a.duration)[0];
        return `  t=${rel(e.startTime)}s ${e.duration.toFixed(0)}ms · scripts ${scriptMs.toFixed(0)}ms · ` +
          `style+layout+paint ${layoutMs.toFixed(0)}ms · blocking ${e.blockingDuration.toFixed(0)}ms` +
          (top ? ` · top: ${top.invoker || top.sourceFunctionName} ${top.duration.toFixed(0)}ms` +
            (top.forcedStyleAndLayoutDuration ? ` (forced layout ${top.forcedStyleAndLayoutDuration.toFixed(0)}ms)` : '') : '') +
          `  [${after(e.startTime)}]`;
      });

    return [
      '=== monodrift debug report ===',
      `when: ${new Date().toISOString()}`,
      `ua: ${navigator.userAgent}`,
      `view: ${innerWidth}x${innerHeight} css @ ${devicePixelRatio}x (screen ${screen.width}x${screen.height})`,
      `build: ${import.meta.env.DEV ? 'dev server' : 'production'} · layers drawn: ${[...(debugLayers() ?? ALL_LAYERS)].join(',') || 'none'}`,
      '',
      `frames: ${n} over ${dur.toFixed(1)}s · avg ${(n / Math.max(dur, 0.001)).toFixed(1)} fps · typical ${typical.toFixed(2)}ms (~${(1000 / typical).toFixed(0)} Hz)`,
      `frame ms: p50 ${pct(0.5)} p90 ${pct(0.9)} p99 ${pct(0.99)} max ${pct(1)}`,
      `histogram (ms): ${hist}`,
      `our JS per frame: sim ${(sumSim / Math.max(n, 1)).toFixed(2)}ms + draw ${(sumDraw / Math.max(n, 1)).toFixed(2)}ms avg`,
      '',
      `hitches: ${hitchCount} · median gap between hitches ${median(gaps)}s`,
      `GCs (heap drops > ${GC_DROP_BYTES / 1024}KB): ${isNaN(lastHeap) ? 'n/a (not Chrome)' : `${gcCount} · on hitch frames ${gcOnHitch} · median gap ${median(gcGaps)}s`}`,
      '',
      'last hitches:',
      '  t(s)   frame   prev  st  sim   draw  new  evc trees skids heapKB  after',
      ...rows,
      '',
      `long animation frames (Chrome's own breakdown of >50ms frames): ${loafSupported ? '' : 'not supported in this browser'}`,
      ...(loafSupported ? (loafRows.length ? loafRows : ['  none recorded']) : []),
      '',
      'events:',
      ...events.filter(e => e.t >= startT).slice(-30).map(e => `  ${rel(e.t).padStart(7)}s  ${e.name}`),
      '=== end ===',
    ].join('\n');
  }
}

function fallbackCopy(s: string) {
  const ta = document.createElement('textarea');
  ta.value = s;
  document.body.append(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}
