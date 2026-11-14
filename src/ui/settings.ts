import type { SteerMode } from '../input/input';
import { KEYS, storage } from '../lib/storage';

export interface Settings {
  readonly mode: SteerMode;
  /** Zen: no crashes, no score. */
  readonly zen: boolean;
  /** Drive the daily road (same for everyone each UTC day) instead of a random one. */
  readonly daily: boolean;
}

/** Wires the mode and zen toggle buttons; persists choices. */
export function createSettings(
  modeBtn: HTMLButtonElement,
  zenBtn: HTMLButtonElement,
  roadBtn: HTMLButtonElement,
  onChange: (setting: keyof Settings) => void,
): Settings {
  const state = {
    mode: (storage.get(KEYS.mode) === 'drag' ? 'drag' : 'sides') as SteerMode,
    zen: storage.get(KEYS.zen) === 'on',
    daily: storage.get(KEYS.road) === 'daily',
  };

  const render = () => {
    modeBtn.textContent = state.mode === 'drag' ? 'Mode: Slide' : 'Mode: Sides';
    zenBtn.textContent = state.zen ? 'Zen: On' : 'Zen: Off';
    zenBtn.setAttribute('aria-pressed', String(state.zen));
    roadBtn.textContent = state.daily ? 'Road: Daily' : 'Road: Random';
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

  roadBtn.addEventListener('click', () => {
    state.daily = !state.daily;
    storage.set(KEYS.road, state.daily ? 'daily' : 'random');
    render();
    roadBtn.blur();
    onChange('daily');
  });

  render();
  return state;
}
