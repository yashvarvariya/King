'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Consistent inline error panel used across pages instead of raw
 * error strings or silent failures. Optionally offers a retry action.
 */
export default function ErrorState({
  message = 'Something went wrong.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-6 py-10 text-center">
      <AlertTriangle size={22} className="text-red-400" />
      <p className="text-sm text-[#a9bdb2] max-w-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-md border border-base-700 text-[#a9bdb2] hover:border-signal-500/50 hover:text-signal-500 transition-colors"
        >
          <RefreshCw size={13} /> Try again
        </button>
      )}
    </div>
  );
}
