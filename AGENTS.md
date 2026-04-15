# TMD — guide for contributors and AI assistants

## Repository layout

| Area | Role |
|------|------|
| `output/` | Generated datasets (CSV/JSON). The browser app reads from here. **Tracked in git:** only `output/.gitkeep`; run `python scripts/build_profiles.py` after clone to populate files (see `.gitignore`). |
| `scripts/build_profiles.py` | Builds `investor_profiles.json`, `investor_groups.json` (per CLI flags), optional audit CSV/JSON, and **`investor_profiles_summary.json`** (small aggregate file for future Home/Explorer use). |
| `web/index.html` | HTML shell: fonts, link to `styles/app.css`, `script type="module"` → **`src/main.tsx`** (React). |
| `web/src/` | **React + TypeScript** app: router pages, D3 via npm (`d3`), dataset URLs via `web/src/api/client.ts`. |
| `web/src/i18n/resources.ts` | i18n string tables for react-i18next (`en` / `id`). |
| `web/styles/app.css` | Global application styles. |
| `web/vite.config.ts` | Vite root = `web/`. **`base`** from `VITE_BASE_URL` or `./`. React plugin; **`serve-repo-output`** serves `../output` at **`/output/*`** in dev/preview. |
| `web/package.json` | `npm run dev` \| `build` \| `build:pages` \| `preview`. |
| `Dockerfile`, `docker-compose.yml`, `docker/nginx.conf` | **Static:** Nginx + `dist/` + `/output/*`. See **`docker/README.md`**. |

## Data contracts (`output/`)

- **`one_percent_holders.csv`** — primary ownership table; required on first load.
- **`investor_profiles.json`** / **`investor_groups.json`** — large; **fetched only when the user opens Intelligence** (`initIntelligencePage`), not on initial home load.
- **`investor_profiles_summary.json`** — written by `build_profiles.py`: `total_profiles`, `by_classification`, `top_by_portfolio` (name, portfolio_size, total_pct_sum, classification, local_foreign). Safe for dashboards; the current static UI does not fetch it yet.

## URL resolution in the browser

By default the app loads datasets from the **`output/`** tree (same origin). See **`web/src/api/client.ts`** (`outputBaseHref`, `holdersCsvUrl`, …). Optional **`VITE_ACCESS_GATE=1`** + **`VITE_API_BASE_URL`** targets an external API (not included in this repo).

## npm (from `web/`)

```bash
npm install
npm run dev      # http://localhost:5173 — /output/* via Vite plugin
npm run build    # static output in web/dist/
npm run build:pages   # dist/ + 404.html + .nojekyll (GitHub Pages)
npm run preview  # production build + same /output/* middleware
```

For production hosting without Node, deploy **`dist/`** and **`output/`** so `/output/*` resolves correctly (see `README.md`).

**Docker / Hostinger:** From repo root, `docker compose up` serves the app at **`http://localhost:8080`** with **`./output` → `/output/`**. Use **`docker compose --profile test run --rm smoke-test`** after `up` for a quick HTTP smoke check. Details: **`docker/README.md`**.

## Where to edit for feature X

| Feature | Start here |
|---------|------------|
| Copy / translations | `web/src/i18n/resources.ts` |
| Global layout, nav, routes | `web/src/App.tsx`, `web/src/components/Layout.tsx` |
| Pages (Home, Explorer, …) | `web/src/pages/*.tsx` |
| Intelligence D3 visuals | `web/src/charts/intelCharts.ts` |
| Force / pie charts (Explorer) | `web/src/charts/forceNetwork.ts`, `web/src/charts/pieDonut.ts` |
| Styling | `web/styles/app.css` |
| Dataset URLs / optional gate | `web/src/api/client.ts`, `web/src/auth/AuthContext.tsx` |
| Profile/group pipeline | `scripts/build_profiles.py` |

## D3

Charts import **`d3`** from npm in `web/src/charts/*` (bundled by Vite).

## GitHub

```bash
git remote add origin https://github.com/<you>/<repo>.git
git add -A
git commit -m "Initial commit"
git push -u origin main
```

Do not commit `node_modules/`, `.gitnexus/`, or secrets.
