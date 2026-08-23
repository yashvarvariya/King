'use client';

import { useEffect, useState } from 'react';
import { Users, Rocket, Zap, Activity } from 'lucide-react';
import { api } from '@/lib/api';
import AnimatedCounter from './AnimatedCounter';
import { useScrollReveal } from './useScrollReveal';

interface PublicStats {
  totalUsers: number;
  totalServers: number;
  activeDeployments: number;
  uptimePercent: number;
}

// Shown while /api/stats is loading, and if the request fails outright, so
// the section never looks visually broken.
const FALLBACK: PublicStats = { totalUsers: 0, totalServers: 0, activeDeployments: 0, uptimePercent: 99.9 };

export default function LiveStats() {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();
  const [stats, setStats] = useState<PublicStats>(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/stats')
      .then((res) => {
        if (!cancelled) setStats({ ...FALLBACK, ...res.data });
      })
      .catch(() => {
        // keep fallback values — the section still renders, just at zero
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = [
    { icon: <Users size={22} />, value: stats.totalUsers, suffix: '', decimals: 0, label: 'Total Users' },
    { icon: <Rocket size={22} />, value: stats.totalServers, suffix: '', decimals: 0, label: 'Total Servers' },
    { icon: <Zap size={22} />, value: stats.uptimePercent, suffix: '%', decimals: 1, label: 'Platform Uptime' },
    { icon: <Activity size={22} />, value: stats.activeDeployments, suffix: '', decimals: 0, label: 'Active Deployments' },
  ];

  return (
    <section className="py-14 border-t border-base-700">
      <div
        ref={ref}
        className={`max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 transition-all duration-700 ${
          revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-base-700 bg-base-900/60 backdrop-blur p-6 text-center transition-transform hover:-translate-y-1"
          >
            <div className="text-signal-500 mb-2 flex justify-center">{c.icon}</div>
            <div className="font-mono text-2xl sm:text-3xl font-bold text-white">
              {loaded ? <AnimatedCounter value={c.value} suffix={c.suffix} decimals={c.decimals} /> : '—'}
            </div>
            <p className="mt-1 text-xs sm:text-sm text-[#8ea095]">{c.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
