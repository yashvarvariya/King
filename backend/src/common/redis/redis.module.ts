import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Global module so any feature module can inject RedisService without
 * re-importing it everywhere. Backs: stats caching, throttler storage,
 * and the BullMQ connection used by the backup queue.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
