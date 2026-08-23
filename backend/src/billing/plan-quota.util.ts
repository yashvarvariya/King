// Plans store ram/storage/cpu/maxServers as free-form display strings
// (e.g. "256 MB", "2 GB", "150%", "Unlimited") so admins can type whatever
// reads best on the pricing page. The User model's actual quota columns
// (maxMemoryMb/maxDiskMb/maxCpuPercent/maxServers) are strict numbers that
// ServersService enforces on every server create — this file is the one
// place that bridges the two, so assigning a plan actually grants the
// resources it advertises instead of just being decorative copy.

const UNLIMITED_SERVERS_SENTINEL = 999_999;

function parseSizeToMb(value: string): number {
  const match = String(value)
    .trim()
    .toLowerCase()
    .match(/([\d.]+)\s*(gb|mb|g|m)?/);
  if (!match) return 0;
  const n = parseFloat(match[1]);
  if (Number.isNaN(n)) return 0;
  const unit = match[2] || 'mb';
  return unit.startsWith('g') ? Math.round(n * 1024) : Math.round(n);
}

function parseCpuPercent(value: string): number {
  const match = String(value).trim().match(/[\d.]+/);
  if (!match) return 100;
  const n = parseFloat(match[0]);
  return Number.isNaN(n) ? 100 : Math.round(n);
}

function parseMaxServers(value: string): number {
  const raw = String(value).trim().toLowerCase();
  if (raw === 'unlimited') return UNLIMITED_SERVERS_SENTINEL;
  const match = raw.match(/\d+/);
  if (!match) return 1;
  const n = parseInt(match[0], 10);
  return Number.isNaN(n) || n < 0 ? 1 : n;
}

export interface PlanQuota {
  maxServers: number;
  maxMemoryMb: number;
  maxDiskMb: number;
  maxCpuPercent: number;
}

export function planToQuota(plan: { ram: string; storage: string; cpu: string; maxServers: string }): PlanQuota {
  return {
    maxServers: parseMaxServers(plan.maxServers),
    maxMemoryMb: parseSizeToMb(plan.ram),
    maxDiskMb: parseSizeToMb(plan.storage),
    maxCpuPercent: parseCpuPercent(plan.cpu),
  };
}
