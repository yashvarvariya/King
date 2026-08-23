import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { EmailSettingsService } from './email-settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  UpdateSmtpSettingsDto,
  TestSmtpDto,
  UpdateEmailTemplateDto,
  UpdateEmailValidationSettingsDto,
  AddDomainDto,
} from './dto';

@Controller('email-settings')
export class EmailSettingsController {
  constructor(private readonly emailSettings: EmailSettingsService) {}

  // Used by the register page for instant client-side feedback. Exposes
  // only what's needed to validate an email locally — never SMTP creds or
  // template content.
  @Get('validation/public')
  getValidationPublic() {
    return this.emailSettings.getValidationSettingsPublic();
  }

  // --- Everything below is Admin > Email Settings -----------------------

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('smtp')
  getSmtp() {
    return this.emailSettings.getSmtp();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('smtp')
  updateSmtp(@Body() dto: UpdateSmtpSettingsDto, @CurrentUser() user: any) {
    return this.emailSettings.updateSmtp(dto, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('smtp/test')
  testSmtp(@Body() dto: TestSmtpDto) {
    return this.emailSettings.sendTestEmail(dto.to);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('templates')
  listTemplates() {
    return this.emailSettings.listTemplates();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('templates/:type')
  getTemplate(@Param('type') type: string) {
    return this.emailSettings.getTemplate(type);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('templates/:type')
  updateTemplate(@Param('type') type: string, @Body() dto: UpdateEmailTemplateDto, @CurrentUser() user: any) {
    return this.emailSettings.updateTemplate(type, dto, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('validation')
  getValidation() {
    return this.emailSettings.getValidationSettings();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('validation')
  updateValidation(@Body() dto: UpdateEmailValidationSettingsDto, @CurrentUser() user: any) {
    return this.emailSettings.updateValidationSettings(dto, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('validation/allowed')
  addAllowed(@Body() dto: AddDomainDto, @CurrentUser() user: any) {
    return this.emailSettings.addDomain('allowedDomains', dto.domain, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('validation/allowed/:domain')
  removeAllowed(@Param('domain') domain: string, @CurrentUser() user: any) {
    return this.emailSettings.removeDomain('allowedDomains', domain, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('validation/blocked')
  addBlocked(@Body() dto: AddDomainDto, @CurrentUser() user: any) {
    return this.emailSettings.addDomain('blockedDomains', dto.domain, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('validation/blocked/:domain')
  removeBlocked(@Param('domain') domain: string, @CurrentUser() user: any) {
    return this.emailSettings.removeDomain('blockedDomains', domain, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('logs')
  listLogs(@Query('limit') limit?: string) {
    return this.emailSettings.listLogs(limit ? parseInt(limit, 10) : undefined);
  }
}
