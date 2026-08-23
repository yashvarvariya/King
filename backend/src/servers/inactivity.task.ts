import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { DockerService } from '../docker/docker.service';

const INACTIVITY_DAYS = 5;

/**
 * Free-plan inactivity policy: if a Free user hasn't made an authenticated
 * request in 5 consecutive days (tracked by PlatformAccessGuard), every
 * running server they own is stopped. Files, the Docker container, and the
 * database records are left completely untouched — only the running process
 * is stopped, so the next login just needs a "Start Server" click.
 * Premium users are never affected (see the isPremium filter below).
 */
@Injectable()
export class InactivityTask {
  private readonly logger = new Logger(InactivityTask.name);

  constructor(private prisma: PrismaService, private docker: DockerService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);

    const inactiveFreeUserIds = (
      await this.prisma.user.findMany({
        where: { isPremium: false, suspended: false, lastActiveAt: { lt: cutoff } },
        select: { id: true },
      })
    ).map((u) => u.id);

    if (inactiveFreeUserIds.length === 0) return;

    const runningServers = await this.prisma.server.findMany({
      where: { ownerId: { in: inactiveFreeUserIds }, status: 'RUNNING' },
    });

    for (const server of runningServers) {
      try {
        if (server.containerId) {
          await this.docker.stop(server.containerId).catch(() => undefined);
        }
        await this.prisma.server.update({ where: { id: server.id }, data: { status: 'OFFLINE' } });
        this.logger.log(
          `Auto-stopped server ${server.name} (${server.id}) — owner inactive ${INACTIVITY_DAYS}+ days on Free plan`,
        );
      } catch (err) {
        this.logger.error(`Inactivity auto-stop failed for server ${server.id}: ${(err as Error).message}`);
      }
    }
  }
}
