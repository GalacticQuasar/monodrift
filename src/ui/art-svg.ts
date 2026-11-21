// Hand-drawn pixel art (src/art/*.json) as an inline SVG for the DOM: one rect per
// run of same-tone pixels, coloured by CSS classes named after the palette's tones
// (e.g. .outline, .hi), so light/dark comes from CSS tokens.

import { toneMap } from '../art/palettes';
import { artRuns, type PixelArt } from '../lib/pixel-art';

export function artSvg(art: PixelArt): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${art.pixels[0].length} ${art.pixels.length}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  const tones = toneMap(art.palette);
  for (const { x, y, w, c } of artRuns(art)) {
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', String(x));
    r.setAttribute('y', String(y));
    r.setAttribute('width', String(w));
    r.setAttribute('height', '1');
    r.setAttribute('class', tones[c].name);
    svg.append(r);
  }
  return svg;
}
