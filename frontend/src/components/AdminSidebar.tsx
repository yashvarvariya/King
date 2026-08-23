'use client';

import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Server as ServerIcon,
  Gauge,
  Paintbrush,
  Wrench,
  Crown,
  Mail,
  Tag,
  CreditCard,
  Cpu,
  Bot,
  ArrowLeft,
} from 'lucide-react';
import Logo from './Logo';

export type AdminTab =
  | 'dashboard'
  | 'users'
  | 'servers'
  | 'resources'
  | 'branding'
  | 'maintenance'
  | 'premium'
  | 'email'
  | 'pricing'
  | 'billing'
  | 'runtimes'
  | 'discord';

const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
  { id: 'users', label: 'Users', icon: <Users size={16} /> },
  { id: 'servers', label: 'Servers', icon: <ServerIcon size={16} /> },
  { id: 'resources', label: 'Resources', icon: <Gauge size={16} /> },
  { id: 'pricing', label: 'Pricing Manager', icon: <Tag size={16} /> },
  { id: 'billing', label: 'Billing', icon: <CreditCard size={16} /> },
  { id: 'runtimes', label: 'Runtime Manager', icon: <Cpu size={16} /> },
  { id: 'discord', label: 'Discord Bot', icon: <Bot size={16} /> },
  { id: 'branding', label: 'Branding', icon: <Paintbrush size={16} /> },
  { id: 'email', label: 'Email', icon: <Mail size={16} /> },
  { id: 'maintenance', label: 'Maintenance', icon: <Wrench size={16} /> },
  { id: 'premium', label: 'Premium', icon: <Crown size={16} /> },
];

/**
 * Vertical sidebar for the admin panel. Purely presentational — the parent
 * page owns `active` state and receives tab-change callbacks, so the whole
 * admin panel stays a single client-rendered page (no per-tab routes) while
 * still getting real navigation-feeling UI.
 */
export default function AdminSidebar({
  active,
  onChange,
}: {
  active: AdminTab;
  onChange: (tab: AdminTab) => void;
}) {
  return (
    <aside className="w-full md:w-56 md:shrink-0 md:border-r border-base-700 md:min-h-[calc(100vh-3.5rem)]">
      <div className="hidden md:flex items-center gap-2 px-4 h-14 border-b border-base-700">
        <Logo size={20} />
      </div>

      <nav className="p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${
              active === tab.id
                ? 'bg-signal-500/10 text-signal-500 border border-signal-500/30'
                : 'text-[#a9bdb2] hover:text-white hover:bg-base-800 border border-transparent'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-base-700 mt-2 md:mt-auto">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-[#8ea095] hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </Link>
      </div>
    </aside>
  );
}
