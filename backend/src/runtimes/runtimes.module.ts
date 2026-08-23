import { Module } from '@nestjs/common';
import { RuntimesController } from './runtimes.controller';
import { RuntimesService } from './runtimes.service';

@Module({
  controllers: [RuntimesController],
  providers: [RuntimesService],
  exports: [RuntimesService],
})
export class RuntimesModule {}
