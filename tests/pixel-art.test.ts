import { describe, expect, it } from 'vitest';
import { PALETTES } from '../src/art/palettes';
import { artProblems, artRuns, type PixelArt } from '../src/lib/pixel-art';
import css from '../src/style.css?raw';

const assets = import.meta.glob<string>('../src/art/*.json', { query: '?raw', import: 'default', eager: true });

describe('pixel art', () => {
  it('finds the assets', () => expect(Object.keys(assets).length).toBeGreaterThan(0));
  for (const [file, text] of Object.entries(assets)) {
    it(`${file} is valid`, () => expect(artProblems(JSON.parse(text))).toEqual([]));
  }

  it('spots broken assets', () => {
    expect(artProblems({ palette: 'copper', pixels: ['oo', 'o'] })).toEqual(['row 1 is 1 wide, not 2']);
    expect(artProblems({ palette: 'copper', pixels: ['ox'] })).toEqual(['characters not in the copper palette: x']);
    expect(artProblems({ palette: 'nope', pixels: ['.'] })).toEqual(['unknown palette "nope"']);
    expect(artProblems({ palette: 'copper', pixels: ['..'], anchor: [2, 0] })).toHaveLength(1);
    expect(artProblems({ palette: 'scenery', pixels: ['.o', 's4'], anchor: [1, 1] })).toEqual([]);
  });

  it('splits rows into runs of one tone', () => {
    const art: PixelArt = { palette: 'copper', pixels: ['.ooh', 'dd..'] };
    expect(artRuns(art)).toEqual([
      { x: 1, y: 0, w: 2, c: 'o' },
      { x: 3, y: 0, w: 1, c: 'h' },
      { x: 0, y: 1, w: 2, c: 'd' },
    ]);
  });

  it('palettes use each character once, never the transparent one', () => {
    for (const tones of Object.values(PALETTES)) {
      const chars = tones.map(t => t.char);
      expect(new Set(chars).size).toBe(chars.length);
      expect(chars.every(c => c.length === 1 && c !== '.')).toBe(true);
    }
  });

  it('copper tones match their CSS tokens in style.css (light and dark)', () => {
    const block = (selector: string) => css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)));
    const light = block(':root {'), dark = block(":root[data-theme='dark'] {");
    const value = (b: string, prop = '') => b.match(new RegExp(`${prop}:\\s*([^;]+);`))?.[1].trim();
    for (const tone of PALETTES.copper) {
      expect(value(light, tone.css), tone.css).toBe(tone.light);
      expect(value(dark, tone.css), tone.css).toBe(tone.dark);
    }
  });
});
