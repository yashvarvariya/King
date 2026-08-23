'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface ReadinessCheck {
  ok: boolean;
  error?: string;
}
interface ReadinessResponse {
  status: string;
  checks: {
    database: ReadinessCheck;
    redis: ReadinessCheck;
    dockerSocket: ReadinessCheck;
  };
}

type ComponentState = 'checking' | 'operational' | 'down';

function Row({ label, state }: { label: string; state: ComponentState }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-base-800 last:border-b-0">
      <span className="text-sm text-[#e7f2ec]">{label}</span>
      {state === 'checking' && (
        <span className="flex items-center gap-1.5 text-xs text-[#5a6b62]">
          <Loader2 size={14} className="animate-spin" /> Checking…
        </span>
      )}
      {state === 'operational' && (
        <span className="flex items-center gap-1.5 text-xs text-signal-500">
          <CheckCircle2 size={14} /> Operational
        </span>
      )}
      {state === 'down' && (
        <span className="flex items-center gap-1.5 text-xs text-red-400">
          <XCircle size={14} /> Degraded
        </span>
      )}
    </div>
  );
}

export default function StatusPage() {
  const [api_, setApiState] = useState<ComponentState>('checking');
  const [db, setDb] = useState<ComponentState>('checking');
  const [redis, setRedis] = useState<ComponentState>('checking');
  const [docker, setDocker] = useState<ComponentState>('checking');

  useEffect(() => {
    api
      .get('/health')
      .then(() => setApiState('operational'))
      .catch(() => setApiState('down'));

    api
      .get<ReadinessResponse>('/health/ready')
      .then((res) => {
        setDb(res.data.checks.database.ok ? 'operational' : 'down');
        setRedis(res.data.checks.redis.ok ? 'operational' : 'down');
        setDocker(res.data.checks.dockerSocket.ok ? 'operational' : 'down');
      })
      .catch((err) => {
        // /health/ready responds 503 (still with a JSON body) when any
        // dependency is down — axios treats that as an error, so read the
        // checks out of the error response instead of assuming everything
        // is down.
        const checks = err?.response?.data?.checks as ReadinessResponse['checks'] | undefined;
        setDb(checks?.database.ok ? 'operational' : 'down');
        setRedis(checks?.redis.ok ? 'operational' : 'down');
        setDocker(checks?.dockerSocket.ok ? 'operational' : 'down');
      });
  }, []);

  const allChecked = [api_, db, redis, docker].every((s) => s !== 'checking');
  const allOperational = [api_, db, redis, docker].every((s) => s === 'operational');

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[#8ea095] hover:text-white transition-colors mb-8">
        <ArrowLeft size={14} /> Back to home
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Platform Status</h1>
      <p className="text-sm text-[#8ea095] mb-10">
        Live health of the API, database, cache, and container runtime.
      </p>

      <div className="rounded-2xl border border-base-700 bg-base-900 overflow-hidden mb-6">
        <div className="px-5 py-4 bg-base-800/60 flex items-center justify-between">
          <span className="text-sm font-medium text-white">Overall status</span>
          {!allChecked ? (
            <span className="flex items-center gap-1.5 text-xs text-[#5a6b62]">
              <Loader2 size={14} className="animate-spin" /> Checking…
            </span>
          ) : allOperational ? (
            <span className="flex items-center gap-1.5 text-xs text-signal-500">
              <CheckCircle2 size={14} /> All systems operational
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-red-400">
              <XCircle size={14} /> Partial outage
            </span>
          )}
        </div>
        <Row label="API" state={api_} />
        <Row label="Database" state={db} />
        <Row label="Cache (Redis)" state={redis} />
        <Row label="Container runtime (Docker)" state={docker} />
      </div>

      <p className="text-xs text-[#5a6b62]">
        This page checks the API&rsquo;s liveness/readiness endpoints in real time — it doesn&rsquo;t keep
        historical uptime data.
      </p>
    </main>
  );
}
