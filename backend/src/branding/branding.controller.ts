import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { BrandingService } from './branding.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('branding')
export class BrandingController {
  constructor(private branding: BrandingService) {}

  @Get()
  get() {
    return this.branding.getCached();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch()
  update(@Body() data: any) {
    return this.branding.update(data);
  }
}
