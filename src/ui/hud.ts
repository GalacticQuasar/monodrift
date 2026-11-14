import type { SteerMode } from '../input/input';
import { DESKTOP } from '../lib/device';
import type { Speed } from './settings';

const HELP: Record<SteerMode, string> = DESKTOP
  ? { sides: '← → or A/D to steer', drag: '← → or A/D to steer' } // no steering modes on desktop
  : { sides: 'hold left or right side to steer', drag: 'hold and slide left or right to aim the car' };

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

  function message(title: string, lines: string[], hintDelayMs = 0) {
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
    msgEl.replaceChildren(b, span);
  }

  return {
    setScore(text) {
      if (text === shownScore) return; // avoid touching the DOM every frame
      scoreEl.textContent = text;
      shownScore = text;
    },
    showStart(mode, zen, daily, speed) {
      const pace = speed === 'slow' ? 'Slow' : speed === 'fast' ? 'Fast' : '';
      message(
        ['Monodrift', daily && 'Daily', zen && 'Zen', pace].filter(Boolean).join(' · '),
        zen
          ? [HELP[mode], 'no crashes, no score · just drive', `${PRESS} to start`]
          : [`${HELP[mode]} · stay on the road`, ...(pace ? [`${pace} speed · not ranked`] : []), `${PRESS} to start`],
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
