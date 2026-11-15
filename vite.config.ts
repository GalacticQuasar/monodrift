/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { headline, parsePatchNotes, renderPatchNotes } from './src/lib/patch-notes.ts';
import { ART_NAME, artProblems } from './src/lib/pixel-art.ts';

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

const ART_DIR = 'src/art';

/**
 * Dev server only: the pixel editor's (/tools/pixel-editor/) access to src/art/*.json.
 * GET /__art lists every asset; PUT /__art/<name> validates and saves one.
 */
function pixelArt(): Plugin {
  return {
    name: 'monodrift-pixel-art',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__art', (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method === 'GET' && (req.url === '/' || req.url === '')) {
          const assets = readdirSync(ART_DIR)
            .filter(f => f.endsWith('.json'))
            .sort()
            .map(f => ({ name: f.slice(0, -5), art: JSON.parse(readFileSync(join(ART_DIR, f), 'utf8')) }));
          return send(200, assets);
        }
        const name = decodeURIComponent((req.url ?? '').slice(1));
        if (req.method !== 'PUT' || !ART_NAME.test(name)) return send(404, { error: 'not found' });
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          let art: unknown;
          try {
            art = JSON.parse(body);
          } catch {
            return send(400, { error: 'not JSON' });
          }
          const problems = artProblems(art);
          if (problems.length) return send(400, { error: problems.join('; ') });
          const { palette, anchor, pixels } = art as { palette: string; anchor?: number[]; pixels: string[] };
          // one row per line, so diffs show which rows changed
          writeFileSync(join(ART_DIR, `${name}.json`), JSON.stringify(anchor ? { palette, anchor, pixels } : { palette, pixels }, null, 2).replace(/\[\n\s+(\d+),\n\s+(\d+)\n\s+\]/, '[$1, $2]') + '\n');
          send(200, { ok: true });
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [patchNotes(), serviceWorker(), pixelArt()],
  build: {
    rollupOptions: { input: { main: 'index.html', updates: 'updates.html' } },
  },
  // the leaderboard API runs in `npx wrangler dev` (local Worker + local database)
  // tests read style.css (?raw) to check colour tokens; Vitest blanks CSS otherwise
  test: { css: { include: [/style\.css/] } },
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
