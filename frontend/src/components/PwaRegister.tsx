'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js once the page has finished loading. Mounted globally in
 * layout.tsx (outside any route-specific logic) so it runs on every page,
 * not just the dashboard — a service worker registered from any scope
 * under '/' controls the whole origin.
 *
 * Deliberately silent on failure: some environments (Safari in certain
 * private-browsing modes, browsers with service workers disabled by
 * policy) don't support this API at all, and that should never be
 * user-visible or block the rest of the app.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Registration can fail (unsupported context, blocked by policy,
        // etc.) — the app works fine without a service worker, it just
        // isn't installable/offline-capable.
      });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
