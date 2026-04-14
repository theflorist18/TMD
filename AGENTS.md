# TMD — guide for contributors and AI assistants

## Repository layout

| Area | Role |
|------|------|
| `output/` | Generated datasets (CSV/JSON). The browser app reads from here. **Tracked in git:** only `output/.gitkeep`; run `python scripts/build_profiles.py` after clone to populate files (see `.gitignore`). |
| `scripts/build_profiles.py` | Builds `investor_profiles.json`, `investor_groups.json` (per CLI flags), optional audit CSV/JSON, and **`investor_profiles_summary.json`** (small aggregate file for future Home/Explorer use). |
| `web/index.html` | Thin HTML shell: fonts, D3 v7 CDN, link to `styles/app.css`, `script type="module"` → `js/app.js`. |
| `web/styles/app.css` | Application styles (extracted from the former monolith). |
| `web/js/app.js` | Main ES module: CSV load, explorer/holdings/market/intelligence UI, navigation, shared state. |
| `web/js/i18n-data.js` | Exported `I18N` string tables (`en` / `id`). |
| `web/js/charts/intel-charts.js` | Intelligence D3 charts only; loaded via **`import()`** when charts render. |
| `web/vite.config.js` | Vite root = `web/`. **`base: './'`** for portable `dist/`. Plugin **`serve-repo-output`** serves repo `../output` at **`/output/*`** in **`vite dev`** and **`vite preview`**. |
| `web/package.json` | `npm run dev` \| `build` \| `preview`. |

## Data contracts (`output/`)

- **`one_percent_holders.csv`** — primary ownership table; required on first load.
- **`investor_profiles.json`** / **`investor_groups.json`** — large; **fetched only when the user opens Intelligence** (`initIntelligencePage`), not on initial home load.
- **`investor_profiles_summary.json`** — written by `build_profiles.py`: `total_profiles`, `by_classification`, `top_by_portfolio` (name, portfolio_size, total_pct_sum, classification, local_foreign). Safe for dashboards; the current static UI does not fetch it yet.

## URL resolution in the browser

`web/js/app.js` defines:

```js
const OUTPUT_BASE = new URL('../../output/', window.location.href).href;
```

That resolves to the repo `output/` folder when the app is opened as `web/index.html`, as built `web/dist/index.html`, or over `http://localhost:5173/` / `4173/` (Vite). Prefer `new URL('<file>', OUTPUT_BASE)` for fetches.

## npm (from `web/`)

```bash
npm install
npm run dev      # http://localhost:5173 — data at /output/* via Vite plugin
npm run build    # static output in web/dist/
npm run preview  # production build + same /output/* middleware
```

For production hosting without Node, deploy **`dist/`** contents and ensure **`output/`** is available at the URL that **`../../output/`** resolves to relative to the served `index.html` (same layout as repo: parent of `web/` contains `output/`), or serve both behind one static origin with that path structure.

## Where to edit for feature X

| Feature | Start here |
|---------|------------|
| Copy / translations | `web/js/i18n-data.js` |
| Global layout, nav, init | `web/js/app.js` |
| Intelligence D3 visuals | `web/js/charts/intel-charts.js` |
| Styling | `web/styles/app.css` |
| Profile/group pipeline | `scripts/build_profiles.py` |

Further split into `web/js/pages/*.js` and `web/js/data/*.js` is optional; keep modules cohesive and under ~800 lines when extracting.

## D3

Charts on Intelligence use **d3** from the CDN script tag in `index.html`. The lazy chunk only uses the global `d3`; do not duplicate a second D3 bundle unless you migrate to npm + Vite `optimizeDeps`.

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

**GitHub:** create an empty repository on GitHub, then:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git add -A
git commit -m "Initial commit"
git push -u origin main
```

Do not commit `node_modules/`, `.gitnexus/`, or secrets.
