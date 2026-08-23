import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { PlansService } from '../plans/plans.service';

const COLORS = { success: 0x22c55e, error: 0xef4444, info: 0x6366f1 };

function baseEmbed(title: string, color: number) {
  return { title, color, timestamp: new Date().toISOString(), footer: { text: 'Bot Hosting Platform' } };
}

export function errorEmbed(message: string) {
  return { embeds: [{ ...baseEmbed('❌ Error', COLORS.error), description: message }] };
}

function successEmbed(title: string, description: string, fields: { name: string; value: string; inline?: boolean }[] = []) {
  return { embeds: [{ ...baseEmbed(`✅ ${title}`, COLORS.success), description, fields }] };
}

function notRegisteredReply() {
  return errorEmbed('This email is not registered. Ask the user to create an account first.');
}

export interface DiscordCommandDef {
  name: string;
  description: string;
  // Discord.js SlashCommandBuilder options, described generically so this
  // file has no hard type dependency on discord.js (it's built lazily —
  // see DiscordBotService.loadDiscordJs).
  options?: {
    type: 'string' | 'integer';
    name: string;
    description: string;
    required?: boolean;
    minValue?: number;
  }[];
  execute: (input: {
    getString: (name: string, required?: boolean) => string;
    getInteger: (name: string) => number | null;
    performedByLabel: string;
  }) => Promise<any>;
}

@Injectable()
export class DiscordCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly plans: PlansService,
  ) {}

  private async findUserByEmail(email: string) {
    if (!email) return null;
    return this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
      select: { id: true, username: true, email: true, role: true },
    });
  }

  // Accepts either a plan id (e.g. "starter_plus") or its display name
  // (e.g. "Starter+") — resolved against the live Pricing Manager catalog,
  // never a hardcoded list.
  private async resolvePlan(input: string) {
    if (!input) return null;
    const raw = input.trim();
    const byId = await this.plans.getPlan(raw);
    if (byId) return byId;
    return this.plans.getPlanByName(raw);
  }

  private async availablePlanNames(): Promise<string[]> {
    const plans = await this.plans.getAllPlans({ activeOnly: true });
    return plans.map((p) => p.name);
  }

  get commands(): DiscordCommandDef[] {
    return [
      // ---- /deploy ----
      {
        name: 'deploy',
        description: 'Assign a hosting plan to a registered user',
        options: [
          { type: 'string', name: 'email', description: "The user's account email", required: true },
          { type: 'string', name: 'plan', description: 'Plan name (see /listplans)', required: true },
          { type: 'integer', name: 'duration', description: 'Duration in days (default 30)', minValue: 1 },
        ],
        execute: async ({ getString, getInteger, performedByLabel }) => {
          const email = getString('email', true);
          const planInput = getString('plan', true);
          const duration = getInteger('duration') || 30;

          const user = await this.findUserByEmail(email);
          if (!user) return notRegisteredReply();

          const plan = await this.resolvePlan(planInput);
          if (!plan) {
            const names = await this.availablePlanNames();
            return errorEmbed(`Unknown plan "${planInput}". Available plans: ${names.join(', ') || 'none configured'}.`);
          }

          const expiryDate = plan.lifetime ? undefined : new Date(Date.now() + duration * 86400000).toISOString();
          const result = await this.billing.adminAssignSubscription(
            user.id,
            { planId: plan.id, expiryDate },
            `discord:${performedByLabel}`,
          );
          const sub = result.subscription;
          return successEmbed('Plan Deployed', `Activated **${plan.name}** for **${user.username}** (${email}).`, [
            { name: 'Status', value: sub.status, inline: true },
            { name: 'Expiry', value: sub.expiryDate ? new Date(sub.expiryDate).toLocaleDateString() : 'Never (lifetime)', inline: true },
            { name: 'Duration', value: plan.lifetime ? 'Lifetime' : `${duration} day(s)`, inline: true },
          ]);
        },
      },

      // ---- /renew ----
      {
        name: 'renew',
        description: 'Renew an existing subscription',
        options: [
          { type: 'string', name: 'email', description: "The user's account email", required: true },
          { type: 'integer', name: 'duration', description: 'Days to add (default 30)', minValue: 1 },
        ],
        execute: async ({ getString, getInteger, performedByLabel }) => {
          const email = getString('email', true);
          const duration = getInteger('duration') || 30;

          const user = await this.findUserByEmail(email);
          if (!user) return notRegisteredReply();

          try {
            const result = await this.billing.adminExtendSubscription(user.id, { days: duration }, `discord:${performedByLabel}`);
            const sub = result.subscription;
            return successEmbed('Subscription Renewed', `Renewed **${user.username}**'s subscription by ${duration} day(s).`, [
              { name: 'Status', value: sub.status, inline: true },
              { name: 'New Expiry', value: sub.expiryDate ? new Date(sub.expiryDate).toLocaleDateString() : 'Never (lifetime)', inline: true },
            ]);
          } catch (err: any) {
            return errorEmbed(err.message);
          }
        },
      },

      // ---- /changeplan ----
      {
        name: 'changeplan',
        description: "Upgrade or downgrade a user's plan",
        options: [
          { type: 'string', name: 'email', description: "The user's account email", required: true },
          { type: 'string', name: 'plan', description: 'New plan name (see /listplans)', required: true },
        ],
        execute: async ({ getString, performedByLabel }) => {
          const email = getString('email', true);
          const planInput = getString('plan', true);

          const user = await this.findUserByEmail(email);
          if (!user) return notRegisteredReply();

          const plan = await this.resolvePlan(planInput);
          if (!plan) {
            const names = await this.availablePlanNames();
            return errorEmbed(`Unknown plan "${planInput}". Available plans: ${names.join(', ') || 'none configured'}.`);
          }

          try {
            const result = await this.billing.adminChangePlan(user.id, plan.id, `discord:${performedByLabel}`);
            const sub = result.subscription;
            return successEmbed('Plan Changed', `**${user.username}** is now on **${plan.name}**.`, [
              { name: 'Status', value: sub.status, inline: true },
              { name: 'Expiry', value: sub.expiryDate ? new Date(sub.expiryDate).toLocaleDateString() : 'Never (lifetime)', inline: true },
            ]);
          } catch (err: any) {
            return errorEmbed(err.message);
          }
        },
      },

      // ---- /suspend ----
      {
        name: 'suspend',
        description: "Suspend a user's subscription",
        options: [{ type: 'string', name: 'email', description: "The user's account email", required: true }],
        execute: async ({ getString, performedByLabel }) => {
          const email = getString('email', true);
          const user = await this.findUserByEmail(email);
          if (!user) return notRegisteredReply();

          try {
            await this.billing.adminSuspend(user.id, `via Discord bot by ${performedByLabel}`, `discord:${performedByLabel}`);
            return successEmbed('Subscription Suspended', `**${user.username}**'s subscription has been suspended.`);
          } catch (err: any) {
            return errorEmbed(err.message);
          }
        },
      },

      // ---- /unsuspend ----
      {
        name: 'unsuspend',
        description: 'Restore a suspended subscription',
        options: [
          { type: 'string', name: 'email', description: "The user's account email", required: true },
          { type: 'integer', name: 'duration', description: 'Days to grant (defaults to 30 if already expired)', minValue: 1 },
        ],
        execute: async ({ getString, getInteger, performedByLabel }) => {
          const email = getString('email', true);
          const duration = getInteger('duration') || undefined;
          const user = await this.findUserByEmail(email);
          if (!user) return notRegisteredReply();

          try {
            const result = await this.billing.adminUnsuspend(user.id, { days: duration }, `discord:${performedByLabel}`);
            const sub = result.subscription;
            return successEmbed('Subscription Restored', `**${user.username}**'s access has been restored.`, [
              { name: 'Status', value: sub.status, inline: true },
              { name: 'Expiry', value: sub.expiryDate ? new Date(sub.expiryDate).toLocaleDateString() : 'Never (lifetime)', inline: true },
            ]);
          } catch (err: any) {
            return errorEmbed(err.message);
          }
        },
      },

      // ---- /userinfo ----
      {
        name: 'userinfo',
        description: "Show a user's account, plan, and server info",
        options: [{ type: 'string', name: 'email', description: "The user's account email", required: true }],
        execute: async ({ getString }) => {
          const email = getString('email', true);
          const user = await this.findUserByEmail(email);
          if (!user) return notRegisteredReply();

          const { subscription } = await this.billing.adminGetSubscription(user.id);
          const serverCount = await this.prisma.server.count({ where: { ownerId: user.id } });

          return {
            embeds: [
              {
                ...baseEmbed(`👤 ${user.username}`, COLORS.info),
                fields: [
                  { name: 'Email', value: user.email || 'Not set', inline: true },
                  { name: 'Current Plan', value: subscription.planName, inline: true },
                  { name: 'Plan Status', value: subscription.status, inline: true },
                  {
                    name: 'Expiry Date',
                    value: subscription.expiryDate ? new Date(subscription.expiryDate).toLocaleDateString() : 'Never (lifetime)',
                    inline: true,
                  },
                  { name: 'Server Count', value: String(serverCount), inline: true },
                ],
              },
            ],
          };
        },
      },

      // ---- /listplans ----
      {
        name: 'listplans',
        description: 'Display all available hosting plans',
        execute: async () => {
          // Reads live from the Pricing Manager catalog — never hardcoded.
          const activePlans = await this.plans.getAllPlans({ activeOnly: true });
          if (activePlans.length === 0) return errorEmbed('No active plans are configured in the Pricing Manager.');

          const fields = activePlans.map((p) => ({
            name: `${p.name}${p.badgeLabel ? ` (${p.badgeLabel})` : ''}`,
            value: `💲 ${p.lifetime ? 'Free/Lifetime' : `$${p.price}/mo`} · RAM ${p.ram} · Storage ${p.storage} · CPU ${p.cpu} · Servers ${p.maxServers}`,
          }));

          return { embeds: [{ ...baseEmbed('📦 Available Plans', COLORS.info), fields }] };
        },
      },
    ];
  }

  findCommand(name: string): DiscordCommandDef | undefined {
    return this.commands.find((c) => c.name === name);
  }
}
