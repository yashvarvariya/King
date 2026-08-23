import { Module } from '@nestjs/common';
import { BackupsService } from './backups.service';
import { BackupsController } from './backups.controller';
import { BackupsProcessor } from './backups.processor';
import { ScheduledBackupsTask } from './scheduled-backups.task';
import { ServersModule } from '../servers/servers.module';

@Module({
  imports: [ServersModule],
  providers: [BackupsService, BackupsProcessor, ScheduledBackupsTask],
  controllers: [BackupsController],
})
export class BackupsModule {}
