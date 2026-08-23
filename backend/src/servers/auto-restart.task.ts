import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { DockerService } from '../docker/docker.service';

/**
 * Every 30 seconds, checks all servers marked RUNNING in the DB and, if their
 * container has actually exited and autoRestart is enabled, restarts it.
 * This is what makes "Auto Restart" behave like a process supervisor without
 * relying on Docker's own restart policy (which we intentionally disable so
 * suspensions/kills are respected).
 */
@Injectable()
export class AutoRestartTask {
  private readonly logger = new Logger(AutoRestartTask.name);

  constructor(private prisma: PrismaService, private docker: DockerService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron() {
    const candidates = await this.prisma.server.findMany({
      where: { status: 'RUNNING', suspended: false, autoRestart: true, containerId: { not: null } },
    });

    for (const server of candidates) {
      try {
        const info = await this.docker.inspect(server.containerId as string);
        const running = info.State?.Running;
        if (!running) {
          this.logger.warn(`Server ${server.name} (${server.id}) exited unexpectedly — auto-restarting`);
          await this.docker.start(server.containerId as string);
        }
      } catch (err) {
        this.logger.error(`Failed to check/restart server ${server.id}: ${(err as Error).message}`);
        await this.prisma.server.update({ where: { id: server.id }, data: { status: 'ERRORED' } });
      }
    }
  }
}
