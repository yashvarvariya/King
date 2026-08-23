'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import type { AdminUser, QuotaFields } from './types';

export default function ResourcesTab({ users, reload }: { users: AdminUser[] | null; reload: () => void }) {
  return (
    <div>
      <p className="text-sm text-[#8ea095] mb-6">
        Default per-user quotas. These govern how many servers and how much RAM/CPU/disk a Premium
        user can allocate across all their servers (Free-plan users are always capped at one
        server regardless of these values). Edit a row and save to apply.
      </p>

      <div className="rounded-lg border border-base-700 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-base-900 text-[#8ea095] text-left">
            <tr>
              <th className="px-4 py-2 font-normal">User</th>
              <th className="px-4 py-2 font-normal">Max servers</th>
              <th className="px-4 py-2 font-normal">Max RAM (MB)</th>
              <th className="px-4 py-2 font-normal">Max disk (MB)</th>
              <th className="px-4 py-2 font-normal">Max CPU (%)</th>
              <th className="px-4 py-2 font-normal">Backup limit</th>
              <th className="px-4 py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {users === null &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-base-800">
                  <td className="px-4 py-3" colSpan={7}>
                    <div className="h-4 bg-base-800 rounded animate-pulse w-full" />
                  </td>
                </tr>
              ))}
            {users?.map((u) => (
              <QuotaRow key={u.id} user={u} reload={reload} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuotaRow({ user, reload }: { user: AdminUser; reload: () => void }) {
  const [fields, setFields] = useState<QuotaFields>({
    maxServers: user.maxServers,
    maxMemoryMb: user.maxMemoryMb,
    maxDiskMb: user.maxDiskMb,
    maxCpuPercent: user.maxCpuPercent,
    backupLimit: user.backupLimit,
  });
  const [saving, setSaving] = useState(false);

  const dirty =
    fields.maxServers !== user.maxServers ||
    fields.maxMemoryMb !== user.maxMemoryMb ||
    fields.maxDiskMb !== user.maxDiskMb ||
    fields.maxCpuPercent !== user.maxCpuPercent ||
    fields.backupLimit !== user.backupLimit;

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/admin/users/${user.id}/quotas`, fields);
      toast.success(`Quotas updated for ${user.username}`);
      reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not update quotas');
    } finally {
      setSaving(false);
    }
  }

  const cellInput = (value: number, min: number, onChange: (v: number) => void) => (
    <input
      type="number"
      min={min}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
      className="w-20 rounded-md bg-base-950 border border-base-700 px-2 py-1 text-sm outline-none focus:border-signal-500"
    />
  );

  return (
    <tr className="border-t border-base-800">
      <td className="px-4 py-3">
        <p>{user.username}</p>
        <p className="text-[#8ea095] text-xs">{user.email}</p>
      </td>
      <td className="px-4 py-3">{cellInput(fields.maxServers, 0, (v) => setFields({ ...fields, maxServers: v }))}</td>
      <td className="px-4 py-3">{cellInput(fields.maxMemoryMb, 64, (v) => setFields({ ...fields, maxMemoryMb: v }))}</td>
      <td className="px-4 py-3">{cellInput(fields.maxDiskMb, 100, (v) => setFields({ ...fields, maxDiskMb: v }))}</td>
      <td className="px-4 py-3">{cellInput(fields.maxCpuPercent, 10, (v) => setFields({ ...fields, maxCpuPercent: v }))}</td>
      <td className="px-4 py-3">{cellInput(fields.backupLimit, 0, (v) => setFields({ ...fields, backupLimit: v }))}</td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1.5 text-xs text-signal-500 hover:underline disabled:opacity-30 disabled:no-underline"
        >
          <Save size={13} />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </td>
    </tr>
  );
}
