'use client';

import { useBranding } from '@/lib/branding';
import { Wrench } from 'lucide-react';
import Logo from './Logo';

export default function MaintenanceScreen() {
  const branding = useBranding();

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-8">
          <Logo size={32} />
        </div>
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
          <Wrench size={26} />
        </div>
        <h1 className="text-2xl font-semibold mb-3">Down for maintenance</h1>
        <p className="text-sm text-[#a9bdb2] mb-8">
          {branding.hostingName} is currently undergoing scheduled maintenance. Please check back
          shortly — we&apos;ll be back online soon.
        </p>
        {branding.supportEmail && (
          <p className="text-xs text-[#8ea095]">
            Questions?{' '}
            <a href={`mailto:${branding.supportEmail}`} className="text-signal-500 hover:underline">
              {branding.supportEmail}
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
