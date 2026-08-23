'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Play, Square, RotateCw, PlugZap, Bot } from 'lucide-react';
import { Field, TextInput, PrimaryButton, SecondaryButton } from './AdminUI';

interface DiscordSettings {
  botTokenSet: boolean;
  botTokenPreview: string;
  clientId: string;
  guildId: string;
  ownerDiscordId: string;
  desiredState: string;
  updatedAt: string;
}

interface DiscordStatus {
  status: 'stopped' | 'connecting' | 'online' | 'error';
  lastError: string | null;
  lastConnectedAt: string | null;
  botTag: string | null;
}

interface CommandLogEntry {
  id: string;
  discordUserId: string | null;
  discordUsername: string | null;
  command: string;
  status: string;
  detail: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  online: 'text-green-400 border-green-500/30 bg-green-500/10',
  connecting: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  error: 'text-red-400 border-red-500/30 bg-red-500/10',
  stopped: 'text-[#8ea095] border-base-700 bg-base-800',
};

export default function DiscordBotTab() {
  const [settings, setSettings] = useState<DiscordSettings | null>(null);
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [logs, setLogs] = useState<CommandLogEntry[] | null>(null);

  const [botToken, setBotToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [guildId, setGuildId] = useState('');
  const [ownerDiscordId, setOwnerDiscordId] = useState('');

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, st, l] = await Promise.all([
        api.get('/discord-bot/settings'),
        api.get('/discord-bot/status'),
        api.get('/discord-bot/logs?limit=50'),
      ]);
      setSettings(s.data.settings);
      setClientId(s.data.settings.clientId);
      setGuildId(s.data.settings.guildId);
      setOwnerDiscordId(s.data.settings.ownerDiscordId);
      setStatus(st.data.status);
      setLogs(l.data.logs);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not load Discord bot settings');
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(async () => {
      try {
        const st = await api.get('/discord-bot/status');
        setStatus(st.data.status);
      } catch {
        // transient — next tick will retry
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const payload: any = { clientId, guildId, ownerDiscordId };
      if (botToken.trim()) payload.botToken = botToken.trim();
      const res = await api.post('/discord-bot/settings', payload);
      setBotToken('');
      toast.success(res.data.autoStartWarning ? `Saved, but: ${res.data.autoStartWarning}` : 'Settings saved');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const payload: any = { clientId, guildId };
      if (botToken.trim()) payload.botToken = botToken.trim();
      const res = await api.post('/discord-bot/test-connection', payload);
      toast.success(res.data.message);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Connection test failed');
    } finally {
      setTesting(false);
    }
  }

  async function action(name: string, path: string) {
    setBusy(name);
    try {
      const res = await api.post(`/discord-bot/${path}`);
      toast.success(res.data.message);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-base-700 bg-base-900/60 p-5 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Bot size={20} className="text-signal-500" />
          <div>
            <p className="font-medium">
              {status ? (
                <span className={`text-xs px-2 py-0.5 rounded-full border mr-2 ${STATUS_STYLES[status.status]}`}>
                  {status.status}
                </span>
              ) : null}
              {status?.botTag || 'Not connected'}
            </p>
            {status?.lastError && <p className="text-xs text-red-400 mt-1">{status.lastError}</p>}
            {status?.lastConnectedAt && (
              <p className="text-xs text-[#8ea095] mt-1">Last connected: {new Date(status.lastConnectedAt).toLocaleString()}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={() => action('start', 'start')} disabled={busy === 'start' || status?.status === 'online'}>
            <Play size={13} className="inline mr-1" /> Start
          </SecondaryButton>
          <SecondaryButton onClick={() => action('restart', 'restart')} disabled={busy === 'restart'}>
            <RotateCw size={13} className="inline mr-1" /> Restart
          </SecondaryButton>
          <SecondaryButton onClick={() => action('stop', 'stop')} disabled={busy === 'stop' || status?.status === 'stopped'}>
            <Square size={13} className="inline mr-1" /> Stop
          </SecondaryButton>
        </div>
      </div>

      <div className="rounded-lg border border-base-700 bg-base-900/60 p-5 sm:p-6">
        <h3 className="text-sm font-medium mb-4">Bot configuration</h3>
        <div className="space-y-4 max-w-lg">
          <Field label={`Bot Token${settings?.botTokenSet ? ` (currently: ${settings.botTokenPreview})` : ''}`}>
            <TextInput
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder={settings?.botTokenSet ? 'Leave blank to keep current token' : 'Paste bot token'}
            />
          </Field>
          <Field label="Client ID">
            <TextInput value={clientId} onChange={(e) => setClientId(e.target.value)} />
          </Field>
          <Field label="Guild ID (server)">
            <TextInput value={guildId} onChange={(e) => setGuildId(e.target.value)} />
          </Field>
          <Field label="Owner Discord ID (only this user can run commands)">
            <TextInput value={ownerDiscordId} onChange={(e) => setOwnerDiscordId(e.target.value)} />
          </Field>
          <div className="flex gap-3 pt-2">
            <PrimaryButton onClick={save} loading={saving}>
              Save settings
            </PrimaryButton>
            <SecondaryButton onClick={testConnection} disabled={testing}>
              <PlugZap size={13} className="inline mr-1" /> {testing ? 'Testing…' : 'Test connection'}
            </SecondaryButton>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">Recent command activity</h3>
        <div className="rounded-lg border border-base-700 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-base-900 text-[#8ea095] text-left">
              <tr>
                <th className="px-4 py-2 font-normal">Discord user</th>
                <th className="px-4 py-2 font-normal">Command</th>
                <th className="px-4 py-2 font-normal">Status</th>
                <th className="px-4 py-2 font-normal">Detail</th>
                <th className="px-4 py-2 font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              {logs === null &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-t border-base-800">
                    <td className="px-4 py-3" colSpan={5}>
                      <div className="h-4 bg-base-800 rounded animate-pulse w-full" />
                    </td>
                  </tr>
                ))}
              {logs !== null && logs.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-[#8ea095]" colSpan={5}>
                    No commands run yet.
                  </td>
                </tr>
              )}
              {logs?.map((l) => (
                <tr key={l.id} className="border-t border-base-800">
                  <td className="px-4 py-3">{l.discordUsername || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">/{l.command}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        l.status === 'success'
                          ? 'text-green-400 border-green-500/30 bg-green-500/10'
                          : l.status === 'denied'
                            ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                            : 'text-red-400 border-red-500/30 bg-red-500/10'
                      }`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#8ea095]">{l.detail || '—'}</td>
                  <td className="px-4 py-3 text-xs text-[#8ea095] font-mono">{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
