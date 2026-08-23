'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, BotServer } from '@/lib/api';
import { Plus, Trash2, Download, GitBranch, PackageCheck, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { RowSkeletonList, Skeleton } from '@/components/Skeleton';

interface Backup {
  id: string;
  fileName: string;
  sizeBytes: string;
  createdAt: string;
}

interface RuntimeVersionOption {
  id: string;
  version: string;
  enabled: boolean;
}
interface RuntimeEngineOption {
  id: string;
  name: string;
  icon: string;
  family: 'NODEJS' | 'PYTHON';
  enabled: boolean;
  versions: RuntimeVersionOption[];
}

export default function ServerSettingsPage() {
  const params = useParams();
  const serverId = params.id as string;

  const [server, setServer] = useState<BotServer | null>(null);
  const [name, setName] = useState('');
  const [startupCommand, setStartupCommand] = useState('');
  const [autoRestart, setAutoRestart] = useState(true);
  const [env, setEnv] = useState<{ key: string; value: string }[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [installOutput, setInstallOutput] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [importing, setImporting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [backingUp, setBackingUp] = useState(false);
  const [runtimeCatalog, setRuntimeCatalog] = useState<RuntimeEngineOption[] | null>(null);
  const [engineId, setEngineId] = useState('');
  const [versionId, setVersionId] = useState('');

  async function load() {
    const res = await api.get(`/servers/${serverId}`);
    setServer(res.data);
    setName(res.data.name);
    setStartupCommand(res.data.startupCommand || '');
    setAutoRestart(res.data.autoRestart);
    setEnv(res.data.envVars?.length ? res.data.envVars : [{ key: '', value: '' }]);
    setEngineId(res.data.runtimeEngineId || '');
    setVersionId(res.data.runtimeVersionId || '');
    const b = await api.get(`/servers/${serverId}/backups`);
    setBackups(b.data);
  }

  async function loadRuntimes() {
    try {
      const res = await api.get('/runtimes');
      setRuntimeCatalog(res.data.runtimes);
    } catch {
      // Not fatal — the runtime section just won't render if the catalog
      // can't be reached; every other setting still works normally.
      setRuntimeCatalog([]);
    }
  }

  useEffect(() => {
    load();
    loadRuntimes();
  }, [serverId]);

  const selectedEngine = runtimeCatalog?.find((e) => e.id === engineId);

  function onEngineChange(id: string) {
    setEngineId(id);
    const engine = runtimeCatalog?.find((e) => e.id === id);
    setVersionId(engine?.versions[0]?.id || '');
  }

  async function saveGeneral() {
    setSavingSettings(true);
    try {
      if (name !== server?.name) await api.patch(`/servers/${serverId}/rename`, { name });
      const settingsPayload: any = { startupCommand, autoRestart };
      // Only send a runtime change if one is actually selected — omitting
      // both keeps whatever the server already has (see UpdateSettingsDto).
      if (engineId && versionId) {
        settingsPayload.runtimeEngineId = engineId;
        settingsPayload.runtimeVersionId = versionId;
      }
      await api.patch(`/servers/${serverId}/settings`, settingsPayload);
      const envObj = Object.fromEntries(env.filter((e) => e.key.trim()).map((e) => [e.key.trim(), e.value]));
      await api.patch(`/servers/${serverId}/env`, { env: envObj });
      await load();
      toast.success('Settings saved — restart the server for a runtime change to take effect');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  }

  async function installDeps() {
    setInstalling(true);
    setInstallOutput(null);
    try {
      const res = await api.post(`/servers/${serverId}/install`);
      setInstallOutput(res.data.output || 'Done.');
      toast.success('Dependencies installed');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Install failed';
      setInstallOutput(msg);
      toast.error(msg);
    } finally {
      setInstalling(false);
    }
  }

  async function importRepo() {
    if (!repoUrl.trim()) return;
    setImporting(true);
    try {
      await api.post(`/servers/${serverId}/github-import`, { repoUrl, branch: branch.trim() || undefined });
      toast.success('Repository imported');
      setRepoUrl('');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  async function pullLatest() {
    setPulling(true);
    try {
      const res = await api.post(`/servers/${serverId}/github-pull`);
      const changed = res.data.files?.length ?? 0;
      toast.success(changed > 0 ? `Pulled latest — ${changed} file${changed === 1 ? '' : 's'} changed` : 'Already up to date');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Pull failed');
    } finally {
      setPulling(false);
    }
  }

  async function createBackup() {
    setBackingUp(true);
    try {
      await api.post(`/servers/${serverId}/backups`);
      const b = await api.get(`/servers/${serverId}/backups`);
      setBackups(b.data);
      toast.success('Backup created');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Backup failed');
    } finally {
      setBackingUp(false);
    }
  }

  async function restoreBackup(id: string) {
    if (!confirm('Restore this backup? Current files will be replaced.')) return;
    try {
      await api.post(`/servers/${serverId}/backups/${id}/restore`);
      toast.success('Backup restored');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Restore failed');
    }
  }

  async function deleteBackup(id: string) {
    if (!confirm('Delete this backup?')) return;
    try {
      await api.delete(`/servers/${serverId}/backups/${id}`);
      setBackups((prev) => prev.filter((b) => b.id !== id));
      toast.success('Backup deleted');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete backup');
    }
  }

  if (!server)
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="rounded-lg border border-base-700 bg-base-900/60 p-5 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
        <RowSkeletonList count={3} />
      </div>
    );

  return (
    <div className="space-y-6 max-w-2xl">
      {/* General */}
      <Section title="General">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </Field>
        <Field label="Startup command">
          <input value={startupCommand} onChange={(e) => setStartupCommand(e.target.value)} className="input font-mono" />
        </Field>
        {runtimeCatalog && runtimeCatalog.length > 0 && (
          <Field label="Runtime">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={engineId}
                onChange={(e) => onEngineChange(e.target.value)}
                className="input"
              >
                {!engineId && <option value="">Use platform default</option>}
                {runtimeCatalog.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.icon} {e.name}
                  </option>
                ))}
              </select>
              <select
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
                disabled={!selectedEngine}
                className="input disabled:opacity-50"
              >
                {selectedEngine?.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.version}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-[#8ea095] mt-1">
              Changing this takes effect the next time the server is (re)started.
            </p>
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm text-[#a9bdb2]">
          <input type="checkbox" checked={autoRestart} onChange={(e) => setAutoRestart(e.target.checked)} />
          Auto-restart on crash
        </label>

        <div className="pt-2">
          <p className="text-sm text-[#a9bdb2] mb-2">Environment variables</p>
          <div className="space-y-2">
            {env.map((e, i) => (
              <div key={i} className="flex flex-col sm:flex-row gap-2">
                <input
                  placeholder="KEY"
                  value={e.key}
                  onChange={(ev) => setEnv((prev) => prev.map((x, j) => (j === i ? { ...x, key: ev.target.value.toUpperCase() } : x)))}
                  className="input font-mono w-full sm:w-1/3"
                />
                <input
                  placeholder="value"
                  value={e.value}
                  onChange={(ev) => setEnv((prev) => prev.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)))}
                  className="input font-mono flex-1"
                />
                <button onClick={() => setEnv((prev) => prev.filter((_, j) => j !== i))} className="self-end sm:self-auto text-[#8ea095] hover:text-red-400 px-2">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={() => setEnv((prev) => [...prev, { key: '', value: '' }])}
              className="flex items-center gap-1 text-xs text-signal-500 hover:underline"
            >
              <Plus size={12} /> Add variable
            </button>
          </div>
        </div>

        <button
          onClick={saveGeneral}
          disabled={savingSettings}
          className="flex items-center gap-2 rounded-md bg-signal-500 text-base-950 font-medium px-4 py-2 hover:bg-signal-400 transition-colors disabled:opacity-60 mt-2"
        >
          <Save size={14} /> {savingSettings ? 'Saving…' : 'Save changes'}
        </button>
      </Section>

      {/* Dependencies */}
      <Section title="Dependencies">
        <p className="text-sm text-[#8ea095]">
          Auto-detects <code className="font-mono">package.json</code> or <code className="font-mono">requirements.txt</code> and installs.
        </p>
        <button
          onClick={installDeps}
          disabled={installing}
          className="flex items-center gap-2 text-sm border border-base-700 rounded-md px-4 py-2 hover:border-signal-500/50 hover:text-signal-500 transition-colors disabled:opacity-60 w-fit"
        >
          <PackageCheck size={14} /> {installing ? 'Installing…' : 'Install dependencies'}
        </button>
        {installOutput && (
          <pre className="bg-black/40 rounded-md p-3 text-xs font-mono max-h-48 overflow-y-auto scrollbar-thin whitespace-pre-wrap">
            {installOutput}
          </pre>
        )}
      </Section>

      {/* GitHub import */}
      <Section title="Import from GitHub">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="input font-mono flex-1"
          />
          <input
            placeholder="branch (optional)"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="input font-mono sm:w-40"
          />
          <button
            onClick={importRepo}
            disabled={importing}
            className="flex items-center justify-center gap-2 text-sm border border-base-700 rounded-md px-4 py-2 sm:py-0 hover:border-signal-500/50 hover:text-signal-500 transition-colors disabled:opacity-60"
          >
            <GitBranch size={14} /> {importing ? 'Cloning…' : 'Clone'}
          </button>
        </div>
        <p className="text-xs text-[#8ea095] mt-2">
          Already imported this server from GitHub?{' '}
          <button onClick={pullLatest} disabled={pulling} className="text-signal-500 hover:underline disabled:opacity-60">
            {pulling ? 'Pulling…' : 'Pull latest changes'}
          </button>
        </p>
      </Section>

      {/* Backups */}
      <Section title="Backups">
        <button
          onClick={createBackup}
          disabled={backingUp}
          className="flex items-center gap-2 text-sm border border-base-700 rounded-md px-4 py-2 hover:border-signal-500/50 hover:text-signal-500 transition-colors disabled:opacity-60 w-fit"
        >
          <Download size={14} /> {backingUp ? 'Backing up…' : 'Create backup'}
        </button>

        {backups.length > 0 && (
          <div className="mt-2 divide-y divide-base-800 border border-base-800 rounded-md">
            {backups.map((b) => (
              <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <p className="font-mono text-xs break-all">{b.fileName}</p>
                  <p className="text-[#8ea095] text-xs">{new Date(b.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => restoreBackup(b.id)} className="text-xs text-signal-500 hover:underline">
                    Restore
                  </button>
                  <button onClick={() => deleteBackup(b.id)} className="text-xs text-red-400 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <style jsx global>{`
        .input {
          margin-top: 0.25rem;
          width: 100%;
          border-radius: 0.375rem;
          background: #0a0f0d;
          border: 1px solid #212e28;
          padding: 0.5rem 0.75rem;
          outline: none;
        }
        .input:focus {
          border-color: #3fe07d;
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-base-700 bg-base-900/60 p-5 space-y-3">
      <h2 className="font-medium">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm text-[#a9bdb2]">{label}</label>
      {children}
    </div>
  );
}
