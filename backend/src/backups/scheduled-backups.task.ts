import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { BACKUP_QUEUE } from '../queue/queue.module';

/**
 * Once a day, enqueues a backup job for every non-suspended server that has
 * opted into automatic backups (Server.autoBackupEnabled). Actual archiving
 * happens in BackupsProcessor so this stays fast even with many servers.
 */
@Injectable()
export class ScheduledBackupsTask {
  private readonly logger = new Logger(ScheduledBackupsTask.name);

  constructor(private prisma: PrismaService, @Inject(BACKUP_QUEUE) private backupQueue: Queue) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron() {
    const servers = await this.prisma.server.findMany({
      where: { autoBackupEnabled: true, suspended: false },
      select: { id: true, ownerId: true },
    });

    for (const server of servers) {
      await this.backupQueue.add(
        'create',
        { serverId: server.id, userId: server.ownerId, isAdmin: true },
        { removeOnComplete: 50, removeOnFail: 50, attempts: 2 },
      );
    }

    if (servers.length > 0) {
      this.logger.log(`Enqueued ${servers.length} scheduled backup(s)`);
    }
  }
}
