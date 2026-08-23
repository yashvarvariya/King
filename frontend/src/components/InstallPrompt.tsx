'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download, X } from 'lucide-react';
import { useBranding } from '@/lib/branding';

const DISMISSED_KEY = 'pwa-install-dismissed';

// Auth-flow pages where a screen change (a banner sliding in/out) would be
// distracting mid-form, same reasoning AppGate/Footer already apply to
// these routes.
const HIDDEN_ON = ['/login', '/register', '/forgot-password', '/verify-email'];

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Chrome/Edge/Android fire `beforeinstallprompt` when the page qualifies as
 * installable (valid manifest + registered service worker + served over
 * HTTPS) and the browser hasn't already decided to show its own native
 * mini-infobar. This component captures that event, suppresses the
 * browser's default UI, and shows its own dismissible banner instead so the
 * install offer matches the app's design rather than each browser's own
 * generic prompt style. iOS Safari doesn't fire this event at all (there's
 * no programmatic install prompt on iOS) — this banner simply never
 * appears there, which is expected, not a bug.
 */
export default function InstallPrompt() {
  const pathname = usePathname();
  const branding = useBranding();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const alreadyInstalled = window.matchMedia?.('(display-mode: standalone)')?.matches;
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (alreadyInstalled || dismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const onInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function onInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    // Whether accepted or dismissed, this specific captured prompt event is
    // spent — the browser only lets it be used once.
    setDeferredPrompt(null);
    setVisible(false);
  }

  function onDismiss() {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, '1');
  }

  if (!visible || HIDDEN_ON.includes(pathname || '')) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 rounded-xl border border-base-700 bg-base-900/95 backdrop-blur shadow-2xl shadow-black/40 p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-signal-500/15 border border-signal-500/25 flex items-center justify-center shrink-0 text-signal-500">
        <Download size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#e7f2ec]">Install the app</p>
        <p className="text-xs text-[#8ea095] mt-0.5">Add {branding.hostingName} to your home screen for quick access.</p>
        <div className="flex items-center gap-3 mt-2.5">
          <button
            onClick={onInstall}
            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-signal-500 hover:bg-signal-400 text-base-950 transition-colors"
          >
            Install
          </button>
          <button onClick={onDismiss} className="text-xs text-[#8ea095] hover:text-white transition-colors">
            Not now
          </button>
        </div>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-[#5a6b62] hover:text-white transition-colors shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
}
