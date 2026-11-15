// Hand-drawn pixel art assets (src/art/*.json). Pure: no DOM, safe in tests and in
// vite.config.ts (the pixel editor's save endpoint validates with artProblems).

import { PALETTES, toneMap, type PaletteName } from '../art/palettes';

export interface PixelArt {
  palette: PaletteName;
  /** One string per row, one character per pixel: a palette tone, or '.' for transparent. */
  pixels: string[];
  /**
   * Optional anchor pixel [x, y] (e.g. the base centre of a building, for placement).
   * Its centre is at (x + 0.5, y + 0.5) art px from the top-left.
   */
  anchor?: [number, number];
}

export const TRANSPARENT = '.';
/** Asset file names (without .json): lowercase words joined by dashes. */
export const ART_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** What's wrong with a would-be asset (empty when it's valid). */
export function artProblems(art: unknown): string[] {
  if (!art || typeof art !== 'object') return ['not an object'];
  const a = art as Partial<PixelArt>;
  const problems: string[] = [];
  if (typeof a.palette !== 'string' || !(a.palette in PALETTES)) problems.push(`unknown palette ${JSON.stringify(a.palette)}`);
  if (!Array.isArray(a.pixels) || a.pixels.length === 0 || !a.pixels.every(r => typeof r === 'string')) return [...problems, 'pixels must be a non-empty list of strings'];
  const w = a.pixels[0].length;
  if (w === 0) problems.push('rows are empty');
  a.pixels.forEach((row, y) => {
    if (row.length !== w) problems.push(`row ${y} is ${row.length} wide, not ${w}`);
  });
  if (typeof a.palette === 'string' && a.palette in PALETTES) {
    const tones = toneMap(a.palette as PaletteName);
    const bad = new Set([...a.pixels.join('')].filter(c => c !== TRANSPARENT && !(c in tones)));
    if (bad.size) problems.push(`characters not in the ${a.palette} palette: ${[...bad].join(' ')}`);
  }
  if (a.anchor !== undefined) {
    const [x, y] = Array.isArray(a.anchor) ? a.anchor : [-1, -1];
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= a.pixels.length) problems.push('anchor must be a pixel [x, y] inside the image');
  }
  return problems;
}

export interface Run {
  x: number;
  y: number;
  /** Length in pixels. */
  w: number;
  /** Palette character. */
  c: string;
}

/** Horizontal runs of same-tone pixels (transparent left out), e.g. one rect each. */
export function artRuns(art: PixelArt): Run[] {
  const runs: Run[] = [];
  art.pixels.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      let end = x + 1;
      while (row[end] === row[x]) end++;
      if (row[x] !== TRANSPARENT) runs.push({ x, y, w: end - x, c: row[x] });
      x = end;
    }
  });
  return runs;
}

/** The anchor point in art px from the top-left: the anchor pixel's centre, else the image centre. */
export function artAnchor(art: PixelArt): { x: number; y: number } {
  return art.anchor ? { x: art.anchor[0] + 0.5, y: art.anchor[1] + 0.5 } : { x: art.pixels[0].length / 2, y: art.pixels.length / 2 };
}

/**
 * Farthest painted point from the anchor, in art px (pixel corners count). Scenery
 * uses it for road clearance and view culling, so it follows the art when it's edited.
 */
export function artReach(art: PixelArt): number {
  const a = artAnchor(art);
  let reach = 0;
  for (const { x, y, w } of artRuns(art)) {
    const dx = Math.max(Math.abs(x - a.x), Math.abs(x + w - a.x));
    const dy = Math.max(Math.abs(y - a.y), Math.abs(y + 1 - a.y));
    reach = Math.max(reach, Math.hypot(dx, dy));
  }
  return reach;
}
