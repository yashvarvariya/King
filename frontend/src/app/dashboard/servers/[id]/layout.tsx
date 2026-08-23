'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, BotServer } from '@/lib/api';
import Navbar from '@/components/Navbar';
import StatusPill from '@/components/StatusPill';
import { ServerHeaderSkeleton } from '@/components/Skeleton';
import ErrorState from '@/components/ErrorState';
import { Play, Square, RotateCw, Skull, Trash2, Ban, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ServerLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const serverId = params.id as string;

  const [server, setServer] = useState<BotServer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  async function load() {
    try {
      const res = await api.get(`/servers/${serverId}`);
      setServer(res.data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [serverId]);

  async function action(name: string, fn: () => Promise<any>) {
    setBusy(name);
    try {
      await fn();
      await load();
      toast.success(`${capitalize(name)} succeeded`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || `Failed to ${name}`);
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!confirm(`Delete "${server?.name}" permanently? This removes the container and all files.`)) return;
    try {
      await api.delete(`/servers/${serverId}`);
      toast.success('Server deleted');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete server');
    }
  }

  const tabs = [
    { href: `/dashboard/servers/${serverId}`, label: 'Console' },
    { href: `/dashboard/servers/${serverId}/files`, label: 'Files' },
    { href: `/dashboard/servers/${serverId}/settings`, label: 'Settings' },
  ];

  return (
    <div>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {loadError ? (
          <ErrorState message="Couldn't load this server." onRetry={load} />
        ) : !server ? (
          <ServerHeaderSkeleton />
        ) : (
          <>
            <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-semibold break-all">{server.name}</h1>
                  <StatusPill status={server.status} />
                </div>
                {server.description && <p className="text-sm text-[#8ea095] mt-1">{server.description}</p>}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <ActionButton onClick={() => action('start', () => api.post(`/servers/${serverId}/start`))} busy={busy === 'start'} icon={<Play size={14} />} label="Start" />
                <ActionButton onClick={() => action('stop', () => api.post(`/servers/${serverId}/stop`))} busy={busy === 'stop'} icon={<Square size={14} />} label="Stop" />
                <ActionButton onClick={() => action('restart', () => api.post(`/servers/${serverId}/restart`))} busy={busy === 'restart'} icon={<RotateCw size={14} />} label="Restart" />
                <ActionButton onClick={() => action('kill', () => api.post(`/servers/${serverId}/kill`))} busy={busy === 'kill'} icon={<Skull size={14} />} label="Kill" danger />
                <ActionButton onClick={() => action('suspend', () => api.post(`/servers/${serverId}/${server.suspended ? 'unsuspend' : 'suspend'}`))} busy={busy === 'suspend'} icon={<Ban size={14} />} label={server.suspended ? 'Unsuspend' : 'Suspend'} />
                <ActionButton onClick={onDelete} busy={false} icon={<Trash2 size={14} />} label="Delete" danger />
              </div>
            </div>

            <div className="flex items-center gap-1 border-b border-base-700 mb-6 overflow-x-auto scrollbar-thin">
              {tabs.map((tab) => {
                const active = tab.href === pathname;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap ${
                      active ? 'border-signal-500 text-signal-500' : 'border-transparent text-[#8ea095] hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            {children}
          </>
        )}
      </main>
    </div>
  );
}

function ActionButton({
  onClick,
  busy,
  icon,
  label,
  danger,
}: {
  onClick: () => void;
  busy: boolean;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border transition-colors disabled:opacity-50 ${
        danger
          ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
          : 'border-base-700 text-[#a9bdb2] hover:border-signal-500/50 hover:text-signal-500'
      }`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}
