import type { SteerMode } from '../input/input';

const HELP: Record<SteerMode, string> = {
  sides: 'hold left or right side to steer',
  drag: 'hold and slide left or right to aim the car',
};

export interface Hud {
  setScore(text: string): void;
  showStart(mode: SteerMode, zen: boolean): void;
  /** `hintDelayMs`: the "tap to retry" line fades in after this long. */
  showGameOver(score: number, best: number, hintDelayMs: number): void;
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
    showStart(mode, zen) {
      message(
        zen ? 'Drift · Zen' : 'Drift',
        zen
          ? [HELP[mode], 'no crashes, no score · just drive', 'tap to start']
          : [`${HELP[mode]} · stay on the road`, 'tap to start'],
      );
    },
    showGameOver(score, best, hintDelayMs) {
      message(String(score), [`best ${best} · tap to retry`], hintDelayMs);
    },
    hideMessage() {
      msgEl.replaceChildren();
    },
  };
}
