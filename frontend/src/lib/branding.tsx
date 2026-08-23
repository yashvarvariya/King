'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { api, API_URL } from './api';

/**
 * Resolves a branding image field (logoUrl/faviconUrl/backgroundImageUrl) to
 * a fully-qualified URL. Uploaded images are stored as relative paths like
 * `/uploads/branding/logo-xxxx.png` (served by the backend, not the Next.js
 * app), so those need the API origin prefixed. A full URL pasted by an admin
 * (e.g. `https://cdn.example.com/logo.png`) is returned unchanged.
 */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

// --- Color helpers for live theme derivation --------------------------------

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Mixes `hex` toward white (amount > 0) or black (amount < 0) by `amount` (0-1). */
function shade(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  const target = amount >= 0 ? 255 : 0;
  const a = Math.abs(amount);
  return rgbToHex(r + (target - r) * a, g + (target - g) * a, b + (target - b) * a);
}

export interface Branding {
  hostingName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  browserTitle: string;
  footerText: string;
  discordInvite: string | null;
  supportEmail: string | null;
  themeColor: string;
  secondaryThemeColor: string;
  backgroundImageUrl: string | null;
  maintenanceMode: boolean;
}

export const DEFAULT_BRANDING: Branding = {
  hostingName: 'Kerit Panel',
  logoUrl: null,
  faviconUrl: null,
  browserTitle: 'Kerit Panel',
  footerText: 'Powered by Kerit Panel',
  discordInvite: null,
  supportEmail: null,
  themeColor: '#5eff9a',
  secondaryThemeColor: '#0a0f0d',
  backgroundImageUrl: null,
  maintenanceMode: false,
};

const BrandingContext = createContext<{ branding: Branding; refresh: () => void }>({
  branding: DEFAULT_BRANDING,
  refresh: () => undefined,
});

export const useBranding = () => useContext(BrandingContext).branding;
export const useRefreshBranding = () => useContext(BrandingContext).refresh;

// Polling interval for picking up admin branding changes without a reload —
// this is what makes "Live update... without editing source code" work for
// everyone already sitting on a page (navbar/sidebar/footer re-render via
// context; theme colors + title/favicon are re-applied in the effect below).
const POLL_MS = 20_000;

export default function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  async function load() {
    try {
      const res = await api.get('/branding');
      setBranding({ ...DEFAULT_BRANDING, ...res.data });
    } catch {
      // Backend unreachable or branding not yet seeded — keep the defaults.
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    document.title = branding.browserTitle || branding.hostingName;

    let iconLink = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!iconLink) {
      iconLink = document.createElement('link');
      iconLink.rel = 'icon';
      document.head.appendChild(iconLink);
    }
    iconLink.href = resolveAssetUrl(branding.faviconUrl) || '/favicon.svg';

    const root = document.documentElement.style;
    // Primary (signal) color — darker/lighter tints for hover/active states.
    root.setProperty('--color-signal-500', branding.themeColor);
    root.setProperty('--color-signal-600', shade(branding.themeColor, -0.25));
    root.setProperty('--color-signal-400', shade(branding.themeColor, 0.25));
    // Secondary color drives the whole dark background ramp used across the
    // app (base-950 = darkest/page background, base-600 = lightest border).
    root.setProperty('--color-base-950', branding.secondaryThemeColor);
    root.setProperty('--color-base-900', shade(branding.secondaryThemeColor, 0.06));
    root.setProperty('--color-base-800', shade(branding.secondaryThemeColor, 0.12));
    root.setProperty('--color-base-700', shade(branding.secondaryThemeColor, 0.2));
    root.setProperty('--color-base-600', shade(branding.secondaryThemeColor, 0.3));
  }, [branding.browserTitle, branding.hostingName, branding.faviconUrl, branding.themeColor, branding.secondaryThemeColor]);

  return (
    <BrandingContext.Provider value={{ branding, refresh: load }}>{children}</BrandingContext.Provider>
  );
}
