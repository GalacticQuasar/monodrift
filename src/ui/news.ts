// "Monodrift was updated" card: once per patch notes entry, for returning players, on
// the start screen. New players never see it (nothing is new to them), and opening
// /updates counts as seen (updates.html sets the same key).

import { KEYS, storage } from '../lib/storage';

export interface News {
  /** On a menu screen: show the card if it's due. True if it's showing (other cards wait). */
  maybeShow(): boolean;
  hide(): void;
}

export function createNews(el: HTMLElement, latest: { id: string; headline: string } | null): News {
  const seen = storage.get(KEYS.notesSeen);
  const returning = (Number(storage.get(KEYS.runs)) || 0) > 0;
  if (latest && seen === null && !returning) storage.set(KEYS.notesSeen, latest.id); // first visit
  let due = latest !== null && seen !== latest.id && (seen !== null || returning);
  let visible = false;

  function hide() {
    el.hidden = true;
    visible = false;
  }

  function render(entry: { id: string; headline: string }) {
    const title = document.createElement('b');
    title.textContent = 'Monodrift was updated';
    const text = document.createElement('p');
    text.textContent = `New: ${entry.headline}.`;
    const later = document.createElement('button');
    later.textContent = 'Later';
    later.addEventListener('click', hide);
    const open = document.createElement('button');
    open.className = 'primary';
    open.textContent = "What's new";
    open.addEventListener('click', () => location.assign('/updates'));
    const buttons = document.createElement('div');
    buttons.className = 'buttons';
    buttons.append(later, open);
    el.replaceChildren(title, text, buttons);
  }

  return {
    hide,
    maybeShow() {
      if (visible) return true;
      if (!due || !latest) return false;
      due = false;
      storage.set(KEYS.notesSeen, latest.id); // shown once; "Later" doesn't bring it back
      render(latest);
      el.hidden = false;
      visible = true;
      return true;
    },
  };
}
