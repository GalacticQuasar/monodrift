import type { SteerMode } from '../input/input';
import { KEYS, storage } from '../lib/storage';

export interface Settings {
  readonly mode: SteerMode;
  readonly crash: boolean;
}

/** Wires the mode and crash toggle buttons; persists choices. */
export function createSettings(
  modeBtn: HTMLButtonElement,
  crashBtn: HTMLButtonElement,
  onChange: (setting: keyof Settings) => void,
): Settings {
  const state = {
    mode: (storage.get(KEYS.mode) === 'drag' ? 'drag' : 'sides') as SteerMode,
    crash: storage.get(KEYS.crash) !== 'off',
  };

  const render = () => {
    modeBtn.textContent = state.mode === 'drag' ? 'Mode: Slide' : 'Mode: Sides';
    crashBtn.textContent = state.crash ? 'Crash: On' : 'Crash: Off';
  };

  modeBtn.addEventListener('click', () => {
    state.mode = state.mode === 'drag' ? 'sides' : 'drag';
    storage.set(KEYS.mode, state.mode);
    render();
    modeBtn.blur();
    onChange('mode');
  });
  crashBtn.addEventListener('click', () => {
    state.crash = !state.crash;
    storage.set(KEYS.crash, state.crash ? 'on' : 'off');
    render();
    crashBtn.blur();
    onChange('crash');
  });

  render();
  return state;
}
