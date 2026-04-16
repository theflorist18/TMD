const ACCESS_KEY = 'tmd_jwt_access';
const REFRESH_KEY = 'tmd_jwt_refresh';

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

/** Absolute or same-origin path for API calls (Vite dev proxies `/api`). */
export function apiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!apiBase) return p;
  return `${apiBase}${p}`;
}

export function getStoredAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_KEY);
}

export function getStoredRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_KEY);
}

export function persistTokens(access: string, refresh: string) {
  sessionStorage.setItem(ACCESS_KEY, access);
  sessionStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

export function devSkipAuth(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_DEV_SKIP_AUTH === '1';
}

/**
 * When `true`, the app requires a subscriber login (JWT) before routes load.
 * When `false` (default), the UI is open and loads CSV/JSON from `output/` like a static site.
 * Set `VITE_ACCESS_GATE=1` only for gated / API-backed deployments.
 */
export function accessGateEnabled(): boolean {
  return import.meta.env.VITE_ACCESS_GATE === '1';
}

/** When false, dataset URLs never point at the API (GitHub Pages / static hosting). */
function useApiDatasetUrls(): boolean {
  return accessGateEnabled() && Boolean(getStoredAccessToken());
}

type Json = Record<string, unknown>;

async function tryRefresh(): Promise<string | null> {
  const refresh = getStoredRefreshToken();
  if (!refresh) return null;
  const r = await fetch(apiUrl('/api/v1/auth/token/refresh/'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });
  if (!r.ok) {
    clearTokens();
    return null;
  }
  const data = (await r.json()) as Json;
  const access = data.access as string | undefined;
  if (!access) {
    clearTokens();
    return null;
  }
  sessionStorage.setItem(ACCESS_KEY, access);
  return access;
}

/** Same-origin or absolute URL fetch with Bearer when a JWT is stored. */
export async function authorizedFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  let access = getStoredAccessToken();
  if (access) headers.set('Authorization', `Bearer ${access}`);

  let res = await fetch(url, { ...init, headers });
  if (res.status === 401 && getStoredRefreshToken()) {
    access = await tryRefresh();
    if (access) {
      headers.set('Authorization', `Bearer ${access}`);
      res = await fetch(url, { ...init, headers });
    }
  }
  return res;
}

function datasetUrlNeedsBearer(url: string): boolean {
  return /\/api\/v1\/datasets\//.test(url);
}

/** Fetch CSV/JSON: plain `fetch` for static `output/`; Bearer only for gated API dataset URLs. */
export async function fetchDataset(url: string, init: RequestInit = {}): Promise<Response> {
  if (datasetUrlNeedsBearer(url)) return authorizedFetch(url, init);
  return fetch(url, init);
}

/** Fetch JSON from API with Bearer; refreshes once on 401. */
export async function apiFetchJson<T = Json>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  let access = getStoredAccessToken();
  if (access) headers.set('Authorization', `Bearer ${access}`);

  let res = await fetch(apiUrl(path), { ...init, headers });
  if (res.status === 401 && getStoredRefreshToken()) {
    access = await tryRefresh();
    if (access) {
      headers.set('Authorization', `Bearer ${access}`);
      res = await fetch(apiUrl(path), { ...init, headers });
    }
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Authenticated text (e.g. CSV) from API. */
export async function apiFetchText(path: string): Promise<string> {
  const headers = new Headers();
  let access = getStoredAccessToken();
  if (access) headers.set('Authorization', `Bearer ${access}`);

  let res = await fetch(apiUrl(path), { headers });
  if (res.status === 401 && getStoredRefreshToken()) {
    access = await tryRefresh();
    if (access) {
      headers.set('Authorization', `Bearer ${access}`);
      res = await fetch(apiUrl(path), { headers });
    }
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.text();
}

export async function loginWithSubscriberToken(token: string): Promise<void> {
  const r = await fetch(apiUrl('/api/v1/auth/login/'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token.trim() }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
  const data = (await r.json()) as { access?: string; refresh?: string };
  if (!data.access || !data.refresh) throw new Error('Invalid login response');
  persistTokens(data.access, data.refresh);
}

/**
 * Base URL for the `output/` folder (CSV/JSON). Uses Vite `BASE_URL` + `output/` so GitHub
 * project pages (`https://user.github.io/RepoName/`) resolve to `.../RepoName/output/`.
 * Override with `VITE_OUTPUT_BASE_URL` (absolute or same-origin path, no trailing slash required).
 */
export function outputBaseHref(): string {
  const custom = (import.meta.env.VITE_OUTPUT_BASE_URL as string | undefined)?.trim();
  if (custom) {
    const n = custom.replace(/\/$/, '');
    return `${n}/`;
  }
  const rawBase = import.meta.env.BASE_URL ?? '/';
  const baseForResolve = rawBase === './' ? '/' : rawBase;
  const normalized = baseForResolve.endsWith('/') ? baseForResolve : `${baseForResolve}/`;
  return new URL('output/', new URL(normalized, window.location.href)).href;
}

/** CSV URL: API only when access gate is on and a JWT exists; otherwise always static `output/`. */
export function holdersCsvUrl(): string {
  if (devSkipAuth() || !useApiDatasetUrls()) {
    return new URL('one_percent_holders.csv', outputBaseHref()).href;
  }
  return apiUrl('/api/v1/datasets/one_percent_holders.csv/');
}

export function intelProfilesUrl(): string {
  if (devSkipAuth() || !useApiDatasetUrls()) {
    return new URL('investor_profiles.json', outputBaseHref()).href;
  }
  return apiUrl('/api/v1/datasets/investor_profiles.json/');
}

export function intelGroupsUrl(): string {
  if (devSkipAuth() || !useApiDatasetUrls()) {
    return new URL('investor_groups.json', outputBaseHref()).href;
  }
  return apiUrl('/api/v1/datasets/investor_groups.json/');
}

/** Heuristic group clusters (used when verified ``investor_groups.json`` is empty). */
export function intelGroupCandidatesUrl(): string {
  if (devSkipAuth() || !useApiDatasetUrls()) {
    return new URL('investor_group_candidates.json', outputBaseHref()).href;
  }
  return apiUrl('/api/v1/datasets/investor_group_candidates.json/');
}

export function freeFloatJsonUrl(): string {
  if (devSkipAuth() || !useApiDatasetUrls()) {
    return new URL('free_float.json', outputBaseHref()).href;
  }
  return apiUrl('/api/v1/datasets/free_float.json/');
}
