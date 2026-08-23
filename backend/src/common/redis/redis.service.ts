import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Thin wrapper around a single ioredis connection, shared across the app for:
 *  - short-lived caching (e.g. container stats, to avoid hammering the Docker
 *    Engine API when multiple browser tabs/panels poll the same server)
 *  - the BullMQ connection (see backups queue)
 *  - the connection used by the Nest Throttler storage adapter
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
    this.client.on('connect', () => this.logger.log('Connected to Redis'));
  }

  /** Returns a duplicated connection suitable for BullMQ (which requires its own connection). */
  duplicate(): Redis {
    return this.client.duplicate({
      maxRetriesPerRequest: null,
    });
  }

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJSON(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
