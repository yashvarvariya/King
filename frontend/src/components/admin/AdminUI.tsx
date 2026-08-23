'use client';

import { X } from 'lucide-react';

export function StatTile({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-base-700 bg-base-900/60 p-4">
      <div className={`flex items-center gap-2 text-xs mb-2 ${accent ? 'text-signal-500' : 'text-[#8ea095]'}`}>
        {icon} {label}
      </div>
      <div className="text-2xl font-semibold font-mono">{value}</div>
    </div>
  );
}

export function AdminModal({
  title,
  onClose,
  children,
  maxWidth = 'max-w-md',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4 sm:px-6" onClick={onClose}>
      <div
        className={`w-full ${maxWidth} rounded-lg border border-base-700 bg-base-900 p-5 sm:p-6 max-h-[90vh] overflow-y-auto scrollbar-thin`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-medium">{title}</h2>
          <button onClick={onClose} className="text-[#8ea095] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm text-[#a9bdb2]">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-md bg-base-950 border border-base-700 px-3 py-2 outline-none focus:border-signal-500 text-sm ${className}`}
    />
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <Field label={label}>
      <TextInput
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
      />
    </Field>
  );
}

export function PrimaryButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean },
) {
  const { className = '', loading, children, disabled, ...rest } = props;
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`rounded-md bg-signal-500 text-base-950 font-medium py-2 px-4 hover:bg-signal-400 transition-colors disabled:opacity-60 text-sm ${className}`}
    >
      {loading ? 'Working…' : children}
    </button>
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props;
  return (
    <button
      {...rest}
      className={`rounded-md border border-base-700 py-2 px-4 text-sm text-[#a9bdb2] hover:text-white hover:border-base-600 transition-colors ${className}`}
    />
  );
}

export function DangerButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props;
  return (
    <button
      {...rest}
      className={`rounded-md border border-red-500/30 py-2 px-4 text-sm text-red-400 hover:bg-red-500/10 transition-colors ${className}`}
    />
  );
}
