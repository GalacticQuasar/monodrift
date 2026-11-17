import type { SteerMode } from '../input/input';
import { DESKTOP } from '../lib/device';
import type { Speed } from './settings';

// Desktop shows keycaps instead (no steering modes on desktop)
const HELP: Record<SteerMode, string> = { sides: 'hold a side to steer', drag: 'hold and slide left or right to aim the car' };

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Pixel arrow / chevron pointing right (Silkscreen has no arrow glyphs); mirrored in CSS for left. */
const ARROW = 'M3 0h1v1h1v1h1v1h-1v1h-1v1h-1V3H0V2h3z'; // 6×5
const CHEVRON = 'M0 0h2v1h1v1h1v1h1v1h1v2h-1v1h-1v1h-1v1h-1v1H0V9h1V8h1V7h1V6h1V4h-1V3h-1V2h-1V1H0z'; // 6×10

function pixelIcon(path: string, w: number, h: number, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', path);
  svg.append(p);
  return svg;
}

function keycap(content: string | SVGSVGElement): HTMLElement {
  const kbd = document.createElement('kbd');
  kbd.append(content);
  return kbd;
}

/** Desktop start screen: [A][D] or [←][→] to steer. */
function keysRow(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'keys';
  row.setAttribute('aria-label', 'A and D, or left and right arrow keys, to steer');
  row.append(
    keycap('A'),
    keycap('D'),
    ' or ',
    keycap(pixelIcon(ARROW, 6, 5, 'arrow left')),
    keycap(pixelIcon(ARROW, 6, 5, 'arrow')),
    ' to steer',
  );
  return row;
}

/** Phone start screen in Sides mode: a chevron at each screen edge. */
const chevrons = () => [pixelIcon(CHEVRON, 6, 10, 'side-hint left'), pixelIcon(CHEVRON, 6, 10, 'side-hint right')];

const PRESS = DESKTOP ? 'press any key' : 'tap';

export interface Hud {
  setScore(text: string): void;
  showStart(mode: SteerMode, zen: boolean, daily: boolean, speed: Speed): void;
  /** `hintDelayMs`: the "tap/press any key to retry" line fades in after this long. */
  showGameOver(score: number, best: number, hintDelayMs: number): void;
  /** The run is paused (Settings was opened mid-run). */
  showPaused(): void;
  /** Adds the leaderboard line (e.g. "#3 today · #12 all-time") under a game-over message. */
  showRank(text: string): void;
  hideMessage(): void;
}

export function createHud(scoreEl: HTMLElement, msgEl: HTMLElement): Hud {
  let shownScore: string | null = null;

  /** `extra`: nodes between the title and the text lines (keycaps, edge chevrons). */
  function message(title: string, lines: string[], hintDelayMs = 0, extra: Node[] = []) {
    const b = document.createElement('b');
    b.textContent = title;
    const span = document.createElement('span');
    lines.forEach((line, i) => {
      if (i) span.append(document.createElement('br'));
      span.append(line);
    });
    if (hintDelayMs > 0) {
      span.className = 'later';
      span.style.animationDelay = `${hintDelayMs}ms`;
    }
    msgEl.replaceChildren(b, ...extra, span);
  }

  return {
    setScore(text) {
      if (text === shownScore) return; // avoid touching the DOM every frame
      scoreEl.textContent = text;
      shownScore = text;
    },
    showStart(mode, zen, daily, speed) {
      const pace = speed === 'slow' ? 'Slow' : speed === 'fast' ? 'Fast' : '';
      const help = DESKTOP ? [] : [HELP[mode]];
      const edges = !DESKTOP && mode === 'sides'; // chevrons at the screen edges leave a narrower column
      const zenLines = edges ? ['no crashes, no score', 'just drive'] : ['no crashes, no score · just drive'];
      message(
        ['Monodrift', daily && 'Daily', zen && 'Zen', pace].filter(Boolean).join(' · '),
        zen
          ? [...help, ...zenLines, `${PRESS} to start`]
          : [...help, 'stay on the road', ...(pace ? [`${pace} speed · not ranked`] : []), `${PRESS} to start`],
        0,
        DESKTOP ? [keysRow()] : edges ? chevrons() : [],
      );
    },
    showGameOver(score, best, hintDelayMs) {
      message(String(score), [`best ${best} · ${PRESS} to retry`], hintDelayMs);
    },
    showPaused() {
      message('Paused', [`${PRESS} to resume`]);
    },
    showRank(text) {
      const line = document.createElement('span');
      line.className = 'rank';
      line.textContent = text;
      msgEl.append(line);
    },
    hideMessage() {
      msgEl.replaceChildren();
    },
  };
}
