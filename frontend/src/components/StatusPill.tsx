import { ServerStatus } from '@/lib/api';

const STYLES: Record<ServerStatus, string> = {
  RUNNING: 'bg-signal-500/15 text-signal-500',
  OFFLINE: 'bg-base-700 text-[#a9bdb2]',
  INSTALLING: 'bg-amber-500/15 text-amber-500',
  STOPPING: 'bg-amber-500/15 text-amber-500',
  SUSPENDED: 'bg-red-500/15 text-red-400',
  ERRORED: 'bg-red-500/15 text-red-400',
};

export default function StatusPill({ status }: { status: ServerStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded ${STYLES[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-current ${status === 'RUNNING' ? 'status-dot-running' : ''}`} />
      {status}
    </span>
  );
}
