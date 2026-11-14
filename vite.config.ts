import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { headline, parsePatchNotes, renderPatchNotes } from './src/lib/patch-notes.ts';

/** Files in public/ the game doesn't need offline (og.png is only for link previews). */
const NOT_OFFLINE = new Set(['og.png']);

/** Built pages and the clean URL each is served at (Cloudflare serves updates.html at /updates). */
const PAGES: Record<string, string> = { 'index.html': '/', 'updates.html': '/updates' };

const PATCH_NOTES = 'docs/patch-notes.md';
const readNotes = () => parsePatchNotes(readFileSync(PATCH_NOTES, 'utf8'));

/**
 * The /updates page and the in-game "updated" card, both from docs/patch-notes.md:
 * fills updates.html with the rendered notes, and gives the game the newest entry
 * as __LATEST_NOTES__ ({ id, headline } or null).
 */
function patchNotes(): Plugin {
  return {
    name: 'monodrift-patch-notes',
    config() {
      const latest = readNotes()[0];
      return { define: { __LATEST_NOTES__: JSON.stringify(latest ? { id: latest.id, headline: headline(latest) } : null) } };
    },
    configureServer(server) {
      // notes edited while the dev server runs: reload, so /updates shows them
      server.watcher.add(PATCH_NOTES);
      server.watcher.on('change', file => {
        if (file.endsWith(PATCH_NOTES)) server.ws.send({ type: 'full-reload' });
      });
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!ctx.path.endsWith('/updates.html')) return html;
        const notes = readNotes();
        return html.replace('<!--PATCH_NOTES-->', renderPatchNotes(notes)).replace('__LATEST_NOTES_ID__', notes[0]?.id ?? '');
      },
    },
  };
}

/**
 * Builds dist/sw.js from the src/sw.js template: fills in the list of files to keep
 * offline and a version derived from their contents, so every deploy that changes
 * anything gets a fresh cache and old ones are cleaned up.
 */
function serviceWorker(): Plugin {
  let publicDir = '';
  return {
    name: 'monodrift-service-worker',
    apply: 'build',
    enforce: 'post', // after Vite has emitted the pages
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_, bundle) {
      const hash = createHash('sha256');
      for (const page of Object.keys(PAGES)) {
        const html = bundle[page];
        if (!html || html.type !== 'asset') throw new Error(`service worker: ${page} not in bundle`);
        hash.update(html.source); // page names aren't hashed: their content is (e.g. edited notes)
      }

      const built = Object.keys(bundle).filter(f => !(f in PAGES)); // names are content-hashed
      const pub = readdirSync(publicDir).filter(f => !NOT_OFFLINE.has(f));
      for (const f of built) hash.update(f);
      for (const f of pub) hash.update(f).update(readFileSync(join(publicDir, f)));

      const files = [...Object.values(PAGES), ...[...built, ...pub].sort().map(f => `/${f}`)];
      const source = readFileSync('src/sw.js', 'utf8')
        .replace('__VERSION__', JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('__PRECACHE__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [patchNotes(), serviceWorker()],
  build: {
    rollupOptions: { input: { main: 'index.html', updates: 'updates.html' } },
  },
  // the leaderboard API runs in `npx wrangler dev` (local Worker + local database)
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
