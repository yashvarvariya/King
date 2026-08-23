'use client';

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Logo from '@/components/Logo';

interface EmailValidationRules {
  enabled: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
}

// Mirrors backend/src/common/mail/mail.service.ts#validateEmailDomain so the
// register form can reject a disposable/blocked domain instantly, before the
// round trip to POST /auth/register. The server re-validates independently,
// so this is purely a UX shortcut and never the source of truth.
function checkDomain(email: string, rules: EmailValidationRules | null): string | null {
  if (!rules || !rules.enabled) return null;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  const blocked = rules.blockedDomains.map((d) => d.toLowerCase());
  const allowed = rules.allowedDomains.map((d) => d.toLowerCase());
  const unsupported = 'This email provider is not supported. Please use a personal email address.';
  if (blocked.includes(domain)) return unsupported;
  if (allowed.length > 0 && !allowed.includes(domain)) return unsupported;
  return null;
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationRules, setValidationRules] = useState<EmailValidationRules | null>(null);
  const [emailWarning, setEmailWarning] = useState('');

  useEffect(() => {
    api
      .get('/email-settings/validation/public')
      .then((res) => setValidationRules(res.data))
      .catch(() => setValidationRules(null)); // fail open — server still validates on submit
  }, []);

  useEffect(() => {
    if (!email.includes('@')) {
      setEmailWarning('');
      return;
    }
    setEmailWarning(checkDomain(email, validationRules) || '');
  }, [email, validationRules]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== passwordConfirmation) {
      setError('Passwords do not match');
      return;
    }
    const domainError = checkDomain(email, validationRules);
    if (domainError) {
      setError(domainError);
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/register', { email, username, password, passwordConfirmation });
      // Registration no longer logs you in directly — the account has to
      // verify its email with the OTP we just sent before it can log in.
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo size={20} />
        </div>

        <h1 className="text-2xl font-semibold text-center mb-8">Create account</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-[#a9bdb2]">Username</label>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3-20 chars, letters/numbers/_/-"
              className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500"
            />
          </div>
          <div>
            <label className="text-sm text-[#a9bdb2]">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500"
            />
            {emailWarning && <p className="text-xs text-amber-400 mt-1">{emailWarning}</p>}
          </div>
          <div>
            <label className="text-sm text-[#a9bdb2]">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters"
              className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500"
            />
          </div>
          <div>
            <label className="text-sm text-[#a9bdb2]">Confirm password</label>
            <input
              type="password"
              required
              minLength={8}
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || !!emailWarning}
            className="w-full rounded-md bg-signal-500 text-base-950 font-medium py-2 hover:bg-signal-400 transition-colors disabled:opacity-60"
          >
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-[#8ea095] text-center mt-6">
          Already registered?{' '}
          <Link href="/login" className="text-signal-500 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
