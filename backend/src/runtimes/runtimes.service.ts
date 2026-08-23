import { Injectable } from '@nestjs/common';
import { Prisma, RuntimeEngine, RuntimeEngineVersion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRuntimeEngineDto, CreateRuntimeVersionDto, UpdateRuntimeEngineDto, UpdateRuntimeVersionDto } from './dto';

function slugify(name: string): string {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export interface SerializedVersion {
  id: string;
  runtimeEngineId: string;
  version: string;
  image: string;
  enabled: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedEngine {
  id: string;
  name: string;
  icon: string;
  description: string;
  family: 'NODEJS' | 'PYTHON';
  enabled: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  versions?: SerializedVersion[];
}

function serializeVersion(v: RuntimeEngineVersion): SerializedVersion {
  return {
    id: v.id,
    runtimeEngineId: v.runtimeEngineId,
    version: v.version,
    image: v.image,
    enabled: v.enabled,
    displayOrder: v.displayOrder,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

function serializeEngine(e: RuntimeEngine, versions?: RuntimeEngineVersion[]): SerializedEngine {
  return {
    id: e.id,
    name: e.name,
    icon: e.icon,
    description: e.description,
    family: e.family,
    enabled: e.enabled,
    displayOrder: e.displayOrder,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    versions: versions ? versions.map(serializeVersion) : undefined,
  };
}

@Injectable()
export class RuntimesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Reads --------------------------------------------------------------

  async getVersionsForEngine(engineId: string, opts: { activeOnly?: boolean } = {}): Promise<SerializedVersion[]> {
    const rows = await this.prisma.runtimeEngineVersion.findMany({
      where: opts.activeOnly ? { runtimeEngineId: engineId, enabled: true } : { runtimeEngineId: engineId },
      orderBy: [{ displayOrder: 'asc' }, { version: 'asc' }],
    });
    return rows.map(serializeVersion);
  }

  async listEngines(
    opts: { activeOnly?: boolean; withVersions?: boolean; activeVersionsOnly?: boolean } = {},
  ): Promise<SerializedEngine[]> {
    const rows = await this.prisma.runtimeEngine.findMany({
      where: opts.activeOnly ? { enabled: true } : undefined,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    if (!opts.withVersions) return rows.map((r) => serializeEngine(r));
    return Promise.all(
      rows.map(async (r) => serializeEngine(r, await this.rawVersionsForEngine(r.id, opts.activeVersionsOnly))),
    );
  }

  private async rawVersionsForEngine(engineId: string, activeOnly?: boolean) {
    return this.prisma.runtimeEngineVersion.findMany({
      where: activeOnly ? { runtimeEngineId: engineId, enabled: true } : { runtimeEngineId: engineId },
      orderBy: [{ displayOrder: 'asc' }, { version: 'asc' }],
    });
  }

  async getEngine(
    id: string,
    opts: { withVersions?: boolean; activeVersionsOnly?: boolean } = {},
  ): Promise<SerializedEngine | null> {
    if (!id) return null;
    const row = await this.prisma.runtimeEngine.findUnique({ where: { id } });
    if (!row) return null;
    if (!opts.withVersions) return serializeEngine(row);
    return serializeEngine(row, await this.rawVersionsForEngine(id, opts.activeVersionsOnly));
  }

  async getEngineByName(name: string): Promise<SerializedEngine | null> {
    if (!name) return null;
    const row = await this.prisma.runtimeEngine.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    return row ? serializeEngine(row) : null;
  }

  async getVersion(versionId: string): Promise<SerializedVersion | null> {
    if (!versionId) return null;
    const row = await this.prisma.runtimeEngineVersion.findUnique({ where: { id: versionId } });
    return row ? serializeVersion(row) : null;
  }

  async searchEngines(opts: { search?: string; enabled?: string | boolean }): Promise<SerializedEngine[]> {
    let engines = await this.listEngines({ withVersions: true });
    if (opts.search) {
      const q = String(opts.search).trim().toLowerCase();
      engines = engines.filter((e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
    }
    if (opts.enabled === 'true' || opts.enabled === true) engines = engines.filter((e) => e.enabled);
    if (opts.enabled === 'false' || opts.enabled === false) engines = engines.filter((e) => !e.enabled);
    return engines;
  }

  async getDefaults() {
    const row = await this.prisma.runtimeDefaults.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
    return {
      defaultRuntimeEngineId: row.defaultRuntimeEngineId,
      defaultRuntimeVersionId: row.defaultRuntimeVersionId,
      defaultRuntimeEngine: row.defaultRuntimeEngineId ? await this.getEngine(row.defaultRuntimeEngineId) : null,
      defaultRuntimeVersion: row.defaultRuntimeVersionId ? await this.getVersion(row.defaultRuntimeVersionId) : null,
    };
  }

  // ---- Validation -----------------------------------------------------
  // The rule the task calls out explicitly: an engine and version must
  // actually belong together, and (unless explicitly allowed) both sides
  // must be enabled.
  async validateEngineVersion(
    engineId: string,
    versionId: string,
    { requireEnabled = true }: { requireEnabled?: boolean } = {},
  ): Promise<{ valid: boolean; error?: string; engine?: SerializedEngine; version?: SerializedVersion }> {
    if (!engineId || !versionId) return { valid: false, error: 'Both runtime and runtime version are required' };

    const engine = await this.prisma.runtimeEngine.findUnique({ where: { id: engineId } });
    if (!engine) return { valid: false, error: `Unknown runtime: ${engineId}` };
    if (requireEnabled && !engine.enabled) return { valid: false, error: `Runtime "${engine.name}" is currently disabled` };

    const version = await this.prisma.runtimeEngineVersion.findUnique({ where: { id: versionId } });
    if (!version) return { valid: false, error: 'Unknown runtime version' };
    if (version.runtimeEngineId !== engineId) {
      return { valid: false, error: `Version "${version.version}" does not belong to runtime "${engine.name}"` };
    }
    if (requireEnabled && !version.enabled) {
      return { valid: false, error: `Version "${version.version}" of ${engine.name} is currently disabled` };
    }

    return { valid: true, engine: serializeEngine(engine), version: serializeVersion(version) };
  }

  async serversUsingEngine(id: string): Promise<number> {
    return this.prisma.server.count({ where: { runtimeEngineId: id } });
  }

  async serversUsingVersion(id: string): Promise<number> {
    return this.prisma.server.count({ where: { runtimeVersionId: id } });
  }

  // ---- Mutations: Engines (Admin > Runtime Manager) -----------------------

  async createEngine(data: CreateRuntimeEngineDto): Promise<{ engine?: SerializedEngine; errors?: string[] }> {
    const errors: string[] = [];
    if (!data.name?.trim()) errors.push('Runtime name is required');
    if (!data.family) errors.push('Runtime family (NODEJS or PYTHON) is required');
    if (data.name?.trim()) {
      const existing = await this.getEngineByName(data.name.trim());
      if (existing) errors.push(`A runtime named "${data.name}" already exists`);
    }
    if (errors.length) return { errors };

    let id = slugify(data.name);
    if (!id) id = `runtime_${Date.now()}`;
    let candidate = id;
    let suffix = 2;
    // eslint-disable-next-line no-await-in-loop
    while (await this.prisma.runtimeEngine.findUnique({ where: { id: candidate }, select: { id: true } })) {
      candidate = `${id}_${suffix}`;
      suffix += 1;
    }
    id = candidate;

    const maxOrderRow = await this.prisma.runtimeEngine.aggregate({ _max: { displayOrder: true } });
    const maxOrder = maxOrderRow._max.displayOrder || 0;

    const row = await this.prisma.runtimeEngine.create({
      data: {
        id,
        name: data.name.trim(),
        icon: data.icon?.trim() || '⚙️',
        description: data.description?.trim() || '',
        family: data.family,
        enabled: data.enabled === undefined ? true : !!data.enabled,
        displayOrder: data.displayOrder ?? maxOrder + 1,
      },
    });

    return { engine: serializeEngine(row, []) };
  }

  async updateEngine(id: string, data: UpdateRuntimeEngineDto): Promise<{ engine?: SerializedEngine; errors?: string[] }> {
    const existing = await this.prisma.runtimeEngine.findUnique({ where: { id } });
    if (!existing) return { errors: ['Runtime not found'] };

    if (data.name !== undefined && data.name.trim() === '') return { errors: ['Runtime name cannot be empty'] };
    if (data.name !== undefined) {
      const other = await this.getEngineByName(data.name.trim());
      if (other && other.id !== id) return { errors: [`A runtime named "${data.name}" already exists`] };
    }

    const update: Prisma.RuntimeEngineUpdateInput = {};
    if (data.name !== undefined) update.name = data.name.trim();
    if (data.icon !== undefined) update.icon = data.icon.trim();
    if (data.description !== undefined) update.description = data.description.trim();
    if (data.family !== undefined) update.family = data.family;
    if (data.enabled !== undefined) update.enabled = !!data.enabled;
    if (data.displayOrder !== undefined) update.displayOrder = data.displayOrder;

    const row = await this.prisma.runtimeEngine.update({ where: { id }, data: update });
    return { engine: serializeEngine(row, await this.rawVersionsForEngine(id)) };
  }

  async setEngineEnabled(id: string, enabled: boolean): Promise<{ engine?: SerializedEngine; errors?: string[] }> {
    const existing = await this.prisma.runtimeEngine.findUnique({ where: { id } });
    if (!existing) return { errors: ['Runtime not found'] };
    const row = await this.prisma.runtimeEngine.update({ where: { id }, data: { enabled } });
    return { engine: serializeEngine(row, await this.rawVersionsForEngine(id)) };
  }

  async deleteEngine(id: string): Promise<{ deleted?: true; errors?: string[] }> {
    const existing = await this.prisma.runtimeEngine.findUnique({ where: { id } });
    if (!existing) return { errors: ['Runtime not found'] };
    const inUse = await this.serversUsingEngine(id);
    if (inUse > 0) {
      return {
        errors: [
          `Cannot delete "${existing.name}" — ${inUse} server${inUse === 1 ? '' : 's'} still use it. Disable it instead so existing servers keep working.`,
        ],
      };
    }
    await this.prisma.runtimeEngine.delete({ where: { id } }); // cascades to its versions
    const defaults = await this.prisma.runtimeDefaults.findUnique({ where: { id: 'singleton' } });
    if (defaults?.defaultRuntimeEngineId === id) {
      await this.prisma.runtimeDefaults.update({
        where: { id: 'singleton' },
        data: { defaultRuntimeEngineId: null, defaultRuntimeVersionId: null },
      });
    }
    return { deleted: true };
  }

  // ---- Mutations: Versions --------------------------------------------

  async createVersion(
    engineId: string,
    data: CreateRuntimeVersionDto,
  ): Promise<{ version?: SerializedVersion; errors?: string[] }> {
    const engine = await this.prisma.runtimeEngine.findUnique({ where: { id: engineId } });
    if (!engine) return { errors: ['Runtime not found'] };
    if (!data.version?.trim()) return { errors: ['Version label is required'] };
    if (!data.image?.trim()) return { errors: ['Docker image is required (e.g. "node:22-alpine")'] };

    const version = data.version.trim();
    const dupe = await this.prisma.runtimeEngineVersion.findFirst({
      where: { runtimeEngineId: engineId, version: { equals: version, mode: 'insensitive' } },
    });
    if (dupe) return { errors: [`Version "${version}" already exists for ${engine.name}`] };

    const maxOrderRow = await this.prisma.runtimeEngineVersion.aggregate({
      where: { runtimeEngineId: engineId },
      _max: { displayOrder: true },
    });
    const maxOrder = maxOrderRow._max.displayOrder || 0;

    const row = await this.prisma.runtimeEngineVersion.create({
      data: {
        runtimeEngineId: engineId,
        version,
        image: data.image.trim(),
        enabled: data.enabled === undefined ? true : !!data.enabled,
        displayOrder: data.displayOrder ?? maxOrder + 1,
      },
    });
    return { version: serializeVersion(row) };
  }

  async updateVersion(
    versionId: string,
    data: UpdateRuntimeVersionDto,
  ): Promise<{ version?: SerializedVersion; errors?: string[] }> {
    const existing = await this.prisma.runtimeEngineVersion.findUnique({ where: { id: versionId } });
    if (!existing) return { errors: ['Runtime version not found'] };

    if (data.version !== undefined && data.version.trim() === '') return { errors: ['Version label cannot be empty'] };
    if (data.version !== undefined) {
      const dupe = await this.prisma.runtimeEngineVersion.findFirst({
        where: {
          runtimeEngineId: existing.runtimeEngineId,
          version: { equals: data.version.trim(), mode: 'insensitive' },
          NOT: { id: versionId },
        },
      });
      if (dupe) return { errors: [`Version "${data.version}" already exists for this runtime`] };
    }
    if (data.image !== undefined && data.image.trim() === '') return { errors: ['Docker image cannot be empty'] };

    const update: Prisma.RuntimeEngineVersionUpdateInput = {};
    if (data.version !== undefined) update.version = data.version.trim();
    if (data.image !== undefined) update.image = data.image.trim();
    if (data.enabled !== undefined) update.enabled = !!data.enabled;
    if (data.displayOrder !== undefined) update.displayOrder = data.displayOrder;

    const row = await this.prisma.runtimeEngineVersion.update({ where: { id: versionId }, data: update });
    return { version: serializeVersion(row) };
  }

  async setVersionEnabled(versionId: string, enabled: boolean): Promise<{ version?: SerializedVersion; errors?: string[] }> {
    const existing = await this.prisma.runtimeEngineVersion.findUnique({ where: { id: versionId } });
    if (!existing) return { errors: ['Runtime version not found'] };
    const row = await this.prisma.runtimeEngineVersion.update({ where: { id: versionId }, data: { enabled } });
    return { version: serializeVersion(row) };
  }

  async deleteVersion(versionId: string): Promise<{ deleted?: true; errors?: string[] }> {
    const existing = await this.prisma.runtimeEngineVersion.findUnique({ where: { id: versionId } });
    if (!existing) return { errors: ['Runtime version not found'] };
    const inUse = await this.serversUsingVersion(versionId);
    if (inUse > 0) {
      return {
        errors: [
          `Cannot delete "${existing.version}" — ${inUse} server${inUse === 1 ? '' : 's'} still use it. Disable it instead so existing servers keep working.`,
        ],
      };
    }
    await this.prisma.runtimeEngineVersion.delete({ where: { id: versionId } });
    const defaults = await this.prisma.runtimeDefaults.findUnique({ where: { id: 'singleton' } });
    if (defaults?.defaultRuntimeVersionId === versionId) {
      await this.prisma.runtimeDefaults.update({ where: { id: 'singleton' }, data: { defaultRuntimeVersionId: null } });
    }
    return { deleted: true };
  }

  // ---- Defaults ---------------------------------------------------------

  async setDefaults(
    engineId: string | null | undefined,
    versionId: string | null | undefined,
    adminId: string,
  ): Promise<{ defaults?: Awaited<ReturnType<RuntimesService['getDefaults']>>; errors?: string[] }> {
    if (!engineId || !versionId) {
      await this.prisma.runtimeDefaults.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', updatedById: adminId },
        update: { defaultRuntimeEngineId: null, defaultRuntimeVersionId: null, updatedById: adminId },
      });
      return { defaults: await this.getDefaults() };
    }

    const result = await this.validateEngineVersion(engineId, versionId, { requireEnabled: false });
    if (!result.valid) return { errors: [result.error!] };

    await this.prisma.runtimeDefaults.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', defaultRuntimeEngineId: engineId, defaultRuntimeVersionId: versionId, updatedById: adminId },
      update: { defaultRuntimeEngineId: engineId, defaultRuntimeVersionId: versionId, updatedById: adminId },
    });
    return { defaults: await this.getDefaults() };
  }
}
