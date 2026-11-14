// Easter egg (Ready Player One's backwards race): crash into the start of the road
// and a copper key bursts onto the game-over screen. The key is the one splash of
// colour in the game; its tones are the --copper-* tokens in style.css.

/**
 * Pixel-art key, 3/4 view, light from the top-left (docs/art-style.md).
 * o outline, h highlight, m mid, d shadow.
 */
const KEY = [
  '..ooooo.................',
  '.ohhhhmo................',
  'ohhmmmmdoooooooooooooo..',
  'ohm...mdhhhhhhhhhhhhhhho',
  'ohm...mdmmmmmmmmmmmmmmmo',
  'ohm...mddddddddddddddddo',
  'ommmmmddoooooooddoodddo.',
  '.odddddo.....oddoodddo..',
  '..ooooo.......oo..ooo...',
];
const TONE: Record<string, string> = { o: 'outline', h: 'hi', m: 'mid', d: 'lo' };

const TITLE = 'Copper Key';
const SUBTITLE = 'the only way forward was backward';
const SPARKS = 24;

/** Inline SVG, one rect per run of same-tone pixels; colours come from CSS classes. */
function keySvg(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${KEY[0].length} ${KEY.length}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  KEY.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const c = row[x];
      let end = x + 1;
      while (row[end] === c) end++;
      if (TONE[c]) {
        const r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', String(x));
        r.setAttribute('y', String(y));
        r.setAttribute('width', String(end - x));
        r.setAttribute('height', '1');
        r.setAttribute('class', TONE[c]);
        svg.append(r);
      }
      x = end;
    }
  });
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
