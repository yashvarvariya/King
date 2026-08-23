import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import archiver from 'archiver';
import * as unzipper from 'unzipper';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ServersService } from '../servers/servers.service';
import { BACKUP_QUEUE } from '../queue/queue.module';

const BACKUPS_ROOT = process.env.BACKUPS_ROOT || '/srv/bot-hosting/backups';

@Injectable()
export class BackupsService {
  constructor(
    private prisma: PrismaService,
    private serversService: ServersService,
    @Inject(BACKUP_QUEUE) private backupQueue: Queue,
  ) {}

  async list(serverId: string, userId: string, isAdmin = false) {
    await this.serversService.findOwned(serverId, userId, isAdmin);
    return this.prisma.backup.findMany({ where: { serverId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Enqueues backup creation as a background BullMQ job so the HTTP request
   * returns immediately instead of blocking on archiving a potentially large
   * server directory. Returns the job id the client can poll/ignore.
   */
  async requestBackup(serverId: string, userId: string, isAdmin = false) {
    await this.serversService.findOwned(serverId, userId, isAdmin);
    const job = await this.backupQueue.add(
      'create',
      { serverId, userId, isAdmin },
      { removeOnComplete: 50, removeOnFail: 50, attempts: 2 },
    );
    return { queued: true, jobId: job.id };
  }

  /** Does the actual archiving. Called by the BullMQ worker (see backups.processor.ts). */
  async createNow(serverId: string, userId: string, isAdmin = false) {
    const server = await this.serversService.findOwned(serverId, userId, isAdmin);
    const sourceDir = this.serversService.hostPathFor(server);

    await fsp.mkdir(BACKUPS_ROOT, { recursive: true });
    const fileName = `${server.id}-${Date.now()}.zip`;
    const dest = path.join(BACKUPS_ROOT, fileName);

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(dest);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });

    const stat = await fsp.stat(dest);
    const backup = await this.prisma.backup.create({
      data: { fileName, sizeBytes: BigInt(stat.size), serverId: server.id },
    });

    await this.pruneOldBackups(server.id, server.backupRetention);
    return backup;
  }

  /** Keeps only the N most recent backups for a server, deleting the rest from disk + DB. */
  async pruneOldBackups(serverId: string, retention: number) {
    const all = await this.prisma.backup.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
    });
    const toDelete = all.slice(Math.max(retention, 1));
    for (const backup of toDelete) {
      await fsp.rm(path.join(BACKUPS_ROOT, backup.fileName), { force: true }).catch(() => undefined);
      await this.prisma.backup.delete({ where: { id: backup.id } }).catch(() => undefined);
    }
  }

  async restore(serverId: string, backupId: string, userId: string, isAdmin = false) {
    const server = await this.serversService.findOwned(serverId, userId, isAdmin);
    const backup = await this.prisma.backup.findUnique({ where: { id: backupId } });
    if (!backup || backup.serverId !== server.id) throw new NotFoundException('Backup not found');

    const zipPath = path.join(BACKUPS_ROOT, backup.fileName);
    const destDir = this.serversService.hostPathFor(server);

    await fsp.rm(destDir, { recursive: true, force: true });
    await fsp.mkdir(destDir, { recursive: true });

    const directory = await unzipper.Open.file(zipPath);
    for (const file of directory.files) {
      const target = path.join(destDir, file.path);
      if (!target.startsWith(path.resolve(destDir))) continue;
      if (file.type === 'Directory') {
        await fsp.mkdir(target, { recursive: true });
      } else {
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.writeFile(target, await file.buffer());
      }
    }

    return { success: true };
  }

  async remove(serverId: string, backupId: string, userId: string, isAdmin = false) {
    const server = await this.serversService.findOwned(serverId, userId, isAdmin);
    const backup = await this.prisma.backup.findUnique({ where: { id: backupId } });
    if (!backup || backup.serverId !== server.id) throw new NotFoundException('Backup not found');

    await fsp.rm(path.join(BACKUPS_ROOT, backup.fileName), { force: true });
    await this.prisma.backup.delete({ where: { id: backupId } });
    return { success: true };
  }

  /** Resolves the on-disk path for a download, verifying ownership first. */
  async getDownloadPath(serverId: string, backupId: string, userId: string, isAdmin = false) {
    const server = await this.serversService.findOwned(serverId, userId, isAdmin);
    const backup = await this.prisma.backup.findUnique({ where: { id: backupId } });
    if (!backup || backup.serverId !== server.id) throw new NotFoundException('Backup not found');

    const filePath = path.join(BACKUPS_ROOT, backup.fileName);
    if (!fs.existsSync(filePath)) throw new NotFoundException('Backup file missing on disk');
    return { filePath, fileName: backup.fileName };
  }
}
