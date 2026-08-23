'use client';

import { Crown, MessageCircle, X } from 'lucide-react';
import { useBranding } from '@/lib/branding';

/**
 * Shown in place of the inline "Could not create server" error whenever the
 * backend rejects a create-server request with `{ freePlanLimit: true }`
 * (see servers.service.ts `create()`) — i.e. a non-premium user who already
 * owns one server. Distinct from a generic error toast: this is a sales/
 * upgrade moment, not a failure state, so it gets its own professional modal
 * instead of a red error line.
 */
export default function FreePlanModal({ onClose }: { onClose: () => void }) {
  const branding = useBranding();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4 sm:px-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-base-700 bg-base-900 p-6 sm:p-7 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8ea095] hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="w-12 h-12 rounded-full bg-signal-500/10 flex items-center justify-center mb-4">
          <Crown size={22} className="text-signal-500" />
        </div>

        <h2 className="text-lg font-semibold mb-2">Free Plan Limit Reached</h2>
        <p className="text-sm text-[#a9bdb2] leading-relaxed mb-6">
          The Free Plan is limited to a single server. Upgrade to Premium for additional server
          slots, higher resource limits, and priority support.
        </p>

        <div className="space-y-2">
          {branding.discordInvite && (
            <a
              href={branding.discordInvite}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-md bg-signal-500 text-base-950 font-medium py-2.5 hover:bg-signal-400 transition-colors"
            >
              <MessageCircle size={16} />
              Upgrade via Discord
            </a>
          )}
          <button
            onClick={onClose}
            className="w-full rounded-md border border-base-700 py-2.5 text-sm text-[#a9bdb2] hover:text-white hover:border-base-600 transition-colors"
          >
            Maybe later
          </button>
        </div>

        {branding.supportEmail && (
          <p className="text-xs text-[#8ea095] text-center mt-4">
            Questions?{' '}
            <a href={`mailto:${branding.supportEmail}`} className="text-signal-500 hover:underline">
              Contact support
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
