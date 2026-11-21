// Palettes for hand-drawn pixel art (src/art/*.json, editable in the pixel editor:
// `npm run dev`, then /tools/pixel-editor/). Each character in an asset's rows is a
// tone of its palette (listed in display order); '.' is always transparent. Every tone has a light and a dark
// value, like the rest of the game's colours.

import { COLORS } from '../config';

export interface Tone {
  /** The character for this tone in an asset's rows. */
  char: string;
  /** Short name (also the CSS class the copper key's SVG uses). */
  name: string;
  light: string;
  dark: string;
  /** CSS custom property holding the same colour, for art drawn in the DOM. */
  css?: string;
}

const scenery = (char: string, name: string, pick: (p: typeof COLORS.light) => string): Tone => ({ char, name, light: pick(COLORS.light), dark: pick(COLORS.dark) });

export const PALETTES = {
  /** Scenery (campfires, future cottages…): the canvas tones in COLORS. */
  scenery: [
    scenery('o', 'outline', p => p.treeOutline),
    scenery('t', 'trunk', p => p.treeTrunk),
    scenery('1', 'tone 1 (dark)', p => p.treeTones[0]),
    scenery('2', 'tone 2', p => p.treeTones[1]),
    scenery('3', 'tone 3', p => p.treeTones[2]),
    scenery('4', 'tone 4 (light)', p => p.treeTones[3]),
    scenery('s', 'shadow', p => p.treeShadow),
    scenery('f', 'flame', p => p.flame),
    scenery('y', 'flame core', p => p.flameCore),
  ],
  /** The copper key easter egg (ui/egg.ts), drawn in the DOM with the --copper-* tokens. */
  copper: [
    { char: 'o', name: 'outline', light: '#4a2610', dark: '#0f0f0f', css: '--copper-outline' },
    { char: 'h', name: 'hi', light: '#f2b47c', dark: '#e0a26a', css: '--copper-hi' },
    { char: 'm', name: 'mid', light: '#c8763c', dark: '#b5672f', css: '--copper-mid' },
    { char: 'd', name: 'lo', light: '#8f4e22', dark: '#7a411b', css: '--copper-lo' },
  ],
  /** The win trophy (ui/win.ts), drawn in the DOM with the --trophy-* tokens. Grey, like the rest of the game. */
  trophy: [
    { char: 'o', name: 'outline', light: '#3a3a3a', dark: '#0f0f0f', css: '--trophy-outline' },
    { char: 'h', name: 'hi', light: '#fafafa', dark: '#f0f0f0', css: '--trophy-hi' },
    { char: 'm', name: 'mid', light: '#c6c6c6', dark: '#b4b4b4', css: '--trophy-mid' },
    { char: 'd', name: 'lo', light: '#8a8a8a', dark: '#7a7a7a', css: '--trophy-lo' },
  ],
} satisfies Record<string, Tone[]>;

export type PaletteName = keyof typeof PALETTES;

/** A palette's tones by character. */
export function toneMap(palette: PaletteName): Record<string, Tone> {
  return Object.fromEntries(PALETTES[palette].map(t => [t.char, t]));
}
