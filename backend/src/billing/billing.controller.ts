import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  AssignSubscriptionDto,
  ChangePlanDto,
  ExtendSubscriptionDto,
  NoteDto,
  SUBSCRIPTION_STATUSES,
  UpdateBillingStatsDto,
} from './dto';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // ===================================================================
  // Plan catalog — any authenticated user; admins can pass ?all=true to
  // see disabled plans too (e.g. to reassign a user off one).
  // ===================================================================
  @Get('plans')
  getPlans(@Query('all') all: string, @CurrentUser() user: { role: string }) {
    const includeInactive = all === 'true' && user.role === 'ADMIN';
    return this.billing.getPlansCatalog(includeInactive);
  }

  // ===================================================================
  // User-facing billing dashboard
  // ===================================================================
  @Get('me')
  getMine(@CurrentUser() user: { id: string }) {
    return this.billing.getMySubscription(user.id).then((subscription) => ({ subscription }));
  }

  @Get('me/history')
  getMyHistory(@CurrentUser() user: { id: string }) {
    return this.billing.getMyHistory(user.id).then((history) => ({ history }));
  }

  @Get('me/notifications')
  getMyNotifications(@Query('unread') unread: string, @CurrentUser() user: { id: string }) {
    return this.billing.getMyNotifications(user.id, unread === 'true').then((notifications) => ({ notifications }));
  }

  @Post('me/notifications/:id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.billing.markNotificationRead(user.id, id);
  }

  @Post('me/notifications/read-all')
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.billing.markAllNotificationsRead(user.id);
  }

  // ===================================================================
  // Admin billing panel. Suspend/unsuspend/cancel/extend/assign are
  // deliberately admin-only: there's no payment gateway wired up, so a
  // human verifies payment (e.g. over Discord) before any of this runs.
  // ===================================================================

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('admin/overview')
  overview() {
    return this.billing.adminOverview();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/stats')
  updateStats(@Body() dto: UpdateBillingStatsDto, @CurrentUser() admin: { id: string }) {
    return this.billing.updateStats(dto, admin.id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('admin/subscriptions')
  listSubscriptions(@Query('status') status?: string) {
    const valid = SUBSCRIPTION_STATUSES.includes(status as any) ? (status as SubscriptionStatus) : undefined;
    return this.billing.adminListSubscriptions(valid).then((subscriptions) => ({ subscriptions }));
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('admin/subscriptions/:userId')
  getSubscription(@Param('userId') userId: string) {
    return this.billing.adminGetSubscription(userId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('admin/subscriptions/:userId')
  assignSubscription(
    @Param('userId') userId: string,
    @Body() dto: AssignSubscriptionDto,
    @CurrentUser() admin: { id: string },
  ) {
    return this.billing.adminAssignSubscription(userId, dto, admin.id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/subscriptions/:userId/plan')
  changePlan(@Param('userId') userId: string, @Body() dto: ChangePlanDto, @CurrentUser() admin: { id: string }) {
    return this.billing.adminChangePlan(userId, dto.planId, admin.id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/subscriptions/:userId/extend')
  extend(@Param('userId') userId: string, @Body() dto: ExtendSubscriptionDto, @CurrentUser() admin: { id: string }) {
    return this.billing.adminExtendSubscription(userId, dto, admin.id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('admin/subscriptions/:userId/suspend')
  suspend(@Param('userId') userId: string, @Body() dto: NoteDto, @CurrentUser() admin: { id: string }) {
    return this.billing.adminSuspend(userId, dto.note, admin.id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('admin/subscriptions/:userId/unsuspend')
  unsuspend(
    @Param('userId') userId: string,
    @Body() dto: ExtendSubscriptionDto,
    @CurrentUser() admin: { id: string },
  ) {
    return this.billing.adminUnsuspend(userId, dto, admin.id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('admin/subscriptions/:userId/cancel')
  cancel(@Param('userId') userId: string, @Body() dto: NoteDto, @CurrentUser() admin: { id: string }) {
    return this.billing.adminCancel(userId, dto.note, admin.id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('admin/history/:userId')
  historyForUser(@Param('userId') userId: string) {
    return this.billing.adminHistoryForUser(userId).then((history) => ({ history }));
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('admin/history')
  historyFeed() {
    return this.billing.adminHistoryFeed().then((history) => ({ history }));
  }
}
