/**
 * Optional traffic analytics. Enable at build time with Vite env vars (see README).
 * No-op when neither variable is set.
 */

declare global {
  interface Window {
    plausible?: (event: 'pageview' | string, options?: { props?: Record<string, string | number | boolean> }) => void;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initDone = false;

function plausibleDomain(): string | undefined {
  return import.meta.env.VITE_PLAUSIBLE_DOMAIN?.trim() || undefined;
}

function gaMeasurementId(): string | undefined {
  return import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() || undefined;
}

export function isPlausibleEnabled(): boolean {
  return Boolean(plausibleDomain());
}

export function isGaEnabled(): boolean {
  return Boolean(gaMeasurementId());
}

export function analyticsConfigured(): boolean {
  return isPlausibleEnabled() || isGaEnabled();
}

/** Plausible default script records the first page load; call this only on in-app route changes. */
export function trackPlausibleClientNavigation(): void {
  if (!isPlausibleEnabled()) return;
  window.plausible?.('pageview');
}

export function trackGaPageView(pathWithSearch: string): void {
  const gaId = gaMeasurementId();
  if (!gaId || !window.gtag) return;
  window.gtag('event', 'page_view', {
    page_path: pathWithSearch,
    page_location: typeof window !== 'undefined' ? window.location.href : undefined,
    page_title: typeof document !== 'undefined' ? document.title : undefined,
  });
}

/** Call once from main.tsx before rendering the app. */
export function initAnalytics(): void {
  if (typeof document === 'undefined' || initDone) return;
  const pDomain = plausibleDomain();
  const gaId = gaMeasurementId();
  if (!pDomain && !gaId) return;
  initDone = true;

  if (pDomain) {
    const s = document.createElement('script');
    s.defer = true;
    s.setAttribute('data-domain', pDomain);
    s.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(s);
  }

  if (gaId) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // gtag expects `arguments` shape for the tag manager queue
      // eslint-disable-next-line prefer-rest-params
      (window.dataLayer as unknown[]).push(arguments);
    };
    window.gtag('js', new Date());
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    s.onload = () => {
      window.gtag?.('config', gaId, { send_page_view: false });
    };
    document.head.appendChild(s);
  }
}
