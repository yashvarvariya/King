import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingAction, BillingNotificationType, Subscription, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../common/mail/mail.service';
import { PlansService, SerializedPlan } from '../plans/plans.service';
import { planToQuota } from './plan-quota.util';

const DEFAULT_RENEWAL_DAYS = 30;
const EXPIRING_SOON_DAYS = 3;
const FREE_PLAN_ID = 'free';

// In-app notification type -> Email template type. Keeps the email hook in
// this one shared service instead of every call site, so every place that
// already calls notify() (activate, change plan, expire, sweep, renew)
// automatically emails the user too, without duplicating logic.
const NOTIFY_EMAIL_MAP: Record<BillingNotificationType, string> = {
  ACTIVATED: 'subscription_activated',
  EXPIRING_SOON: 'subscription_expiring_soon',
  EXPIRED: 'subscription_expired',
  RENEWED: 'subscription_renewed',
  SUSPENDED: 'account_suspended',
  UNSUSPENDED: 'account_unsuspended',
};

const EMAIL_FALLBACKS: Record<string, { subject: string; title: string; body: string }> = {
  subscription_activated: {
    subject: 'Your subscription is active',
    title: 'Subscription activated',
    body: 'Hi {{username}}, your {{plan_name}} subscription is now active. Thanks for subscribing!',
  },
  subscription_expiring_soon: {
    subject: 'Your subscription is expiring soon',
    title: 'Expiring soon',
    body: 'Hi {{username}}, your {{plan_name}} subscription expires in {{days_remaining}} day(s) on {{expiry_date}}. Renew to avoid interruption.',
  },
  subscription_expired: {
    subject: 'Your subscription has expired',
    title: 'Subscription expired',
    body: "Hi {{username}}, your {{plan_name}} subscription has expired. Hosting access is suspended until it's renewed.",
  },
  subscription_renewed: {
    subject: 'Your subscription was renewed',
    title: 'Subscription renewed',
    body: 'Hi {{username}}, your {{plan_name}} subscription has been renewed. All access is restored.',
  },
};

export interface SerializedSubscription {
  userId: string;
  planId: string;
  planName: string;
  plan: SerializedPlan | null;
  status: SubscriptionStatus;
  activationDate: Date;
  expiryDate: Date | null;
  lifetime: boolean;
  daysRemaining: number | null;
  updatedAt: Date;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly plans: PlansService,
  ) {}

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private daysRemaining(expiryDate: Date | null): number | null {
    if (!expiryDate) return null;
    const diffMs = expiryDate.getTime() - Date.now();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  async logHistory(
    userId: string,
    subscriptionId: string | null,
    action: BillingAction,
    opts: { fromPlan?: string | null; toPlan?: string | null; note?: string | null; performedBy?: string | null } = {},
  ) {
    await this.prisma.billingHistory.create({
      data: {
        userId,
        subscriptionId: subscriptionId || undefined,
        action,
        fromPlan: opts.fromPlan || undefined,
        toPlan: opts.toPlan || undefined,
        note: opts.note || undefined,
        performedBy: opts.performedBy || undefined,
      },
    });
  }

  async notify(userId: string, type: BillingNotificationType, message: string) {
    await this.prisma.billingNotification.create({ data: { userId, type, message } });

    const emailType = NOTIFY_EMAIL_MAP[type];
    if (!emailType) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true, email: true } });
    if (!user?.email) return;

    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    const plan = sub ? await this.plans.getPlan(sub.planId) : null;

    this.mail.sendTemplateAsync(
      emailType,
      {
        to: user.email,
        userId,
        vars: {
          username: user.username,
          plan_name: plan ? plan.name : sub ? sub.planId : '',
          expiry_date: sub?.expiryDate ? sub.expiryDate.toISOString() : '',
          days_remaining: sub ? this.daysRemaining(sub.expiryDate) ?? '' : '',
        },
      },
      EMAIL_FALLBACKS[emailType]
        ? { ...EMAIL_FALLBACKS[emailType], footer: '' }
        : undefined,
    );
  }

  /** Syncs a user's numeric quota columns + isPremium flag to match a plan's advertised specs. */
  private async syncUserQuotaToPlan(userId: string, plan: SerializedPlan) {
    const quota = planToQuota(plan);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isPremium: true, premiumSince: true } });
    const isPaid = plan.id !== FREE_PLAN_ID && !plan.lifetime;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...quota,
        isPremium: isPaid || (user?.isPremium ?? false),
        premiumSince: isPaid && !user?.premiumSince ? new Date() : undefined,
      },
    });
  }

  // -----------------------------------------------------------------------
  // Subscription lifecycle
  // -----------------------------------------------------------------------

  // Every user gets a subscription row lazily, the first time anything asks
  // for one — covers users created before this feature existed.
  async getOrCreateSubscription(userId: string): Promise<Subscription> {
    let sub = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!sub) {
      sub = await this.prisma.subscription.create({
        data: { userId, planId: FREE_PLAN_ID, status: 'ACTIVE', expiryDate: null },
      });
      await this.logHistory(userId, sub.id, 'CREATED', { toPlan: FREE_PLAN_ID, note: 'Default Free plan assigned automatically' });
    }
    return this.checkAndExpireIfNeeded(sub);
  }

  // Lazy auto-expiry: called every time a subscription is read. If it's
  // still marked ACTIVE but its expiryDate has passed, flip it to EXPIRED
  // right now instead of waiting for the periodic sweep below.
  async checkAndExpireIfNeeded(sub: Subscription): Promise<Subscription> {
    if (sub.status !== 'ACTIVE' || !sub.expiryDate || sub.expiryDate.getTime() > Date.now()) return sub;

    const updated = await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } });
    await this.logHistory(sub.userId, sub.id, 'EXPIRED', { fromPlan: sub.planId, note: 'Automatically expired — past expiry date' });
    const plan = await this.plans.getPlan(sub.planId);
    await this.notify(
      sub.userId,
      'EXPIRED',
      `Your ${plan ? plan.name : sub.planId} subscription has expired. Hosting access is suspended until it's renewed.`,
    );
    return updated;
  }

  /** True if the given user's hosting actions should currently be blocked for billing reasons. */
  async isBillingSuspended(userId: string): Promise<boolean> {
    const sub = await this.getOrCreateSubscription(userId);
    return sub.status === 'SUSPENDED' || sub.status === 'EXPIRED';
  }

  async serializeSubscription(sub: Subscription): Promise<SerializedSubscription> {
    const plan = await this.plans.getPlan(sub.planId);
    return {
      userId: sub.userId,
      planId: sub.planId,
      planName: plan ? plan.name : sub.planId,
      plan,
      status: sub.status,
      activationDate: sub.activationDate,
      expiryDate: sub.expiryDate,
      lifetime: !!(plan && plan.lifetime),
      daysRemaining: this.daysRemaining(sub.expiryDate),
      updatedAt: sub.updatedAt,
    };
  }

  // Runs across every subscription on the platform so expiry / "expiring
  // soon" notifications fire even for users who never load the billing
  // page. Subscriptions also self-check on every read via
  // checkAndExpireIfNeeded, but that only fires on-demand.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepAllSubscriptions() {
    try {
      const rows = await this.prisma.subscription.findMany({ where: { status: 'ACTIVE', expiryDate: { not: null } } });
      for (const sub of rows) {
        const before = sub.status;
        const after = await this.checkAndExpireIfNeeded(sub);
        if (after.status !== before) continue; // just expired, notification already sent

        const remaining = this.daysRemaining(sub.expiryDate);
        if (remaining !== null && remaining >= 0 && remaining <= EXPIRING_SOON_DAYS) {
          const already = await this.prisma.billingNotification.findFirst({
            where: {
              userId: sub.userId,
              type: 'EXPIRING_SOON',
              createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          });
          if (!already) {
            const plan = await this.plans.getPlan(sub.planId);
            await this.notify(
              sub.userId,
              'EXPIRING_SOON',
              `Your ${plan ? plan.name : sub.planId} subscription expires in ${remaining} day${remaining === 1 ? '' : 's'}. Renew to avoid interruption.`,
            );
          }
        }
      }
    } catch (err) {
      this.logger.error(`Subscription sweep failed: ${(err as Error).message}`);
    }
  }

  // -----------------------------------------------------------------------
  // User-facing billing dashboard
  // -----------------------------------------------------------------------

  async getPlansCatalog(includeInactive: boolean) {
    return this.plans.getAllPlans({ activeOnly: !includeInactive });
  }

  async getMySubscription(userId: string) {
    const sub = await this.getOrCreateSubscription(userId);
    return this.serializeSubscription(sub);
  }

  getMyHistory(userId: string) {
    return this.prisma.billingHistory.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  getMyNotifications(userId: string, unreadOnly: boolean) {
    return this.prisma.billingNotification.findMany({
      where: unreadOnly ? { userId, read: false } : { userId },
      orderBy: { createdAt: 'desc' },
      take: unreadOnly ? undefined : 50,
    });
  }

  async markNotificationRead(userId: string, id: string) {
    const result = await this.prisma.billingNotification.updateMany({ where: { id, userId }, data: { read: true } });
    if (result.count === 0) throw new NotFoundException('Notification not found');
    return { message: 'Marked as read' };
  }

  async markAllNotificationsRead(userId: string) {
    await this.prisma.billingNotification.updateMany({ where: { userId, read: false }, data: { read: true } });
    return { message: 'All notifications marked as read' };
  }

  // -----------------------------------------------------------------------
  // Admin billing panel
  // -----------------------------------------------------------------------

  private async getUserOr404(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, role: true } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async adminOverview() {
    const [active, expired, suspended, cancelled, paidUsers] = await Promise.all([
      this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.subscription.count({ where: { status: 'EXPIRED' } }),
      this.prisma.subscription.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.subscription.count({ where: { status: 'CANCELLED' } }),
      this.prisma.subscription.count({
        where: { planId: { not: FREE_PLAN_ID }, status: { in: ['ACTIVE', 'SUSPENDED'] } },
      }),
    ]);
    const stats = await this.prisma.billingStats.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
    return {
      activeSubscriptions: active,
      expiredSubscriptions: expired,
      suspendedUsers: suspended,
      cancelledSubscriptions: cancelled,
      totalPaidUsers: paidUsers,
      totalRevenue: stats.totalRevenue,
      monthlyRevenue: stats.monthlyRevenue,
      revenueUpdatedAt: stats.updatedAt,
    };
  }

  async updateStats(dto: { totalRevenue?: number; monthlyRevenue?: number }, adminId: string) {
    if (dto.totalRevenue === undefined && dto.monthlyRevenue === undefined) {
      throw new BadRequestException('Provide totalRevenue and/or monthlyRevenue');
    }
    const current = await this.prisma.billingStats.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
    const stats = await this.prisma.billingStats.update({
      where: { id: 'singleton' },
      data: {
        totalRevenue: dto.totalRevenue ?? current.totalRevenue,
        monthlyRevenue: dto.monthlyRevenue ?? current.monthlyRevenue,
        updatedById: adminId,
      },
    });
    return { message: 'Revenue stats updated', totalRevenue: stats.totalRevenue, monthlyRevenue: stats.monthlyRevenue };
  }

  async adminListSubscriptions(status?: SubscriptionStatus) {
    const rows = await this.prisma.subscription.findMany({
      where: status ? { status } : undefined,
      include: { user: { select: { username: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return Promise.all(rows.map(async (r) => ({ ...(await this.serializeSubscription(r)), username: r.user.username })));
  }

  async adminGetSubscription(userId: string) {
    const user = await this.getUserOr404(userId);
    const sub = await this.getOrCreateSubscription(user.id);
    return { user, subscription: await this.serializeSubscription(sub) };
  }

  // Create/assign a subscription in one shot: plan + activation + expiry.
  async adminAssignSubscription(
    userId: string,
    dto: { planId: string; activationDate?: string; expiryDate?: string },
    adminId: string,
  ) {
    const user = await this.getUserOr404(userId);
    const plan = await this.plans.getPlan(dto.planId);
    if (!plan) {
      const order = await this.plans.getPlanOrder();
      throw new BadRequestException(`planId must be one of: ${order.join(', ')}`);
    }

    const activation = dto.activationDate ? new Date(dto.activationDate) : new Date();
    if (Number.isNaN(activation.getTime())) throw new BadRequestException('activationDate is not a valid date');

    let expiry: Date | null;
    if (plan.lifetime) {
      expiry = null;
    } else if (dto.expiryDate) {
      expiry = new Date(dto.expiryDate);
      if (Number.isNaN(expiry.getTime())) throw new BadRequestException('expiryDate is not a valid date');
    } else {
      // A paid plan always gets an expiry — default to 30 days out if the
      // admin didn't set one explicitly, so an assignment never silently
      // becomes an unlimited free ride by omission.
      expiry = new Date(Date.now() + DEFAULT_RENEWAL_DAYS * 86400000);
    }

    const existing = await this.prisma.subscription.findUnique({ where: { userId: user.id } });
    const previousPlan = existing?.planId ?? null;

    const sub = existing
      ? await this.prisma.subscription.update({
          where: { userId: user.id },
          data: { planId: plan.id, status: 'ACTIVE', activationDate: activation, expiryDate: expiry },
        })
      : await this.prisma.subscription.create({
          data: { userId: user.id, planId: plan.id, status: 'ACTIVE', activationDate: activation, expiryDate: expiry },
        });

    await this.syncUserQuotaToPlan(user.id, plan);
    await this.logHistory(user.id, sub.id, existing ? 'PLAN_CHANGED' : 'CREATED', {
      fromPlan: previousPlan,
      toPlan: plan.id,
      performedBy: adminId,
      note: `Subscription manually ${existing ? 'assigned' : 'created'} by admin`,
    });
    await this.notify(user.id, 'ACTIVATED', `Your ${plan.name} subscription has been activated.`);

    return { message: 'Subscription saved', subscription: await this.serializeSubscription(sub) };
  }

  async adminChangePlan(userId: string, planId: string, adminId: string) {
    const user = await this.getUserOr404(userId);
    const plan = await this.plans.getPlan(planId);
    if (!plan) {
      const order = await this.plans.getPlanOrder();
      throw new BadRequestException(`planId must be one of: ${order.join(', ')}`);
    }

    const sub = await this.getOrCreateSubscription(user.id);
    // Switching to a lifetime plan clears any expiry; switching to a paid
    // plan from one with no expiry set gets a default 30-day term so it
    // doesn't silently behave like a second lifetime plan.
    const newExpiry = plan.lifetime ? null : sub.expiryDate || new Date(Date.now() + DEFAULT_RENEWAL_DAYS * 86400000);

    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { planId: plan.id, expiryDate: newExpiry },
    });
    await this.syncUserQuotaToPlan(user.id, plan);
    await this.logHistory(user.id, sub.id, 'PLAN_CHANGED', { fromPlan: sub.planId, toPlan: plan.id, performedBy: adminId });
    await this.notify(user.id, 'ACTIVATED', `Your plan was changed to ${plan.name}.`);

    return { message: 'Plan changed', subscription: await this.serializeSubscription(updated) };
  }

  async adminExtendSubscription(userId: string, dto: { expiryDate?: string; days?: number }, adminId: string) {
    const user = await this.getUserOr404(userId);
    const sub = await this.getOrCreateSubscription(user.id);
    const plan = await this.plans.getPlan(sub.planId);
    if (plan?.lifetime) throw new BadRequestException('A lifetime plan never expires — nothing to extend');

    let newExpiry: Date;
    if (dto.expiryDate) {
      newExpiry = new Date(dto.expiryDate);
      if (Number.isNaN(newExpiry.getTime())) throw new BadRequestException('expiryDate is not a valid date');
    } else if (dto.days) {
      const base = sub.expiryDate && sub.expiryDate.getTime() > Date.now() ? sub.expiryDate.getTime() : Date.now();
      newExpiry = new Date(base + dto.days * 86400000);
    } else {
      throw new BadRequestException('Provide expiryDate or days');
    }

    const updated = await this.prisma.subscription.update({ where: { id: sub.id }, data: { expiryDate: newExpiry } });
    await this.logHistory(user.id, sub.id, 'EXTENDED', {
      fromPlan: sub.planId,
      toPlan: sub.planId,
      performedBy: adminId,
      note: `Expiry set to ${newExpiry.toISOString()}`,
    });
    return { message: 'Subscription extended', subscription: await this.serializeSubscription(updated) };
  }

  async adminSuspend(userId: string, note: string | undefined, adminId: string) {
    const user = await this.getUserOr404(userId);
    const sub = await this.getOrCreateSubscription(user.id);
    const plan = await this.plans.getPlan(sub.planId);
    if (plan?.lifetime) throw new BadRequestException('A lifetime plan cannot be suspended');
    if (sub.status === 'CANCELLED') throw new BadRequestException('This subscription is cancelled — reassign a plan instead of suspending it');

    const updated = await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'SUSPENDED' } });
    await this.logHistory(user.id, sub.id, 'SUSPENDED', { fromPlan: sub.planId, performedBy: adminId, note });
    await this.notify(user.id, 'SUSPENDED', `Your ${plan ? plan.name : sub.planId} subscription has been suspended by an administrator.`);

    return { message: 'Subscription suspended', subscription: await this.serializeSubscription(updated) };
  }

  // Renews access: clears suspended/expired status and restores everything,
  // without touching any of the user's existing servers/files.
  async adminUnsuspend(userId: string, dto: { expiryDate?: string; days?: number }, adminId: string) {
    const user = await this.getUserOr404(userId);
    const sub = await this.getOrCreateSubscription(user.id);
    const plan = await this.plans.getPlan(sub.planId);

    let newExpiry: Date | null = sub.expiryDate;
    if (!plan?.lifetime) {
      if (dto.expiryDate) {
        newExpiry = new Date(dto.expiryDate);
        if (Number.isNaN(newExpiry.getTime())) throw new BadRequestException('expiryDate is not a valid date');
      } else if (dto.days) {
        newExpiry = new Date(Date.now() + dto.days * 86400000);
      } else {
        // No explicit renewal length given — if the current expiry has
        // already passed (or was never set), default to another 30 days
        // so "unsuspend" doesn't just re-expire on the next read.
        const stillFuture = sub.expiryDate && sub.expiryDate.getTime() > Date.now();
        if (!stillFuture) newExpiry = new Date(Date.now() + DEFAULT_RENEWAL_DAYS * 86400000);
      }
    }

    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'ACTIVE', expiryDate: newExpiry },
    });
    await this.logHistory(user.id, sub.id, 'UNSUSPENDED', {
      fromPlan: sub.planId,
      toPlan: sub.planId,
      performedBy: adminId,
      note: `Expiry set to ${newExpiry ? newExpiry.toISOString() : 'lifetime'}`,
    });
    await this.notify(user.id, 'RENEWED', `Your ${plan ? plan.name : sub.planId} subscription has been renewed. All access is restored.`);
    await this.notify(user.id, 'UNSUSPENDED', 'Your account has been unsuspended — full access is restored.');

    return { message: 'Subscription unsuspended', subscription: await this.serializeSubscription(updated) };
  }

  async adminCancel(userId: string, note: string | undefined, adminId: string) {
    const user = await this.getUserOr404(userId);
    const sub = await this.getOrCreateSubscription(user.id);
    const plan = await this.plans.getPlan(sub.planId);
    if (plan?.lifetime) throw new BadRequestException('A lifetime plan cannot be cancelled');

    const updated = await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } });
    await this.logHistory(user.id, sub.id, 'CANCELLED', { fromPlan: sub.planId, performedBy: adminId, note });

    return { message: 'Subscription cancelled', subscription: await this.serializeSubscription(updated) };
  }

  async adminHistoryForUser(userId: string) {
    const user = await this.getUserOr404(userId);
    return this.prisma.billingHistory.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async adminHistoryFeed() {
    const rows = await this.prisma.billingHistory.findMany({
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({ ...r, username: r.user.username }));
  }
}
