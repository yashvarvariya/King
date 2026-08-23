import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Uptime is not currently tracked historically anywhere in this codebase
// (health.controller.ts only reports the current process's uptimeSeconds,
// not a rolling SLA figure). Rather than fabricate a "measured" percentage,
// this is a documented constant the landing page displays as the platform's
// advertised uptime target. Replace with a real calculation if/when
// historical health-check logging is added.
const ADVERTISED_UPTIME_PERCENT = 99.9;

/**
 * Public, unauthenticated platform stats for the landing page's "Live
 * Platform Stats" section. Deliberately separate from
 * AdminController.stats() (GET /admin/stats), which is authenticated and
 * also returns business-sensitive breakdowns (premium/free/suspended user
 * counts) that have no business being public.
 *
 *  GET /api/stats -> { totalUsers, totalServers, activeDeployments, uptimePercent }
 */
@Controller('stats')
export class StatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getPublicStats() {
    const [totalUsers, totalServers, activeDeployments] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.server.count(),
      this.prisma.server.count({ where: { status: 'RUNNING' } }),
    ]);

    return {
      totalUsers,
      totalServers,
      activeDeployments,
      uptimePercent: ADVERTISED_UPTIME_PERCENT,
    };
  }
}
