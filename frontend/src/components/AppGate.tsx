'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useBranding } from '@/lib/branding';
import MaintenanceScreen from './MaintenanceScreen';
import SuspendedScreen from './SuspendedScreen';
import Footer from './Footer';

// Public routes that must always render normally, regardless of maintenance
// mode or suspension — matching the backend's PlatformAccessGuard allowlist
// (auth needs to work so a suspended/blocked user can still identify their
// state, and marketing/auth pages shouldn't vanish behind maintenance).
const EXEMPT_PATHS = ['/', '/login', '/register', '/forgot-password', '/verify-email', '/terms', '/privacy', '/status'];

export default function AppGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const branding = useBranding();

  const isExempt = EXEMPT_PATHS.includes(pathname || '');

  let content = children;

  if (!loading && !isExempt) {
    if (branding.maintenanceMode && (!user || user.role !== 'ADMIN')) {
      content = <MaintenanceScreen />;
    } else if (user?.suspended) {
      content = <SuspendedScreen />;
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col">{content}</div>
      <Footer />
    </div>
  );
}
