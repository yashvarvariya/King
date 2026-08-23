import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { existsSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

/**
 * Health endpoints for load balancers, container orchestrators, and uptime
 * monitors. Deliberately unauthenticated (they must be reachable before a
 * caller has a JWT) and excluded from the throttler-heavy /api prefix logic
 * is unaffected since ThrottlerGuard limits are generous (120 req/min).
 *
 *  GET /api/health        -> liveness: process is up, no dependency checks
 *  GET /api/health/ready  -> readiness: DB + Redis + Docker socket reachable
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  liveness() {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async readiness() {
    const checks = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      dockerSocket: this.checkDockerSocket(),
    };

    const allHealthy = Object.values(checks).every((c) => c.ok);

    if (!allHealthy) {
      throw new ServiceUnavailableException({
        status: 'error',
        checks,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
    }
  }

  private async checkRedis(): Promise<{ ok: boolean; error?: string }> {
    try {
      const pong = await this.redis.client.ping();
      return { ok: pong === 'PONG' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
    }
  }

  private checkDockerSocket(): { ok: boolean; error?: string } {
    const socketPath = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
    const ok = existsSync(socketPath);
    return ok ? { ok: true } : { ok: false, error: `${socketPath} not found` };
  }
}
