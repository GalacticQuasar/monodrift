import { describe, expect, it } from 'vitest';
import realLog from '../docs/patch-notes.md?raw';
import { entryDate, headline, parsePatchNotes, renderPatchNotes } from '../src/lib/patch-notes';

const SAMPLE = `# Patch notes

Intro text.

## 2026-11-14

- Covers: \`a\` to \`b\`
- Last commit: \`b\`

**Monodrift**: a minimal top-down drift game. Play at https://example.com

**Big new stuff**
- **Settings**: one button holds the options
- **Dark mode**: a night road

**Polish**
- **Pixel-art trees** along the road
- Plain item with <html> & stuff.

## 2026-11-13

**Big new stuff**
- **Leaderboard**: pick a name
`;

describe('patch notes', () => {
  const entries = parsePatchNotes(SAMPLE);

  it('reads entries newest first, skipping metadata and intro lines', () => {
    expect(entries.map(e => e.id)).toEqual(['2026-11-14', '2026-11-13']);
    expect(entries[0].sections.map(s => s.title)).toEqual(['Big new stuff', 'Polish']);
    expect(entries[0].sections[0].items[0]).toEqual({ name: 'Settings', text: 'one button holds the options' });
    // bold without a colon stays inline
    expect(entries[0].sections[1].items[0]).toEqual({ name: null, text: '**Pixel-art trees** along the road' });
  });

  it('renders sentences, inline bold, and escapes HTML', () => {
    const html = renderPatchNotes(entries);
    expect(html).toContain('<li><b>Settings.</b> One button holds the options.</li>');
    expect(html).toContain('<li><b>Pixel-art trees</b> along the road.</li>');
    expect(html).toContain('Plain item with &lt;html&gt; &amp; stuff.');
    expect(html).toContain('<h2>November 14, 2026</h2>');
    expect(html).not.toContain('Last commit');
    expect(html).not.toContain('example.com');
  });

  it('summarises an entry for the in-game card', () => {
    expect(headline(entries[0])).toBe('Settings, Dark mode and more');
    expect(headline(entries[1])).toBe('Leaderboard');
  });

  it('formats date headings and leaves others alone', () => {
    expect(entryDate('2026-01-02')).toBe('January 2, 2026');
    expect(entryDate('Launch')).toBe('Launch');
  });

  it('parses the real log', () => {
    const real = parsePatchNotes(realLog);
    expect(real.length).toBeGreaterThan(0);
    for (const e of real) expect(e.sections.every(s => s.items.length > 0)).toBe(true);
  });
});
