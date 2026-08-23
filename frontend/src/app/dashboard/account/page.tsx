'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, setStoredToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import toast from 'react-hot-toast';

export default function AccountPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useAuth();

  // Local, editable copies of the profile fields. Seeded from `user` once
  // it loads, then updated in place after a successful save — useAuth()
  // doesn't expose a refetch, and re-fetching the whole session just to
  // reflect a username/email that this page already knows the new value of
  // would be redundant.
  const [displayUsername, setDisplayUsername] = useState('');
  const [displayEmail, setDisplayEmail] = useState('');
  useEffect(() => {
    if (user) {
      setDisplayUsername(user.username);
      setDisplayEmail(user.email);
    }
  }, [user]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  // -- Change username --
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  useEffect(() => {
    if (user) setUsernameInput(user.username);
  }, [user]);

  async function onChangeUsername(e: FormEvent) {
    e.preventDefault();
    setUsernameError('');
    if (usernameInput === displayUsername) return;
    setSavingUsername(true);
    try {
      const res = await api.patch('/users/me/username', { username: usernameInput });
      setDisplayUsername(res.data.username);
      toast.success('Username updated');
    } catch (err: any) {
      setUsernameError(err?.response?.data?.message || 'Could not update username');
    } finally {
      setSavingUsername(false);
    }
  }

  // -- Change email (two-step: request OTP at the new address, then confirm) --
  const [emailStep, setEmailStep] = useState<'idle' | 'awaiting-code'>('idle');
  const [newEmail, setNewEmail] = useState('');
  const [emailChangePassword, setEmailChangePassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [requestingEmail, setRequestingEmail] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [confirmingEmail, setConfirmingEmail] = useState(false);

  async function onRequestEmailChange(e: FormEvent) {
    e.preventDefault();
    setEmailError('');
    setRequestingEmail(true);
    try {
      await api.post('/users/me/email/request-change', { newEmail, currentPassword: emailChangePassword });
      setEmailStep('awaiting-code');
      toast.success(`Confirmation code sent to ${newEmail}`);
    } catch (err: any) {
      setEmailError(err?.response?.data?.message || 'Could not start email change');
    } finally {
      setRequestingEmail(false);
    }
  }

  async function onConfirmEmailChange(e: FormEvent) {
    e.preventDefault();
    setConfirmError('');
    setConfirmingEmail(true);
    try {
      const res = await api.post('/users/me/email/confirm-change', { code: confirmCode });
      setDisplayEmail(res.data.email);
      setEmailStep('idle');
      setNewEmail('');
      setEmailChangePassword('');
      setConfirmCode('');
      toast.success('Email address updated');
    } catch (err: any) {
      setConfirmError(err?.response?.data?.message || 'Could not confirm email change');
    } finally {
      setConfirmingEmail(false);
    }
  }

  function onCancelEmailChange() {
    setEmailStep('idle');
    setConfirmCode('');
    setConfirmError('');
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/auth/change-password', { currentPassword, newPassword });
      setStoredToken(res.data.accessToken);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not change password');
    } finally {
      setSaving(false);
    }
  }

  async function onLogoutAllDevices() {
    setLoggingOutAll(true);
    try {
      const res = await api.post('/auth/logout-all');
      setStoredToken(res.data.accessToken);
      toast.success('Every other session has been logged out');
    } catch {
      toast.error('Could not log out other devices');
    } finally {
      setLoggingOutAll(false);
    }
  }

  return (
    <main className="min-h-screen">
      <Navbar />
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        <div>
          <h1 className="text-2xl font-semibold">Account</h1>
          {!userLoading && user && <p className="text-sm text-[#8ea095] mt-1">{displayEmail}</p>}
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Username</h2>
          <form onSubmit={onChangeUsername} className="space-y-4">
            <div>
              <label className="text-sm text-[#a9bdb2]">Username</label>
              <input
                type="text"
                required
                pattern="[a-zA-Z0-9_-]{3,20}"
                title="3-20 characters: letters, numbers, _ or -"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500"
              />
            </div>
            {usernameError && <p className="text-sm text-red-400">{usernameError}</p>}
            <button
              type="submit"
              disabled={savingUsername || usernameInput === displayUsername}
              className="rounded-md bg-signal-500 text-base-950 font-medium px-4 py-2 hover:bg-signal-400 transition-colors disabled:opacity-60"
            >
              {savingUsername ? 'Saving…' : 'Update username'}
            </button>
          </form>
        </section>

        <section className="space-y-4 border-t border-base-700 pt-8">
          <h2 className="text-lg font-medium">Email address</h2>
          <p className="text-sm text-[#8ea095]">
            Current: <span className="text-[#e7f2ec]">{displayEmail}</span>
          </p>

          {emailStep === 'idle' ? (
            <form onSubmit={onRequestEmailChange} className="space-y-4">
              <div>
                <label className="text-sm text-[#a9bdb2]">New email address</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500"
                />
              </div>
              <div>
                <label className="text-sm text-[#a9bdb2]">Current password</label>
                <input
                  type="password"
                  required
                  value={emailChangePassword}
                  onChange={(e) => setEmailChangePassword(e.target.value)}
                  className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500"
                />
              </div>
              {emailError && <p className="text-sm text-red-400">{emailError}</p>}
              <button
                type="submit"
                disabled={requestingEmail}
                className="rounded-md bg-signal-500 text-base-950 font-medium px-4 py-2 hover:bg-signal-400 transition-colors disabled:opacity-60"
              >
                {requestingEmail ? 'Sending code…' : 'Send confirmation code'}
              </button>
            </form>
          ) : (
            <form onSubmit={onConfirmEmailChange} className="space-y-4">
              <p className="text-sm text-[#8ea095]">
                We sent a 6-digit code to <span className="text-[#e7f2ec]">{newEmail}</span>. Enter it below to
                confirm the change.
              </p>
              <div>
                <label className="text-sm text-[#a9bdb2]">Confirmation code</label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500 tracking-widest font-mono"
                />
              </div>
              {confirmError && <p className="text-sm text-red-400">{confirmError}</p>}
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={confirmingEmail}
                  className="rounded-md bg-signal-500 text-base-950 font-medium px-4 py-2 hover:bg-signal-400 transition-colors disabled:opacity-60"
                >
                  {confirmingEmail ? 'Confirming…' : 'Confirm new email'}
                </button>
                <button
                  type="button"
                  onClick={onCancelEmailChange}
                  className="text-sm text-[#8ea095] hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="space-y-4 border-t border-base-700 pt-8">
          <h2 className="text-lg font-medium">Change password</h2>
          <form onSubmit={onChangePassword} className="space-y-4">
            <div>
              <label className="text-sm text-[#a9bdb2]">Current password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 w-full rounded-md bg-base-900 border border-base-700 px-3 py-2 outline-none focus:border-signal-500"
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
              disabled={saving}
              className="rounded-md bg-signal-500 text-base-950 font-medium px-4 py-2 hover:bg-signal-400 transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </section>

        <section className="space-y-3 border-t border-base-700 pt-8">
          <h2 className="text-lg font-medium">Sessions</h2>
          <p className="text-sm text-[#8ea095]">
            Log out of every other browser or device signed in to your account. This browser will stay signed in.
          </p>
          <button
            onClick={onLogoutAllDevices}
            disabled={loggingOutAll}
            className="rounded-md border border-base-700 px-4 py-2 text-sm hover:border-red-400 hover:text-red-400 transition-colors disabled:opacity-60"
          >
            {loggingOutAll ? 'Logging out other devices…' : 'Log out all other devices'}
          </button>
        </section>
      </div>
    </main>
  );
}
