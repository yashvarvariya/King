'use client';

import { useState, useEffect, FormEvent, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, setStoredToken } from '@/lib/api';
import Logo from '@/components/Logo';

const RESEND_COOLDOWN_SECONDS = 60;

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-email', { email, code });
      if (res.data?.accessToken) {
        setStoredToken(res.data.accessToken);
        router.push('/dashboard');
      } else {
        setInfo('Email already verified — please sign in.');
        router.push('/login');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    setError('');
    setInfo('');
    if (!email) {
      setError('Enter your email first');
      return;
    }
    try {
      await api.post('/auth/resend-otp', { email, purpose: 'EMAIL_VERIFICATION' });
      setInfo('If that account needs verifying, a new code was sent.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not resend code');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo size={20} />
        </div>

        <h1 className="text-2xl font-semibold text-center mb-2">Verify your email</h1>
        <p className="text-sm text-[#8ea095] text-center mb-8">
          Enter the 6-digit code we sent to your email address.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-[#a9bdb2]">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500"
            />
          </div>
          <div>
            <label className="text-sm text-[#a9bdb2]">Verification code</label>
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500 tracking-[0.3em] text-center font-mono text-lg"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {info && <p className="text-sm text-signal-500">{info}</p>}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full rounded-md bg-signal-500 text-base-950 font-medium py-2 hover:bg-signal-400 transition-colors disabled:opacity-60"
          >
            {loading ? 'Verifying…' : 'Verify email'}
          </button>
        </form>

        <p className="text-sm text-[#8ea095] text-center mt-6">
          Didn&apos;t get a code?{" "}
          <button
            type="button"
            onClick={onResend}
            disabled={cooldown > 0}
            className="text-signal-500 hover:underline disabled:opacity-60 disabled:no-underline"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
        </p>

        <p className="text-sm text-[#8ea095] text-center mt-2">
          <Link href="/login" className="text-signal-500 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
