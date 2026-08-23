'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, setStoredToken } from '@/lib/api';
import Logo from '@/components/Logo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password, rememberMe });
      setStoredToken(res.data.accessToken);
      router.push('/dashboard');
    } catch (err: any) {
      if (err?.response?.status === 403) {
        // Account exists but hasn't verified its email yet.
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setError(err?.response?.data?.message || 'Login failed');
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

        <h1 className="text-2xl font-semibold text-center mb-8">Sign in</h1>

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
            <div className="flex items-center justify-between">
              <label className="text-sm text-[#a9bdb2]">Password</label>
              <Link href="/forgot-password" className="text-xs text-signal-500 hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[#a9bdb2] select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded border-base-700 bg-base-900 accent-signal-500"
            />
            Remember me
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-signal-500 text-base-950 font-medium py-2 hover:bg-signal-400 transition-colors disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-sm text-[#8ea095] text-center mt-6">
          No account?{' '}
          <Link href="/register" className="text-signal-500 hover:underline">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
