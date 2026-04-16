import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  analyticsConfigured,
  isGaEnabled,
  isPlausibleEnabled,
  trackGaPageView,
  trackPlausibleClientNavigation,
} from '@/analytics';

/**
 * SPA virtual pageviews: GA4 on every route (including first); Plausible only on
 * client navigations (first load is counted by the default Plausible script).
 */
export function AnalyticsPageviews() {
  const location = useLocation();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    if (!analyticsConfigured()) return;

    const path = `${location.pathname}${location.search}`;

    if (isGaEnabled()) {
      trackGaPageView(path);
    }

    if (isPlausibleEnabled()) {
      if (prevPath.current !== null && prevPath.current !== path) {
        trackPlausibleClientNavigation();
      }
      prevPath.current = path;
    } else {
      prevPath.current = path;
    }
  }, [location.pathname, location.search]);

  return null;
}
