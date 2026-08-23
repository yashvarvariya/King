import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ServersModule } from '../servers/servers.module';

@Module({
  imports: [ServersModule],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
