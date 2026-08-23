import type { Metadata, Viewport } from 'next';
import './globals.css';
import ToastProvider from '@/components/ToastProvider';
import BrandingProvider from '@/lib/branding';
import AppGate from '@/components/AppGate';
import PwaRegister from '@/components/PwaRegister';
import InstallPrompt from '@/components/InstallPrompt';

// Static fallback only — the real, branded title/favicon are applied on the
// client by BrandingProvider once `/branding` loads (see lib/branding.tsx),
// since this platform's name/icon are admin-configurable at runtime rather
// than build time. manifest.json and the PWA icons are static for the same
// reason a static favicon.svg already was: a home-screen icon is
// effectively snapshotted at install time by the OS, so making it "live"
// wouldn't actually re-brand an already-installed app anyway. See
// TODO.md if per-tenant branding ever needs to flow into the manifest.
export const metadata: Metadata = {
  title: 'Bot Hosting Panel',
  description: 'Deploy, manage, and monitor bots in isolated Docker containers.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kerit Panel',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0f0d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-base-950 text-[#e7f2ec] antialiased">
        <ToastProvider />
        <PwaRegister />
        <BrandingProvider>
          <AppGate>{children}</AppGate>
          <InstallPrompt />
        </BrandingProvider>
      </body>
    </html>
  );
}
