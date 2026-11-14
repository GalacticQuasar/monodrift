/**
 * Mouse/trackpad + keyboard (laptop/desktop) rather than touch. Desktop players steer
 * with the keyboard only, so touch-only controls (steering mode, pointer steering) hide.
 */
export const DESKTOP = matchMedia('(hover: hover) and (pointer: fine)').matches;
