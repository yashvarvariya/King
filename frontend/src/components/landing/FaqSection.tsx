'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useScrollReveal } from './useScrollReveal';

const FAQS = [
  { q: 'Is the Free plan lifetime?', a: "Yes. The Free plan doesn't expire — it stays free for as long as you use it, with no recurring charge." },
  { q: 'How do I purchase a paid plan?', a: 'Click "Buy Now" on any paid plan to join our Discord and open a purchase ticket. An admin will confirm payment and assign the plan to your account.' },
  { q: 'What happens when my subscription expires?', a: "Your account drops back to the Free plan's limits until you renew. You'll get a heads-up beforehand so there are no surprises." },
  { q: 'Will my files be deleted?', a: 'No — your files stay put when a subscription expires. Files are only removed if a server is intentionally deleted from the panel.' },
  { q: 'Can I upgrade later?', a: 'Yes. You can upgrade from Free to any paid tier, or move between paid tiers, at any time — just open a ticket on Discord.' },
  { q: 'How do I contact support?', a: "Join our Discord server and open a support ticket — that's the fastest way to reach the team." },
];

export default function FaqSection() {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-20 border-t border-base-700">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">Frequently asked questions</h2>
        </div>
        <div
          ref={ref}
          className={`mt-10 space-y-3 transition-all duration-700 ${
            revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {FAQS.map((item, i) => {
            const open = openIndex === i;
            return (
              <div key={item.q} className="rounded-xl border border-base-700 bg-base-900 overflow-hidden">
                <button
                  onClick={() => setOpenIndex(open ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left text-[#e7f2ec] font-medium"
                >
                  <span>{item.q}</span>
                  <Plus
                    size={18}
                    className={`text-signal-500 shrink-0 transition-transform duration-200 ${open ? 'rotate-45' : ''}`}
                  />
                </button>
                {open && <div className="px-5 pb-4 text-sm text-[#8ea095]">{item.a}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
