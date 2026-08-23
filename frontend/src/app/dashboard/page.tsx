'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, BotServer } from '@/lib/api';
import Navbar from '@/components/Navbar';
import ServerCard from '@/components/ServerCard';
import { ServerCardSkeletonGrid } from '@/components/Skeleton';
import FreePlanModal from '@/components/FreePlanModal';
import { Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';

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

export default function DashboardPage() {
  const router = useRouter();
  const [servers, setServers] = useState<BotServer[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showFreePlanModal, setShowFreePlanModal] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [runtimeCatalog, setRuntimeCatalog] = useState<RuntimeEngineOption[] | null>(null);
  const [engineId, setEngineId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const res = await api.get('/servers');
      setServers(res.data);
    } catch {
      router.push('/login');
    }
  }

  async function loadRuntimes() {
    try {
      const res = await api.get('/runtimes');
      const engines: RuntimeEngineOption[] = res.data.runtimes;
      setRuntimeCatalog(engines);
      const defaultEngineId = res.data.defaults?.defaultRuntimeEngineId;
      const defaultVersionId = res.data.defaults?.defaultRuntimeVersionId;
      const fallbackEngine = engines.find((e) => e.id === defaultEngineId) || engines[0];
      setEngineId(fallbackEngine?.id || '');
      const fallbackVersion =
        fallbackEngine?.versions.find((v) => v.id === defaultVersionId) || fallbackEngine?.versions[0];
      setVersionId(fallbackVersion?.id || '');
    } catch {
      // Catalog failed to load — Create Server still works using the
      // platform-wide default resolved server-side (see ServersService).
      setRuntimeCatalog([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (showCreate && runtimeCatalog === null) loadRuntimes();
  }, [showCreate]);

  const selectedEngine = runtimeCatalog?.find((e) => e.id === engineId);

  function onEngineChange(id: string) {
    setEngineId(id);
    const engine = runtimeCatalog?.find((e) => e.id === id);
    setVersionId(engine?.versions[0]?.id || '');
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      // Legacy `runtime` field is still required by the API — derived from
      // the selected engine's family when a catalog runtime is picked, so
      // the two never disagree (see ServersService.create).
      const runtime = selectedEngine?.family || 'NODEJS';
      const payload: any = { name, description, runtime };
      if (engineId && versionId) {
        payload.runtimeEngineId = engineId;
        payload.runtimeVersionId = versionId;
      }
      const res = await api.post('/servers', payload);
      setShowCreate(false);
      setName('');
      setDescription('');
      router.push(`/dashboard/servers/${res.data.id}`);
    } catch (err: any) {
      if (err?.response?.data?.freePlanLimit) {
        setShowCreate(false);
        setShowFreePlanModal(true);
      } else {
        const msg = err?.response?.data?.message || 'Could not create server';
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold">Your servers</h1>
            <p className="text-sm text-[#8ea095] mt-1">Each server runs in its own isolated container.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center justify-center gap-2 rounded-md bg-signal-500 text-base-950 font-medium px-4 py-2 hover:bg-signal-400 transition-colors w-full sm:w-auto"
          >
            <Plus size={16} /> New server
          </button>
        </div>

        {servers === null && <ServerCardSkeletonGrid />}
        {servers?.length === 0 && (
          <div className="rounded-lg border border-dashed border-base-700 py-16 text-center text-[#8ea095]">
            No servers yet. Create your first one to get started.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers?.map((s) => (
            <ServerCard key={s.id} server={s} />
          ))}
        </div>
      </main>

      {showCreate && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center px-4 sm:px-6">
          <div className="w-full max-w-md rounded-lg border border-base-700 bg-base-900 p-5 sm:p-6 max-h-[90vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium">Create server</h2>
              <button onClick={() => setShowCreate(false)} className="text-[#8ea095] hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={onCreate} className="space-y-4">
              <div>
                <label className="text-sm text-[#a9bdb2]">Name</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md bg-base-950 border border-base-700 px-3 py-2 outline-none focus:border-signal-500"
                />
              </div>
              <div>
                <label className="text-sm text-[#a9bdb2]">Description (optional)</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-md bg-base-950 border border-base-700 px-3 py-2 outline-none focus:border-signal-500"
                />
              </div>
              <div>
                <label className="text-sm text-[#a9bdb2]">Runtime</label>
                {runtimeCatalog === null && (
                  <div className="mt-1 h-9 bg-base-800 rounded-md animate-pulse" />
                )}
                {runtimeCatalog?.length === 0 && (
                  <p className="mt-1 text-xs text-[#8ea095]">Using the platform default runtime.</p>
                )}
                {runtimeCatalog && runtimeCatalog.length > 0 && (
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <select
                      value={engineId}
                      onChange={(e) => onEngineChange(e.target.value)}
                      className="rounded-md bg-base-950 border border-base-700 px-3 py-2 text-sm outline-none focus:border-signal-500"
                    >
                      {runtimeCatalog.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.icon} {e.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={versionId}
                      onChange={(e) => setVersionId(e.target.value)}
                      className="rounded-md bg-base-950 border border-base-700 px-3 py-2 text-sm outline-none focus:border-signal-500"
                    >
                      {selectedEngine?.versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.version}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-md bg-signal-500 text-base-950 font-medium py-2 hover:bg-signal-400 transition-colors disabled:opacity-60"
              >
                {creating ? 'Creating…' : 'Create server'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showFreePlanModal && <FreePlanModal onClose={() => setShowFreePlanModal(false)} />}
    </div>
  );
}
