'use client';

import { Star } from 'lucide-react';
import { useScrollReveal } from './useScrollReveal';

// Presentational testimonials carried over from the feature-source panel's
// landing page. Not backed by an API — there's no review/testimonial model
// in this backend. Flagged in REVIEW.md as static content to revisit if a
// real review system is ever added.
const REVIEWS = [
  { text: 'Moved four small game servers over in an afternoon. The terminal actually feels like a real shell, not a wrapper around one.', name: 'Arjun M.', role: 'Indie game host' },
  { text: 'RBAC was the deciding factor — I can hand a junior admin the file manager without giving them the whole box.', name: 'Priya S.', role: 'DevOps lead, small studio' },
  { text: 'Started on the Free plan to try it out, upgraded within a week once I trusted the reconnect logic.', name: 'Daniel K.', role: 'Freelance backend dev' },
  { text: 'Deployment went from a 20-minute manual chore to a two-minute Git clone and restart. Genuinely faster team.', name: 'Meera T.', role: 'Full-stack developer' },
  { text: 'Support on Discord answered within minutes and helped me pick the right plan for my Node bot. Smooth experience.', name: 'Rohan V.', role: 'Discord bot developer' },
];

export default function ReviewsSection() {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();

  return (
    <section id="reviews" className="py-20 border-t border-base-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">What operators are saying</h2>
        </div>
        <div
          ref={ref}
          className={`mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6 transition-all duration-700 ${
            revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {REVIEWS.map((r) => (
            <div key={r.name} className="p-6 rounded-2xl bg-base-900 border border-base-700">
              <div className="flex text-amber-500 mb-3 gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={14} fill="currentColor" strokeWidth={0} />
                ))}
              </div>
              <p className="text-[#c7d6cf] text-sm leading-relaxed">{r.text}</p>
              <p className="mt-4 text-sm font-medium text-white">{r.name}</p>
              <p className="text-xs text-[#8ea095]">{r.role}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
