import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoOutput = path.resolve(__dirname, '..', 'output');

function outputMiddleware() {
  return (req: import('http').IncomingMessage, res: import('http').ServerResponse, next: () => void) => {
    const url = (req.url ?? '').split('?')[0];
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

function guessMime(fp: string) {
  if (fp.endsWith('.json')) return 'application/json';
  if (fp.endsWith('.csv')) return 'text/csv; charset=utf-8';
  return 'application/octet-stream';
}

function serveRepoOutput() {
  return {
    name: 'serve-repo-output',
    configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use(outputMiddleware());
    },
    configurePreviewServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use(outputMiddleware());
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const base = (env.VITE_BASE_URL ?? '').trim() || './';

  return {
    root: __dirname,
    base,
    plugins: [react(), serveRepoOutput()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: {
      port: 5173,
      fs: { allow: [path.resolve(__dirname, '..')] },
    },
    preview: {},
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
