'use client';

import Link from 'next/link';
import { Terminal } from 'lucide-react';
import { useBranding } from '@/lib/branding';

export default function Hero() {
  const branding = useBranding();

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 [background-image:linear-gradient(#161f1b_1px,transparent_1px),linear-gradient(90deg,#161f1b_1px,transparent_1px)] [background-size:48px_48px] opacity-40" />

      {/* Drifting signal-green glow blobs, matching the app's accent color */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="hero-blob hero-blob-1" />
        <div className="hero-blob hero-blob-2" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono text-signal-500 bg-signal-500/10 border border-signal-500/25">
          <span className="w-1.5 h-1.5 rounded-full bg-signal-500 status-dot-running" />
          self-hosted · docker-isolated · no pterodactyl
        </span>

        <h1 className="mt-6 text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.08] text-white">
          Deploy and manage<br className="hidden sm:block" />
          every app from <span className="text-signal-500">one forge</span>.
        </h1>

        <p className="mt-6 text-base sm:text-lg text-[#a9bdb2] max-w-2xl mx-auto">
          {branding.hostingName} is a modern hosting platform built for speed and control — instant
          deployments, a real terminal, live resource monitoring, and a full file manager, backed
          by fast servers across multiple regions.
        </p>

        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="#pricing"
            className="w-full sm:w-auto px-6 py-3 rounded-md bg-signal-500 hover:bg-signal-400 text-base-950 font-semibold transition-colors text-center"
          >
            Create Account
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto px-6 py-3 rounded-md border border-base-600 hover:border-signal-500 text-[#e7f2ec] font-semibold transition-colors text-center"
          >
            Sign In
          </Link>
        </div>

        {/* Signature: stylized terminal mockup */}
        <div className="mt-16 mx-auto max-w-3xl rounded-2xl border border-base-700 bg-base-900/80 shadow-2xl shadow-black/40 text-left overflow-hidden">
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-base-700 bg-base-900">
            <Terminal size={13} className="text-[#5a6b62] mr-1" />
            <span className="text-xs text-[#5a6b62] font-mono">root@quantaforge:~</span>
          </div>
          <div className="p-5 font-mono text-sm text-[#c7d6cf] space-y-1.5">
            <p><span className="text-signal-500">$</span> quantaforge status</p>
            <p className="text-[#5a6b62]">→ containers online · agent connected</p>
            <p><span className="text-signal-500">$</span> quantaforge deploy --server prod-01</p>
            <p className="text-[#5a6b62]">→ syncing files… restarting process… <span className="text-signal-500">done</span></p>
          </div>
        </div>
      </div>
    </section>
  );
}
