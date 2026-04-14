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
