'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useBranding } from '@/lib/branding';

export default function TermsPage() {
  const branding = useBranding();

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[#8ea095] hover:text-white transition-colors mb-8">
        <ArrowLeft size={14} /> Back to home
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Terms of Service</h1>
      <p className="text-sm text-[#5a6b62] mb-10">Last updated: {new Date().getFullYear()}</p>

      <div className="space-y-8 text-sm leading-relaxed text-[#c7d6cf]">
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">1. Acceptance of terms</h2>
          <p>
            By creating an account or deploying a server on {branding.hostingName}, you agree to these
            Terms of Service. If you don&rsquo;t agree, please don&rsquo;t use the platform.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">2. Acceptable use</h2>
          <p>
            Servers must not be used for illegal activity, malware distribution, denial-of-service
            attacks, or content that violates applicable law. We reserve the right to suspend or
            terminate any server or account found in violation.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">3. Resource limits</h2>
          <p>
            Each plan grants a fixed allocation of RAM, storage, CPU, and server count, enforced per
            your subscribed plan. Exceeding your allocation may result in your server being throttled
            or stopped.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">4. Subscriptions and billing</h2>
          <p>
            Paid plans are activated after payment is confirmed by an administrator. Subscription
            expiry reverts your account to the Free plan&rsquo;s limits; your files are preserved unless a
            server is intentionally deleted.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">5. Service availability</h2>
          <p>
            We aim for high availability but do not guarantee uninterrupted service. Scheduled
            maintenance and unforeseen outages may occur.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">6. Changes to these terms</h2>
          <p>
            We may update these terms from time to time. Continued use of the platform after a change
            constitutes acceptance of the revised terms.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">7. Contact</h2>
          <p>
            Questions about these terms? Reach out on{' '}
            {branding.discordInvite ? (
              <a href={branding.discordInvite} target="_blank" rel="noopener noreferrer" className="text-signal-500 hover:underline">
                Discord
              </a>
            ) : (
              'our support channel'
            )}
            {branding.supportEmail && (
              <>
                {' '}or email{' '}
                <a href={`mailto:${branding.supportEmail}`} className="text-signal-500 hover:underline">
                  {branding.supportEmail}
                </a>
              </>
            )}
            .
          </p>
        </section>
      </div>
    </main>
  );
}
