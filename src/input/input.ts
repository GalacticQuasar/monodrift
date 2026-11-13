// Turns pointer and keyboard events into a device-independent SteerIntent.

import { INPUT } from '../config';
import type { SteerIntent } from '../sim/game';

/** 'sides': hold left/right half. 'drag': slide finger from where it went down. */
export type SteerMode = 'sides' | 'drag';

export interface Input {
  /** Current intent; sampled once per simulation step. */
  intent(): SteerIntent;
  /** Forget held pointers (e.g. after a mode switch). */
  clear(): void;
}

const NON_ACTION_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape', 'ContextMenu']);

/** True for keys that should count as "press any key": not modifiers, shortcuts or F-keys. */
function isActionKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  // a focused button (reached via Tab) gets its own Enter/Space; don't also start a run
  if (e.target instanceof HTMLElement && e.target.closest('button, input, select, textarea, a')) return false;
  if (NON_ACTION_KEYS.has(e.key) || /^F\d+$/.test(e.key)) return false;
  return true;
}

interface HeldPointer {
  startX: number;
  x: number;
  gesture: number;
}

export function createInput(
  target: HTMLElement,
  opts: {
    mode: () => SteerMode;
    /** Called on tap / Space / Enter. Return true if it was consumed (e.g. started a run). */
    onAction: () => boolean;
  },
): Input {
  const pointers = new Map<number, HeldPointer>();
  let keyL = false, keyR = false;
  let nextGesture = 1;

  target.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (opts.onAction()) return;
    pointers.set(e.pointerId, { startX: e.clientX, x: e.clientX, gesture: nextGesture++ });
  });
  target.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (p) p.x = e.clientX;
  });
  const release = (e: PointerEvent) => pointers.delete(e.pointerId);
  target.addEventListener('pointerup', release);
  target.addEventListener('pointercancel', release);
  target.addEventListener('pointerleave', release);

  addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') keyL = true;
    if (e.key === 'ArrowRight') keyR = true;
    // any key starts/retries, so an arrow press both starts the run and steers
    if (!e.repeat && isActionKey(e)) opts.onAction();
  });
  addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft') keyL = false;
    if (e.key === 'ArrowRight') keyR = false;
  });
  addEventListener('contextmenu', e => e.preventDefault());

  return {
    intent() {
      let last: HeldPointer | undefined;
      for (const p of pointers.values()) last = p; // most recent touch wins

      let rate = 0;
      if (last) {
        if (opts.mode() === 'drag') {
          if (!keyL && !keyR) {
            const offset = ((last.x - last.startX) / INPUT.dragPxPer90) * (Math.PI / 2);
            return { kind: 'aim', offset, gesture: last.gesture };
          }
        } else {
          rate = last.x < innerWidth / 2 ? -1 : 1;
        }
      }
      if (keyL) rate = -1;
      if (keyR) rate = 1;
      return { kind: 'rate', rate };
    },
    clear() {
      pointers.clear();
    },
  };
}
