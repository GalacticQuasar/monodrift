// Easter egg (Ready Player One's backwards race): crash into the start of the road
// and a copper key bursts onto the game-over screen. The key is the one splash of
// colour in the game; its tones are the --copper-* tokens in style.css.

import { toneMap } from '../art/palettes';
import keyArt from '../art/copper-key.json';
import { artRuns, type PixelArt } from '../lib/pixel-art';

/** Pixel-art key, 3/4 view, light from the top-left. Edit it in the pixel editor (/tools/pixel-editor/). */
const KEY = keyArt as PixelArt;

const TITLE = 'Copper Key';
const SUBTITLE = 'the only way forward was backward';
const SPARKS = 24;

/** Inline SVG, one rect per run of same-tone pixels; colours come from CSS classes. */
function keySvg(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${KEY.pixels[0].length} ${KEY.pixels.length}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  const tones = toneMap(KEY.palette);
  for (const { x, y, w, c } of artRuns(KEY)) {
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

export interface Egg {
  show(): void;
  hide(): void;
}

export function createEgg(el: HTMLElement, canvas: HTMLCanvasElement): Egg {
  const key = document.createElement('div');
  key.className = 'egg-key';
  key.append(keySvg());

  const title = document.createElement('b');
  title.setAttribute('aria-label', TITLE);
  [...TITLE].forEach((ch, i) => {
    const s = document.createElement('span');
    s.textContent = ch;
    s.style.animationDelay = `${450 + i * 55}ms`;
    s.setAttribute('aria-hidden', 'true');
    title.append(s);
  });

  const sub = document.createElement('span');
  sub.className = 'egg-sub';
  sub.textContent = SUBTITLE;

  const flash = document.createElement('div');
  flash.className = 'egg-flash';

  return {
    show() {
      // fresh sparks each time, flying out at random angles from behind the key
      const sparks = document.createElement('div');
      sparks.className = 'egg-sparks';
      for (let i = 0; i < SPARKS; i++) {
        const s = document.createElement('i');
        const a = (i / SPARKS) * Math.PI * 2 + Math.random() * 0.4;
        const d = 70 + Math.random() * 90;
        s.style.setProperty('--dx', `${Math.round(Math.cos(a) * d)}px`);
        s.style.setProperty('--dy', `${Math.round(Math.sin(a) * d * 0.7)}px`);
        s.style.animationDelay = `${Math.round(Math.random() * 120)}ms`;
        if (i % 3 === 0) s.className = 'ink';
        sparks.append(s);
      }
      el.replaceChildren(flash, sparks, key, title, sub);
      el.hidden = false;
      // restart the shake even if the last one is still on
      canvas.classList.remove('egg-shake');
      void canvas.offsetWidth;
      canvas.classList.add('egg-shake');
    },
    hide() {
      el.hidden = true;
      el.replaceChildren();
      canvas.classList.remove('egg-shake');
    },
  };
}
