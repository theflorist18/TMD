/**
 * After `vite build`, prepares `dist/` for GitHub Pages:
 * - `404.html` = copy of `index.html` so client-side routes work on refresh / deep links.
 * - `.nojekyll` disables Jekyll so paths like `assets/` are served as-is.
 */
import { copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, '..', 'dist');

copyFileSync(join(dist, 'index.html'), join(dist, '404.html'));
writeFileSync(join(dist, '.nojekyll'), '');
