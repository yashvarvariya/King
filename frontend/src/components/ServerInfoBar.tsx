'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Server, Box, Cpu, Network } from 'lucide-react';

interface ServerInfo {
  status: string;
  containerId: string | null;
  image: string | null;
  runtime: string;
  network: { name: string; ipAddress: string | null } | null;
  startedAt: string | null;
}

/** Compact strip of container-level facts: status, container id, image, runtime, network. */
export default function ServerInfoBar({ serverId }: { serverId: string }) {
  const [info, setInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      api
        .get(`/servers/${serverId}/info`)
        .then((res) => {
          if (!cancelled) setInfo(res.data);
        })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [serverId]);

  if (!info) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-base-700 bg-base-900/60 px-4 py-2.5 text-xs font-mono text-[#a9bdb2]">
      <span className="flex items-center gap-1.5">
        <Server size={12} className={info.status === 'RUNNING' ? 'text-signal-500' : 'text-[#8ea095]'} />
        {info.status}
      </span>
      {info.containerId && (
        <span className="flex items-center gap-1.5">
          <Box size={12} className="text-[#8ea095]" /> {info.containerId}
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <Cpu size={12} className="text-[#8ea095]" /> {info.image || info.runtime}
      </span>
      {info.network && (
        <span className="flex items-center gap-1.5">
          <Network size={12} className="text-[#8ea095]" />
          {info.network.name}
          {info.network.ipAddress ? ` · ${info.network.ipAddress}` : ''}
        </span>
      )}
    </div>
  );
}
