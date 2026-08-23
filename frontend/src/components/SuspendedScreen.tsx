'use client';

import { useBranding } from '@/lib/branding';
import { useAuth } from '@/lib/auth';
import { Ban, MessageCircle, Mail, LogOut } from 'lucide-react';
import Logo from './Logo';

/**
 * Full-screen block for suspended accounts. Mounted by AppGate whenever
 * `user.suspended` is true, on any non-exempt route — it fully replaces the
 * page content, so it also blocks the dashboard, hosting, console, and file
 * manager (all of which live under routes this screen intercepts).
 */
export default function SuspendedScreen() {
  const branding = useBranding();
  const { logout } = useAuth();

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-8">
          <Logo size={32} />
        </div>
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-400">
          <Ban size={26} />
        </div>
        <h1 className="text-2xl font-semibold mb-3">Account suspended</h1>
        <p className="text-sm text-[#a9bdb2] mb-8">
          Your hosting has been suspended by the administrator. All servers, the console, and the
          file manager are unavailable until this is resolved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
          {branding.discordInvite && (
            <a
              href={branding.discordInvite}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-md bg-signal-500 text-base-950 font-medium px-4 py-2 hover:bg-signal-400 transition-colors"
            >
              <MessageCircle size={16} /> Join Discord
            </a>
          )}
          {branding.supportEmail && (
            <a
              href={`mailto:${branding.supportEmail}`}
              className="flex items-center justify-center gap-2 rounded-md border border-base-600 px-4 py-2 hover:border-signal-500 transition-colors"
            >
              <Mail size={16} /> {branding.supportEmail}
            </a>
          )}
        </div>

        <button
          onClick={logout}
          className="flex items-center gap-2 mx-auto text-xs text-[#8ea095] hover:text-white transition-colors"
        >
          <LogOut size={13} /> Log out
        </button>
      </div>
    </main>
  );
}
