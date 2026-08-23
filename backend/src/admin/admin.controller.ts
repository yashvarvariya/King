import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { UpdateQuotasDto, CreateUserDto, AdminCreateServerDto } from './dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  // --- Dashboard ---------------------------------------------------------

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  // --- User management -----------------------------------------------------

  @Get('users')
  users() {
    return this.admin.listUsers();
  }

  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.admin.createUser(dto);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.admin.deleteUser(id);
  }

  @Post('users/:id/suspend')
  suspend(@Param('id') id: string) {
    return this.admin.setSuspended(id, true);
  }

  @Post('users/:id/unsuspend')
  unsuspend(@Param('id') id: string) {
    return this.admin.setSuspended(id, false);
  }

  @Post('users/:id/reset-password')
  resetPassword(@Param('id') id: string) {
    return this.admin.resetPassword(id);
  }

  @Post('users/:id/reset-email-verification')
  resetEmailVerification(@Param('id') id: string) {
    return this.admin.resetEmailVerification(id);
  }

  @Post('users/:id/grant-premium')
  grantPremium(@Param('id') id: string) {
    return this.admin.grantPremium(id);
  }

  @Post('users/:id/remove-premium')
  removePremium(@Param('id') id: string) {
    return this.admin.removePremium(id);
  }

  @Patch('users/:id/quotas')
  updateQuotas(@Param('id') id: string, @Body() dto: UpdateQuotasDto) {
    return this.admin.updateQuotas(id, dto);
  }

  @Patch('users/:id/role')
  setRole(@Param('id') id: string, @Body() body: { role: 'USER' | 'ADMIN' }) {
    return this.admin.setRole(id, body.role);
  }

  // --- Server management -----------------------------------------------------

  @Get('servers')
  servers() {
    return this.admin.listAllServers();
  }

  @Post('servers')
  createServer(@Body() dto: AdminCreateServerDto) {
    return this.admin.createServerForUser(dto);
  }

  @Delete('servers/:id')
  deleteServer(@Param('id') id: string, @CurrentUser() user: any) {
    return this.admin.deleteServer(id, user.id);
  }

  @Post('servers/:id/force-stop')
  forceStop(@Param('id') id: string, @CurrentUser() user: any) {
    return this.admin.forceStop(id, user.id);
  }

  @Post('servers/:id/force-restart')
  forceRestart(@Param('id') id: string, @CurrentUser() user: any) {
    return this.admin.forceRestart(id, user.id);
  }

  @Post('servers/:id/force-kill')
  forceKill(@Param('id') id: string, @CurrentUser() user: any) {
    return this.admin.forceKill(id, user.id);
  }

  @Patch('servers/:id/resources')
  updateServerResources(
    @Param('id') id: string,
    @Body() dto: { memoryLimitMb?: number; cpuLimitPercent?: number; diskLimitMb?: number },
  ) {
    return this.admin.updateServerResources(id, dto);
  }
}
