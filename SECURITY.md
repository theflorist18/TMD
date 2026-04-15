# Security model and operations (TMD)

This document summarizes how confidentiality and access control work in the **split stack** (static React + Django API) and what operators must configure for production.

## Threat model (high level)

| Asset | Risk if misconfigured |
|-------|------------------------|
| `output/*.csv` / JSON on the **same origin** as the SPA | Anyone can fetch URLs; **JWT does not protect** files served as static files. |
| Django **subscriber codes** | If leaked, holder can obtain JWTs until you **deactivate** the row in admin. |
| Django **admin** | Full control over tokens and (if exposed) impersonation risk. |

**Design rule:** For paid or sensitive data, do **not** publish `output/` on the public static host. Use **`docker/nginx.no-output.conf`** (see `docker-compose.yml` profile `private_static`) and serve datasets **only** through `GET /api/v1/datasets/...` with JWT (`Authorization: Bearer`).

## Subscriber access codes (storage)

- Raw codes are **never** stored in the database.
- Stored value is **HMAC-SHA256(pepper, secret)** hex (see [`backend/core/crypto.py`](backend/core/crypto.py)).
- **`SUBSCRIBER_TOKEN_PEPPER`**: long random secret in the environment (not in git). **Required when `DEBUG=False`** (system check `tmd.E001`).
- Legacy rows hashed with plain **SHA-256(secret)** still verify once and are **upgraded** to HMAC on successful login.

## JWT and revocation

- Access tokens include claim **`sid`** (subscriber token primary key).
- [`SubscriberJWTAuthentication`](backend/core/authentication.py) rejects JWTs if that `SubscriberToken` row is missing or **`is_active=False`** (immediate revocation for dataset routes).
- **Refresh rotation + blacklist** (`rest_framework_simplejwt.token_blacklist`) limits refresh-token reuse after rotation.

## Transport and cookies (Django)

When `DEBUG=False`, settings enable **secure cookies**, **HSTS** (configurable), **SSL redirect** behind `X-Forwarded-Proto`, and related flags (see [`backend/tmd_api/settings.py`](backend/tmd_api/settings.py)). Terminate TLS at your reverse proxy and forward the proto header.

## Admin panel

- Create staff with **`python manage.py createsuperuser`** (strong password; enable MFA at the host if available).
- Optional: set **`DJANGO_ADMIN_PATH`** to a non-default path (obscurity only).
- **Mint codes** in Django admin: **Add** `SubscriberToken` — the plaintext code is shown **once** in a warning message; only the hash is saved.
- Failed Django admin logins are logged (`django_admin_login_failed`).

## API hardening

- **`POST /api/v1/auth/login/`** is rate-limited (`subscriber_login` scope, default **10/minute** per IP).
- Failed subscriber logins return a **generic** `invalid_credentials` message (no distinction between wrong vs expired in the response body).
- **DRF exception handler** returns `{"detail":"server_error"}` for 5xx when `DEBUG=False`.

## SQL injection

All subscriber lookups use the **Django ORM** with parameters; do not introduce raw SQL built from user input.

## Supply chain

- Keep **[`web/package-lock.json`](web/package-lock.json)** and **[`backend/requirements.txt`](backend/requirements.txt)** committed and review updates.
- CI workflow **[`.github/workflows/security-audit.yml`](.github/workflows/security-audit.yml)** runs `npm audit` and `pip-audit` (non-blocking by default; tighten policy as you prefer).

## OWASP Top 10:2025 mapping (short)

| ID | Mitigations in this repo |
|----|---------------------------|
| A01 Broken access control | JWT on API datasets; optional **no public `/output/`** stack; `sid` must match active token. |
| A02 Security misconfiguration | `DEBUG` defaults off; production TLS/cookie/HSTS flags; explicit CORS; `manage.py check` for pepper. |
| A03 Supply chain | Lockfiles + audit workflow. |
| A04 Cryptographic failures | HTTPS (operator); HMAC+pepper for codes; JWT for API. |
| A05 Injection | ORM-only data access. |
| A06 Insecure design | Documented split: static `/output/` is not a confidentiality boundary. |
| A07 Authentication failures | Rate limit login; generic errors; refresh blacklist; short access lifetime. |
| A08 Integrity | Pip/npm lockfiles; no unsigned deserialization of untrusted blobs in app code. |
| A09 Logging failures | Structured loggers `tmd.security`, `tmd.api`, `django.security`. |
| A10 Exception handling | Sanitized API 5xx in production; client avoids leaking raw API errors on `/access`. |

## Environment checklist (production API)

- `DJANGO_SECRET_KEY` — unique random.
- `DJANGO_DEBUG=0`
- `SUBSCRIBER_TOKEN_PEPPER` — long random (rotate = invalidate all existing codes unless you dual-hash).
- `DJANGO_ALLOWED_HOSTS` — real hostnames only (no `*` in production).
- `CORS_ALLOWED_ORIGINS` — your SPA origins only (HTTPS).
- `TMD_DATA_ROOT` — private path or read-only volume to `output/`.
- TLS certificate on reverse proxy; forward `X-Forwarded-Proto: https`.
