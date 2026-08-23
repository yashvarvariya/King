'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, Square, RotateCw, Skull, Trash2, Settings2 } from 'lucide-react';
import StatusPill from '../StatusPill';
import { AdminModal, Field, TextInput, NumberField, PrimaryButton, SecondaryButton } from './AdminUI';
import type { AdminServer, AdminUser, ServerResourceFields } from './types';
import type { ServerStatus } from '@/lib/api';

export default function ServersTab({
  servers,
  users,
  reload,
}: {
  servers: AdminServer[] | null;
  users: AdminUser[] | null;
  reload: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AdminServer | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, action: 'force-stop' | 'force-restart' | 'force-kill', label: string) {
    setBusyId(id);
    try {
      await api.post(`/admin/servers/${id}/${action}`);
      toast.success(label);
      reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(server: AdminServer) {
    if (!confirm(`Delete server "${server.name}"? This cannot be undone.`)) return;
    setBusyId(server.id);
    try {
      await api.delete(`/admin/servers/${server.id}`);
      toast.success('Server deleted');
      reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not delete server');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-[#8ea095]">{servers?.length ?? 0} total servers.</p>
        <PrimaryButton onClick={() => setShowCreate(true)} className="flex items-center gap-2">
          <Plus size={15} /> New server
        </PrimaryButton>
      </div>

      <div className="rounded-lg border border-base-700 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-base-900 text-[#8ea095] text-left">
            <tr>
              <th className="px-4 py-2 font-normal">Server</th>
              <th className="px-4 py-2 font-normal">Owner</th>
              <th className="px-4 py-2 font-normal">Runtime</th>
              <th className="px-4 py-2 font-normal">Resources</th>
              <th className="px-4 py-2 font-normal">Status</th>
              <th className="px-4 py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {servers === null &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-base-800">
                  <td className="px-4 py-3" colSpan={6}>
                    <div className="h-4 bg-base-800 rounded animate-pulse w-full" />
                  </td>
                </tr>
              ))}
            {servers?.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-[#8ea095]" colSpan={6}>
                  No servers found.
                </td>
              </tr>
            )}
            {servers?.map((s) => (
              <tr key={s.id} className="border-t border-base-800">
                <td className="px-4 py-3">{s.name}</td>
                <td className="px-4 py-3 text-[#8ea095]">{s.owner.username}</td>
                <td className="px-4 py-3 font-mono text-xs">{s.runtime}</td>
                <td className="px-4 py-3 text-xs text-[#8ea095] font-mono">
                  {s.memoryLimitMb}MB · {s.cpuLimitPercent}% · {s.diskLimitMb}MB
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={s.status as ServerStatus} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <IconButton title="Force stop" disabled={busyId === s.id} onClick={() => act(s.id, 'force-stop', 'Server stopped')}>
                      <Square size={14} />
                    </IconButton>
                    <IconButton title="Force restart" disabled={busyId === s.id} onClick={() => act(s.id, 'force-restart', 'Server restarted')}>
                      <RotateCw size={14} />
                    </IconButton>
                    <IconButton title="Force kill" disabled={busyId === s.id} onClick={() => act(s.id, 'force-kill', 'Server killed')}>
                      <Skull size={14} />
                    </IconButton>
                    <IconButton title="Edit resources" disabled={busyId === s.id} onClick={() => setEditing(s)}>
                      <Settings2 size={14} />
                    </IconButton>
                    <IconButton title="Delete" danger disabled={busyId === s.id} onClick={() => remove(s)}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateServerModal users={users} onClose={() => setShowCreate(false)} onDone={reload} />}
      {editing && <EditResourcesModal server={editing} onClose={() => setEditing(null)} onDone={reload} />}
    </div>
  );
}

function IconButton({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-md border border-base-700 transition-colors disabled:opacity-40 ${
        danger ? 'text-red-400 hover:bg-red-500/10 hover:border-red-500/30' : 'text-[#a9bdb2] hover:text-signal-500 hover:border-signal-500/30'
      }`}
    >
      {children}
    </button>
  );
}

function CreateServerModal({
  users,
  onClose,
  onDone,
}: {
  users: AdminUser[] | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [ownerId, setOwnerId] = useState(users?.[0]?.id || '');
  const [name, setName] = useState('');
  const [runtime, setRuntime] = useState<'NODEJS' | 'PYTHON'>('NODEJS');
  const [startupCommand, setStartupCommand] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ownerId) {
      toast.error('Select an owner');
      return;
    }
    setSaving(true);
    try {
      await api.post('/admin/servers', { ownerId, name, runtime, startupCommand: startupCommand || undefined });
      toast.success('Server created');
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not create server');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal title="Create server for user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Owner">
          <select
            required
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="w-full rounded-md bg-base-950 border border-base-700 px-3 py-2 outline-none focus:border-signal-500 text-sm"
          >
            <option value="" disabled>
              Select a user…
            </option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} ({u.email})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name">
          <TextInput required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Runtime">
          <div className="grid grid-cols-2 gap-2">
            {(['NODEJS', 'PYTHON'] as const).map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setRuntime(r)}
                className={`rounded-md border px-3 py-2 text-sm font-mono transition-colors ${
                  runtime === r ? 'border-signal-500 text-signal-500 bg-signal-500/10' : 'border-base-700 text-[#a9bdb2]'
                }`}
              >
                {r === 'NODEJS' ? 'node.js' : 'python'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Startup command (optional)">
          <TextInput value={startupCommand} onChange={(e) => setStartupCommand(e.target.value)} />
        </Field>
        <PrimaryButton type="submit" loading={saving} className="w-full">
          Create server
        </PrimaryButton>
      </form>
    </AdminModal>
  );
}

function EditResourcesModal({
  server,
  onClose,
  onDone,
}: {
  server: AdminServer;
  onClose: () => void;
  onDone: () => void;
}) {
  const [fields, setFields] = useState<ServerResourceFields>({
    memoryLimitMb: server.memoryLimitMb,
    cpuLimitPercent: server.cpuLimitPercent,
    diskLimitMb: server.diskLimitMb,
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/admin/servers/${server.id}/resources`, fields);
      toast.success('Resources updated');
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not update resources');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal title={`Edit resources — ${server.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <NumberField
          label="Memory limit (MB, min 64)"
          value={fields.memoryLimitMb}
          min={64}
          onChange={(v) => setFields({ ...fields, memoryLimitMb: v })}
        />
        <NumberField
          label="CPU limit (%, min 10)"
          value={fields.cpuLimitPercent}
          min={10}
          onChange={(v) => setFields({ ...fields, cpuLimitPercent: v })}
        />
        <NumberField
          label="Disk limit (MB, min 100)"
          value={fields.diskLimitMb}
          min={100}
          onChange={(v) => setFields({ ...fields, diskLimitMb: v })}
        />
        <div className="flex gap-2 pt-2">
          <PrimaryButton type="submit" loading={saving} className="flex-1">
            Save
          </PrimaryButton>
          <SecondaryButton type="button" onClick={onClose} className="flex-1">
            Cancel
          </SecondaryButton>
        </div>
      </form>
    </AdminModal>
  );
}
