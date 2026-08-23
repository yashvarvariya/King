'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Bell, Clock, Crown, CheckCircle2 } from 'lucide-react';
import Navbar from '@/components/Navbar';

interface Plan {
  id: string;
  name: string;
  description: string;
  oldPrice: number | null;
  price: number;
  ram: string;
  storage: string;
  cpu: string;
  maxServers: string;
  lifetime: boolean;
  badgeLabel: string | null;
}

interface Subscription {
  planId: string;
  planName: string;
  plan: Plan | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';
  expiryDate: string | null;
  lifetime: boolean;
  daysRemaining: number | null;
}

interface Notification {
  id: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'text-green-400 border-green-500/30 bg-green-500/10',
  SUSPENDED: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  EXPIRED: 'text-red-400 border-red-500/30 bg-red-500/10',
  CANCELLED: 'text-[#8ea095] border-base-700 bg-base-800',
};

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [me, planList, notifs] = await Promise.all([
        api.get('/billing/me'),
        api.get('/billing/plans'),
        api.get('/billing/me/notifications'),
      ]);
      setSubscription(me.data.subscription);
      setPlans(planList.data);
      setNotifications(notifs.data.notifications);
    } catch {
      toast.error('Could not load billing info');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markAllRead() {
    try {
      await api.post('/billing/me/notifications/read-all');
      load();
    } catch {
      toast.error('Could not mark notifications as read');
    }
  }

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  return (
    <div>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-[#8ea095] mt-1">Your plan, subscription status, and notifications</p>
        </div>

        {/* Current plan */}
        <section className="rounded-lg border border-base-700 bg-base-900/60 p-5 sm:p-6">
          {!subscription ? (
            <div className="h-24 bg-base-800 rounded animate-pulse" />
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Crown size={16} className="text-signal-500" />
                  <span className="text-lg font-medium">{subscription.planName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES[subscription.status]}`}>
                    {subscription.status}
                  </span>
                </div>
                {subscription.lifetime ? (
                  <p className="text-sm text-[#8ea095]">This plan never expires.</p>
                ) : subscription.expiryDate ? (
                  <p className="text-sm text-[#8ea095] flex items-center gap-1.5">
                    <Clock size={13} />
                    {subscription.status === 'EXPIRED' ? 'Expired on' : 'Renews / expires on'}{' '}
                    {new Date(subscription.expiryDate).toLocaleDateString()}
                    {subscription.daysRemaining !== null &&
                      subscription.daysRemaining >= 0 &&
                      ` (${subscription.daysRemaining} day${subscription.daysRemaining === 1 ? '' : 's'} left)`}
                  </p>
                ) : null}
                {subscription.plan && (
                  <p className="text-xs text-[#8ea095] mt-2">
                    {subscription.plan.ram} RAM · {subscription.plan.storage} storage · {subscription.plan.cpu} CPU ·{' '}
                    {subscription.plan.maxServers} servers
                  </p>
                )}
              </div>
              {(subscription.status === 'SUSPENDED' || subscription.status === 'EXPIRED') && (
                <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                  Hosting access is paused. Contact support or your platform's Discord to renew.
                </div>
              )}
            </div>
          )}
        </section>

        {/* Notifications */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <Bell size={14} /> Notifications
              {unreadCount > 0 && <span className="text-xs text-signal-500">({unreadCount} unread)</span>}
            </h2>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-[#8ea095] hover:text-white flex items-center gap-1">
                <CheckCircle2 size={13} /> Mark all read
              </button>
            )}
          </div>
          <div className="rounded-lg border border-base-700 divide-y divide-base-800">
            {notifications === null && <div className="h-16 bg-base-800 rounded animate-pulse m-3" />}
            {notifications !== null && notifications.length === 0 && (
              <p className="text-sm text-[#8ea095] px-4 py-6 text-center">No notifications yet.</p>
            )}
            {notifications?.map((n) => (
              <div key={n.id} className={`px-4 py-3 text-sm ${!n.read ? 'bg-signal-500/5' : ''}`}>
                <p className={n.read ? 'text-[#a9bdb2]' : ''}>{n.message}</p>
                <p className="text-xs text-[#8ea095] mt-1">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Plan catalog */}
        <section>
          <h2 className="text-sm font-medium mb-3">Available plans</h2>
          <p className="text-xs text-[#8ea095] mb-4">
            There's no automated checkout yet — purchases are verified manually. Reach out to support or your platform's
            Discord to upgrade or change plans.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans === null &&
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 bg-base-800 rounded-lg animate-pulse" />)}
            {plans?.map((p) => (
              <div
                key={p.id}
                className={`rounded-lg border p-4 ${
                  p.id === subscription?.planId ? 'border-signal-500/50 bg-signal-500/5' : 'border-base-700 bg-base-900/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">{p.name}</p>
                  {p.badgeLabel && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-signal-500/10 text-signal-500 border border-signal-500/30">
                      {p.badgeLabel}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#8ea095] mb-3">{p.description}</p>
                <p className="font-mono text-lg mb-3">
                  {p.oldPrice ? <span className="text-[#8ea095] line-through mr-1 text-sm">${p.oldPrice}</span> : null}
                  ${p.price}
                  {!p.lifetime && <span className="text-sm text-[#8ea095]">/mo</span>}
                </p>
                <p className="text-xs text-[#a9bdb2]">
                  {p.ram} RAM · {p.storage} storage · {p.cpu} CPU · {p.maxServers} servers
                </p>
                {p.id === subscription?.planId && (
                  <p className="text-xs text-signal-500 mt-3 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Current plan
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
