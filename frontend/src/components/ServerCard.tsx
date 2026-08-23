import Link from 'next/link';
import { BotServer } from '@/lib/api';
import StatusPill from './StatusPill';
import { Box, Cpu, HardDrive } from 'lucide-react';

export default function ServerCard({ server }: { server: BotServer }) {
  return (
    <Link
      href={`/dashboard/servers/${server.id}`}
      className="block rounded-lg border border-base-700 bg-base-900/60 p-5 hover:border-signal-500/60 transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Box size={16} className="text-[#8ea095]" />
          <span className="font-medium">{server.name}</span>
        </div>
        <StatusPill status={server.status} />
      </div>

      {server.description && <p className="text-sm text-[#8ea095] mb-4 line-clamp-2">{server.description}</p>}

      <div className="flex items-center gap-4 text-xs font-mono text-[#8ea095]">
        <span className="uppercase tracking-wide">{server.runtime === 'NODEJS' ? 'node.js' : 'python'}</span>
        <span className="flex items-center gap-1">
          <Cpu size={12} /> {server.cpuLimitPercent}%
        </span>
        <span className="flex items-center gap-1">
          <HardDrive size={12} /> {server.memoryLimitMb}MB
        </span>
      </div>
    </Link>
  );
}
