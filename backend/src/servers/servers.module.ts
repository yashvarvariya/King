import { Module } from '@nestjs/common';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { DockerModule } from '../docker/docker.module';
import { RuntimesModule } from '../runtimes/runtimes.module';
import { AutoRestartTask } from './auto-restart.task';
import { InactivityTask } from './inactivity.task';

@Module({
  imports: [DockerModule, RuntimesModule],
  providers: [ServersService, AutoRestartTask, InactivityTask],
  controllers: [ServersController],
  exports: [ServersService],
})
export class ServersModule {}
