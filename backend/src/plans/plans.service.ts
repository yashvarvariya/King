import { Injectable } from '@nestjs/common';
import { Plan, PlanBadge, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto, UpdatePlanDto } from './dto';

export const BADGES = ['NONE', 'FREE', 'MOST_POPULAR', 'BEST_VALUE', 'NEW', 'LIMITED_OFFER'] as const;

const BADGE_LABELS: Record<string, string | null> = {
  NONE: null,
  FREE: 'Free',
  MOST_POPULAR: 'Most Popular',
  BEST_VALUE: 'Best Value',
  NEW: 'New',
  LIMITED_OFFER: 'Limited Offer',
};

export interface SerializedPlan {
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
  active: boolean;
  displayOrder: number;
  badge: PlanBadge;
  badgeLabel: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Legacy shape some call sites (Discord bot / older frontend code) still
  // read — kept so nothing that renders a plan needs its field lookups
  // rewritten.
  period: 'lifetime' | 'mo';
  specs: { ram: string; ssd: string; cpu: string; servers: string };
}

function serialize(plan: Plan): SerializedPlan {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    oldPrice: plan.oldPrice,
    price: plan.price,
    ram: plan.ram,
    storage: plan.storage,
    cpu: plan.cpu,
    maxServers: plan.maxServers,
    lifetime: plan.lifetime,
    active: plan.active,
    displayOrder: plan.displayOrder,
    badge: plan.badge,
    badgeLabel: BADGE_LABELS[plan.badge] ?? null,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    period: plan.lifetime ? 'lifetime' : 'mo',
    specs: { ram: plan.ram, ssd: plan.storage, cpu: plan.cpu, servers: plan.maxServers },
  };
}

function slugify(name: string): string {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function parseLeadingNumber(value: unknown): number | null {
  const match = String(value).trim().match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

// A validator-only shape covering every field either DTO can carry —
// avoids relying on TS to intersect two classes whose `oldPrice` types
// differ slightly (Create disallows null, Update allows it to clear it).
type PlanInputLike = {
  name?: string;
  description?: string;
  oldPrice?: number | null;
  price?: number;
  ram?: string;
  storage?: string;
  cpu?: string;
  maxServers?: string;
  lifetime?: boolean;
  active?: boolean;
  displayOrder?: number;
  badge?: string;
};

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllPlans(opts: { activeOnly?: boolean } = {}): Promise<SerializedPlan[]> {
    const rows = await this.prisma.plan.findMany({
      where: opts.activeOnly ? { active: true } : undefined,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(serialize);
  }

  async getPlan(id: string): Promise<SerializedPlan | null> {
    if (!id) return null;
    const row = await this.prisma.plan.findUnique({ where: { id } });
    return row ? serialize(row) : null;
  }

  async getPlanByName(name: string): Promise<SerializedPlan | null> {
    if (!name) return null;
    const row = await this.prisma.plan.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    return row ? serialize(row) : null;
  }

  async isValidPlan(id: string): Promise<boolean> {
    if (!id) return false;
    const row = await this.prisma.plan.findUnique({ where: { id }, select: { id: true } });
    return !!row;
  }

  async getPlanOrder(activeOnly = false): Promise<string[]> {
    const plans = await this.getAllPlans({ activeOnly });
    return plans.map((p) => p.id);
  }

  async subscriptionCountForPlan(id: string): Promise<number> {
    return this.prisma.subscription.count({ where: { planId: id } });
  }

  // ---- Validation --------------------------------------------------------

  private async validatePlanInput(
    data: PlanInputLike,
    { partial = false, excludeId }: { partial?: boolean; excludeId?: string } = {},
  ): Promise<string[]> {
    const errors: string[] = [];
    const has = (key: string) => Object.prototype.hasOwnProperty.call(data, key);

    const requiredIfNotPartial = (key: string, label: string) => {
      const value = (data as any)[key];
      if (!partial && (value === undefined || value === null || String(value).trim() === '')) {
        errors.push(`${label} is required`);
      }
    };

    requiredIfNotPartial('name', 'Plan Name');
    requiredIfNotPartial('ram', 'RAM');
    requiredIfNotPartial('storage', 'Storage');
    requiredIfNotPartial('cpu', 'CPU');
    requiredIfNotPartial('maxServers', 'Maximum Servers');
    if (!partial && (data.price === undefined || data.price === null)) {
      errors.push('Current Price is required');
    }

    if (has('name') && String((data as any).name).trim() !== '') {
      const existing = await this.getPlanByName(String((data as any).name).trim());
      if (existing && existing.id !== excludeId) {
        errors.push(`A plan named "${(data as any).name}" already exists`);
      }
    }

    if (has('price') && data.price !== undefined && data.price !== null) {
      if (Number.isNaN(Number(data.price))) errors.push('Current Price must be a number');
      else if (Number(data.price) < 0) errors.push('Current Price cannot be negative');
    }
    if (has('oldPrice') && (data as any).oldPrice !== undefined && (data as any).oldPrice !== null) {
      const n = Number((data as any).oldPrice);
      if (Number.isNaN(n)) errors.push('Old Price must be a number');
      else if (n < 0) errors.push('Old Price cannot be negative');
    }

    for (const [key, label] of [
      ['ram', 'RAM'],
      ['storage', 'Storage'],
      ['cpu', 'CPU'],
    ] as const) {
      const value = (data as any)[key];
      if (has(key) && value !== undefined && String(value).trim() !== '') {
        const n = parseLeadingNumber(value);
        if (n !== null && n < 0) errors.push(`${label} cannot be negative`);
      }
    }

    if (has('maxServers') && String((data as any).maxServers).trim() !== '') {
      const raw = String((data as any).maxServers).trim();
      if (raw.toLowerCase() !== 'unlimited') {
        const n = parseLeadingNumber(raw);
        if (n === null || n < 0) errors.push('Maximum Servers must be "Unlimited" or a non-negative number');
      }
    }

    if (has('displayOrder') && (data as any).displayOrder !== undefined && (data as any).displayOrder !== null) {
      if (Number.isNaN(Number((data as any).displayOrder))) errors.push('Display Order must be a number');
    }

    return errors;
  }

  // ---- Mutations (Pricing Manager) ---------------------------------------

  async createPlan(data: CreatePlanDto): Promise<{ plan?: SerializedPlan; errors?: string[] }> {
    const errors = await this.validatePlanInput(data, { partial: false });
    if (errors.length) return { errors };

    let id = slugify(data.name);
    if (!id) id = `plan_${Date.now()}`;
    let candidate = id;
    let suffix = 2;
    // eslint-disable-next-line no-await-in-loop
    while (await this.prisma.plan.findUnique({ where: { id: candidate }, select: { id: true } })) {
      candidate = `${id}_${suffix}`;
      suffix += 1;
    }
    id = candidate;

    const maxOrderRow = await this.prisma.plan.aggregate({ _max: { displayOrder: true } });
    const maxOrder = maxOrderRow._max.displayOrder || 0;

    const row = await this.prisma.plan.create({
      data: {
        id,
        name: data.name.trim(),
        description: data.description?.trim() || '',
        oldPrice: data.oldPrice === undefined || data.oldPrice === null ? null : Number(data.oldPrice),
        price: Number(data.price),
        ram: data.ram.trim(),
        storage: data.storage.trim(),
        cpu: data.cpu.trim(),
        maxServers: data.maxServers.trim(),
        lifetime: !!data.lifetime,
        active: data.active === undefined ? true : !!data.active,
        displayOrder: data.displayOrder ?? maxOrder + 1,
        badge: (data.badge as PlanBadge) || 'NONE',
      },
    });

    return { plan: serialize(row) };
  }

  async updatePlan(id: string, data: UpdatePlanDto): Promise<{ plan?: SerializedPlan; errors?: string[] }> {
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) return { errors: ['Plan not found'] };

    const errors = await this.validatePlanInput(data, { partial: true, excludeId: id });
    if (errors.length) return { errors };

    const update: Prisma.PlanUpdateInput = {};
    if (data.name !== undefined) update.name = data.name.trim();
    if (data.description !== undefined) update.description = data.description.trim();
    if (data.oldPrice !== undefined) update.oldPrice = data.oldPrice === null ? null : Number(data.oldPrice);
    if (data.price !== undefined) update.price = Number(data.price);
    if (data.ram !== undefined) update.ram = data.ram.trim();
    if (data.storage !== undefined) update.storage = data.storage.trim();
    if (data.cpu !== undefined) update.cpu = data.cpu.trim();
    if (data.maxServers !== undefined) update.maxServers = data.maxServers.trim();
    if (data.lifetime !== undefined) update.lifetime = !!data.lifetime;
    if (data.active !== undefined) update.active = !!data.active;
    if (data.displayOrder !== undefined) update.displayOrder = data.displayOrder;
    if (data.badge !== undefined) update.badge = data.badge as PlanBadge;

    const row = await this.prisma.plan.update({ where: { id }, data: update });
    return { plan: serialize(row) };
  }

  async setActive(id: string, active: boolean): Promise<{ plan?: SerializedPlan; errors?: string[] }> {
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) return { errors: ['Plan not found'] };
    const row = await this.prisma.plan.update({ where: { id }, data: { active } });
    return { plan: serialize(row) };
  }

  async deletePlan(id: string): Promise<{ deleted?: true; errors?: string[] }> {
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) return { errors: ['Plan not found'] };
    const inUse = await this.subscriptionCountForPlan(id);
    if (inUse > 0) {
      return {
        errors: [
          `Cannot delete "${existing.name}" — ${inUse} subscription${inUse === 1 ? '' : 's'} still reference it. Disable it instead so existing users keep their plan until expiry.`,
        ],
      };
    }
    await this.prisma.plan.delete({ where: { id } });
    return { deleted: true };
  }

  async duplicatePlan(id: string): Promise<{ plan?: SerializedPlan; errors?: string[] }> {
    const existing = await this.getPlan(id);
    if (!existing) return { errors: ['Plan not found'] };

    let name = `${existing.name} (Copy)`;
    let n = 2;
    // eslint-disable-next-line no-await-in-loop
    while (await this.getPlanByName(name)) {
      name = `${existing.name} (Copy ${n})`;
      n += 1;
    }

    return this.createPlan({
      name,
      description: existing.description,
      oldPrice: existing.oldPrice ?? undefined,
      price: existing.price,
      ram: existing.ram,
      storage: existing.storage,
      cpu: existing.cpu,
      maxServers: existing.maxServers,
      lifetime: existing.lifetime,
      active: false, // duplicates start disabled so they don't appear on the storefront until reviewed
      badge: existing.badge as any,
    });
  }

  async reorderPlans(orderedIds: string[]): Promise<{ plans?: SerializedPlan[]; errors?: string[] }> {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return { errors: ['Provide an array of plan ids in the new order'] };
    }
    const all = new Set((await this.getAllPlans()).map((p) => p.id));
    for (const id of orderedIds) {
      if (!all.has(id)) return { errors: [`Unknown plan id: ${id}`] };
    }
    await this.prisma.$transaction(
      orderedIds.map((id, idx) => this.prisma.plan.update({ where: { id }, data: { displayOrder: idx + 1 } })),
    );
    return { plans: await this.getAllPlans() };
  }

  async searchPlans(opts: {
    search?: string;
    active?: string | boolean;
    lifetime?: string | boolean;
    sortBy?: string;
    order?: string;
  }): Promise<SerializedPlan[]> {
    let plans = await this.getAllPlans();

    if (opts.search) {
      const q = String(opts.search).trim().toLowerCase();
      plans = plans.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (opts.active === 'true' || opts.active === true) plans = plans.filter((p) => p.active);
    if (opts.active === 'false' || opts.active === false) plans = plans.filter((p) => !p.active);
    if (opts.lifetime === 'true' || opts.lifetime === true) plans = plans.filter((p) => p.lifetime);
    if (opts.lifetime === 'false' || opts.lifetime === false) plans = plans.filter((p) => !p.lifetime);

    const sortableNumeric = ['price', 'ram', 'storage', 'cpu', 'displayOrder'];
    if (opts.sortBy && sortableNumeric.includes(opts.sortBy)) {
      const key = opts.sortBy as 'price' | 'ram' | 'storage' | 'cpu' | 'displayOrder';
      const dir = opts.order === 'desc' ? -1 : 1;
      plans = [...plans].sort((a, b) => {
        const av = key === 'price' || key === 'displayOrder' ? Number(a[key]) : parseLeadingNumber(a[key]) ?? 0;
        const bv = key === 'price' || key === 'displayOrder' ? Number(b[key]) : parseLeadingNumber(b[key]) ?? 0;
        return (av - bv) * dir;
      });
    }

    return plans;
  }
}
