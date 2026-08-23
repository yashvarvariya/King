'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import Logo from '@/components/Logo';

const LINKS = [
  { href: '#pricing', label: 'Pricing' },
  { href: '#languages', label: 'Runtimes' },
  { href: '#why', label: 'Why QuantaForge' },
  { href: '#locations', label: 'Locations' },
  { href: '#reviews', label: 'Reviews' },
  { href: '#faq', label: 'FAQ' },
];

export default function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-base-950/85 backdrop-blur border-b border-base-700">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <Logo size={26} />
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-[#a9bdb2]">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-white transition-colors">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="px-4 py-2 text-sm font-medium text-[#c7d6cf] hover:text-white transition-colors">
            Sign In
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 text-sm font-semibold rounded-md bg-signal-500 hover:bg-signal-400 text-base-950 transition-colors"
          >
            Create Account
          </Link>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="md:hidden text-[#c7d6cf] p-2 -mr-2"
          aria-label="Toggle menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-base-700 bg-base-950 px-4 py-3 space-y-1">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block px-2 py-2 rounded-md text-[#a9bdb2] hover:bg-base-800"
            >
              {l.label}
            </a>
          ))}
          <div className="pt-2 flex gap-2">
            <Link href="/login" className="flex-1 text-center px-4 py-2 rounded-md bg-base-800 text-[#e7f2ec]">
              Sign In
            </Link>
            <Link href="/register" className="flex-1 text-center px-4 py-2 rounded-md bg-signal-500 text-base-950 font-medium">
              Create Account
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
