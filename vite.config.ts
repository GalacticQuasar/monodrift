import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Files in public/ the game doesn't need offline (og.png is only for link previews). */
const NOT_OFFLINE = new Set(['og.png']);

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
    enforce: 'post', // after Vite has emitted index.html
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') throw new Error('service worker: index.html not in bundle');

      const built = Object.keys(bundle).filter(f => f !== 'index.html'); // names are content-hashed
      const pub = readdirSync(publicDir).filter(f => !NOT_OFFLINE.has(f));

      const hash = createHash('sha256').update(html.source);
      for (const f of built) hash.update(f);
      for (const f of pub) hash.update(f).update(readFileSync(join(publicDir, f)));

      const files = ['/', ...[...built, ...pub].sort().map(f => `/${f}`)];
      const source = readFileSync('src/sw.js', 'utf8')
        .replace('__VERSION__', JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('__PRECACHE__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [serviceWorker()],
});
