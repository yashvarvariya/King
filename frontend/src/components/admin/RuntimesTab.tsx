'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Cpu, Star } from 'lucide-react';
import { StatTile, AdminModal, Field, TextInput, PrimaryButton, SecondaryButton } from './AdminUI';
import type { RuntimeDefaults, RuntimeEngine, RuntimeFamily, RuntimeVersion } from './types';

export default function RuntimesTab() {
  const [engines, setEngines] = useState<RuntimeEngine[] | null>(null);
  const [defaults, setDefaults] = useState<RuntimeDefaults | null>(null);
  const [editingEngine, setEditingEngine] = useState<RuntimeEngine | null | 'new'>(null);
  const [editingVersion, setEditingVersion] = useState<{ engine: RuntimeEngine; version: RuntimeVersion | null } | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/runtimes/admin/list');
      setEngines(res.data.runtimes);
      setDefaults(res.data.defaults);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not load runtimes');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleEngine(engine: RuntimeEngine) {
    setBusyId(engine.id);
    try {
      await api.patch(`/runtimes/admin/${engine.id}/status`, { enabled: !engine.enabled });
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleVersion(version: RuntimeVersion) {
    setBusyId(version.id);
    try {
      await api.patch(`/runtimes/admin/${version.runtimeEngineId}/versions/${version.id}/status`, {
        enabled: !version.enabled,
      });
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function removeEngine(engine: RuntimeEngine) {
    if (!confirm(`Delete "${engine.name}" and all its versions?`)) return;
    setBusyId(engine.id);
    try {
      await api.delete(`/runtimes/admin/${engine.id}`);
      toast.success(`Deleted ${engine.name}`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not delete — it may still be in use');
    } finally {
      setBusyId(null);
    }
  }

  async function removeVersion(version: RuntimeVersion) {
    if (!confirm(`Delete version "${version.version}"?`)) return;
    setBusyId(version.id);
    try {
      await api.delete(`/runtimes/admin/${version.runtimeEngineId}/versions/${version.id}`);
      toast.success('Version deleted');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not delete — it may still be in use');
    } finally {
      setBusyId(null);
    }
  }

  async function setDefault(engineId: string, versionId: string) {
    try {
      await api.patch('/runtimes/admin/defaults', { runtimeEngineId: engineId, runtimeVersionId: versionId });
      toast.success('Default runtime updated');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not set default');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <StatTile icon={<Cpu size={16} />} label="Runtimes" value={engines?.length ?? 0} accent />
        <PrimaryButton onClick={() => setEditingEngine('new')} className="flex items-center gap-2">
          <Plus size={15} /> New Runtime
        </PrimaryButton>
      </div>

      {defaults && (
        <p className="text-xs text-[#8ea095] mb-4">
          Platform default: {defaults.defaultRuntimeEngine?.name ?? '—'} {defaults.defaultRuntimeVersion?.version ?? ''}
        </p>
      )}

      <div className="space-y-4">
        {engines === null &&
          Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-28 bg-base-800 rounded-lg animate-pulse" />)}

        {engines?.map((engine) => (
          <div key={engine.id} className="rounded-lg border border-base-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-base-900">
              <div className="flex items-center gap-2">
                <span className="text-lg">{engine.icon}</span>
                <div>
                  <p className="font-medium">
                    {engine.name} <span className="text-xs text-[#8ea095] font-mono">({engine.family})</span>
                  </p>
                  <p className="text-xs text-[#8ea095]">{engine.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleEngine(engine)}
                  disabled={busyId === engine.id}
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    engine.enabled
                      ? 'text-green-400 border-green-500/30 bg-green-500/10'
                      : 'text-[#8ea095] border-base-700 bg-base-800'
                  }`}
                >
                  {engine.enabled ? 'Enabled' : 'Disabled'}
                </button>
                <button onClick={() => setEditingEngine(engine)} className="text-[#8ea095] hover:text-white">
                  <Pencil size={14} />
                </button>
                <button onClick={() => removeEngine(engine)} className="text-red-400 hover:text-red-300">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {(engine.versions ?? []).map((v) => (
                  <tr key={v.id} className="border-t border-base-800">
                    <td className="px-4 py-2 w-8">
                      {defaults?.defaultRuntimeVersionId === v.id ? (
                        <Star size={13} className="text-signal-500 fill-signal-500" />
                      ) : (
                        <button
                          title="Set as platform default"
                          onClick={() => setDefault(engine.id, v.id)}
                          className="text-[#8ea095] hover:text-white"
                        >
                          <Star size={13} />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2">{v.version}</td>
                    <td className="px-4 py-2 font-mono text-xs text-[#8ea095]">{v.image}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => toggleVersion(v)}
                        disabled={busyId === v.id}
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          v.enabled
                            ? 'text-green-400 border-green-500/30 bg-green-500/10'
                            : 'text-[#8ea095] border-base-700 bg-base-800'
                        }`}
                      >
                        {v.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => setEditingVersion({ engine, version: v })} className="text-[#8ea095] hover:text-white">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => removeVersion(v)} className="text-red-400 hover:text-red-300">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-base-800">
                  <td className="px-4 py-2" colSpan={5}>
                    <button
                      onClick={() => setEditingVersion({ engine, version: null })}
                      className="text-xs text-signal-500 hover:underline flex items-center gap-1"
                    >
                      <Plus size={12} /> Add version
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {editingEngine && (
        <EngineFormModal engine={editingEngine === 'new' ? null : editingEngine} onClose={() => setEditingEngine(null)} onSaved={load} />
      )}
      {editingVersion && (
        <VersionFormModal
          engine={editingVersion.engine}
          version={editingVersion.version}
          onClose={() => setEditingVersion(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function EngineFormModal({
  engine,
  onClose,
  onSaved,
}: {
  engine: RuntimeEngine | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(engine?.name ?? '');
  const [icon, setIcon] = useState(engine?.icon ?? '');
  const [description, setDescription] = useState(engine?.description ?? '');
  const [family, setFamily] = useState<RuntimeFamily>(engine?.family ?? 'NODEJS');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const payload = { name: name.trim(), icon: icon.trim(), description: description.trim(), family };
    try {
      if (engine) {
        await api.patch(`/runtimes/admin/${engine.id}`, payload);
        toast.success('Runtime saved');
      } else {
        await api.post('/runtimes/admin', payload);
        toast.success('Runtime created');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not save runtime');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal title={engine ? `Edit ${engine.name}` : 'New Runtime'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Deno" />
        </Field>
        <Field label="Icon (emoji)">
          <TextInput value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="⚙️" />
        </Field>
        <Field label="Description">
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Family">
          <select
            value={family}
            onChange={(e) => setFamily(e.target.value as RuntimeFamily)}
            className="w-full rounded-md bg-base-950 border border-base-700 px-3 py-2 outline-none focus:border-signal-500 text-sm"
          >
            <option value="NODEJS">Node.js-style (npm install; node ...)</option>
            <option value="PYTHON">Python-style (pip install; python3 ...)</option>
          </select>
        </Field>
        <div className="flex gap-3 pt-2">
          <PrimaryButton onClick={save} loading={saving} className="flex-1">
            {engine ? 'Save' : 'Create'}
          </PrimaryButton>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        </div>
      </div>
    </AdminModal>
  );
}

function VersionFormModal({
  engine,
  version,
  onClose,
  onSaved,
}: {
  engine: RuntimeEngine;
  version: RuntimeVersion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(version?.version ?? '');
  const [image, setImage] = useState(version?.image ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const payload = { version: label.trim(), image: image.trim() };
    try {
      if (version) {
        await api.patch(`/runtimes/admin/${engine.id}/versions/${version.id}`, payload);
        toast.success('Version saved');
      } else {
        await api.post(`/runtimes/admin/${engine.id}/versions`, payload);
        toast.success('Version added');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not save version');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal title={version ? `Edit version — ${engine.name}` : `Add version — ${engine.name}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Version label">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. 22 LTS" />
        </Field>
        <Field label="Docker image">
          <TextInput value={image} onChange={(e) => setImage(e.target.value)} placeholder="e.g. node:22-alpine" />
        </Field>
        <div className="flex gap-3 pt-2">
          <PrimaryButton onClick={save} loading={saving} className="flex-1">
            {version ? 'Save' : 'Add'}
          </PrimaryButton>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        </div>
      </div>
    </AdminModal>
  );
}
