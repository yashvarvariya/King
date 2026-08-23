'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useRefreshBranding, type Branding } from '@/lib/branding';
import toast from 'react-hot-toast';
import { Wrench, AlertTriangle } from 'lucide-react';

export default function MaintenanceTab({ branding, reload }: { branding: Branding | null; reload: () => void }) {
  const refreshGlobalBranding = useRefreshBranding();
  const [saving, setSaving] = useState(false);

  if (!branding) {
    return <div className="h-40 rounded-lg border border-base-700 bg-base-900/40 animate-pulse" />;
  }

  async function toggle() {
    if (!branding) return;
    setSaving(true);
    try {
      await api.patch('/branding', { maintenanceMode: !branding.maintenanceMode });
      toast.success(branding.maintenanceMode ? 'Maintenance mode disabled' : 'Maintenance mode enabled');
      reload();
      refreshGlobalBranding();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not update maintenance mode');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="rounded-lg border border-base-700 bg-base-900/60 p-6">
        <div className="flex items-start gap-4">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              branding.maintenanceMode ? 'bg-amber-500/15 text-amber-500' : 'bg-signal-500/10 text-signal-500'
            }`}
          >
            <Wrench size={18} />
          </div>
          <div className="flex-1">
            <h3 className="font-medium mb-1">Maintenance mode</h3>
            <p className="text-sm text-[#8ea095] mb-4">
              When enabled, every page except login/register/password-reset shows a maintenance
              screen to non-admin users. Admins can still access the full panel to work on the
              issue while it&apos;s active.
            </p>

            <button
              onClick={toggle}
              disabled={saving}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-60 ${
                branding.maintenanceMode ? 'bg-amber-500' : 'bg-base-700'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-base-950 transition-transform ${
                  branding.maintenanceMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="ml-3 text-sm align-middle">
              {branding.maintenanceMode ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>

        {branding.maintenanceMode && (
          <div className="mt-5 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-500">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            Maintenance mode is currently live. Regular users cannot access the dashboard, hosting,
            console, or file manager until it&apos;s disabled.
          </div>
        )}
      </div>
    </div>
  );
}
