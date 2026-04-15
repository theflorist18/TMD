/**
 * Verifies `dist/` is ready for GitHub Pages (run after `npm run build:pages`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, '..', 'dist');

const required = ['index.html', '404.html', '.nojekyll'];
let ok = true;
for (const f of required) {
  const p = join(dist, f);
  if (!existsSync(p)) {
    console.error(`verify-pages-dist: missing ${f}`);
    ok = false;
  }
}
if (!ok) process.exit(1);

const idx = readFileSync(join(dist, 'index.html'), 'utf8');
const four = readFileSync(join(dist, '404.html'), 'utf8');
if (idx !== four) {
  console.error('verify-pages-dist: 404.html must match index.html for SPA routing');
  process.exit(1);
}

if (!idx.includes('script') || !idx.includes('assets/')) {
  console.error('verify-pages-dist: index.html looks invalid');
  process.exit(1);
}

console.log('verify-pages-dist: OK (index.html, 404.html, .nojekyll, SPA fallback match)');
