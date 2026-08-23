'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { resolveAssetUrl, useRefreshBranding, type Branding } from '@/lib/branding';
import toast from 'react-hot-toast';
import { Upload, Mail, MessageCircle, Save } from 'lucide-react';
import { Field, TextInput, PrimaryButton } from './AdminUI';

export default function BrandingTab({ branding, reload }: { branding: Branding | null; reload: () => void }) {
  const refreshGlobalBranding = useRefreshBranding();
  const [form, setForm] = useState<Branding | null>(branding);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // Keep local edit form in sync whenever a fresh branding row lands from
  // the parent (initial load, or after a save/upload round-trip).
  if (branding && form === null) setForm(branding);

  if (!form) {
    return <div className="h-64 rounded-lg border border-base-700 bg-base-900/40 animate-pulse" />;
  }

  function update<K extends keyof Branding>(key: K, value: Branding[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const { maintenanceMode: _mm, ...rest } = form;
      await api.patch('/branding', rest);
      toast.success('Branding saved');
      reload();
      refreshGlobalBranding();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not save branding');
    } finally {
      setSaving(false);
    }
  }

  async function upload(kind: 'logo' | 'favicon', file: File) {
    const setBusy = kind === 'logo' ? setUploadingLogo : setUploadingFavicon;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await api.post(`/branding/upload/${kind}`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      update(kind === 'logo' ? 'logoUrl' : 'faviconUrl', kind === 'logo' ? res.data.logoUrl : res.data.faviconUrl);
      toast.success(`${kind === 'logo' ? 'Logo' : 'Favicon'} uploaded`);
      reload();
      refreshGlobalBranding();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || `Could not upload ${kind}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-medium text-[#a9bdb2] mb-3">Identity</h3>
          <div className="space-y-4">
            <Field label="Hosting name">
              <TextInput value={form.hostingName} onChange={(e) => update('hostingName', e.target.value)} />
            </Field>
            <Field label="Browser title">
              <TextInput value={form.browserTitle} onChange={(e) => update('browserTitle', e.target.value)} />
            </Field>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-[#a9bdb2] mb-3">Images</h3>
          <div className="grid grid-cols-2 gap-4">
            <ImageUploadField
              label="Logo"
              url={resolveAssetUrl(form.logoUrl)}
              uploading={uploadingLogo}
              inputRef={logoInputRef}
              onFile={(f) => upload('logo', f)}
            />
            <ImageUploadField
              label="Favicon"
              url={resolveAssetUrl(form.faviconUrl)}
              uploading={uploadingFavicon}
              inputRef={faviconInputRef}
              onFile={(f) => upload('favicon', f)}
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-[#a9bdb2] mb-3">Contact</h3>
          <div className="space-y-4">
            <Field label="Discord invite URL">
              <TextInput
                placeholder="https://discord.gg/…"
                value={form.discordInvite || ''}
                onChange={(e) => update('discordInvite', e.target.value)}
              />
            </Field>
            <Field label="Support email">
              <TextInput
                type="email"
                placeholder="support@example.com"
                value={form.supportEmail || ''}
                onChange={(e) => update('supportEmail', e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-[#a9bdb2] mb-3">Theme colors</h3>
          <div className="grid grid-cols-2 gap-4">
            <ColorField label="Primary (signal)" value={form.themeColor} onChange={(v) => update('themeColor', v)} />
            <ColorField
              label="Background (base)"
              value={form.secondaryThemeColor}
              onChange={(v) => update('secondaryThemeColor', v)}
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-[#a9bdb2] mb-3">Footer</h3>
          <Field label="Footer text">
            <TextInput value={form.footerText} onChange={(e) => update('footerText', e.target.value)} />
          </Field>
        </section>

        <PrimaryButton onClick={save} loading={saving} className="flex items-center gap-2">
          <Save size={15} /> Save changes
        </PrimaryButton>
      </div>

      <LivePreview form={form} />
    </div>
  );
}

function ImageUploadField({
  label,
  url,
  uploading,
  inputRef,
  onFile,
}: {
  label: string;
  url: string | null;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onFile: (file: File) => void;
}) {
  return (
    <div>
      <label className="text-sm text-[#a9bdb2]">{label}</label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="mt-1 w-full aspect-square rounded-md border border-dashed border-base-700 hover:border-signal-500/50 transition-colors flex flex-col items-center justify-center gap-2 text-[#8ea095] overflow-hidden disabled:opacity-60"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded, arbitrary origin
          <img src={url} alt={label} className="w-full h-full object-contain p-3" />
        ) : (
          <>
            <Upload size={20} />
            <span className="text-xs">{uploading ? 'Uploading…' : 'Click to upload'}</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-md border border-base-700 bg-base-950 cursor-pointer shrink-0"
        />
        <TextInput value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  );
}

function LivePreview({ form }: { form: Branding }) {
  const logoUrl = resolveAssetUrl(form.logoUrl);

  return (
    <div className="lg:sticky lg:top-20 h-fit">
      <h3 className="text-sm font-medium text-[#a9bdb2] mb-3">Live preview</h3>
      <div
        className="rounded-lg border border-base-700 overflow-hidden"
        style={{ backgroundColor: form.secondaryThemeColor }}
      >
        <div className="flex items-center gap-2 px-4 h-12 border-b" style={{ borderColor: `${form.themeColor}33` }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview of admin-uploaded asset
            <img src={logoUrl} alt="" width={20} height={20} className="rounded object-contain" />
          ) : (
            <div className="w-5 h-5 rounded" style={{ backgroundColor: form.themeColor }} />
          )}
          <span className="font-mono text-sm" style={{ color: form.themeColor }}>
            {form.hostingName || 'Hosting name'}
          </span>
        </div>

        <div className="p-4 space-y-3">
          <div className="h-3 w-3/4 rounded bg-white/10" />
          <div className="h-3 w-1/2 rounded bg-white/10" />
          <button
            className="text-xs font-medium px-3 py-1.5 rounded-md"
            style={{ backgroundColor: form.themeColor, color: form.secondaryThemeColor }}
          >
            Sample button
          </button>
        </div>

        <div
          className="px-4 py-3 border-t flex items-center justify-between text-xs"
          style={{ borderColor: `${form.themeColor}33`, color: `${form.themeColor}99` }}
        >
          <span>
            © {new Date().getFullYear()} {form.hostingName}. {form.footerText}
          </span>
          <div className="flex items-center gap-3">
            {form.supportEmail && <Mail size={12} />}
            {form.discordInvite && <MessageCircle size={12} />}
          </div>
        </div>
      </div>
    </div>
  );
}
