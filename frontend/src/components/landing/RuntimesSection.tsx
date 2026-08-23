'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useScrollReveal } from './useScrollReveal';

interface RuntimeVersion {
  id: string;
  version: string;
  enabled: boolean;
}
interface RuntimeEngine {
  id: string;
  name: string;
  icon: string;
  description: string;
  versions: RuntimeVersion[];
}

export default function RuntimesSection() {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();
  const [runtimes, setRuntimes] = useState<RuntimeEngine[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/runtimes')
      .then((res) => {
        if (!cancelled) setRuntimes(res.data?.runtimes || []);
      })
      .catch(() => {
        if (!cancelled) setRuntimes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="languages" className="py-20 border-t border-base-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">Runs whatever you throw at it</h2>
          <p className="mt-3 text-[#a9bdb2]">
            Every server runs in its own isolated Docker container, whichever runtime you pick.
          </p>
        </div>

        <div
          ref={ref}
          className={`mt-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5 transition-all duration-700 ${
            revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {runtimes === null &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-5 rounded-2xl bg-base-900 border border-base-700 h-32 animate-pulse" />
            ))}

          {runtimes?.map((rt) => {
            const versionsLabel = rt.versions?.length
              ? `Supports ${rt.versions.map((v) => v.version).join(', ')}`
              : null;
            return (
              <div
                key={rt.id}
                className="p-5 rounded-2xl bg-base-900 border border-base-700 transition-transform hover:-translate-y-1 hover:border-base-600"
              >
                <div className="text-3xl mb-3">{rt.icon || '⬢'}</div>
                <h3 className="font-semibold text-white mb-1">{rt.name}</h3>
                {rt.description && <p className="text-xs text-[#8ea095] mb-2">{rt.description}</p>}
                {versionsLabel && <p className="text-xs text-[#5a6b62]">{versionsLabel}</p>}
              </div>
            );
          })}

          {runtimes && runtimes.length === 0 && (
            <p className="col-span-full text-center text-sm text-[#8ea095] py-6">
              Runtime catalog is being configured — check back shortly.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
