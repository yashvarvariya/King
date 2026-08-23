'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, ShieldCheck, LogOut, Menu, X, UserCircle, CreditCard } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import Logo from './Logo';

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: <LayoutGrid size={15} /> },
    { href: '/dashboard/billing', label: 'Billing', icon: <CreditCard size={15} /> },
    { href: '/dashboard/account', label: 'Account', icon: <UserCircle size={15} /> },
    ...(user?.role === 'ADMIN' ? [{ href: '/admin', label: 'Admin', icon: <ShieldCheck size={15} /> }] : []),
  ];

  // Highlight whichever nav item is the longest matching prefix, so e.g.
  // /dashboard/billing lights up "Billing" (not also "Dashboard"), while
  // /dashboard/servers/abc still correctly lights up "Dashboard" since no
  // more specific item matches it.
  const activeHref = navItems
    .map((item) => item.href)
    .filter((href) => pathname?.startsWith(href))
    .sort((a, b) => b.length - a.length)[0];
  const linkClass = (href: string) =>
    `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
      href === activeHref ? 'bg-base-800 text-signal-500' : 'text-[#a9bdb2] hover:text-white'
    }`;

  return (
    <nav className="sticky top-0 z-30 border-b border-base-700 bg-base-950/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center">
            <Logo />
          </Link>
          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          {user && <span className="hidden sm:inline text-sm text-[#8ea095] font-mono">{user.username}</span>}
          <button onClick={logout} className="text-[#8ea095] hover:text-red-400 transition-colors" title="Log out">
            <LogOut size={16} />
          </button>
          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-[#a9bdb2] hover:text-white transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile nav panel */}
      {mobileOpen && (
        <div className="md:hidden border-t border-base-700 bg-base-950 px-4 py-3 space-y-1">
          {user && <p className="text-xs text-[#8ea095] font-mono px-3 pb-2">{user.username}</p>}
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={linkClass(item.href)}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
