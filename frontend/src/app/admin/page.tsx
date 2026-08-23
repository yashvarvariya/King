'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Branding } from '@/lib/branding';
import Navbar from '@/components/Navbar';
import AdminSidebar, { AdminTab } from '@/components/AdminSidebar';
import DashboardTab from '@/components/admin/DashboardTab';
import UsersTab from '@/components/admin/UsersTab';
import ServersTab from '@/components/admin/ServersTab';
import ResourcesTab from '@/components/admin/ResourcesTab';
import BrandingTab from '@/components/admin/BrandingTab';
import MaintenanceTab from '@/components/admin/MaintenanceTab';
import PremiumTab from '@/components/admin/PremiumTab';
import EmailTab from '@/components/admin/EmailTab';
import PricingTab from '@/components/admin/PricingTab';
import BillingTab from '@/components/admin/BillingTab';
import RuntimesTab from '@/components/admin/RuntimesTab';
import DiscordBotTab from '@/components/admin/DiscordBotTab';
import ErrorState from '@/components/ErrorState';
import type { AdminStats, AdminUser, AdminServer } from '@/components/admin/types';

const TAB_TITLES: Record<AdminTab, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Platform overview' },
  users: { title: 'Users', subtitle: 'Manage accounts, roles, and access' },
  servers: { title: 'Servers', subtitle: 'Every server across every user' },
  resources: { title: 'Resources', subtitle: 'Per-user default quotas' },
  branding: { title: 'Branding', subtitle: 'Customize how the panel looks' },
  maintenance: { title: 'Maintenance', subtitle: 'Take the platform offline for non-admins' },
  premium: { title: 'Premium', subtitle: 'Manage Premium plan access' },
  email: { title: 'Email', subtitle: 'SMTP, templates, validation, and delivery logs' },
  pricing: { title: 'Pricing Manager', subtitle: 'The plan catalog shown on the pricing page' },
  billing: { title: 'Billing', subtitle: 'Subscriptions, revenue, and billing history' },
  runtimes: { title: 'Runtime Manager', subtitle: 'Runtimes, versions, and the platform default' },
  discord: { title: 'Discord Bot', subtitle: 'Manage billing for users right from Discord' },
};

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [servers, setServers] = useState<AdminServer[] | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadAll = useCallback(async () => {
    setLoadError(false);
    try {
      const [s, u, sv, b] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/admin/servers'),
        api.get('/branding'),
      ]);
      setStats(s.data);
      setUsers(u.data);
      setServers(sv.data);
      setBranding(b.data);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'ADMIN')) {
      router.push('/dashboard');
      return;
    }
    if (user?.role === 'ADMIN') {
      loadAll();
    }
  }, [authLoading, user, router, loadAll]);

  if (authLoading || !user || user.role !== 'ADMIN') {
    return (
      <div>
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="h-40 rounded-lg border border-base-700 bg-base-900/40 animate-pulse" />
        </main>
      </div>
    );
  }

  const { title, subtitle } = TAB_TITLES[tab];

  return (
    <div>
      <Navbar />
      <div className="flex flex-col md:flex-row">
        <AdminSidebar active={tab} onChange={setTab} />

        <main className="flex-1 px-4 sm:px-6 md:px-8 py-8 sm:py-10 max-w-6xl">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-[#8ea095] mt-1">{subtitle}</p>
          </div>

          {loadError ? (
            <ErrorState message="Could not load admin data." onRetry={loadAll} />
          ) : (
            <>
              {tab === 'dashboard' && <DashboardTab stats={stats} />}
              {tab === 'users' && <UsersTab users={users} reload={loadAll} />}
              {tab === 'servers' && <ServersTab servers={servers} users={users} reload={loadAll} />}
              {tab === 'resources' && <ResourcesTab users={users} reload={loadAll} />}
              {tab === 'branding' && <BrandingTab branding={branding} reload={loadAll} />}
              {tab === 'maintenance' && <MaintenanceTab branding={branding} reload={loadAll} />}
              {tab === 'premium' && <PremiumTab users={users} reload={loadAll} />}
              {tab === 'email' && <EmailTab />}
              {tab === 'pricing' && <PricingTab />}
              {tab === 'billing' && <BillingTab users={users} />}
              {tab === 'runtimes' && <RuntimesTab />}
              {tab === 'discord' && <DiscordBotTab />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
