'use client';

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Logo from '@/components/Logo';

const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function onRequestCode(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setInfo('If an account exists for that email, a reset code was sent.');
      setStep('reset');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setInfo('If an account exists for that email, a new code was sent.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not resend code');
    }
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email, code, newPassword });
      router.push('/login');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Reset failed');
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

        <h1 className="text-2xl font-semibold text-center mb-8">Reset your password</h1>

        {step === 'request' && (
          <form onSubmit={onRequestCode} className="space-y-4">
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

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-signal-500 text-base-950 font-medium py-2 hover:bg-signal-400 transition-colors disabled:opacity-60"
            >
              {loading ? 'Sending…' : 'Send reset code'}
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={onReset} className="space-y-4">
            {info && <p className="text-sm text-signal-500">{info}</p>}
            <div>
              <label className="text-sm text-[#a9bdb2]">Reset code</label>
              <input
                required
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500 tracking-[0.3em] text-center font-mono text-lg"
              />
            </div>
            <div>
              <label className="text-sm text-[#a9bdb2]">New password</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="8+ characters"
                className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500"
              />
            </div>
            <div>
              <label className="text-sm text-[#a9bdb2]">Confirm new password</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full rounded-md bg-signal-500 text-base-950 font-medium py-2 hover:bg-signal-400 transition-colors disabled:opacity-60"
            >
              {loading ? 'Resetting…' : 'Reset password'}
            </button>

            <p className="text-sm text-[#8ea095] text-center">
              Didn&apos;t get a code?{' '}
              <button
                type="button"
                onClick={onResend}
                disabled={cooldown > 0}
                className="text-signal-500 hover:underline disabled:opacity-60 disabled:no-underline"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </p>
          </form>
        )}

        <p className="text-sm text-[#8ea095] text-center mt-6">
          <Link href="/login" className="text-signal-500 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
