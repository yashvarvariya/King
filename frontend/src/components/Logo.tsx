'use client';

import { useBranding, resolveAssetUrl } from '@/lib/branding';

export default function Logo({ size = 22, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  const branding = useBranding();
  const logoSrc = resolveAssetUrl(branding.logoUrl);

  return (
    <span className="flex items-center gap-2">
      {logoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- external/uploaded URL, arbitrary origin
        <img src={logoSrc} alt={branding.hostingName} width={size} height={size} className="rounded object-contain" style={{ width: size, height: size }} />
      ) : (
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="#0a0f0d" />
          <rect x="1" y="1" width="62" height="62" rx="13" stroke="#212e28" strokeWidth="2" />
          <path d="M17 22L27 32L17 42" stroke="#5eff9a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M33 42H47" stroke="#5eff9a" strokeWidth="5" strokeLinecap="round" />
        </svg>
      )}
      {showWordmark && (
        <span className="font-mono text-signal-500 text-sm tracking-tight">{branding.hostingName}</span>
      )}
    </span>
  );
}
