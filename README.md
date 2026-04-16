# Transparent Market Data (TMD)

Static informational site: a React app in **`web/`** plus CSV/JSON under **`output/`**, deployed to **GitHub Pages** (no server in this repo).

## What gets published

GitHub Actions ([`.github/workflows/pages.yml`](.github/workflows/pages.yml)) runs `npm ci` and `npm run build:pages` in **`web/`**, then copies everything from **`output/`** into **`web/dist/output/`**. The live site loads data from the same origin, e.g. `https://<user>.github.io/<repo>/output/...`.

Commit the dataset files you want public under **`output/`** (see `.gitignore` for which names can be tracked).

## Local preview (optional)

```bash
cd web
npm install
npm run dev
```

Place or symlink CSV/JSON into **`output/`** at the repo root. Vite serves `../output` at `/output/*`.

Production-style build with SPA assets for GitHub Pages:

```bash
cd web
export VITE_BASE_URL=/YourRepoName/   # or / for username.github.io
npm run build:pages
mkdir -p dist/output && cp ../output/* dist/output/
```

## GitHub Pages setup

1. **Repository → Settings → Pages → Build and deployment:** set source to **GitHub Actions** (not “Deploy from a branch” unless you prefer manual uploads).
2. Push to **`main`** (or **`master`**). The workflow sets `VITE_BASE_URL` to `/RepoName/` for normal repos, or `/` when the repo is named **`youruser.github.io`**.

## Configuration (Vite)

| Variable | Purpose |
|----------|---------|
| `VITE_BASE_URL` | App base path; must match GitHub Pages URL path (`/RepoName/` vs `/`). |
| `VITE_OUTPUT_BASE_URL` | Optional override for dataset URLs. |
| `VITE_ACCESS_GATE` | `1` = login UI + API datasets (you host the API). Omit for public static sites. |
| `VITE_API_BASE_URL` | API origin when using the access gate. |
| `VITE_DEV_SKIP_AUTH` | Dev only: skip `/access` when testing. |

Use **`web/.env.local`** for local overrides (gitignored).

## Public data

Anything under **`/output/`** on the deployed site is fetchable by visitors. Do not commit sensitive data.

## Layout (for edits)

| Path | Role |
|------|------|
| `web/src/` | App source (pages, charts, `api/client.ts`). |
| `web/src/i18n/resources.ts` | English / Indonesian strings. |
| `output/` | Datasets the browser loads (CSV/JSON). |

## License

[MIT](LICENSE)
