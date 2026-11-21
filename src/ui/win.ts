// Round winner in a multiplayer room: the winner gets a pixel trophy bursting in
// (flash, sparks, spin, bob: the same moves as the copper key, ui/egg.ts); everyone
// else sees "<name> wins!" in the HUD or on the room card. The trophy is
// src/art/trophy.json (edit it in the pixel editor), coloured by the --trophy-* tokens.

import trophyArt from '../art/trophy.json';
import type { PixelArt } from '../lib/pixel-art';
import { artSvg } from './art-svg';

const TROPHY = trophyArt as PixelArt;
const SPARKS = 24;

/** A small trophy (e.g. next to the winner on the room card). */
export const trophyIcon = (): SVGSVGElement => {
  const svg = artSvg(TROPHY);
  svg.classList.add('trophy-icon');
  return svg;
};

export interface Win {
  /** The big win: `title` in bouncing letters ("You win!"), `sub` under it. */
  show(title: string, sub: string): void;
  hide(): void;
  readonly shown: boolean;
}

export function createWin(el: HTMLElement): Win {
  return {
    show(title, sub) {
      const flash = document.createElement('div');
      flash.className = 'egg-flash';
      const sparks = document.createElement('div');
      sparks.className = 'win-sparks';
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
      const trophy = document.createElement('div');
      trophy.className = 'win-trophy';
      trophy.append(artSvg(TROPHY));
      const b = document.createElement('b');
      b.setAttribute('aria-label', title);
      [...title].forEach((ch, i) => {
        const s = document.createElement('span');
        s.textContent = ch;
        s.style.animationDelay = `${450 + i * 55}ms`;
        s.setAttribute('aria-hidden', 'true');
        b.append(s);
      });
      const subEl = document.createElement('span');
      subEl.className = 'win-sub';
      subEl.textContent = sub;
      el.replaceChildren(flash, sparks, trophy, b, subEl);
      el.hidden = false;
    },
    hide() {
      el.hidden = true;
      el.replaceChildren();
    },
    get shown() {
      return !el.hidden;
    },
  };
}
