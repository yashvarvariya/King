'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Crown, Plus } from 'lucide-react';
import { StatTile, PrimaryButton, SecondaryButton } from './AdminUI';
import type { AdminUser } from './types';

export default function PremiumTab({ users, reload }: { users: AdminUser[] | null; reload: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showGrant, setShowGrant] = useState(false);

  const premiumUsers = users?.filter((u) => u.isPremium) ?? [];
  const freeUsers = users?.filter((u) => !u.isPremium) ?? [];

  async function toggle(user: AdminUser) {
    setBusyId(user.id);
    try {
      await api.post(`/admin/users/${user.id}/${user.isPremium ? 'remove-premium' : 'grant-premium'}`);
      toast.success(user.isPremium ? `Premium removed from ${user.username}` : `Premium granted to ${user.username}`);
      reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <StatTile icon={<Crown size={16} />} label="Premium users" value={premiumUsers.length} accent />
        <PrimaryButton onClick={() => setShowGrant(true)} className="flex items-center gap-2">
          <Plus size={15} /> Grant Premium
        </PrimaryButton>
      </div>

      <div className="rounded-lg border border-base-700 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-base-900 text-[#8ea095] text-left">
            <tr>
              <th className="px-4 py-2 font-normal">User</th>
              <th className="px-4 py-2 font-normal">Premium since</th>
              <th className="px-4 py-2 font-normal">Servers</th>
              <th className="px-4 py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {users === null &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-t border-base-800">
                  <td className="px-4 py-3" colSpan={4}>
                    <div className="h-4 bg-base-800 rounded animate-pulse w-full" />
                  </td>
                </tr>
              ))}
            {users !== null && premiumUsers.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-[#8ea095]" colSpan={4}>
                  No Premium users yet.
                </td>
              </tr>
            )}
            {premiumUsers.map((u) => (
              <tr key={u.id} className="border-t border-base-800">
                <td className="px-4 py-3">
                  <p>{u.username}</p>
                  <p className="text-[#8ea095] text-xs">{u.email}</p>
                </td>
                <td className="px-4 py-3 text-xs text-[#8ea095] font-mono">
                  {u.premiumSince ? new Date(u.premiumSince).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
                  {u._count.servers} / {u.maxServers}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => toggle(u)}
                    disabled={busyId === u.id}
                    className="text-xs text-red-400 hover:underline disabled:opacity-40"
                  >
                    Remove Premium
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showGrant && (
        <GrantPremiumModal freeUsers={freeUsers} onClose={() => setShowGrant(false)} onGrant={toggle} />
      )}
    </div>
  );
}

function GrantPremiumModal({
  freeUsers,
  onClose,
  onGrant,
}: {
  freeUsers: AdminUser[];
  onClose: () => void;
  onGrant: (user: AdminUser) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4 sm:px-6" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-base-700 bg-base-900 p-5 sm:p-6 max-h-[80vh] overflow-y-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-medium mb-4">Grant Premium</h2>
        {freeUsers.length === 0 ? (
          <p className="text-sm text-[#8ea095]">Every user already has Premium.</p>
        ) : (
          <div className="space-y-1 mb-4">
            {freeUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  onGrant(u);
                  onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-base-800 text-left transition-colors"
              >
                <span>
                  <span className="text-sm">{u.username}</span>
                  <span className="block text-xs text-[#8ea095]">{u.email}</span>
                </span>
                <Crown size={14} className="text-[#8ea095]" />
              </button>
            ))}
          </div>
        )}
        <SecondaryButton onClick={onClose} className="w-full">
          Close
        </SecondaryButton>
      </div>
    </div>
  );
}
