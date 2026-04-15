# Docker (test → Hostinger)

The image serves the **Vite production build** from `web/dist/` and exposes **`/output/*`** exactly like `npm run preview` in the repo, matching:

`OUTPUT_BASE = new URL('../../output/', window.location.href)` → **`https://<host>/output/`** when the app is served from the site root.

## Quick test

```bash
# From repo root — ensure output/ has data (e.g. one_percent_holders.csv) after clone
docker compose build
docker compose up -d
# http://localhost:8080  (override with TMD_PORT=3000 docker compose up -d)
docker compose --profile test run --rm smoke-test
docker compose down
```

## Hostinger

| Product | Approach |
|--------|----------|
| **VPS** | Install Docker, copy the repo (or CI artifact), run `docker compose up -d`. Put TLS in front (Caddy, Nginx on host, or Hostinger panel). Same `docker-compose.yml` as local. |
| **Web hosting (static)** | Run `npm run build` in `web/`, upload **`dist/` contents** to `public_html/` (or subfolder), upload **`output/`** files to **`public_html/output/`** so URLs are `/output/...`. No Docker on shared hosting — this layout matches what the container serves. |

## CI

```bash
docker compose build && docker compose up -d && docker compose --profile test run --rm smoke-test && docker compose down
```

## Split stack (static React + Django API)

When the SPA is built with Vite and hosted separately from the API (see plan: `VITE_API_BASE_URL` or dev proxy to `/api`):

| Variable | Where | Purpose |
|----------|--------|---------|
| `VITE_API_BASE_URL` | Web build (optional) | Absolute API origin, e.g. `https://api.example.com` |
| `VITE_API_PROXY_TARGET` | `web/.env.local` dev only | Where Vite proxies `/api` (default `http://127.0.0.1:8000`) |
| `TMD_DATA_ROOT` | Django | Directory with `one_percent_holders.csv`, `investor_profiles.json`, … (Docker: `/data` → `./output`) |
| `CORS_ALLOWED_ORIGINS` | Django | Comma-separated SPA origins allowed to call the API |
| `DJANGO_SECRET_KEY` | Django | Required for production; set in compose or host env |

Run API locally:

```bash
cd backend && .venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py create_subscriber_token --label=demo
.venv\Scripts\python manage.py runserver 8000
```

Run API in Docker (profile `api`):

```bash
docker compose --profile api up --build api
```

From `web/`, `npm run dev` proxies `/api` to `VITE_API_PROXY_TARGET` so the React app can use relative `/api/v1/...` URLs without `VITE_API_BASE_URL`.

### Static site without public `output/` (profile `private_static`)

For OWASP-style hosting where datasets must not be world-readable as static files:

```bash
docker compose --profile private_static up --build tmd-private
```

This builds the same SPA image with `docker/nginx.no-output.conf` (no `/output/` location). Pair with the **`api`** profile and a SPA build that uses the API for all data. See [SECURITY.md](../SECURITY.md).

Nginx security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`) are applied in both `docker/nginx.conf` and `docker/nginx.no-output.conf`.
