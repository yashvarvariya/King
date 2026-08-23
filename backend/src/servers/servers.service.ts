import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import simpleGit from 'simple-git';
import { PrismaService } from '../prisma/prisma.service';
import { DockerService } from '../docker/docker.service';
import { RedisService } from '../common/redis/redis.service';
import { RuntimesService } from '../runtimes/runtimes.service';
import { CreateServerDto, UpdateSettingsDto, ImportGithubDto } from './dto';

const SERVERS_ROOT = process.env.SERVERS_ROOT || '/srv/bot-hosting/servers';

@Injectable()
export class ServersService {
  constructor(
    private prisma: PrismaService,
    private docker: DockerService,
    private redis: RedisService,
    private runtimes: RuntimesService,
  ) {}

  private hostPath(containerName: string) {
    return path.join(SERVERS_ROOT, containerName);
  }

  private defaultStartupCommand(runtime: 'NODEJS' | 'PYTHON') {
    return runtime === 'NODEJS'
      ? 'npm install --omit=dev 2>/dev/null; node index.js'
      : 'pip install -r requirements.txt 2>/dev/null; python3 main.py';
  }

  async list(userId: string) {
    return this.prisma.server.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' } });
  }

  async findOwned(serverId: string, userId: string, isAdmin = false) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: { envVars: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (server.ownerId !== userId && !isAdmin) throw new ForbiddenException();
    return server;
  }

  /**
   * @param bypassQuota Skips both the Free-plan single-server cap and the
   * per-user maxServers quota. Only ever passed `true` by AdminService, which
   * is explicitly allowed to create unlimited servers for any user.
   */
  async create(userId: string, dto: CreateServerDto, bypassQuota = false) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.suspended) throw new ForbiddenException('Account suspended');

    if (!bypassQuota) {
      const count = await this.prisma.server.count({ where: { ownerId: userId } });

      // Free plan: capped at exactly one server, regardless of any
      // admin-configured maxServers quota. Premium users are governed by
      // maxServers only (existing quota behavior, unchanged).
      if (!user.isPremium && count >= 1) {
        throw new ForbiddenException({
          freePlanLimit: true,
          message: 'Free Plan Limit Reached',
        });
      }
      if (count >= user.maxServers) {
        throw new BadRequestException(`Server quota reached (${user.maxServers} max)`);
      }
    }

    // Runtime Manager catalog selection is optional and all-or-nothing:
    // provide both ids together, or neither (legacy hardcoded-image path).
    let runtimeEngineId: string | undefined;
    let runtimeVersionId: string | undefined;
    let runtimeFamily: 'NODEJS' | 'PYTHON' = dto.runtime;
    if (dto.runtimeEngineId || dto.runtimeVersionId) {
      if (!dto.runtimeEngineId || !dto.runtimeVersionId) {
        throw new BadRequestException('Provide both runtimeEngineId and runtimeVersionId, or neither');
      }
      const result = await this.runtimes.validateEngineVersion(dto.runtimeEngineId, dto.runtimeVersionId);
      if (!result.valid) throw new BadRequestException(result.error);
      runtimeEngineId = dto.runtimeEngineId;
      runtimeVersionId = dto.runtimeVersionId;
      // The catalog engine's family is the source of truth once a catalog
      // selection is made — takes priority over whatever `runtime` the
      // client happened to send, so the two can never disagree.
      runtimeFamily = result.engine!.family;
    }

    const containerName = `bot-${userId.slice(0, 8)}-${Date.now()}`;
    const hostPath = this.hostPath(containerName);
    await fs.mkdir(hostPath, { recursive: true });

    const server = await this.prisma.server.create({
      data: {
        name: dto.name,
        description: dto.description,
        runtime: runtimeFamily,
        startupCommand: dto.startupCommand || this.defaultStartupCommand(runtimeFamily),
        runtimeEngineId,
        runtimeVersionId,
        containerName,
        status: 'OFFLINE',
        memoryLimitMb: Math.min(user.maxMemoryMb, 1024),
        cpuLimitPercent: Math.min(user.maxCpuPercent, 100),
        diskLimitMb: Math.min(user.maxDiskMb, 1024),
        ownerId: userId,
      },
    });

    // Container is created lazily on first Start so editing files/env before
    // the first boot doesn't require a rebuild.
    return server;
  }

  async rename(serverId: string, userId: string, name: string, isAdmin = false) {
    const server = await this.findOwned(serverId, userId, isAdmin);
    return this.prisma.server.update({ where: { id: server.id }, data: { name } });
  }

  async updateSettings(serverId: string, userId: string, dto: UpdateSettingsDto, isAdmin = false) {
    const server = await this.findOwned(serverId, userId, isAdmin);

    let runtimeEngineId = server.runtimeEngineId;
    let runtimeVersionId = server.runtimeVersionId;
    let runtime = server.runtime;
    if (dto.runtimeEngineId !== undefined || dto.runtimeVersionId !== undefined) {
      const nextEngineId = dto.runtimeEngineId ?? server.runtimeEngineId ?? undefined;
      const nextVersionId = dto.runtimeVersionId ?? server.runtimeVersionId ?? undefined;
      if (!nextEngineId || !nextVersionId) {
        throw new BadRequestException('Provide both runtimeEngineId and runtimeVersionId, or neither');
      }
      const result = await this.runtimes.validateEngineVersion(nextEngineId, nextVersionId);
      if (!result.valid) throw new BadRequestException(result.error);
      runtimeEngineId = nextEngineId;
      runtimeVersionId = nextVersionId;
      runtime = result.engine!.family;
    }

    return this.prisma.server.update({
      where: { id: server.id },
      data: {
        startupCommand: dto.startupCommand ?? server.startupCommand,
        autoRestart: dto.autoRestart ?? server.autoRestart,
        autoBackupEnabled: dto.autoBackupEnabled ?? server.autoBackupEnabled,
        backupRetention: dto.backupRetention ?? server.backupRetention,
        runtime,
        runtimeEngineId,
        runtimeVersionId,
      },
    });
  }

  async updateEnv(serverId: string, userId: string, env: Record<string, string>, isAdmin = false) {
    const server = await this.findOwned(serverId, userId, isAdmin);
    await this.prisma.$transaction([
      this.prisma.envVar.deleteMany({ where: { serverId: server.id } }),
      this.prisma.envVar.createMany({
        data: Object.entries(env).map(([key, value]) => ({ serverId: server.id, key, value })),
      }),
    ]);
    return this.prisma.envVar.findMany({ where: { serverId: server.id } });
  }

  async remove(serverId: string, userId: string, isAdmin = false) {
    const server = await this.findOwned(serverId, userId, isAdmin);
    if (server.containerId) {
      await this.docker.remove(server.containerId);
    }
    await fs.rm(this.hostPath(server.containerName), { recursive: true, force: true }).catch(() => undefined);
    await this.prisma.server.delete({ where: { id: server.id } });
    return { success: true };
  }

  async suspend(serverId: string, userId: string, suspended: boolean, isAdmin = false) {
    const server = await this.findOwned(serverId, userId, isAdmin);
    if (suspended && server.containerId) {
      await this.docker.stop(server.containerId).catch(() => undefined);
    }
    return this.prisma.server.update({
      where: { id: server.id },
      data: { suspended, status: suspended ? 'SUSPENDED' : 'OFFLINE' },
    });
  }

  /** Ensures the underlying Docker container exists, (re)creating it with current settings. */
  private async ensureContainer(server: any) {
    if (server.containerId) {
      try {
        await this.docker.inspect(server.containerId);
        return server.containerId;
      } catch {
        // container was removed out-of-band; fall through and recreate
      }
    }

    const envVars = await this.prisma.envVar.findMany({ where: { serverId: server.id } });
    const env = Object.fromEntries(envVars.map((e) => [e.key, e.value]));

    // Runtime Manager catalog override: only set on servers created (or
    // reconfigured) after this feature existed. Anything else falls back
    // to DockerService's legacy runtime -> hardcoded image map untouched.
    const image = server.runtimeVersionId
      ? (await this.runtimes.getVersion(server.runtimeVersionId))?.image
      : undefined;

    const containerId = await this.docker.createContainer({
      containerName: server.containerName,
      hostPath: this.hostPath(server.containerName),
      runtime: server.runtime,
      startupCommand: server.startupCommand || this.defaultStartupCommand(server.runtime),
      env,
      memoryLimitMb: server.memoryLimitMb,
      cpuLimitPercent: server.cpuLimitPercent,
      image,
    });

    await this.prisma.server.update({ where: { id: server.id }, data: { containerId } });
    return containerId;
  }

  async start(serverId: string, userId: string, isAdmin = false) {
    const server = await this.findOwned(serverId, userId, isAdmin);
    if (server.suspended) throw new ForbiddenException('Server is suspended');

    const containerId = await this.ensureContainer(server);
    await this.docker.start(containerId);
    return this.prisma.server.update({ where: { id: server.id }, data: { status: 'RUNNING' } });
  }

  async stop(serverId: string, userId: string, isAdmin = false) {
    const server = await this.findOwned(serverId, userId, isAdmin);
    if (server.containerId) await this.docker.stop(server.containerId);
    return this.prisma.server.update({ where: { id: server.id }, data: { status: 'OFFLINE' } });
  }

  async restart(serverId: string, userId: string, isAdmin = false) {
    const server = await this.findOwned(serverId, userId, isAdmin);
    const containerId = await this.ensureContainer(server);
    await this.docker.restart(containerId);
    return this.prisma.server.update({ where: { id: server.id }, data: { status: 'RUNNING' } });
  }

  async kill(serverId: string, userId: string, isAdmin = false) {
    const server = await this.findOwned(serverId, userId, isAdmin);
    if (server.containerId) await this.docker.kill(server.containerId);
    return this.prisma.server.update({ where: { id: server.id }, data: { status: 'OFFLINE' } });
  }

  /** Auto-detects package.json / requirements.txt and installs dependencies. */
  async installDependencies(serverId: string, userId: string, isAdmin = false) {
    const server = await this.findOwned(serverId, userId, isAdmin);
    const dir = this.hostPath(server.containerName);

    const hasPackageJson = fsSync.existsSync(path.join(dir, 'package.json'));
    const hasRequirements = fsSync.existsSync(path.join(dir, 'requirements.txt'));

    if (!hasPackageJson && !hasRequirements) {
      throw new BadRequestException('No package.json or requirements.txt found');
    }

    const containerId = await this.ensureContainer(server);
    // container must be running for `exec`
    await this.docker.start(containerId).catch(() => undefined);

    const cmd = hasPackageJson ? ['sh', '-c', 'npm install'] : ['sh', '-c', 'pip install -r requirements.txt'];
    const result = await this.docker.exec(containerId, cmd);

    return {
      detected: hasPackageJson ? 'package.json (Node.js)' : 'requirements.txt (Python)',
      exitCode: result.exitCode,
      output: result.output,
    };
  }

  async importGithub(serverId: string, userId: string, dto: ImportGithubDto, isAdmin = false) {
    const server = await this.findOwned(serverId, userId, isAdmin);
    const dir = this.hostPath(server.containerName);

    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/.test(dto.repoUrl)) {
      throw new BadRequestException('Only https://github.com/<owner>/<repo> URLs are supported');
    }

    const git = simpleGit();
    await git.clone(dto.repoUrl, dir, dto.branch ? ['--branch', dto.branch, '--depth', '1'] : ['--depth', '1']);
    return { success: true };
  }

  /** Pulls the latest changes for a server previously imported from GitHub. */
  async pullLatest(serverId: string, userId: string, isAdmin = false) {
    const server = await this.findOwned(serverId, userId, isAdmin);
    const dir = this.hostPath(server.containerName);
    if (!fsSync.existsSync(path.join(dir, '.git'))) {
      throw new BadRequestException('This server was not imported from GitHub');
    }
    const git = simpleGit(dir);
    const result = await git.pull();
    return { success: true, summary: result.summary, files: result.files };
  }

  /** Server information panel: container id, image, runtime, network, uptime. */
  async getInfo(serverId: string, userId: string, isAdmin = false) {
    const server = await this.findOwned(serverId, userId, isAdmin);

    if (!server.containerId) {
      return {
        status: server.status,
        containerId: null,
        image: null,
        runtime: server.runtime,
        network: null,
        startedAt: null,
      };
    }

    try {
      const info: any = await this.docker.inspect(server.containerId);
      const networks = info.NetworkSettings?.Networks || {};
      const networkName = Object.keys(networks)[0] || null;
      return {
        status: server.status,
        containerId: server.containerId.slice(0, 12),
        image: info.Config?.Image || null,
        runtime: server.runtime,
        network: networkName
          ? { name: networkName, ipAddress: networks[networkName]?.IPAddress || null }
          : null,
        startedAt: info.State?.StartedAt || null,
      };
    } catch {
      return {
        status: server.status,
        containerId: server.containerId.slice(0, 12),
        image: null,
        runtime: server.runtime,
        network: null,
        startedAt: null,
      };
    }
  }

  async getStats(serverId: string, userId: string, isAdmin = false) {
    const server = await this.findOwned(serverId, userId, isAdmin);

    // Short cache so several tabs/polls hitting the same server within the
    // same couple of seconds don't each trigger a fresh Docker Engine call.
    const cacheKey = `stats:${server.id}`;
    const cached = await this.redis.getJSON<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    let diskUsedMb = 0;
    try {
      const dir = this.hostPath(server.containerName);
      diskUsedMb = await this.dirSizeMb(dir);
    } catch {
      diskUsedMb = 0;
    }

    if (!server.containerId || server.status !== 'RUNNING') {
      const idleResult = {
        cpuPercent: 0,
        memoryUsedMb: 0,
        memoryLimitMb: server.memoryLimitMb,
        diskUsedMb,
        diskLimitMb: server.diskLimitMb,
        status: server.status,
      };
      await this.redis.setJSON(cacheKey, idleResult, 2);
      return idleResult;
    }

    const live = await this.docker.stats(server.containerId).catch(() => ({
      cpuPercent: 0,
      memoryUsedMb: 0,
      memoryLimitMb: server.memoryLimitMb,
    }));

    const result = { ...live, diskUsedMb, diskLimitMb: server.diskLimitMb, status: server.status };
    await this.redis.setJSON(cacheKey, result, 2);
    return result;
  }

  private async dirSizeMb(dir: string): Promise<number> {
    let total = 0;
    async function walk(p: string) {
      const entries = await fs.readdir(p, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(p, entry.name);
        if (entry.isDirectory()) await walk(full);
        else {
          const stat = await fs.stat(full).catch(() => null);
          if (stat) total += stat.size;
        }
      }
    }
    await walk(dir).catch(() => undefined);
    return Number((total / 1024 / 1024).toFixed(2));
  }

  hostPathFor(server: { containerName: string }) {
    return this.hostPath(server.containerName);
  }
}
