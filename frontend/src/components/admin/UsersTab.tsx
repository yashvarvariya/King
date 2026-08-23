'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, KeyRound, Mail, Ban, ShieldCheck, Trash2, Crown } from 'lucide-react';
import { AdminModal, Field, TextInput, PrimaryButton, SecondaryButton, DangerButton } from './AdminUI';
import type { AdminUser } from './types';

export default function UsersTab({ users, reload }: { users: AdminUser[] | null; reload: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [managing, setManaging] = useState<AdminUser | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-[#8ea095]">{users?.length ?? 0} total accounts.</p>
        <PrimaryButton onClick={() => setShowCreate(true)} className="flex items-center gap-2">
          <Plus size={15} /> New user
        </PrimaryButton>
      </div>

      <div className="rounded-lg border border-base-700 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-base-900 text-[#8ea095] text-left">
            <tr>
              <th className="px-4 py-2 font-normal">User</th>
              <th className="px-4 py-2 font-normal">Role</th>
              <th className="px-4 py-2 font-normal">Plan</th>
              <th className="px-4 py-2 font-normal">Servers</th>
              <th className="px-4 py-2 font-normal">Status</th>
              <th className="px-4 py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {users === null &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-base-800">
                  <td className="px-4 py-3" colSpan={6}>
                    <div className="h-4 bg-base-800 rounded animate-pulse w-full" />
                  </td>
                </tr>
              ))}
            {users?.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-[#8ea095]" colSpan={6}>
                  No users found.
                </td>
              </tr>
            )}
            {users?.map((u) => (
              <tr key={u.id} className="border-t border-base-800">
                <td className="px-4 py-3">
                  <p>{u.username}</p>
                  <p className="text-[#8ea095] text-xs">{u.email}</p>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{u.role}</td>
                <td className="px-4 py-3">
                  {u.isPremium ? (
                    <span className="inline-flex items-center gap-1 text-xs text-signal-500">
                      <Crown size={12} /> Premium
                    </span>
                  ) : (
                    <span className="text-xs text-[#8ea095]">Free</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u._count.servers} / {u.isPremium ? u.maxServers : 1}
                </td>
                <td className="px-4 py-3">
                  {u.suspended ? (
                    <span className="text-xs text-red-400">Suspended</span>
                  ) : !u.emailVerified ? (
                    <span className="text-xs text-amber-500">Unverified</span>
                  ) : (
                    <span className="text-xs text-signal-500">Active</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setManaging(u)} className="text-xs text-signal-500 hover:underline">
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onDone={reload} />}
      {managing && <ManageUserModal user={managing} onClose={() => setManaging(null)} onDone={reload} />}
    </div>
  );
}

function CreateUserModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'USER' | 'ADMIN'>('USER');
  const [isPremium, setIsPremium] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/users', { email, username, password, role, isPremium });
      toast.success('User created');
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not create user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal title="Create user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <TextInput required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Username">
          <TextInput required value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Password">
          <TextInput
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Role">
          <div className="grid grid-cols-2 gap-2">
            {(['USER', 'ADMIN'] as const).map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setRole(r)}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                  role === r ? 'border-signal-500 text-signal-500 bg-signal-500/10' : 'border-base-700 text-[#a9bdb2]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm text-[#a9bdb2]">
          <input type="checkbox" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} />
          Grant Premium on creation
        </label>
        <PrimaryButton type="submit" loading={saving} className="w-full">
          Create user
        </PrimaryButton>
      </form>
    </AdminModal>
  );
}

function ManageUserModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(action: string, fn: () => Promise<any>, successMsg: string, refresh = true) {
    setBusy(action);
    try {
      await fn();
      toast.success(successMsg);
      if (refresh) onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  async function doResetPassword() {
    setBusy('reset-password');
    try {
      const res = await api.post(`/admin/users/${user.id}/reset-password`);
      setTempPassword(res.data.temporaryPassword);
      toast.success('Password reset');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not reset password');
    } finally {
      setBusy(null);
    }
  }

  async function doDelete() {
    setBusy('delete');
    try {
      await api.delete(`/admin/users/${user.id}`);
      toast.success('User deleted');
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not delete user');
      setBusy(null);
    }
  }

  return (
    <AdminModal title={`Manage — ${user.username}`} onClose={onClose}>
      <div className="space-y-5">
        <div className="text-xs text-[#8ea095] font-mono break-all">{user.email}</div>

        {tempPassword && (
          <div className="rounded-md border border-signal-500/30 bg-signal-500/10 p-3 text-sm">
            <p className="text-[#a9bdb2] mb-1">New temporary password (shown once):</p>
            <p className="font-mono text-signal-500 break-all">{tempPassword}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <SecondaryButton
            disabled={busy !== null}
            onClick={() =>
              run(
                'suspend',
                () => api.post(`/admin/users/${user.id}/${user.suspended ? 'unsuspend' : 'suspend'}`),
                user.suspended ? 'User unsuspended' : 'User suspended',
              )
            }
            className="flex items-center justify-center gap-2"
          >
            <Ban size={14} />
            {user.suspended ? 'Unsuspend' : 'Suspend'}
          </SecondaryButton>

          <SecondaryButton
            disabled={busy !== null}
            onClick={() =>
              run(
                'role',
                () => api.patch(`/admin/users/${user.id}/role`, { role: user.role === 'ADMIN' ? 'USER' : 'ADMIN' }),
                'Role updated',
              )
            }
            className="flex items-center justify-center gap-2"
          >
            <ShieldCheck size={14} />
            Make {user.role === 'ADMIN' ? 'User' : 'Admin'}
          </SecondaryButton>

          <SecondaryButton
            disabled={busy !== null}
            onClick={() =>
              run(
                'premium',
                () => api.post(`/admin/users/${user.id}/${user.isPremium ? 'remove-premium' : 'grant-premium'}`),
                user.isPremium ? 'Premium removed' : 'Premium granted',
              )
            }
            className="flex items-center justify-center gap-2"
          >
            <Crown size={14} />
            {user.isPremium ? 'Remove Premium' : 'Grant Premium'}
          </SecondaryButton>

          <SecondaryButton
            disabled={busy !== null}
            onClick={() =>
              run('verify', () => api.post(`/admin/users/${user.id}/reset-email-verification`), 'Verification email sent')
            }
            className="flex items-center justify-center gap-2"
          >
            <Mail size={14} />
            Reset Verification
          </SecondaryButton>
        </div>

        <SecondaryButton
          disabled={busy !== null}
          onClick={doResetPassword}
          className="w-full flex items-center justify-center gap-2"
        >
          <KeyRound size={14} />
          Reset Password
        </SecondaryButton>

        <div className="pt-4 border-t border-base-800">
          {!confirmDelete ? (
            <DangerButton onClick={() => setConfirmDelete(true)} className="w-full flex items-center justify-center gap-2">
              <Trash2 size={14} />
              Delete user
            </DangerButton>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-red-400">
                This permanently deletes the account and every server it owns. This cannot be undone.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <SecondaryButton onClick={() => setConfirmDelete(false)}>Cancel</SecondaryButton>
                <DangerButton disabled={busy !== null} onClick={doDelete}>
                  {busy === 'delete' ? 'Deleting…' : 'Confirm delete'}
                </DangerButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminModal>
  );
}
