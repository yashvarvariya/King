import { Module } from '@nestjs/common';
import { ConsoleGateway } from './console.gateway';
import { DockerModule } from '../docker/docker.module';

@Module({
  imports: [DockerModule],
  providers: [ConsoleGateway],
})
export class ConsoleModule {}
