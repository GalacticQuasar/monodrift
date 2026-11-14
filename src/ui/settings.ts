// Settings: the Settings button and its panel (road, zen, steering mode, sensitivity,
// trees). Choices are saved in localStorage and apply right away.

import { INPUT } from '../config';
import type { SteerMode } from '../input/input';
import { DESKTOP } from '../lib/device';
import { KEYS, storage } from '../lib/storage';

export interface Settings {
  readonly mode: SteerMode;
  /** Zen: no crashes, no score. */
  readonly zen: boolean;
  /** Drive the daily road (same for everyone each UTC day) instead of a random one. */
  readonly daily: boolean;
  /** Steering sensitivity level, 1..INPUT.sensitivity.length (middle = default). */
  readonly sensitivity: number;
  /** Draw the trees. */
  readonly trees: boolean;
}

export interface SettingsPanel extends Settings {
  /** True while the panel is open (game input should be ignored). */
  readonly open: boolean;
}

const LEVELS = INPUT.sensitivity.length;
const DEFAULT_LEVEL = Math.ceil(LEVELS / 2);

function loadLevel(): number {
  const n = Number(storage.get(KEYS.sensitivity));
  return Number.isInteger(n) && n >= 1 && n <= LEVELS ? n : DEFAULT_LEVEL;
}

/** Steering multiplier for a sensitivity level. */
export const sensitivityFactor = (level: number): number => INPUT.sensitivity[level - 1];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e: HTMLElementTagNameMap[K] = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

export function createSettings(button: HTMLButtonElement, panel: HTMLElement, onChange: (setting: keyof Settings) => void): SettingsPanel {
  const state = {
    mode: (storage.get(KEYS.mode) === 'drag' ? 'drag' : 'sides') as SteerMode,
    zen: storage.get(KEYS.zen) === 'on',
    daily: storage.get(KEYS.road) === 'daily',
    sensitivity: loadLevel(),
    trees: storage.get(KEYS.trees) !== 'off',
  };
  let isOpen = false;

  /** Updates the controls to match `state` (set by each row below). */
  const refreshers: (() => void)[] = [];
  const refresh = () => refreshers.forEach(f => f());

  /** A row with two (or more) choices; the chosen one is pressed. */
  function choice<T>(label: string, options: [T, string][], get: () => T, set: (v: T) => void): HTMLElement {
    const seg = el('div', { className: 'seg', role: 'group', ariaLabel: label });
    const buttons = options.map(([value, text]) => {
      const b = el('button', { type: 'button', textContent: text });
      b.addEventListener('click', () => {
        if (get() === value) return;
        set(value);
        refresh();
      });
      seg.append(b);
      return [value, b] as const;
    });
    refreshers.push(() => buttons.forEach(([value, b]) => b.setAttribute('aria-pressed', String(get() === value))));
    return el('div', { className: 'row' }, el('span', { className: 'label', textContent: label }), seg);
  }

  function sensitivityRow(): HTMLElement {
    const less = el('button', { type: 'button', className: 'step', textContent: '-', ariaLabel: 'Less sensitive' });
    const more = el('button', { type: 'button', className: 'step', textContent: '+', ariaLabel: 'More sensitive' });
    const cells = Array.from({ length: LEVELS }, () => el('i'));
    const meter = el('span', { className: 'meter', role: 'img' }, ...cells);
    const change = (d: number) => {
      const next = Math.min(LEVELS, Math.max(1, state.sensitivity + d));
      if (next === state.sensitivity) return;
      state.sensitivity = next;
      storage.set(KEYS.sensitivity, String(next));
      refresh();
      onChange('sensitivity');
    };
    less.addEventListener('click', () => change(-1));
    more.addEventListener('click', () => change(1));
    refreshers.push(() => {
      cells.forEach((c, i) => c.classList.toggle('on', i < state.sensitivity));
      meter.ariaLabel = `Sensitivity ${state.sensitivity} of ${LEVELS}`;
      less.disabled = state.sensitivity === 1;
      more.disabled = state.sensitivity === LEVELS;
    });
    return el('div', { className: 'row' }, el('span', { className: 'label', textContent: 'Sensitivity' }), el('div', { className: 'seg' }, less, meter, more));
  }

  const closeBtn = el('button', { type: 'button', className: 'close', textContent: '×', ariaLabel: 'Close' });
  closeBtn.addEventListener('click', close);

  const rows = [
    choice(
      'Road',
      [
        [true, 'Daily'],
        [false, 'Random'],
      ],
      () => state.daily,
      v => {
        state.daily = v;
        storage.set(KEYS.road, v ? 'daily' : 'random');
        onChange('daily');
      },
    ),
    choice(
      'Zen',
      [
        [false, 'Off'],
        [true, 'On'],
      ],
      () => state.zen,
      v => {
        state.zen = v;
        storage.set(KEYS.zen, v ? 'on' : 'off');
        onChange('zen');
      },
    ),
    // desktop steers with the keyboard only, so the touch steering mode doesn't apply
    ...(DESKTOP
      ? []
      : [
          choice<SteerMode>(
            'Steering',
            [
              ['sides', 'Sides'],
              ['drag', 'Slide'],
            ],
            () => state.mode,
            v => {
              state.mode = v;
              storage.set(KEYS.mode, v);
              onChange('mode');
            },
          ),
        ]),
    sensitivityRow(),
    choice(
      'Trees',
      [
        [true, 'On'],
        [false, 'Off'],
      ],
      () => state.trees,
      v => {
        state.trees = v;
        storage.set(KEYS.trees, v ? 'on' : 'off');
        onChange('trees');
      },
    ),
  ];

  const box = el(
    'div',
    { className: 'box', role: 'dialog', ariaModal: 'true', ariaLabel: 'Settings' },
    el('div', { className: 'head' }, el('b', { textContent: 'Settings' }), closeBtn),
    el('div', { className: 'rows' }, ...rows),
    el('p', { className: 'note', textContent: 'Changing Road or Zen starts over.' }),
  );
  panel.replaceChildren(box);
  refresh();

  function close() {
    if (!isOpen) return;
    isOpen = false;
    panel.hidden = true;
    button.focus({ preventScroll: true });
    button.blur();
  }

  button.addEventListener('click', () => {
    button.blur();
    isOpen = true;
    panel.hidden = false;
    closeBtn.focus({ preventScroll: true });
  });
  panel.addEventListener('pointerdown', e => {
    if (e.target === panel) close(); // tap outside the box
  });
  addEventListener('keydown', e => {
    if (isOpen && e.key === 'Escape') close();
  });

  return {
    get mode() {
      return state.mode;
    },
    get zen() {
      return state.zen;
    },
    get daily() {
      return state.daily;
    },
    get sensitivity() {
      return state.sensitivity;
    },
    get trees() {
      return state.trees;
    },
    get open() {
      return isOpen;
    },
  };
}
