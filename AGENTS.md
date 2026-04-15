# TMD — guide for contributors and AI assistants

## Repository layout

| Area | Role |
|------|------|
| `output/` | Generated datasets (CSV/JSON). The browser app reads from here. **Tracked in git:** only `output/.gitkeep`; run `python scripts/build_profiles.py` after clone to populate files (see `.gitignore`). |
| `scripts/build_profiles.py` | Builds `investor_profiles.json`, `investor_groups.json` (per CLI flags), optional audit CSV/JSON, and **`investor_profiles_summary.json`** (small aggregate file for future Home/Explorer use). |
| `web/index.html` | HTML shell: fonts, link to `styles/app.css`, `script type="module"` → **`src/main.tsx`** (React). |
| `web/src/` | **React + TypeScript** app: router pages, D3 via npm (`d3`), API client (`/api` proxy in dev). |
| `web/src/i18n/resources.ts` | Copy of legacy `I18N` tables (same keys as `web/js/i18n-data.js`; prefer editing one source long-term). |
| `web/styles/app.css` | Global application styles. |
| `web/js/app.js` | **Legacy** vanilla module (pre–React split); kept for reference until fully retired. |
| `web/js/i18n-data.js` | Legacy string tables (duplicated in `web/src/i18n/resources.ts` for react-i18next). |
| `web/js/charts/intel-charts.js` | Legacy intel charts (superseded by `web/src/charts/intelCharts.ts`). |
| `web/vite.config.ts` | Vite root = `web/`. **`base: './'`**. React plugin; **`serve-repo-output`** serves `../output` at **`/output/*`**; **`/api`** proxies to **`VITE_API_PROXY_TARGET`**. |
| `web/package.json` | `npm run dev` \| `build` \| `preview`. |
| `backend/` | **Django + DRF**: JWT login (`POST /api/v1/auth/login/`), gated dataset files under `TMD_DATA_ROOT`, HMAC+pepper subscriber codes, admin mint, blacklist refresh rotation. See [SECURITY.md](SECURITY.md), `backend/.env.example`. Local API: set **`DJANGO_DEBUG=1`** (default is off). |
| `Dockerfile`, `docker-compose.yml`, `docker/nginx.conf` | **Static:** Nginx + `dist/` + `/output/*`. Optional **`docker/Dockerfile.api`** + compose **`api`** profile for split deploy. See **`docker/README.md`**. |

## Data contracts (`output/`)

- **`one_percent_holders.csv`** — primary ownership table; required on first load.
- **`investor_profiles.json`** / **`investor_groups.json`** — large; **fetched only when the user opens Intelligence** (`initIntelligencePage`), not on initial home load.
- **`investor_profiles_summary.json`** — written by `build_profiles.py`: `total_profiles`, `by_classification`, `top_by_portfolio` (name, portfolio_size, total_pct_sum, classification, local_foreign). Safe for dashboards; the current static UI does not fetch it yet.

## URL resolution in the browser

The React app uses **`web/src/api/client.ts`**: with a JWT it fetches datasets from **`/api/v1/datasets/...`** (proxied to Django in dev). Without auth (or with `VITE_DEV_SKIP_AUTH=1` in dev), it falls back to the repo **`output/`** tree via the same relative URL shape as before:

```js
new URL('../../output/', window.location.href).href;
```

## npm (from `web/`)

```bash
npm install
npm run dev      # http://localhost:5173 — /output/* via plugin; /api → Django (VITE_API_PROXY_TARGET)
npm run build    # static output in web/dist/
npm run preview  # production build + same /output/* middleware
```

For production hosting without Node, deploy **`dist/`** contents and ensure **`output/`** is available at the URL that **`../../output/`** resolves to relative to the served `index.html` (same layout as repo: parent of `web/` contains `output/`), or serve both behind one static origin with that path structure.

**Docker / Hostinger:** From repo root, `docker compose up` serves the app at **`http://localhost:8080`** with **`./output` → `/output/`** (matches site root + `/output/` on a domain). Use **`docker compose --profile test run --rm smoke-test`** after `up` for a quick HTTP smoke check. On **Hostinger VPS**, run the same Compose stack; on **shared static hosting**, upload `dist/` to the document root and **`output/`** under **`public_html/output/`** so fetches hit `/output/*`. Details: **`docker/README.md`**.

## Where to edit for feature X

| Feature | Start here |
|---------|------------|
| Copy / translations | `web/src/i18n/resources.ts` (sync with `web/js/i18n-data.js` if both exist) |
| Global layout, nav, routes | `web/src/App.tsx`, `web/src/components/Layout.tsx` |
| Pages (Home, Explorer, …) | `web/src/pages/*.tsx` |
| Intelligence D3 visuals | `web/src/charts/intelCharts.ts` |
| Force / pie charts (Explorer) | `web/src/charts/forceNetwork.ts`, `web/src/charts/pieDonut.ts` |
| Styling | `web/styles/app.css` |
| API client / auth | `web/src/api/client.ts`, `web/src/auth/AuthContext.tsx` |
| Django API, tokens, gated files | `backend/core/` |
| Profile/group pipeline | `scripts/build_profiles.py` |

## D3

Charts import **`d3`** from npm in `web/src/charts/*` (bundled by Vite). Legacy `web/js/app.js` still assumed a global `d3` CDN script; the React shell does not load that CDN.

## GitNexus ([upstream](https://github.com/abhigyanpatwari/GitNexus))

This repo includes **optional** [GitNexus](https://github.com/abhigyanpatwari/GitNexus) integration so Cursor (and other MCP clients) can query a **local knowledge graph** of the codebase (impact, context, hybrid search, etc.).

| Item | Purpose |
|------|---------|
| [package.json](package.json) (repo root) | `devDependency` **`gitnexus`** and npm scripts (`gitnexus:analyze`, …). |
| [.cursor/mcp.json](.cursor/mcp.json) | Project MCP server: runs **`npm exec -- gitnexus mcp`** (uses the repo’s installed CLI). |
| `.gitnexus/` | **Ignored by git** — index DB created by `gitnexus analyze`. Each clone runs analyze locally. |
| [.claude/skills/gitnexus/](.claude/skills/gitnexus/) | Generic agent skills installed by analyze (useful with Claude Code; safe to commit or delete and re-run analyze). |

**First-time / after large refactors** (from repo root, requires git):

```bash
npm install
npm run gitnexus:analyze
```

We use **`--skip-agents-md`** so this file is not overwritten; merge upstream AGENTS sections manually if you want.

**Cursor:** restart the IDE after changing `.cursor/mcp.json`. Ensure GitNexus MCP is enabled under **Settings → MCP**.

**Global setup (optional):** `npx gitnexus setup` configures editors in your user profile; the committed `.cursor/mcp.json` is enough for Cursor in this workspace.

**GitNexus Web UI (graph explorer):** from repo root run **`npm run gitnexus:serve`** (default **http://localhost:4747**). Open that URL in your browser, or open **[gitnexus.vercel.app](https://gitnexus.vercel.app)** — it can connect to the local server (“bridge” mode) so your indexed repos (including TMD) appear without re-uploading.

**GitHub:** create an empty repository on GitHub, then:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git add -A
git commit -m "Initial commit"
git push -u origin main
```

Do not commit `node_modules/`, `.gitnexus/`, or secrets.
