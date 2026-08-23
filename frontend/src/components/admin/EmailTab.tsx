'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Save, Send, Plus, X, RefreshCw } from 'lucide-react';
import { Field, TextInput, PrimaryButton, SecondaryButton } from './AdminUI';

interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordSet: boolean;
  senderName: string;
  senderEmail: string;
}

interface EmailTemplate {
  type: string;
  subject: string;
  title: string;
  body: string;
  footer: string;
}

interface ValidationSettings {
  enabled: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
}

interface EmailLogRow {
  id: string;
  type: string;
  toEmail: string;
  status: string;
  error: string | null;
  createdAt: string;
}

type SubTab = 'smtp' | 'templates' | 'validation' | 'logs';

// Admin > Email tab: four sub-panels covering everything the SMTP /
// template / disposable-email-blocking / delivery-log system needs.
// Mirrors the structure of the other admin tabs (self-contained, owns its
// own fetch + local edit state) so it slots into AdminSidebar/page.tsx the
// same way BrandingTab and PremiumTab do.
export default function EmailTab() {
  const [sub, setSub] = useState<SubTab>('smtp');

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-base-700">
        {(['smtp', 'templates', 'validation', 'logs'] as SubTab[]).map((s) => (
          <button
            key={s}
            onClick={() => setSub(s)}
            className={`px-3 py-2 text-sm capitalize border-b-2 -mb-px transition-colors ${
              sub === s ? 'border-signal-500 text-signal-500' : 'border-transparent text-[#8ea095] hover:text-white'
            }`}
          >
            {s === 'smtp' ? 'SMTP' : s}
          </button>
        ))}
      </div>

      {sub === 'smtp' && <SmtpPanel />}
      {sub === 'templates' && <TemplatesPanel />}
      {sub === 'validation' && <ValidationPanel />}
      {sub === 'logs' && <LogsPanel />}
    </div>
  );
}

function SmtpPanel() {
  const [form, setForm] = useState<SmtpSettings | null>(null);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);

  async function load() {
    const res = await api.get('/email-settings/smtp');
    setForm(res.data);
  }
  useEffect(() => {
    load().catch(() => toast.error('Could not load SMTP settings'));
  }, []);

  if (!form) return <div className="h-48 rounded-lg border border-base-700 bg-base-900/40 animate-pulse" />;

  function update<K extends keyof SmtpSettings>(key: K, value: SmtpSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      await api.patch('/email-settings/smtp', {
        host: form.host,
        port: Number(form.port),
        secure: form.secure,
        username: form.username,
        password: password || undefined,
        senderName: form.senderName,
        senderEmail: form.senderEmail,
      });
      toast.success('SMTP settings saved');
      setPassword('');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not save SMTP settings');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!testTo) return;
    setTesting(true);
    try {
      const res = await api.post('/email-settings/smtp/test', { to: testTo });
      if (res.data?.skipped) toast.error(res.data.reason || 'Email was skipped');
      else toast.success(`Test email sent to ${testTo}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to send test email');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl">
      <div className="space-y-4">
        <Field label="SMTP Host">
          <TextInput
            placeholder="smtp.mailprovider.com"
            value={form.host}
            onChange={(e) => update('host', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Port">
            <TextInput type="number" value={form.port} onChange={(e) => update('port', parseInt(e.target.value, 10) || 0)} />
          </Field>
          <Field label="Use TLS (secure)">
            <select
              value={form.secure ? 'true' : 'false'}
              onChange={(e) => update('secure', e.target.value === 'true')}
              className="w-full rounded-md bg-base-950 border border-base-700 px-3 py-2 outline-none focus:border-signal-500 text-sm"
            >
              <option value="false">No (STARTTLS / port 587)</option>
              <option value="true">Yes (port 465)</option>
            </select>
          </Field>
        </div>
        <Field label="Username">
          <TextInput value={form.username} onChange={(e) => update('username', e.target.value)} />
        </Field>
        <Field label={form.passwordSet ? 'Password (leave blank to keep current)' : 'Password'}>
          <TextInput
            type="password"
            placeholder={form.passwordSet ? '••••••••' : ''}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Sender name">
            <TextInput value={form.senderName} onChange={(e) => update('senderName', e.target.value)} />
          </Field>
          <Field label="Sender email">
            <TextInput type="email" value={form.senderEmail} onChange={(e) => update('senderEmail', e.target.value)} />
          </Field>
        </div>
        <PrimaryButton onClick={save} loading={saving} className="flex items-center gap-2">
          <Save size={15} /> Save SMTP settings
        </PrimaryButton>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-[#a9bdb2]">Send a test email</h3>
        <p className="text-xs text-[#8ea095]">
          Verifies the settings above actually work end-to-end. Save first if you just changed anything.
        </p>
        <div className="flex gap-2">
          <TextInput
            type="email"
            placeholder="you@example.com"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
          />
          <SecondaryButton onClick={sendTest} disabled={testing || !testTo} className="flex items-center gap-2 shrink-0">
            <Send size={14} /> {testing ? 'Sending…' : 'Send test'}
          </SecondaryButton>
        </div>
        {!form.host && (
          <p className="text-xs text-amber-400">
            No SMTP host configured yet — emails will be logged to the server console instead of delivered.
          </p>
        )}
      </div>
    </div>
  );
}

function TemplatesPanel() {
  const [types, setTypes] = useState<EmailTemplate[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [form, setForm] = useState<EmailTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await api.get('/email-settings/templates');
    setTypes(res.data);
    if (!active && res.data.length) setActive(res.data[0].type);
  }
  useEffect(() => {
    load().catch(() => toast.error('Could not load email templates'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active) return;
    const existing = types?.find((t) => t.type === active);
    if (existing) setForm(existing);
  }, [active, types]);

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      await api.patch(`/email-settings/templates/${form.type}`, {
        subject: form.subject,
        title: form.title,
        body: form.body,
        footer: form.footer,
      });
      toast.success('Template saved');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not save template');
    } finally {
      setSaving(false);
    }
  }

  if (!types) return <div className="h-64 rounded-lg border border-base-700 bg-base-900/40 animate-pulse" />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
      <div className="space-y-1">
        {types.map((t) => (
          <button
            key={t.type}
            onClick={() => setActive(t.type)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              active === t.type
                ? 'bg-signal-500/10 text-signal-500 border border-signal-500/30'
                : 'text-[#a9bdb2] hover:text-white hover:bg-base-800 border border-transparent'
            }`}
          >
            {t.type.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {form && (
        <div className="space-y-4 max-w-2xl">
          <Field label="Subject">
            <TextInput value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </Field>
          <Field label="Email title">
            <TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Body (supports {{variables}} like {{username}}, {{code}}, {{expiresInMinutes}})">
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={6}
              className="w-full rounded-md bg-base-950 border border-base-700 px-3 py-2 outline-none focus:border-signal-500 text-sm font-mono"
            />
          </Field>
          <Field label="Footer">
            <textarea
              value={form.footer}
              onChange={(e) => setForm({ ...form, footer: e.target.value })}
              rows={2}
              className="w-full rounded-md bg-base-950 border border-base-700 px-3 py-2 outline-none focus:border-signal-500 text-sm"
            />
          </Field>
          <PrimaryButton onClick={save} loading={saving} className="flex items-center gap-2">
            <Save size={15} /> Save template
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}

function ValidationPanel() {
  const [settings, setSettings] = useState<ValidationSettings | null>(null);
  const [newAllowed, setNewAllowed] = useState('');
  const [newBlocked, setNewBlocked] = useState('');

  async function load() {
    const res = await api.get('/email-settings/validation');
    setSettings(res.data);
  }
  useEffect(() => {
    load().catch(() => toast.error('Could not load email validation settings'));
  }, []);

  if (!settings) return <div className="h-48 rounded-lg border border-base-700 bg-base-900/40 animate-pulse" />;

  async function toggleEnabled() {
    try {
      await api.patch('/email-settings/validation', { enabled: !settings!.enabled });
      load();
    } catch {
      toast.error('Could not update setting');
    }
  }

  async function addDomain(field: 'allowed' | 'blocked') {
    const domain = field === 'allowed' ? newAllowed : newBlocked;
    if (!domain.trim()) return;
    try {
      await api.post(`/email-settings/validation/${field}`, { domain: domain.trim() });
      field === 'allowed' ? setNewAllowed('') : setNewBlocked('');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not add domain');
    }
  }

  async function removeDomain(field: 'allowed' | 'blocked', domain: string) {
    try {
      await api.delete(`/email-settings/validation/${field}/${encodeURIComponent(domain)}`);
      load();
    } catch {
      toast.error('Could not remove domain');
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between rounded-lg border border-base-700 bg-base-900/60 p-4">
        <div>
          <div className="text-sm font-medium">Block disposable / temporary emails</div>
          <div className="text-xs text-[#8ea095] mt-0.5">
            Applies the allow/block lists below to every new registration.
          </div>
        </div>
        <button
          onClick={toggleEnabled}
          className={`relative w-10 h-6 rounded-full transition-colors ${settings.enabled ? 'bg-signal-500' : 'bg-base-700'}`}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
              settings.enabled ? 'translate-x-4' : ''
            }`}
          />
        </button>
      </div>

      <DomainList
        title="Blocked domains"
        hint="Registrations from these domains are rejected (e.g. disposable-email providers)."
        domains={settings.blockedDomains}
        value={newBlocked}
        onChange={setNewBlocked}
        onAdd={() => addDomain('blocked')}
        onRemove={(d) => removeDomain('blocked', d)}
      />

      <DomainList
        title="Allowed domains"
        hint="If non-empty, ONLY these domains may register (everything else is blocked)."
        domains={settings.allowedDomains}
        value={newAllowed}
        onChange={setNewAllowed}
        onAdd={() => addDomain('allowed')}
        onRemove={(d) => removeDomain('allowed', d)}
      />
    </div>
  );
}

function DomainList({
  title,
  hint,
  domains,
  value,
  onChange,
  onAdd,
  onRemove,
}: {
  title: string;
  hint: string;
  domains: string[];
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (domain: string) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-[#a9bdb2]">{title}</h3>
      <p className="text-xs text-[#8ea095] mt-0.5 mb-3">{hint}</p>
      <div className="flex gap-2 mb-3">
        <TextInput placeholder="example.com" value={value} onChange={(e) => onChange(e.target.value)} />
        <SecondaryButton onClick={onAdd} className="flex items-center gap-1 shrink-0">
          <Plus size={14} /> Add
        </SecondaryButton>
      </div>
      <div className="flex flex-wrap gap-2">
        {domains.map((d) => (
          <span
            key={d}
            className="inline-flex items-center gap-1.5 rounded-full border border-base-700 bg-base-900/60 px-3 py-1 text-xs"
          >
            {d}
            <button onClick={() => onRemove(d)} className="text-[#8ea095] hover:text-red-400">
              <X size={12} />
            </button>
          </span>
        ))}
        {domains.length === 0 && <span className="text-xs text-[#8ea095]">None</span>}
      </div>
    </div>
  );
}

function LogsPanel() {
  const [logs, setLogs] = useState<EmailLogRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/email-settings/logs');
      setLogs(res.data);
    } catch {
      toast.error('Could not load email logs');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const statusColor: Record<string, string> = {
    sent: 'text-signal-500',
    skipped: 'text-amber-400',
    failed: 'text-red-400',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-[#a9bdb2]">Recent send attempts</h3>
        <SecondaryButton onClick={load} className="flex items-center gap-1.5">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </SecondaryButton>
      </div>
      <div className="rounded-lg border border-base-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-base-900/60 text-[#8ea095] text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Time</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">To</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {(logs || []).map((l) => (
              <tr key={l.id} className="border-t border-base-800">
                <td className="px-3 py-2 text-[#8ea095] whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2">{l.type}</td>
                <td className="px-3 py-2">{l.toEmail}</td>
                <td className={`px-3 py-2 font-medium ${statusColor[l.status] || ''}`}>{l.status}</td>
                <td className="px-3 py-2 text-[#8ea095]">{l.error || '—'}</td>
              </tr>
            ))}
            {logs && logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[#8ea095]">
                  No emails sent yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
