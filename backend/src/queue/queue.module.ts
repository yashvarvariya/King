import { Global, Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisModule } from '../common/redis/redis.module';
import { RedisService } from '../common/redis/redis.service';

export const BACKUP_QUEUE = 'BACKUP_QUEUE';

/**
 * Provides a single shared BullMQ Queue (backed by Redis) used to run backup
 * creation as a background job instead of blocking the HTTP request thread.
 * The corresponding Worker lives in backups.module.ts (BackupsProcessor),
 * kept there so the queue's job payload stays close to the domain code that
 * understands it.
 */
@Global()
@Module({
  imports: [RedisModule],
  providers: [
    {
      provide: BACKUP_QUEUE,
      useFactory: (redis: RedisService) =>
        new Queue('backups', { connection: redis.duplicate() }),
      inject: [RedisService],
    },
  ],
  exports: [BACKUP_QUEUE],
})
export class QueueModule {}
