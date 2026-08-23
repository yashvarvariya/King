import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ServersModule } from './servers/servers.module';
import { DockerModule } from './docker/docker.module';
import { FilesModule } from './files/files.module';
import { ConsoleModule } from './console/console.module';
import { BackupsModule } from './backups/backups.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { StatsModule } from './stats/stats.module';
import { RedisModule } from './common/redis/redis.module';
import { MailModule } from './common/mail/mail.module';
import { QueueModule } from './queue/queue.module';
import { BrandingModule } from './branding/branding.module';
import { EmailModule } from './email/email.module';
import { PlansModule } from './plans/plans.module';
import { BillingModule } from './billing/billing.module';
import { RuntimesModule } from './runtimes/runtimes.module';
import { DiscordBotModule } from './discord-bot/discord-bot.module';
import { PlatformAccessGuard } from './common/guards/platform-access.guard';

@Module({
  imports: [
    ScheduleModule.forRoot(), // powers the auto-restart / stats-poll / scheduled-backup crons
    ThrottlerModule.forRoot([
      {
        // Default API-wide rate limit; individual routes (login/register)
        // apply their own stricter @Throttle() overrides.
        ttl: 60_000,
        limit: 120,
      },
    ]),
    RedisModule,
    MailModule,
    QueueModule,
    PrismaModule,
    HealthModule,
    StatsModule,
    AuthModule,
    UsersModule,
    DockerModule,
    ServersModule,
    FilesModule,
    ConsoleModule,
    BackupsModule,
    AdminModule,
    BrandingModule,
    EmailModule,
    PlansModule,
    BillingModule,
    RuntimesModule,
    DiscordBotModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Maintenance mode + account suspension + activity tracking, applied
    // ahead of every route. See PlatformAccessGuard for what it does and
    // does not do — it never replaces the real auth guards.
    {
      provide: APP_GUARD,
      useClass: PlatformAccessGuard,
    },
  ],
})
export class AppModule {}
