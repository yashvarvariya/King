'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { WS_URL, api } from '@/lib/api';

interface Stats {
  cpuPercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  diskUsedMb?: number;
  diskLimitMb?: number;
}

export default function ResourceGraph({ serverId, cpuLimit }: { serverId: string; cpuLimit: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Initial snapshot (also gives us disk usage, which isn't pushed over WS)
    api.get(`/servers/${serverId}/stats`).then((res) => setStats(res.data)).catch(() => {});

    const token = localStorage.getItem('token');
    const socket = io(WS_URL, { auth: { token } });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('subscribe', { serverId }));
    socket.on('stats', (s: Stats) => setStats((prev) => ({ ...prev, ...s }) as Stats));

    return () => {
      socket.disconnect();
    };
  }, [serverId]);

  const cpuPct = Math.min(100, ((stats?.cpuPercent ?? 0) / Math.max(cpuLimit, 1)) * 100);
  const memPct = stats?.memoryLimitMb ? Math.min(100, (stats.memoryUsedMb / stats.memoryLimitMb) * 100) : 0;
  const diskPct = stats?.diskLimitMb ? Math.min(100, ((stats.diskUsedMb ?? 0) / stats.diskLimitMb) * 100) : 0;

  return (
    <div className="grid grid-cols-3 gap-4">
      <Meter label="CPU" value={`${stats?.cpuPercent?.toFixed(1) ?? '0.0'}%`} pct={cpuPct} />
      <Meter label="RAM" value={`${stats?.memoryUsedMb?.toFixed(0) ?? 0} / ${stats?.memoryLimitMb ?? 0} MB`} pct={memPct} />
      <Meter label="Disk" value={`${stats?.diskUsedMb?.toFixed(0) ?? 0} / ${stats?.diskLimitMb ?? 0} MB`} pct={diskPct} />
    </div>
  );
}

function Meter({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="rounded-lg border border-base-700 bg-base-900/60 p-4">
      <div className="flex items-center justify-between text-xs font-mono text-[#8ea095] mb-2">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-base-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct > 85 ? 'bg-red-400' : pct > 60 ? 'bg-amber-500' : 'bg-signal-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
