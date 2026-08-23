'use client';

import { MessageCircle, ArrowRight } from 'lucide-react';
import { useBranding } from '@/lib/branding';
import { useScrollReveal } from './useScrollReveal';

export default function DiscordCta() {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();
  const branding = useBranding();
  const invite = branding.discordInvite;

  return (
    <section className="py-16 border-t border-base-700">
      <div
        ref={ref}
        className={`max-w-4xl mx-auto px-4 sm:px-6 transition-all duration-700 ${
          revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <div className="rounded-2xl bg-gradient-to-r from-base-900 via-base-900 to-base-800 border border-base-700 px-6 py-10 sm:px-12 text-center">
          <div className="text-signal-500 flex justify-center mb-3">
            <MessageCircle size={30} />
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            Need a hand? Come find us on Discord
          </h2>
          <p className="mt-3 text-[#a9bdb2] max-w-xl mx-auto">
            Ask setup questions, purchase a plan, report bugs, or get help from the team and other operators.
          </p>
          {invite ? (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href={invite}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-signal-500 hover:bg-signal-400 text-base-950 font-semibold transition"
              >
                Join the Discord <ArrowRight size={16} />
              </a>
              <a
                href={invite}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-base-900 border border-base-700 hover:border-base-600 text-[#e7f2ec] font-semibold transition"
              >
                Open a Ticket
              </a>
            </div>
          ) : (
            <p className="mt-6 text-sm text-[#5a6b62]">
              Discord invite hasn&rsquo;t been configured yet — check back soon.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
