// "Add to home screen" card for phones, shown on a menu screen once someone has
// played a few runs. Android browsers get an Install button (the browser's own
// install dialog); iOS has no install API, so it explains Share → Add to Home Screen.

import { UI } from '../config';
import { KEYS, storage } from '../lib/storage';

/** Chrome-only event, not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallPrompt {
  /** A run started: count it and hide the card. */
  runStarted(): void;
  /** On a menu screen (start or game over): show the card if it's due. */
  maybeShow(): void;
}

const PHONE = matchMedia('(pointer: coarse)').matches;
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function installed(): boolean {
  return (
    matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function createInstallPrompt(el: HTMLElement): InstallPrompt {
  let deferred: BeforeInstallPromptEvent | null = null;
  let shownThisVisit = false;

  // Android/Chrome: keep the event for our own button instead of the browser's mini-infobar
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
  });
  addEventListener('appinstalled', () => {
    storage.set(KEYS.install, 'done');
    hide();
  });

  function hide() {
    el.hidden = true;
  }
  function done() {
    storage.set(KEYS.install, 'done'); // installed or "not now": don't ask again
    hide();
  }

  function render() {
    const title = document.createElement('b');
    title.textContent = 'Play Monodrift as an app';
    const text = document.createElement('p');
    text.textContent = IOS
      ? 'Tap Share, then Add to Home Screen. It opens full screen and works offline.'
      : 'Add it to your home screen: it opens full screen and works offline.';
    const buttons = document.createElement('div');
    const later = document.createElement('button');
    later.textContent = IOS ? 'Got it' : 'Not now';
    later.addEventListener('click', done);
    buttons.append(later);
    if (!IOS) {
      const install = document.createElement('button');
      install.textContent = 'Install';
      install.className = 'primary';
      install.addEventListener('click', async () => {
        const e = deferred;
        if (!e) return hide();
        deferred = null; // a prompt event can only be used once
        hide();
        await e.prompt();
        if ((await e.userChoice).outcome === 'accepted') storage.set(KEYS.install, 'done');
      });
      buttons.append(install);
    }
    el.replaceChildren(title, text, buttons);
  }

  return {
    runStarted() {
      storage.set(KEYS.runs, String((Number(storage.get(KEYS.runs)) || 0) + 1));
      hide();
    },
    maybeShow() {
      if (shownThisVisit || !PHONE || installed() || storage.get(KEYS.install) === 'done') return;
      if ((Number(storage.get(KEYS.runs)) || 0) < UI.installPromptAfterRuns) return;
      if (!IOS && !deferred) return; // this browser can't install it (or it's already installed)
      shownThisVisit = true;
      render();
      el.hidden = false;
    },
  };
}
