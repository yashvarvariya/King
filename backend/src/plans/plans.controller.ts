import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreatePlanDto, UpdatePlanDto, SetPlanActiveDto, ReorderPlansDto } from './dto';

@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  // Public, unauthenticated catalog (active plans only) — powers the
  // landing page pricing section.
  @Get()
  getPublicCatalog() {
    return this.plans.getAllPlans({ activeOnly: true });
  }

  // --- Everything below is Admin > Pricing Manager -----------------------

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin')
  search(
    @Query('search') search?: string,
    @Query('active') active?: string,
    @Query('lifetime') lifetime?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
  ) {
    return this.plans.searchPlans({ search, active, lifetime, sortBy, order });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/:id')
  async getOne(@Param('id') id: string) {
    const plan = await this.plans.getPlan(id);
    if (!plan) throw new NotFoundException('Plan not found');
    const subscriptionsUsingPlan = await this.plans.subscriptionCountForPlan(id);
    return { plan, subscriptionsUsingPlan };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin')
  async create(@Body() dto: CreatePlanDto) {
    const result = await this.plans.createPlan(dto);
    if (result.errors) throw new BadRequestException(result.errors.join('; '));
    return { message: 'Plan created', plan: result.plan };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/:id')
  async update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    const result = await this.plans.updatePlan(id, dto);
    if (result.errors) {
      if (result.errors[0] === 'Plan not found') throw new NotFoundException(result.errors[0]);
      throw new BadRequestException(result.errors.join('; '));
    }
    return { message: 'Plan saved', plan: result.plan };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/:id/status')
  async setStatus(@Param('id') id: string, @Body() dto: SetPlanActiveDto) {
    const result = await this.plans.setActive(id, dto.active);
    if (result.errors) throw new NotFoundException(result.errors.join('; '));
    return { message: dto.active ? 'Plan enabled' : 'Plan disabled', plan: result.plan };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/:id/duplicate')
  async duplicate(@Param('id') id: string) {
    const result = await this.plans.duplicatePlan(id);
    if (result.errors) {
      if (result.errors[0] === 'Plan not found') throw new NotFoundException(result.errors[0]);
      throw new BadRequestException(result.errors.join('; '));
    }
    return { message: 'Plan duplicated', plan: result.plan };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('admin/:id')
  async remove(@Param('id') id: string) {
    const result = await this.plans.deletePlan(id);
    if (result.errors) {
      if (result.errors[0] === 'Plan not found') throw new NotFoundException(result.errors[0]);
      throw new ConflictException(result.errors.join('; '));
    }
    return { message: 'Plan deleted' };
  }

  // Nested under /admin/reorder/all (rather than /admin/reorder) so it
  // never collides with the /admin/:id routes above for a plan literally
  // named "reorder".
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/reorder/all')
  async reorder(@Body() dto: ReorderPlansDto) {
    const result = await this.plans.reorderPlans(dto.order);
    if (result.errors) throw new BadRequestException(result.errors.join('; '));
    return { message: 'Display order updated', plans: result.plans };
  }
}
