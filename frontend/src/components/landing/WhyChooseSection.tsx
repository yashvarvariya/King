'use client';

import { Zap, Box, FolderOpen, TerminalSquare, Activity, Archive, GitBranch, RotateCw } from 'lucide-react';
import { useScrollReveal } from './useScrollReveal';

const REASONS = [
  { icon: <Zap size={22} />, title: 'Instant Deployment', desc: 'Push your app live in seconds — no manual server juggling.' },
  { icon: <Box size={22} />, title: 'Docker Isolation', desc: 'Every app runs in its own isolated container environment.' },
  { icon: <FolderOpen size={22} />, title: 'File Manager', desc: 'Browse, edit, and upload files straight from the dashboard.' },
  { icon: <TerminalSquare size={22} />, title: 'Live Console', desc: 'A genuine terminal session per server, streamed over WebSocket.' },
  { icon: <Activity size={22} />, title: 'Live Monitoring', desc: 'CPU, RAM, and disk usage updated in real time, per server.' },
  { icon: <Archive size={22} />, title: 'ZIP Upload', desc: 'Drop a zipped project and have it extracted and ready to run.' },
  { icon: <GitBranch size={22} />, title: 'Git Clone', desc: 'Pull straight from a repository URL to deploy your latest commit.' },
  { icon: <RotateCw size={22} />, title: 'Automatic Restart', desc: "Crashed process? It's brought back online automatically." },
];

export default function WhyChooseSection() {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();

  return (
    <section id="why" className="py-20 border-t border-base-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">Why choose QuantaForge</h2>
          <p className="mt-3 text-[#a9bdb2]">Built for people who want real server access, not a dashboard that hides it.</p>
        </div>
        <div
          ref={ref}
          className={`mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5 transition-all duration-700 ${
            revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {REASONS.map((r) => (
            <div
              key={r.title}
              className="p-6 rounded-2xl bg-base-900 border border-base-700 transition-transform hover:-translate-y-1 hover:border-base-600"
            >
              <div className="text-signal-500 mb-3">{r.icon}</div>
              <h3 className="font-semibold text-white mb-1.5">{r.title}</h3>
              <p className="text-sm text-[#8ea095]">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
