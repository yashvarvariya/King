import { Test } from '@nestjs/testing';
import { RedisService } from './redis.service';

// Swap the real ioredis client for ioredis-mock's in-memory implementation
// so these tests never need a running Redis server.
jest.mock('ioredis', () => require('ioredis-mock'));

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ providers: [RedisService] }).compile();
    service = module.get(RedisService);
  });

  afterEach(async () => {
    await service.client.flushall();
  });

  describe('getJSON / setJSON', () => {
    it('round-trips a JSON value with a TTL', async () => {
      await service.setJSON('server:1:stats', { cpuPercent: 12.5, memoryUsedMb: 128 }, 30);
      const result = await service.getJSON<{ cpuPercent: number; memoryUsedMb: number }>('server:1:stats');
      expect(result).toEqual({ cpuPercent: 12.5, memoryUsedMb: 128 });
    });

    it('returns null for a missing key', async () => {
      const result = await service.getJSON('does-not-exist');
      expect(result).toBeNull();
    });

    it('returns null instead of throwing on malformed stored JSON', async () => {
      await service.client.set('corrupt', 'not-valid-json{');
      const result = await service.getJSON('corrupt');
      expect(result).toBeNull();
    });
  });

  describe('del', () => {
    it('removes a stored key', async () => {
      await service.setJSON('to-delete', { a: 1 }, 30);
      await service.del('to-delete');
      const result = await service.getJSON('to-delete');
      expect(result).toBeNull();
    });
  });

  describe('duplicate', () => {
    it('returns a separate client instance for BullMQ', () => {
      const dup = service.duplicate();
      expect(dup).not.toBe(service.client);
    });
  });
});
