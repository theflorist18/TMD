# Security (static TMD)

This repository is oriented toward **static hosting**: the browser loads CSV/JSON from **`/output/*`** on the same origin as the app (see `README.md` and `web/src/api/client.ts`).

## Public data

Anyone who can open your site can request the same **`/output/...`** URLs. Do **not** publish material there that must stay confidential.

## Optional access gate

The web app can be built with **`VITE_ACCESS_GATE=1`** to show a login screen and call dataset URLs under **`/api/v1/...`** on **`VITE_API_BASE_URL`**. That path is for **your own** API deployment; this repo does not ship a server implementation.

## Supply chain

- Commit **`web/package-lock.json`** and run **`npm audit`** when updating dependencies.
- CI runs a non-blocking **`npm audit`** in [`.github/workflows/security-audit.yml`](.github/workflows/security-audit.yml).
- Do not commit secrets; use **`web/.env.local`** for local overrides (gitignored).

## TradingView

Charts load TradingView’s public embed scripts; this repo does **not** store a TradingView API key.
