...only directed, cursor did all the work

# Transparent Market Data (TMD)

Web app and tooling to explore IDX-style major shareholder ownership tables. **Default:** static files only — datasets under `output/`, no server in this repository.

## Open source default (no verification)

For a **public GitHub clone** you do **not** need tokens or a server:

1. Clone the repository.
2. Generate datasets under `output/` (only `output/.gitkeep` is tracked):

   ```bash
   python scripts/build_profiles.py
   ```

   Use your own CSV sources as required by that script, or place compatible files in `output/` per `AGENTS.md`.

3. Install and run the web app:

   ```bash
   cd web
   npm install
   npm run dev
   ```

   Open the URL Vite prints (usually `http://localhost:5173`). Data is served from `/output/*` via the Vite dev plugin.

4. Production static build:

   ```bash
   cd web
   npm run build
   ```

   Put generated files where the app can load them **without any backend**:

   ```bash
   mkdir -p web/dist/output
   cp output/* web/dist/output/
   ```

   For **GitHub Pages** (or any static host that needs SPA deep links), use the bundled step that adds `404.html` (copy of `index.html`) and `.nojekyll`:

   ```bash
   cd web
   export VITE_BASE_URL=/YourRepoName/   # or / for a root site
   npm run build:pages
   mkdir -p dist/output && cp ../output/* dist/output/
   ```

   Deploy the **contents** of `web/dist/` (includes `output/`). The browser only uses `fetch()` against those static URLs.

**Do not set** `VITE_ACCESS_GATE` or `VITE_API_BASE_URL` for a fully static public site.

## Secrets and local config (open source)

- **Nothing in git should contain** API keys, production-only URLs, or personal paths. Use **`web/.env.local`** locally (gitignored).
- **`web/.env.example`** is a template only (placeholders, no real secrets).
- **TradingView** widgets (Home / Market / Explorer charts) load from TradingView’s public embed scripts; this repo does **not** store a TradingView API key.

## GitHub Pages (`*.github.io`)

The app is designed to run as **static files only**: CSV/JSON under `output/`.

1. **Project site** (e.g. `https://youruser.github.io/MyRepo/`): build with a base path that matches the repo name:

   ```bash
   cd web
   npm ci
   set VITE_BASE_URL=/MyRepo/
   npm run build
   ```

   (Use `export VITE_BASE_URL=/MyRepo/` on macOS/Linux.) Then copy datasets into the build and publish `web/dist/`:

   ```bash
   mkdir -p web/dist/output
   cp ../output/* web/dist/output/
   ```

2. **Optional CI**: enable **Settings → Pages → Build and deployment → GitHub Actions**, then commit [`.github/workflows/pages.yml`](.github/workflows/pages.yml). The workflow runs `npm run build:pages` (includes `404.html` + `.nojekyll`), sets `VITE_BASE_URL` to `/RepoName/` for a normal project, or to `/` when the repository name is `owner.github.io` (user/org root site). It copies `output/*` into `web/dist/output/`. Only tracked files under `output/` are present in CI unless you commit datasets you want public (the default repo only has `output/.gitkeep`).

3. **User/org site** (`https://youruser.github.io/` with no repo prefix): name the repository `youruser.github.io` so the workflow uses `VITE_BASE_URL=/`, or build locally with `VITE_BASE_URL=/` and place `output/` under the published root next to `index.html`.

4. Override only if needed: `VITE_OUTPUT_BASE_URL` (see `web/.env.example`).

`BrowserRouter` uses Vite’s `BASE_URL`, so routes and `output/` stay aligned with the same prefix.

## Optional access gate (external API only)

The UI can be built with **`VITE_ACCESS_GATE=1`** so users sign in and datasets load from **`VITE_API_BASE_URL`** (`/api/v1/...`). You must host that API yourself; this repo does not include a server. See **`SECURITY.md`** and **`web/.env.example`**.

## Repository layout

See [`AGENTS.md`](AGENTS.md) for paths (`web/`, `output/`, `scripts/build_profiles.py`, Docker).

## License

[MIT](LICENSE)
