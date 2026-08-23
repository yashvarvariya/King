'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBranding } from '@/lib/branding';
import { useAuth } from '@/lib/auth';
import { MessageCircle, Mail } from 'lucide-react';
import Logo from './Logo';

export default function Footer() {
  const pathname = usePathname();
  const branding = useBranding();
  const { user } = useAuth();
  const year = new Date().getFullYear();

  // The landing page gets the full marketing footer (Product/Legal/
  // Community columns, per Phase 5). Every other page keeps the original
  // minimal single-row footer unchanged, so the dashboard/admin panel look
  // exactly as they did before this phase.
  if (pathname === '/') {
    return (
      <footer className="border-t border-base-700 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <Logo />
              <p className="mt-3 text-sm text-[#5a6b62]">Modern hosting, forged for speed.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[#e7f2ec] mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-[#8ea095]">
                <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[#e7f2ec] mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-[#8ea095]">
                <li><Link href="/terms" className="hover:text-white transition-colors">Terms</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link></li>
                <li><Link href="/status" className="hover:text-white transition-colors">Status</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[#e7f2ec] mb-3">Community</h4>
              <ul className="space-y-2 text-sm text-[#8ea095] mb-3">
                {branding.discordInvite && (
                  <li>
                    <a href={branding.discordInvite} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                      Discord
                    </a>
                  </li>
                )}
                <li>
                  <Link href={user ? '/dashboard' : '/login'} className="hover:text-white transition-colors">
                    {user ? 'Dashboard' : 'Sign In'}
                  </Link>
                </li>
              </ul>
              {!user && (
                <Link
                  href="/register"
                  className="inline-block px-4 py-2 rounded-md bg-base-900 border border-base-700 hover:border-base-600 text-sm text-[#e7f2ec] transition-colors"
                >
                  Create Account
                </Link>
              )}
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-base-800 text-center text-xs text-[#5a6b62]">
            © {year} {branding.hostingName}. {branding.footerText}
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-base-700 mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#8ea095]">
        <p>
          © {year} {branding.hostingName}. {branding.footerText}
        </p>
        <div className="flex items-center gap-4">
          {branding.supportEmail && (
            <a
              href={`mailto:${branding.supportEmail}`}
              className="flex items-center gap-1.5 hover:text-signal-500 transition-colors"
            >
              <Mail size={13} /> {branding.supportEmail}
            </a>
          )}
          {branding.discordInvite && (
            <a
              href={branding.discordInvite}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-signal-500 transition-colors"
            >
              <MessageCircle size={13} /> Discord
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
