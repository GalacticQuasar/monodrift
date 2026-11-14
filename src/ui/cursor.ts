import { UI } from '../config';

/**
 * Hides the mouse cursor so it doesn't sit on top of the game: right away on a key
 * press or while a mouse button is held (steering), otherwise after it has been
 * still for a moment. Moving the mouse brings it back; it stays while over a button.
 */
export function autoHideCursor(root: HTMLElement = document.body) {
  let timer = 0;
  const hide = () => root.classList.add('cursor-hidden');
  const hideNow = () => {
    clearTimeout(timer);
    hide();
  };
  const overButton = (e: Event) => e.target instanceof Element && e.target.closest('button') !== null;

  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    if (e.buttons !== 0) return hideNow();
    clearTimeout(timer);
    root.classList.remove('cursor-hidden');
    if (!overButton(e)) timer = setTimeout(hide, UI.cursorHideMs);
  });
  addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && !overButton(e)) hideNow();
  });
  addEventListener('keydown', e => {
    if (!(e.target instanceof HTMLInputElement)) hideNow(); // not while typing a name
  });

  timer = setTimeout(hide, UI.cursorHideMs);
}
