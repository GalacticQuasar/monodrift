import type { SteerMode } from '../input/input';
import { KEYS, storage } from '../lib/storage';

export interface Settings {
  readonly mode: SteerMode;
  /** Zen: no crashes, no score. */
  readonly zen: boolean;
}

/** Wires the mode and zen toggle buttons; persists choices. */
export function createSettings(
  modeBtn: HTMLButtonElement,
  zenBtn: HTMLButtonElement,
  onChange: (setting: keyof Settings) => void,
): Settings {
  const state = {
    mode: (storage.get(KEYS.mode) === 'drag' ? 'drag' : 'sides') as SteerMode,
    zen: storage.get(KEYS.zen) === 'on',
  };

  const render = () => {
    modeBtn.textContent = state.mode === 'drag' ? 'Mode: Slide' : 'Mode: Sides';
    zenBtn.textContent = state.zen ? 'Zen: On' : 'Zen: Off';
    zenBtn.setAttribute('aria-pressed', String(state.zen));
  };

  modeBtn.addEventListener('click', () => {
    state.mode = state.mode === 'drag' ? 'sides' : 'drag';
    storage.set(KEYS.mode, state.mode);
    render();
    modeBtn.blur();
    onChange('mode');
  });
  zenBtn.addEventListener('click', () => {
    state.zen = !state.zen;
    storage.set(KEYS.zen, state.zen ? 'on' : 'off');
    render();
    zenBtn.blur();
    onChange('zen');
  });

  render();
  return state;
}
