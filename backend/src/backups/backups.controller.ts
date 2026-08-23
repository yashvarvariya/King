import { Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BackupsService } from './backups.service';

@UseGuards(JwtAuthGuard)
@Controller('servers/:serverId/backups')
export class BackupsController {
  constructor(private backups: BackupsService) {}

  private isAdmin(user: any) {
    return user.role === 'ADMIN';
  }

  @Get()
  list(@Param('serverId') serverId: string, @CurrentUser() user: any) {
    return this.backups.list(serverId, user.id, this.isAdmin(user));
  }

  // Backups can be slow to create; throttle harder than the default so one
  // user can't queue dozens back-to-back and starve the worker pool.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  create(@Param('serverId') serverId: string, @CurrentUser() user: any) {
    return this.backups.requestBackup(serverId, user.id, this.isAdmin(user));
  }

  @Post(':backupId/restore')
  restore(@Param('serverId') serverId: string, @Param('backupId') backupId: string, @CurrentUser() user: any) {
    return this.backups.restore(serverId, backupId, user.id, this.isAdmin(user));
  }

  @Get(':backupId/download')
  async download(
    @Param('serverId') serverId: string,
    @Param('backupId') backupId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const { filePath, fileName } = await this.backups.getDownloadPath(
      serverId,
      backupId,
      user.id,
      this.isAdmin(user),
    );
    res.download(filePath, fileName);
  }

  @Delete(':backupId')
  remove(@Param('serverId') serverId: string, @Param('backupId') backupId: string, @CurrentUser() user: any) {
    return this.backups.remove(serverId, backupId, user.id, this.isAdmin(user));
  }
}
