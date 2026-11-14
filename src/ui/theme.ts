// Light/dark theme: the Dark setting (off by default; 'auto' follows the device) decides it. The page
// gets data-theme="dark"|"light" on <html> (CSS tokens in style.css switch on it) and
// the canvas gets the matching palette. index.html applies the same rule before first
// paint, so dark-mode players don't see a light flash while the game loads.

import { COLORS, type Palette } from '../config';

export type DarkSetting = 'auto' | 'on' | 'off';

const deviceDark = matchMedia('(prefers-color-scheme: dark)');

/** Unset (or anything unknown) means off: dark mode is opt-in. */
export const parseDark = (v: string | null): DarkSetting => (v === 'on' || v === 'auto' ? v : 'off');

/**
 * Calls `apply` now and whenever the theme changes because the device switched (for
 * 'auto'). Returns a function to call after the setting itself changes.
 */
export function watchTheme(setting: () => DarkSetting, apply: (colors: Palette) => void): () => void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const update = () => {
    const s = setting();
    const dark = s === 'on' || (s === 'auto' && deviceDark.matches);
    const colors = dark ? COLORS.dark : COLORS.light;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    meta?.setAttribute('content', colors.ground); // phone status bar / browser chrome
    apply(colors);
  };
  deviceDark.addEventListener('change', update);
  update();
  return update;
}
