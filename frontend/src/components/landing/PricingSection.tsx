'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding } from '@/lib/branding';
import { useScrollReveal } from './useScrollReveal';

interface PublicPlan {
  id: string;
  name: string;
  oldPrice: number | null;
  price: number;
  lifetime: boolean;
  badge: string;
  badgeLabel: string | null;
  period: 'lifetime' | 'mo';
  specs: { ram: string; ssd: string; cpu: string; servers: string };
}

const BADGE_CLASS: Record<string, string> = {
  FREE: 'bg-signal-500/15 text-signal-500 border-signal-500/30',
  MOST_POPULAR: 'bg-signal-500/20 text-signal-500 border-signal-500/40',
  BEST_VALUE: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  NEW: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  LIMITED_OFFER: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

export default function PricingSection() {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();
  const branding = useBranding();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/plans')
      .then((res) => {
        if (!cancelled) setPlans(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const scrollByCard = () => {
    const card = trackRef.current?.querySelector<HTMLElement>('[data-pricing-card]');
    return card ? card.getBoundingClientRect().width + 24 : 300;
  };

  const discordInvite = branding.discordInvite || null;

  return (
    <section id="pricing" className="py-20 border-t border-base-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">Simple, honest pricing</h2>
          <p className="mt-3 text-[#a9bdb2]">
            Start free. Scale up whenever your workloads need more room.
          </p>
        </div>

        <div
          ref={ref}
          className={`relative mt-12 transition-all duration-700 ${
            revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <button
            aria-label="Previous plans"
            onClick={() => trackRef.current?.scrollBy({ left: -scrollByCard(), behavior: 'smooth' })}
            className="hidden md:flex items-center justify-center absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-base-900 border border-base-700 text-[#a9bdb2] hover:text-white hover:border-base-600 transition"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            aria-label="Next plans"
            onClick={() => trackRef.current?.scrollBy({ left: scrollByCard(), behavior: 'smooth' })}
            className="hidden md:flex items-center justify-center absolute -right-5 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-base-900 border border-base-700 text-[#a9bdb2] hover:text-white hover:border-base-600 transition"
          >
            <ChevronRight size={18} />
          </button>

          <div
            ref={trackRef}
            className="flex gap-6 overflow-x-auto pb-6 px-1 snap-x snap-mandatory scroll-pl-1 scrollbar-thin"
          >
            {plans === null && !error && (
              <p className="text-[#8ea095] text-sm px-2 py-8">Loading plans…</p>
            )}
            {error && (
              <p className="text-[#8ea095] text-sm px-2 py-8">Unable to load pricing right now — please refresh.</p>
            )}
            {plans && plans.length === 0 && (
              <p className="text-[#8ea095] text-sm px-2 py-8">No plans are available right now.</p>
            )}
            {plans?.map((plan) => {
              const isFreeSignup = plan.lifetime && Number(plan.price) === 0;
              const badgeClass = BADGE_CLASS[plan.badge] || 'bg-base-800 text-[#a9bdb2] border-base-600';
              const popular = plan.badge === 'MOST_POPULAR';
              return (
                <div
                  key={plan.id}
                  data-pricing-card
                  className={`relative shrink-0 w-[260px] sm:w-[280px] snap-center bg-base-900 border rounded-2xl p-6 flex flex-col transition-all duration-300 ${
                    popular
                      ? 'border-signal-500/60 shadow-[0_0_0_1px_rgba(94,255,154,0.25),0_20px_60px_-15px_rgba(94,255,154,0.25)]'
                      : 'border-base-700 hover:border-base-600'
                  }`}
                >
                  {plan.badgeLabel && (
                    <span
                      className={`absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold px-3 py-1 rounded-full border ${badgeClass}`}
                    >
                      {plan.badgeLabel}
                    </span>
                  )}
                  <h3 className="text-lg font-semibold text-white mt-2">{plan.name}</h3>
                  <div className="mt-3 mb-4">
                    {plan.oldPrice != null ? (
                      <div className="flex items-end gap-2 mb-1">
                        <span className="text-sm text-[#5a6b62] line-through">₹{plan.oldPrice}</span>
                      </div>
                    ) : (
                      <div className="h-5" />
                    )}
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-white">₹{plan.price}</span>
                      <span className="text-[#8ea095] text-sm">/{plan.period}</span>
                    </div>
                  </div>
                  <ul className="space-y-2.5 text-sm text-[#c7d6cf] mb-6 flex-1">
                    {[
                      { label: 'RAM', value: plan.specs.ram },
                      { label: 'Storage', value: plan.specs.ssd },
                      { label: 'CPU', value: plan.specs.cpu },
                      { label: 'Servers', value: plan.specs.servers },
                    ].map((s) => (
                      <li key={s.label} className="flex items-center justify-between border-b border-base-800 pb-2">
                        <span className="text-[#5a6b62]">{s.label}</span>
                        <span className="font-medium text-[#e7f2ec]">{s.value}</span>
                      </li>
                    ))}
                  </ul>
                  {isFreeSignup ? (
                    <Link
                      href="/register"
                      className="text-center w-full py-2.5 rounded-lg font-semibold transition bg-base-800 hover:bg-base-700 text-white"
                    >
                      Get Started
                    </Link>
                  ) : discordInvite ? (
                    <a
                      href={discordInvite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`text-center w-full py-2.5 rounded-lg font-semibold transition ${
                        popular ? 'bg-signal-500 hover:bg-signal-400 text-base-950' : 'bg-base-800 hover:bg-signal-500 hover:text-base-950 text-white'
                      }`}
                    >
                      Buy Now
                    </a>
                  ) : (
                    <Link
                      href="/register"
                      className="text-center w-full py-2.5 rounded-lg font-semibold transition bg-base-800 hover:bg-base-700 text-white"
                    >
                      Get Started
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-center text-xs text-[#5a6b62] mt-2">Prices in INR (₹). Swipe to see all plans.</p>
      </div>
    </section>
  );
}
