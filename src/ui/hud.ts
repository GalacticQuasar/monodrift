import type { SteerMode } from '../input/input';

const HELP: Record<SteerMode, string> = {
  sides: 'hold left or right side to steer',
  drag: 'hold and slide left or right to aim the car',
};

export interface Hud {
  setScore(text: string): void;
  showStart(mode: SteerMode): void;
  showGameOver(score: number, best: number): void;
  hideMessage(): void;
}

export function createHud(scoreEl: HTMLElement, msgEl: HTMLElement): Hud {
  let shownScore: string | null = null;

  function message(title: string, lines: string[]) {
    const b = document.createElement('b');
    b.textContent = title;
    const span = document.createElement('span');
    lines.forEach((line, i) => {
      if (i) span.append(document.createElement('br'));
      span.append(line);
    });
    msgEl.replaceChildren(b, span);
  }

  return {
    setScore(text) {
      if (text === shownScore) return; // avoid touching the DOM every frame
      scoreEl.textContent = text;
      shownScore = text;
    },
    showStart(mode) {
      message('Drift', [`${HELP[mode]} · stay on the road`, 'tap to start']);
    },
    showGameOver(score, best) {
      message(String(score), [`best ${best} · tap to retry`]);
    },
    hideMessage() {
      msgEl.replaceChildren();
    },
  };
}
