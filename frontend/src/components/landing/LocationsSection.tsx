'use client';

import { useScrollReveal } from './useScrollReveal';

// Presentational — extend this array when a new region goes live. Not
// pulled from an API because there's no backend "regions" concept yet;
// noted in REVIEW.md as a reasonable follow-up if that changes.
const LOCATIONS = [
  { flag: '🇮🇳', name: 'India', latency: 'Low Latency' },
  { flag: '🇸🇬', name: 'Singapore', latency: 'Low Latency' },
];

export default function LocationsSection() {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();

  return (
    <section id="locations" className="py-20 border-t border-base-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">Server locations</h2>
          <p className="mt-3 text-[#a9bdb2]">Choose the region closest to your users. More locations are on the way.</p>
        </div>
        <div
          ref={ref}
          className={`mt-12 grid sm:grid-cols-2 gap-5 max-w-2xl mx-auto transition-all duration-700 ${
            revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {LOCATIONS.map((loc) => (
            <div
              key={loc.name}
              className="rounded-2xl border border-base-700 bg-base-900/60 backdrop-blur p-6 text-center transition-transform hover:-translate-y-1"
            >
              <div className="text-4xl mb-3">{loc.flag}</div>
              <h3 className="font-semibold text-white mb-3">{loc.name}</h3>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-signal-500 bg-signal-500/10 border border-signal-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-signal-500 status-dot-running" /> Online
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-sky-400 bg-sky-500/10 border border-sky-500/25">
                  {loc.latency}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
