// Pixel editor for hand-drawn assets in src/art/*.json (dev server only: the
// monodrift-pixel-art plugin in vite.config.ts lists and saves them).

import { COLORS, SCENERY } from '../../src/config';
import { PALETTES, toneMap, type PaletteName, type Tone } from '../../src/art/palettes';
import { ART_NAME, TRANSPARENT, artProblems, type PixelArt } from '../../src/lib/pixel-art';

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'anchor';
type Theme = 'light' | 'dark';

interface Doc {
  name: string;
  palette: PaletteName;
  grid: string[][];
  anchor: [number, number] | null;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const MAX_SIZE = 64;
const UNDO_LIMIT = 200;

// ---- state ----
let assets: { name: string; art: PixelArt }[] = [];
let doc: Doc | null = null;
/** What's on disk for the open doc (serialised), to tell if there are unsaved changes. */
let savedText = '';
let tool: Tool = 'pencil';
let color = '';
let theme: Theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
let mirror = false;
let gridLines = true;
let zoom = 24;
let undo: string[] = [];
let redo: string[] = [];
let hover: [number, number] | null = null;

const W = () => doc!.grid[0].length;
const H = () => doc!.grid.length;
const tones = (): Record<string, Tone> => (doc ? toneMap(doc.palette) : {});
/** Swatch order: transparent, then the palette's tones as listed. */
const swatchChars = () => (doc ? [TRANSPARENT, ...PALETTES[doc.palette].map(t => t.char)] : []);

function toArt(d: Doc): PixelArt {
  const art: PixelArt = { palette: d.palette, pixels: d.grid.map(r => r.join('')) };
  if (d.anchor) art.anchor = d.anchor;
  return art;
}
const serialise = (d: Doc) => JSON.stringify(toArt(d));
function fromArt(name: string, art: PixelArt): Doc {
  return { name, palette: art.palette, grid: art.pixels.map(r => [...r]), anchor: art.anchor ? [...art.anchor] : null };
}

// ---- server ----
async function loadAssets() {
  const res = await fetch('/__art');
  if (!res.ok) throw new Error(`couldn't list assets (${res.status}); is this the dev server?`);
  assets = await res.json();
}

async function save() {
  if (!doc) return;
  const art = toArt(doc);
  const problems = artProblems(art);
  if (problems.length) return showError(problems.join('; '));
  const res = await fetch(`/__art/${doc.name}`, { method: 'PUT', body: JSON.stringify(art) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return showError(`save failed: ${body.error ?? res.status}`);
  savedText = serialise(doc);
  const existing = assets.find(a => a.name === doc!.name);
  if (existing) existing.art = art;
  else assets = [...assets, { name: doc.name, art }].sort((a, b) => a.name.localeCompare(b.name));
  showError('');
  renderAll();
}

// ---- editing ----
function snapshot() {
  if (!doc) return;
  undo.push(serialise(doc));
  if (undo.length > UNDO_LIMIT) undo.shift();
  redo = [];
}
function restore(from: string[], to: string[]) {
  if (!doc || !from.length) return;
  to.push(serialise(doc));
  const art = JSON.parse(from.pop()!) as PixelArt;
  doc = fromArt(doc.name, art);
  renderAll();
}

function inBounds(x: number, y: number) {
  return x >= 0 && y >= 0 && x < W() && y < H();
}

function paint(x: number, y: number, c: string) {
  for (const px of mirror ? [x, W() - 1 - x] : [x]) {
    if (inBounds(px, y)) doc!.grid[y][px] = c;
  }
}

function fill(x: number, y: number, c: string) {
  const from = doc!.grid[y][x];
  if (from === c) return;
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (!inBounds(px, py) || doc!.grid[py][px] !== from) continue;
    doc!.grid[py][px] = c;
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
}

/** Every cell on the line between two cells (Bresenham), so fast strokes leave no gaps. */
function line(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function resize(side: 'left' | 'right' | 'top' | 'bottom', d: number) {
  if (!doc) return;
  const horizontal = side === 'left' || side === 'right';
  const size = horizontal ? W() : H();
  if (size + d < 1 || size + d > MAX_SIZE) return;
  snapshot();
  const g = doc.grid;
  if (side === 'left') g.forEach(r => (d > 0 ? r.unshift(TRANSPARENT) : r.shift()));
  if (side === 'right') g.forEach(r => (d > 0 ? r.push(TRANSPARENT) : r.pop()));
  if (side === 'top') d > 0 ? g.unshift(Array(W()).fill(TRANSPARENT)) : g.shift();
  if (side === 'bottom') d > 0 ? g.push(Array(W()).fill(TRANSPARENT)) : g.pop();
  if (doc.anchor) {
    if (side === 'left') doc.anchor[0] += d;
    if (side === 'top') doc.anchor[1] += d;
    if (!inBounds(...doc.anchor)) doc.anchor = null;
  }
  renderAll();
}

function shift(dx: number, dy: number) {
  if (!doc) return;
  snapshot();
  const w = W(), h = H();
  const g = doc.grid.map(r => [...r]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) doc.grid[(y + dy + h) % h][(x + dx + w) % w] = g[y][x];
  if (doc.anchor) doc.anchor = [(doc.anchor[0] + dx + w) % w, (doc.anchor[1] + dy + h) % h];
  renderAll();
}

function flip() {
  if (!doc) return;
  snapshot();
  doc.grid.forEach(r => r.reverse());
  if (doc.anchor) doc.anchor[0] = W() - 1 - doc.anchor[0];
  renderAll();
}

// ---- opening / creating ----
const dirty = () => !!doc && serialise(doc) !== savedText;
const okToLeave = () => !dirty() || confirm(`Discard unsaved changes to ${doc!.name}?`);

function open(name: string, art: PixelArt, saved: boolean) {
  doc = fromArt(name, art);
  savedText = saved ? serialise(doc) : '';
  undo = [];
  redo = [];
  if (!(color in tones())) color = PALETTES[doc.palette][0].char;
  showError('');
  fitZoom();
  renderAll();
}

function fitZoom() {
  if (!doc) return;
  const wrap = $('#canvas-wrap');
  const fit = Math.floor(Math.min((wrap.clientWidth - 60) / W(), (wrap.clientHeight - 60) / H()));
  zoom = Math.max(6, Math.min(48, fit));
  $<HTMLInputElement>('#zoom').value = String(zoom);
}

function askName(suggested: string): string | null {
  const name = prompt('Asset name (lowercase words joined by dashes):', suggested);
  if (name === null) return null;
  if (!ART_NAME.test(name)) return showError(`"${name}" isn't a valid name (e.g. cottage-small)`), null;
  if (assets.some(a => a.name === name)) return showError(`${name} already exists`), null;
  return name;
}

// ---- rendering ----
const grid = $<HTMLCanvasElement>('#grid');
const gctx = grid.getContext('2d')!;
const preview = $<HTMLCanvasElement>('#preview');
const pctx = preview.getContext('2d')!;

function toneColor(c: string, t: Theme) {
  return tones()[c]?.[t];
}

function drawGrid() {
  if (!doc) {
    grid.width = grid.height = 0;
    return;
  }
  const dpr = devicePixelRatio || 1;
  const w = W() * zoom, h = H() * zoom;
  grid.style.width = `${w}px`;
  grid.style.height = `${h}px`;
  grid.width = Math.round(w * dpr);
  grid.height = Math.round(h * dpr);
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pal = COLORS[theme];
  // ground with a faint checker, so transparent cells read as empty
  gctx.fillStyle = pal.ground;
  gctx.fillRect(0, 0, w, h);
  gctx.fillStyle = theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)';
  for (let y = 0; y < H(); y++) for (let x = (y % 2); x < W(); x += 2) gctx.fillRect(x * zoom, y * zoom, zoom, zoom);
  for (let y = 0; y < H(); y++) {
    for (let x = 0; x < W(); x++) {
      const c = toneColor(doc.grid[y][x], theme);
      if (!c) continue;
      gctx.fillStyle = c;
      gctx.fillRect(x * zoom, y * zoom, zoom, zoom);
    }
  }
  if (gridLines && zoom >= 8) {
    gctx.strokeStyle = theme === 'light' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)';
    gctx.lineWidth = 1;
    gctx.beginPath();
    for (let x = 1; x < W(); x++) gctx.moveTo(x * zoom + 0.5, 0), gctx.lineTo(x * zoom + 0.5, h);
    for (let y = 1; y < H(); y++) gctx.moveTo(0, y * zoom + 0.5), gctx.lineTo(w, y * zoom + 0.5);
    gctx.stroke();
  }
  if (mirror) {
    gctx.strokeStyle = 'rgba(200,118,60,0.8)';
    gctx.setLineDash([4, 4]);
    gctx.beginPath();
    gctx.moveTo(w / 2, 0);
    gctx.lineTo(w / 2, h);
    gctx.stroke();
    gctx.setLineDash([]);
  }
  if (doc.anchor) {
    const [ax, ay] = doc.anchor;
    const cx = (ax + 0.5) * zoom, cy = (ay + 0.5) * zoom, r = zoom * 0.3;
    gctx.strokeStyle = '#d33';
    gctx.lineWidth = 2;
    gctx.beginPath();
    gctx.moveTo(cx - r, cy);
    gctx.lineTo(cx + r, cy);
    gctx.moveTo(cx, cy - r);
    gctx.lineTo(cx, cy + r);
    gctx.stroke();
  }
  if (hover && inBounds(...hover)) {
    gctx.strokeStyle = theme === 'light' ? '#111' : '#fff';
    gctx.lineWidth = 2;
    for (const x of mirror ? [hover[0], W() - 1 - hover[0]] : [hover[0]]) gctx.strokeRect(x * zoom + 1, hover[1] * zoom + 1, zoom - 2, zoom - 2);
  }
}

/** The art at game scale on ground and road, light and dark. */
function drawPreview() {
  if (!doc) return;
  const s = SCENERY.pixelScale, pad = 12;
  const cw = W() * s + pad * 2, ch = H() * s + pad * 2;
  preview.width = cw * 2;
  preview.height = ch * 2;
  (['light', 'dark'] as Theme[]).forEach((t, row) => {
    const pal = COLORS[t];
    [pal.ground, pal.road].forEach((bg, col) => {
      const ox = col * cw, oy = row * ch;
      pctx.fillStyle = bg;
      pctx.fillRect(ox, oy, cw, ch);
      for (let y = 0; y < H(); y++) {
        for (let x = 0; x < W(); x++) {
          const c = toneColor(doc!.grid[y][x], t);
          if (!c) continue;
          pctx.fillStyle = c;
          pctx.fillRect(ox + pad + x * s, oy + pad + y * s, s, s);
        }
      }
    });
  });
}

function renderSwatches() {
  const box = $('#swatches');
  box.replaceChildren();
  if (!doc) return;
  swatchChars().forEach((c, i) => {
    const tone = tones()[c];
    const b = document.createElement('button');
    b.className = c === color ? 'on' : '';
    b.title = `key ${i}`;
    const sw = document.createElement('i');
    sw.style.setProperty('--c', tone ? tone[theme] : 'transparent');
    const ch = document.createElement('b');
    ch.textContent = c;
    b.append(sw, ch, tone ? tone.name : 'transparent');
    b.onclick = () => selectColor(c);
    box.append(b);
  });
}

function renderAssets() {
  const ul = $('#assets');
  ul.replaceChildren(
    ...assets.map(a => {
      const li = document.createElement('li');
      li.className = a.name === doc?.name ? 'on' : '';
      const small = document.createElement('small');
      small.textContent = ` ${a.art.pixels[0].length}×${a.art.pixels.length} · ${a.art.palette}`;
      li.append(a.name, small);
      li.onclick = () => {
        if (a.name !== doc?.name && okToLeave()) open(a.name, a.art, true);
      };
      return li;
    }),
  );
}

function renderAll() {
  $('#doc-name').textContent = doc ? `${doc.name}  (${doc.palette})` : 'no asset open';
  $('#dirty').hidden = !dirty();
  $<HTMLButtonElement>('#save').disabled = !doc;
  $<HTMLButtonElement>('#undo').disabled = !undo.length;
  $<HTMLButtonElement>('#redo').disabled = !redo.length;
  $('#size').textContent = doc ? `${W()}×${H()}${doc.anchor ? ` · anchor ${doc.anchor.join(',')}` : ''}` : '';
  document.querySelectorAll<HTMLButtonElement>('#tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
  document.querySelectorAll<HTMLButtonElement>('#theme button').forEach(b => b.classList.toggle('on', b.dataset.theme === theme));
  $<HTMLInputElement>('#mirror').checked = mirror;
  renderAssets();
  renderSwatches();
  drawGrid();
  drawPreview();
}

function showError(text: string) {
  const el = $('#error');
  el.textContent = text;
  el.hidden = !text;
}

function selectColor(c: string) {
  color = c;
  if (tool === 'eraser' || tool === 'picker' || tool === 'anchor') tool = 'pencil';
  renderAll();
}

function status() {
  if (!doc || !hover || !inBounds(...hover)) return ($('#status').innerHTML = '&nbsp;');
  const c = doc.grid[hover[1]][hover[0]];
  $('#status').textContent = `${hover[0]}, ${hover[1]} · ${c === TRANSPARENT ? 'transparent' : `${c} ${tones()[c]?.name}`}`;
}

// ---- pointer ----
let stroke: { last: [number, number]; erase: boolean } | null = null;

function cellAt(e: PointerEvent): [number, number] {
  const r = grid.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) / zoom), Math.floor((e.clientY - r.top) / zoom)];
}

grid.addEventListener('contextmenu', e => e.preventDefault());
grid.addEventListener('pointerdown', e => {
  if (!doc) return;
  const [x, y] = cellAt(e);
  if (!inBounds(x, y)) return;
  const use: Tool = e.altKey ? 'picker' : e.button === 2 ? 'eraser' : tool;
  if (use === 'picker') {
    selectColor(doc.grid[y][x]);
    return;
  }
  snapshot();
  if (use === 'fill') fill(x, y, color);
  else if (use === 'anchor') doc.anchor = [x, y];
  else {
    const erase = use === 'eraser' || color === TRANSPARENT;
    paint(x, y, erase ? TRANSPARENT : color);
    stroke = { last: [x, y], erase };
    grid.setPointerCapture(e.pointerId);
  }
  renderAll();
});
grid.addEventListener('pointermove', e => {
  if (!doc) return;
  const cell = cellAt(e);
  const moved = hover?.[0] !== cell[0] || hover?.[1] !== cell[1];
  hover = cell;
  if (stroke && moved) {
    const c = stroke.erase ? TRANSPARENT : color;
    line(stroke.last[0], stroke.last[1], cell[0], cell[1], (x, y) => paint(x, y, c));
    stroke.last = cell;
    renderAll();
  } else if (moved) drawGrid();
  status();
});
grid.addEventListener('pointerup', () => (stroke = null));
grid.addEventListener('pointercancel', () => (stroke = null));
grid.addEventListener('pointerleave', () => {
  hover = null;
  drawGrid();
  status();
});

// ---- controls ----
const TOOL_KEYS: Record<string, Tool> = { b: 'pencil', e: 'eraser', g: 'fill', i: 'picker', a: 'anchor' };

document.querySelectorAll<HTMLButtonElement>('#tools button').forEach(b => {
  b.onclick = () => {
    tool = b.dataset.tool as Tool;
    renderAll();
  };
});
document.querySelectorAll<HTMLButtonElement>('#theme button').forEach(b => {
  b.onclick = () => {
    theme = b.dataset.theme as Theme;
    renderAll();
  };
});
document.querySelectorAll<HTMLButtonElement>('#resize button').forEach(b => {
  b.onclick = () => resize(b.dataset.side as 'left', Number(b.dataset.d));
});
$<HTMLInputElement>('#mirror').onchange = e => {
  mirror = (e.target as HTMLInputElement).checked;
  renderAll();
};
$<HTMLInputElement>('#gridlines').onchange = e => {
  gridLines = (e.target as HTMLInputElement).checked;
  drawGrid();
};
$<HTMLInputElement>('#zoom').oninput = e => {
  zoom = Number((e.target as HTMLInputElement).value);
  drawGrid();
};
$('#undo').onclick = () => restore(undo, redo);
$('#redo').onclick = () => restore(redo, undo);
$('#save').onclick = () => save();
$('#flip').onclick = flip;
$('#clear-anchor').onclick = () => {
  if (!doc?.anchor) return;
  snapshot();
  doc.anchor = null;
  renderAll();
};
$('#copy').onclick = async () => {
  if (!doc) return;
  await navigator.clipboard.writeText(JSON.stringify(toArt(doc), null, 2));
  $('#status').textContent = 'copied the asset JSON';
};

// new / duplicate
const form = $<HTMLFormElement>('#new-form');
const paletteSelect = $<HTMLSelectElement>('#new-palette');
paletteSelect.append(...Object.keys(PALETTES).map(p => new Option(p, p)));
$('#new').onclick = () => {
  form.hidden = !form.hidden;
  if (!form.hidden) $<HTMLInputElement>('#new-name').focus();
};
$('#new-cancel').onclick = () => (form.hidden = true);
form.onsubmit = e => {
  e.preventDefault();
  const name = $<HTMLInputElement>('#new-name').value.trim();
  if (!ART_NAME.test(name)) return showError(`"${name}" isn't a valid name (lowercase words joined by dashes, e.g. cottage-small)`);
  if (assets.some(a => a.name === name)) return showError(`${name} already exists`);
  const clamp = (v: string) => Math.max(1, Math.min(MAX_SIZE, Math.round(Number(v)) || 16));
  const w = clamp($<HTMLInputElement>('#new-w').value), h = clamp($<HTMLInputElement>('#new-h').value);
  if (!okToLeave()) return;
  form.hidden = true;
  open(name, { palette: paletteSelect.value as PaletteName, pixels: Array(h).fill(TRANSPARENT.repeat(w)) }, false);
};
$('#dup').onclick = () => {
  if (!doc) return;
  const name = askName(`${doc.name}-copy`);
  if (!name || !okToLeave()) return;
  open(name, toArt(doc), false);
};

addEventListener('keydown', e => {
  const target = e.target as HTMLElement;
  if (target.matches('input:not([type=checkbox]):not([type=range]), select, textarea')) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === 's') {
    e.preventDefault();
    save();
  } else if (mod && k === 'z') {
    e.preventDefault();
    e.shiftKey ? restore(redo, undo) : restore(undo, redo);
  } else if (mod && k === 'y') {
    e.preventDefault();
    restore(redo, undo);
  } else if (mod) {
    return;
  } else if (TOOL_KEYS[k]) {
    tool = TOOL_KEYS[k];
    renderAll();
  } else if (k === 'm') {
    mirror = !mirror;
    renderAll();
  } else if (/^[0-9]$/.test(k) && doc) {
    const keys = swatchChars();
    if (Number(k) < keys.length) selectColor(keys[Number(k)]);
  } else if (e.key.startsWith('Arrow') && doc) {
    e.preventDefault();
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]!;
    shift(d[0], d[1]);
  }
});

addEventListener('beforeunload', e => {
  if (dirty()) e.preventDefault();
});

// ---- start ----
loadAssets()
  .then(() => {
    const wanted = new URLSearchParams(location.search).get('asset');
    const first = assets.find(a => a.name === wanted) ?? assets[0];
    if (first) open(first.name, first.art, true);
    else renderAll();
  })
  .catch(err => showError(String(err.message ?? err)));
