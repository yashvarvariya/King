'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { DollarSign, Users, AlertTriangle, Ban, History as HistoryIcon } from 'lucide-react';
import { StatTile, AdminModal, Field, TextInput, PrimaryButton, SecondaryButton, DangerButton } from './AdminUI';
import type { AdminUser, BillingHistoryEntry, BillingOverview, Plan, Subscription } from './types';

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'text-green-400 border-green-500/30 bg-green-500/10',
  SUSPENDED: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  EXPIRED: 'text-red-400 border-red-500/30 bg-red-500/10',
  CANCELLED: 'text-[#8ea095] border-base-700 bg-base-800',
};

// A user who has never touched billing has no Subscription row yet — the
// backend lazily creates one (defaulting to the free plan) the first time
// anything reads it. This mirrors that default client-side purely for
// display, so every user shows up in the table without an extra round trip
// per row; any action taken against them creates the real row server-side.
function virtualFreeSubscription(user: AdminUser): Subscription {
  return {
    userId: user.id,
    planId: 'free',
    planName: 'Free',
    plan: null,
    status: 'ACTIVE',
    activationDate: user.createdAt,
    expiryDate: null,
    lifetime: true,
    daysRemaining: null,
    updatedAt: user.createdAt,
    username: user.username,
  };
}

export default function BillingTab({ users }: { users: AdminUser[] | null }) {
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [history, setHistory] = useState<BillingHistoryEntry[] | null>(null);
  const [acting, setActing] = useState<{ user: AdminUser; sub: Subscription } | null>(null);
  const [editingRevenue, setEditingRevenue] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ov, subsRes, plansRes, historyRes] = await Promise.all([
        api.get('/billing/admin/overview'),
        api.get('/billing/admin/subscriptions'),
        api.get('/plans/admin'),
        api.get('/billing/admin/history'),
      ]);
      setOverview(ov.data);
      setSubs(subsRes.data.subscriptions);
      setPlans(plansRes.data);
      setHistory(historyRes.data.history);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not load billing data');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows: { user: AdminUser; sub: Subscription }[] =
    users?.map((u) => {
      const existing = subs?.find((s) => s.userId === u.id);
      return { user: u, sub: existing || virtualFreeSubscription(u) };
    }) ?? [];

  return (
    <div className="space-y-8">
      <div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
          <StatTile icon={<Users size={16} />} label="Active subscriptions" value={overview?.activeSubscriptions ?? 0} accent />
          <StatTile icon={<AlertTriangle size={16} />} label="Suspended" value={overview?.suspendedUsers ?? 0} />
          <StatTile icon={<Ban size={16} />} label="Expired" value={overview?.expiredSubscriptions ?? 0} />
          <StatTile icon={<DollarSign size={16} />} label="Paid users" value={overview?.totalPaidUsers ?? 0} />
        </div>
        <div className="rounded-lg border border-base-700 bg-base-900/60 p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-[#8ea095] mb-1">Revenue (manually entered — no payment gateway is wired up)</p>
            <p className="text-lg font-mono">
              ${overview?.totalRevenue ?? 0} total · ${overview?.monthlyRevenue ?? 0}/mo
            </p>
          </div>
          <SecondaryButton onClick={() => setEditingRevenue(true)}>Edit revenue</SecondaryButton>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">Subscriptions</h3>
        <div className="rounded-lg border border-base-700 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-base-900 text-[#8ea095] text-left">
              <tr>
                <th className="px-4 py-2 font-normal">User</th>
                <th className="px-4 py-2 font-normal">Plan</th>
                <th className="px-4 py-2 font-normal">Status</th>
                <th className="px-4 py-2 font-normal">Expires</th>
                <th className="px-4 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {users === null &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-t border-base-800">
                    <td className="px-4 py-3" colSpan={5}>
                      <div className="h-4 bg-base-800 rounded animate-pulse w-full" />
                    </td>
                  </tr>
                ))}
              {rows.map(({ user, sub }) => (
                <tr key={user.id} className="border-t border-base-800">
                  <td className="px-4 py-3">
                    <p>{user.username}</p>
                    <p className="text-[#8ea095] text-xs">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">{sub.planName}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES[sub.status]}`}>{sub.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#8ea095] font-mono">
                    {sub.lifetime ? 'Never' : sub.expiryDate ? new Date(sub.expiryDate).toLocaleDateString() : '—'}
                    {sub.daysRemaining !== null && sub.daysRemaining >= 0 && !sub.lifetime && (
                      <span> ({sub.daysRemaining}d)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setActing({ user, sub })} className="text-xs text-signal-500 hover:underline">
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <HistoryIcon size={14} /> Recent billing activity
        </h3>
        <div className="rounded-lg border border-base-700 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-base-900 text-[#8ea095] text-left">
              <tr>
                <th className="px-4 py-2 font-normal">User</th>
                <th className="px-4 py-2 font-normal">Action</th>
                <th className="px-4 py-2 font-normal">Detail</th>
                <th className="px-4 py-2 font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              {history === null &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-t border-base-800">
                    <td className="px-4 py-3" colSpan={4}>
                      <div className="h-4 bg-base-800 rounded animate-pulse w-full" />
                    </td>
                  </tr>
                ))}
              {history !== null && history.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-[#8ea095]" colSpan={4}>
                    No billing activity yet.
                  </td>
                </tr>
              )}
              {history?.map((h) => (
                <tr key={h.id} className="border-t border-base-800">
                  <td className="px-4 py-3">{h.username || '—'}</td>
                  <td className="px-4 py-3 text-xs">{h.action.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-xs text-[#8ea095]">
                    {h.fromPlan && h.toPlan && h.fromPlan !== h.toPlan
                      ? `${h.fromPlan} → ${h.toPlan}`
                      : h.note || h.toPlan || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#8ea095] font-mono">{new Date(h.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {acting && (
        <ManageSubscriptionModal
          user={acting.user}
          sub={acting.sub}
          plans={plans}
          onClose={() => setActing(null)}
          onDone={load}
        />
      )}
      {editingRevenue && overview && (
        <RevenueModal overview={overview} onClose={() => setEditingRevenue(false)} onSaved={load} />
      )}
    </div>
  );
}

function RevenueModal({
  overview,
  onClose,
  onSaved,
}: {
  overview: BillingOverview;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [total, setTotal] = useState(String(overview.totalRevenue));
  const [monthly, setMonthly] = useState(String(overview.monthlyRevenue));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.patch('/billing/admin/stats', { totalRevenue: Number(total), monthlyRevenue: Number(monthly) });
      toast.success('Revenue updated');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not update revenue');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal title="Edit revenue" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Total revenue ($)">
          <TextInput type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} />
        </Field>
        <Field label="Monthly revenue ($)">
          <TextInput type="number" min={0} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
        </Field>
        <div className="flex gap-3 pt-2">
          <PrimaryButton onClick={save} loading={saving} className="flex-1">
            Save
          </PrimaryButton>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        </div>
      </div>
    </AdminModal>
  );
}

function ManageSubscriptionModal({
  user,
  sub,
  plans,
  onClose,
  onDone,
}: {
  user: AdminUser;
  sub: Subscription;
  plans: Plan[] | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [planId, setPlanId] = useState(sub.planId);
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: string, fn: () => Promise<any>) {
    setBusy(action);
    try {
      await fn();
      toast.success('Done');
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminModal title={`Manage — ${user.username}`} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-5">
        <div>
          <p className="text-xs text-[#8ea095] mb-2">Assign / change plan</p>
          <div className="flex gap-2">
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="flex-1 rounded-md bg-base-950 border border-base-700 px-3 py-2 outline-none focus:border-signal-500 text-sm"
            >
              {plans?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <PrimaryButton
              loading={busy === 'plan'}
              onClick={() => run('plan', () => api.patch(`/billing/admin/subscriptions/${user.id}/plan`, { planId }))}
            >
              Apply
            </PrimaryButton>
          </div>
        </div>

        <div>
          <p className="text-xs text-[#8ea095] mb-2">Extend / renew (days from now, or from current expiry if later)</p>
          <div className="flex gap-2">
            <TextInput type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} className="flex-1" />
            <SecondaryButton
              disabled={busy === 'extend'}
              onClick={() => run('extend', () => api.patch(`/billing/admin/subscriptions/${user.id}/extend`, { days: Number(days) }))}
            >
              Extend
            </SecondaryButton>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-base-800">
          {sub.status !== 'SUSPENDED' && (
            <SecondaryButton
              disabled={busy === 'suspend'}
              onClick={() => run('suspend', () => api.post(`/billing/admin/subscriptions/${user.id}/suspend`, {}))}
            >
              Suspend
            </SecondaryButton>
          )}
          {(sub.status === 'SUSPENDED' || sub.status === 'EXPIRED') && (
            <PrimaryButton
              loading={busy === 'unsuspend'}
              onClick={() =>
                run('unsuspend', () => api.post(`/billing/admin/subscriptions/${user.id}/unsuspend`, { days: Number(days) }))
              }
            >
              Unsuspend / renew
            </PrimaryButton>
          )}
          {sub.status !== 'CANCELLED' && (
            <DangerButton
              disabled={busy === 'cancel'}
              onClick={() => run('cancel', () => api.post(`/billing/admin/subscriptions/${user.id}/cancel`, {}))}
            >
              Cancel subscription
            </DangerButton>
          )}
        </div>

        <SecondaryButton onClick={onClose} className="w-full">
          Close
        </SecondaryButton>
      </div>
    </AdminModal>
  );
}
