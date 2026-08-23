import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { RedisService } from '../common/redis/redis.service';
import { BackupsService } from './backups.service';

interface BackupJobData {
  serverId: string;
  userId: string;
  isAdmin: boolean;
}

/**
 * Consumes the 'backups' BullMQ queue and performs the actual (potentially
 * slow) archiving work outside the HTTP request/response cycle.
 */
@Injectable()
export class BackupsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupsProcessor.name);
  private worker?: Worker;

  constructor(private redis: RedisService, private backupsService: BackupsService) {}

  onModuleInit() {
    this.worker = new Worker(
      'backups',
      async (job: Job<BackupJobData>) => {
        const { serverId, userId, isAdmin } = job.data;
        return this.backupsService.createNow(serverId, userId, isAdmin);
      },
      { connection: this.redis.duplicate(), concurrency: 2 },
    );

    this.worker.on('completed', (job) => this.logger.log(`Backup job ${job.id} completed`));
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Backup job ${job?.id} failed: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
