// Settings: the Settings button and its panel (road, zen, speed, steering mode,
// sensitivity, trees, dark). Choices are saved in localStorage and apply right away.

import { CAR_COLORS, INPUT, SPEED, type CarColor } from '../config';
import type { SteerMode } from '../input/input';
import { DESKTOP } from '../lib/device';
import { KEYS, storage } from '../lib/storage';
import { parseDark, type DarkSetting } from './theme';

export interface Settings {
  readonly mode: SteerMode;
  /** Zen: no crashes, no score. */
  readonly zen: boolean;
  /** Game speed; only Normal runs are ranked. */
  readonly speed: Speed;
  /** Drive the daily road (same for everyone each UTC day) instead of a random one. */
  readonly daily: boolean;
  /** Steering sensitivity level, 1..INPUT.sensitivity.length (middle = default). */
  readonly sensitivity: number;
  /** Draw the trees. */
  readonly trees: boolean;
  /** Dark mode: follow the device, or always on/off. */
  readonly dark: DarkSetting;
  /** Car colour (others in a room see it too). */
  readonly car: CarColor;
}

export type Speed = keyof typeof SPEED;

const parseSpeed = (v: string | null): Speed => (v === 'slow' || v === 'fast' ? v : 'normal');
const parseCar = (v: string | null): CarColor => CAR_COLORS.find(c => c.id === v)?.id ?? 'default';

export interface SettingsPanel extends Settings {
  /** True while the panel is open (game input should be ignored). */
  readonly open: boolean;
  /**
   * In a multiplayer room (true): the room picks the road and the rules, so Road, Zen
   * and Speed are locked, and the Friends row offers to leave instead of invite.
   */
  setInRoom(inRoom: boolean): void;
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

export function createSettings(
  button: HTMLButtonElement,
  panel: HTMLElement,
  onChange: (setting: keyof Settings) => void,
  /** The panel opened (true) or closed (false). */
  onOpenChange: (open: boolean) => void,
  /** The Friends row's button: start a room, or leave the one you're in. */
  onFriends: () => void,
): SettingsPanel {
  const state = {
    mode: (storage.get(KEYS.mode) === 'drag' ? 'drag' : 'sides') as SteerMode,
    zen: storage.get(KEYS.zen) === 'on',
    speed: parseSpeed(storage.get(KEYS.speed)),
    daily: storage.get(KEYS.road) === 'daily',
    sensitivity: loadLevel(),
    trees: storage.get(KEYS.trees) !== 'off',
    dark: parseDark(storage.get(KEYS.dark)),
    car: parseCar(storage.get(KEYS.car)),
  };
  let isOpen = false;
  let inRoom = false;

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

  /** Rows the room decides while you're in one. */
  const roomLocked: HTMLElement[] = [];
  const locked = (row: HTMLElement) => {
    roomLocked.push(row);
    return row;
  };
  refreshers.push(() => {
    for (const row of roomLocked) for (const b of row.querySelectorAll('button')) b.disabled = inRoom;
  });

  const friendsBtn = el('button', { type: 'button' });
  friendsBtn.addEventListener('click', () => {
    close();
    onFriends();
  });
  refreshers.push(() => (friendsBtn.textContent = inRoom ? 'Leave room' : 'Invite'));
  const friendsRow = el('div', { className: 'row' }, el('span', { className: 'label', textContent: 'Friends' }), el('div', { className: 'seg' }, friendsBtn));

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

  /** Car colour swatches: the default (ink) and the muted colours, each with its light/dark value. */
  function carRow(): HTMLElement {
    const swatches = el('div', { className: 'swatches', role: 'group', ariaLabel: 'Car colour' });
    const options: [CarColor, string, string, string][] = [['default', 'Default', '', ''], ...CAR_COLORS.map(c => [c.id, c.name, c.light, c.dark] as [CarColor, string, string, string])];
    const buttons = options.map(([id, name, light, dark]) => {
      const b = el('button', { type: 'button', className: id === 'default' ? 'swatch default' : 'swatch', ariaLabel: name, title: name });
      if (light) {
        b.style.setProperty('--swatch-light', light);
        b.style.setProperty('--swatch-dark', dark);
      }
      b.addEventListener('click', () => {
        if (state.car === id) return;
        state.car = id;
        storage.set(KEYS.car, id);
        refresh();
        onChange('car');
      });
      swatches.append(b);
      return [id, b] as const;
    });
    refreshers.push(() => buttons.forEach(([id, b]) => b.setAttribute('aria-pressed', String(state.car === id))));
    return el('div', { className: 'row' }, el('span', { className: 'label', textContent: 'Car' }), swatches);
  }

  /** Under the Speed row while Slow/Fast is picked, so the switch away from Normal is noticed. */
  const speedNote = el('p', { className: 'note speed-note', textContent: 'Not ranked: only Normal speed is.' });
  refreshers.push(() => (speedNote.hidden = state.speed === 'normal' || inRoom));

  const closeBtn = el('button', { type: 'button', className: 'close', textContent: '×', ariaLabel: 'Close' });
  closeBtn.addEventListener('click', close);

  const rows = [
    friendsRow,
    locked(
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
    ),
    locked(
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
    ),
    locked(
      choice<Speed>(
        'Speed',
        [
          ['slow', 'Slow'],
          ['normal', 'Normal'],
          ['fast', 'Fast'],
        ],
        () => state.speed,
        v => {
          state.speed = v;
          storage.set(KEYS.speed, v);
          onChange('speed');
        },
      ),
    ),
    speedNote,
    carRow(),
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
    choice<DarkSetting>(
      'Dark',
      [
        ['off', 'Off'],
        ['on', 'On'],
        ['auto', 'Auto'],
      ],
      () => state.dark,
      v => {
        state.dark = v;
        storage.set(KEYS.dark, v);
        onChange('dark');
      },
    ),
  ];

  const footNote = el('p', { className: 'note' });
  refreshers.push(() => (footNote.textContent = inRoom ? 'In a room, it picks the road: Normal speed, no Zen.' : 'Changing Road, Zen or Speed starts over.'));

  const box = el(
    'div',
    { className: 'box', role: 'dialog', ariaModal: 'true', ariaLabel: 'Settings' },
    el('div', { className: 'head' }, el('b', { textContent: 'Settings' }), closeBtn),
    el('div', { className: 'rows' }, ...rows),
    el('div', { className: 'foot' }, footNote, el('a', { href: '/updates', textContent: "What's new" })),
  );
  panel.replaceChildren(box);
  refresh();

  function close() {
    if (!isOpen) return;
    isOpen = false;
    panel.hidden = true;
    button.focus({ preventScroll: true });
    button.blur();
    onOpenChange(false);
  }

  button.addEventListener('click', () => {
    button.blur();
    isOpen = true;
    panel.hidden = false;
    closeBtn.focus({ preventScroll: true });
    onOpenChange(true);
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
    get speed() {
      return state.speed;
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
    get dark() {
      return state.dark;
    },
    get car() {
      return state.car;
    },
    get open() {
      return isOpen;
    },
    setInRoom(v) {
      inRoom = v;
      refresh();
    },
  };
}
