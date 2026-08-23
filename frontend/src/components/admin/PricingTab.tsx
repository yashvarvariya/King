'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Copy, Trash2, ArrowUp, ArrowDown, Tag } from 'lucide-react';
import { StatTile, AdminModal, Field, TextInput, PrimaryButton, SecondaryButton, DangerButton } from './AdminUI';
import type { Plan, PlanBadge } from './types';

const BADGE_OPTIONS: { value: PlanBadge; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'FREE', label: 'Free' },
  { value: 'MOST_POPULAR', label: 'Most Popular' },
  { value: 'BEST_VALUE', label: 'Best Value' },
  { value: 'NEW', label: 'New' },
  { value: 'LIMITED_OFFER', label: 'Limited Offer' },
];

type PlanFormState = {
  name: string;
  description: string;
  oldPrice: string;
  price: string;
  ram: string;
  storage: string;
  cpu: string;
  maxServers: string;
  lifetime: boolean;
  active: boolean;
  badge: PlanBadge;
};

const EMPTY_FORM: PlanFormState = {
  name: '',
  description: '',
  oldPrice: '',
  price: '',
  ram: '',
  storage: '',
  cpu: '',
  maxServers: '',
  lifetime: false,
  active: true,
  badge: 'NONE',
};

export default function PricingTab() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Plan | null | 'new'>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/plans/admin');
      setPlans(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not load plans');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(plan: Plan) {
    setBusyId(plan.id);
    try {
      await api.patch(`/plans/admin/${plan.id}/status`, { active: !plan.active });
      toast.success(plan.active ? `${plan.name} disabled` : `${plan.name} enabled`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(plan: Plan) {
    setBusyId(plan.id);
    try {
      await api.post(`/plans/admin/${plan.id}/duplicate`);
      toast.success(`Duplicated ${plan.name}`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not duplicate plan');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(plan: Plan) {
    if (!confirm(`Delete "${plan.name}"? This cannot be undone.`)) return;
    setBusyId(plan.id);
    try {
      await api.delete(`/plans/admin/${plan.id}`);
      toast.success(`Deleted ${plan.name}`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not delete plan — it may still have active subscribers');
    } finally {
      setBusyId(null);
    }
  }

  async function move(plan: Plan, direction: -1 | 1) {
    if (!plans) return;
    const sorted = [...plans].sort((a, b) => a.displayOrder - b.displayOrder);
    const idx = sorted.findIndex((p) => p.id === plan.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const order = sorted.map((p) => p.id);
    [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
    setBusyId(plan.id);
    try {
      await api.patch('/plans/admin/reorder/all', { order });
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not reorder plans');
    } finally {
      setBusyId(null);
    }
  }

  const sortedPlans = plans ? [...plans].sort((a, b) => a.displayOrder - b.displayOrder) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <StatTile icon={<Tag size={16} />} label="Plans" value={plans?.length ?? 0} accent />
        <PrimaryButton onClick={() => setEditing('new')} className="flex items-center gap-2">
          <Plus size={15} /> New Plan
        </PrimaryButton>
      </div>

      <div className="rounded-lg border border-base-700 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-base-900 text-[#8ea095] text-left">
            <tr>
              <th className="px-4 py-2 font-normal w-16"></th>
              <th className="px-4 py-2 font-normal">Plan</th>
              <th className="px-4 py-2 font-normal">Price</th>
              <th className="px-4 py-2 font-normal">Specs</th>
              <th className="px-4 py-2 font-normal">Badge</th>
              <th className="px-4 py-2 font-normal">Status</th>
              <th className="px-4 py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {sortedPlans === null &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-t border-base-800">
                  <td className="px-4 py-3" colSpan={7}>
                    <div className="h-4 bg-base-800 rounded animate-pulse w-full" />
                  </td>
                </tr>
              ))}
            {sortedPlans?.map((plan, i) => (
              <tr key={plan.id} className="border-t border-base-800">
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => move(plan, -1)}
                      disabled={i === 0 || busyId === plan.id}
                      className="text-[#8ea095] hover:text-white disabled:opacity-30"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      onClick={() => move(plan, 1)}
                      disabled={i === sortedPlans.length - 1 || busyId === plan.id}
                      className="text-[#8ea095] hover:text-white disabled:opacity-30"
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{plan.name}</p>
                  <p className="text-xs text-[#8ea095]">{plan.description}</p>
                </td>
                <td className="px-4 py-3 font-mono">
                  {plan.oldPrice ? <span className="text-[#8ea095] line-through mr-1">${plan.oldPrice}</span> : null}
                  ${plan.price}
                  {!plan.lifetime && <span className="text-[#8ea095]">/mo</span>}
                </td>
                <td className="px-4 py-3 text-xs text-[#a9bdb2]">
                  {plan.ram} RAM · {plan.storage} SSD · {plan.cpu} CPU · {plan.maxServers} servers
                </td>
                <td className="px-4 py-3">
                  {plan.badgeLabel && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-signal-500/10 text-signal-500 border border-signal-500/30">
                      {plan.badgeLabel}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleActive(plan)}
                    disabled={busyId === plan.id}
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      plan.active
                        ? 'text-green-400 border-green-500/30 bg-green-500/10'
                        : 'text-[#8ea095] border-base-700 bg-base-800'
                    }`}
                  >
                    {plan.active ? 'Active' : 'Disabled'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => setEditing(plan)} className="text-[#8ea095] hover:text-white">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => duplicate(plan)} className="text-[#8ea095] hover:text-white">
                      <Copy size={14} />
                    </button>
                    <button onClick={() => remove(plan)} className="text-red-400 hover:text-red-300">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sortedPlans !== null && sortedPlans.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-[#8ea095]" colSpan={7}>
                  No plans yet — create one to populate the pricing page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && <PlanFormModal plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function PlanFormModal({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<PlanFormState>(
    plan
      ? {
          name: plan.name,
          description: plan.description,
          oldPrice: plan.oldPrice?.toString() ?? '',
          price: plan.price.toString(),
          ram: plan.ram,
          storage: plan.storage,
          cpu: plan.cpu,
          maxServers: plan.maxServers,
          lifetime: plan.lifetime,
          active: plan.active,
          badge: plan.badge,
        }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);

  function set<K extends keyof PlanFormState>(key: K, value: PlanFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      oldPrice: form.oldPrice.trim() === '' ? null : Number(form.oldPrice),
      price: Number(form.price),
      ram: form.ram.trim(),
      storage: form.storage.trim(),
      cpu: form.cpu.trim(),
      maxServers: form.maxServers.trim(),
      lifetime: form.lifetime,
      active: form.active,
      badge: form.badge,
    };
    try {
      if (plan) {
        await api.patch(`/plans/admin/${plan.id}`, payload);
        toast.success('Plan saved');
      } else {
        await api.post('/plans/admin', payload);
        toast.success('Plan created');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not save plan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal title={plan ? `Edit ${plan.name}` : 'New Plan'} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4">
        <Field label="Plan Name">
          <TextInput value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Starter+" />
        </Field>
        <Field label="Description">
          <TextInput value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Shown under the plan name" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Current Price ($)">
            <TextInput type="number" min={0} value={form.price} onChange={(e) => set('price', e.target.value)} />
          </Field>
          <Field label="Old Price ($, optional)">
            <TextInput type="number" min={0} value={form.oldPrice} onChange={(e) => set('oldPrice', e.target.value)} placeholder="For a strikethrough price" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="RAM">
            <TextInput value={form.ram} onChange={(e) => set('ram', e.target.value)} placeholder="e.g. 2 GB" />
          </Field>
          <Field label="Storage">
            <TextInput value={form.storage} onChange={(e) => set('storage', e.target.value)} placeholder="e.g. 10 GB" />
          </Field>
          <Field label="CPU">
            <TextInput value={form.cpu} onChange={(e) => set('cpu', e.target.value)} placeholder="e.g. 200%" />
          </Field>
        </div>
        <Field label="Maximum Servers">
          <TextInput
            value={form.maxServers}
            onChange={(e) => set('maxServers', e.target.value)}
            placeholder='A number, or "Unlimited"'
          />
        </Field>
        <Field label="Badge">
          <select
            value={form.badge}
            onChange={(e) => set('badge', e.target.value as PlanBadge)}
            className="w-full rounded-md bg-base-950 border border-base-700 px-3 py-2 outline-none focus:border-signal-500 text-sm"
          >
            {BADGE_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-[#a9bdb2]">
            <input type="checkbox" checked={form.lifetime} onChange={(e) => set('lifetime', e.target.checked)} />
            Lifetime (never expires)
          </label>
          <label className="flex items-center gap-2 text-sm text-[#a9bdb2]">
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
            Active (visible on pricing page)
          </label>
        </div>

        <div className="flex gap-3 pt-2">
          <PrimaryButton onClick={save} loading={saving} className="flex-1">
            {plan ? 'Save changes' : 'Create plan'}
          </PrimaryButton>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        </div>
      </div>
    </AdminModal>
  );
}
