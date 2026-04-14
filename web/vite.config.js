import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoOutput = path.resolve(__dirname, '..', 'output');

/**
 * Serve ../output/* at /output/* so `new URL('../../output/', location)` resolves in dev/preview.
 */
function outputMiddleware() {
  return (req, res, next) => {
    const url = req.url.split('?')[0];
    if (!url.startsWith('/output/')) return next();
    const rel = url.slice('/output/'.length);
    const fp = path.join(repoOutput, rel);
    if (!fp.startsWith(repoOutput)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    fs.stat(fp, (err, st) => {
      if (err || !st.isFile()) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.setHeader('Content-Type', guessMime(fp));
      fs.createReadStream(fp).pipe(res);
    });
  };
}

function serveRepoOutput() {
  return {
    name: 'serve-repo-output',
    configureServer(server) {
      server.middlewares.use(outputMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(outputMiddleware());
    },
  };
}

function guessMime(fp) {
  if (fp.endsWith('.json')) return 'application/json';
  if (fp.endsWith('.csv')) return 'text/csv; charset=utf-8';
  return 'application/octet-stream';
}

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [serveRepoOutput()],
  server: {
    port: 5173,
    fs: { allow: [path.resolve(__dirname, '..')] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
