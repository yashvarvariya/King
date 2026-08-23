'use client';

import { Users, Server as ServerIcon, Activity, PauseCircle, Crown, UserCheck, Ban } from 'lucide-react';
import { StatTile } from './AdminUI';
import { Skeleton } from '../Skeleton';
import type { AdminStats } from './types';

export default function DashboardTab({ stats }: { stats: AdminStats | null }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-[74px]" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-[#8ea095] mb-6">Platform-wide statistics, updated live from the database.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatTile icon={<Users size={16} />} label="Total users" value={stats.totalUsers} />
        <StatTile icon={<ServerIcon size={16} />} label="Total servers" value={stats.totalServers} />
        <StatTile icon={<Activity size={16} />} label="Running" value={stats.runningServers} accent />
        <StatTile icon={<PauseCircle size={16} />} label="Stopped" value={stats.stoppedServers} />
        <StatTile icon={<Crown size={16} />} label="Premium users" value={stats.premiumUsers} accent />
        <StatTile icon={<UserCheck size={16} />} label="Free users" value={stats.freeUsers} />
        <StatTile icon={<Ban size={16} />} label="Suspended users" value={stats.suspendedUsers} />
      </div>
    </div>
  );
}
