import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DiscordBotService } from './discord-bot.service';
import { SaveDiscordSettingsDto, TestDiscordConnectionDto } from './dto';

@Controller('discord-bot')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class DiscordBotController {
  constructor(private readonly bot: DiscordBotService) {}

  @Get('settings')
  async getSettings() {
    const settings = await this.bot.getSettings();
    return { settings: this.bot.serializeForAdmin(settings) };
  }

  // If saving completes the configuration (all four fields now set) and
  // the bot isn't already connecting/online, it's started automatically
  // here — this satisfies "the bot must automatically start when
  // configured" without the admin also having to press Start.
  @Post('settings')
  async saveSettings(@Body() dto: SaveDiscordSettingsDto, @CurrentUser() admin: { id: string }) {
    if (
      dto.clientId === undefined &&
      dto.guildId === undefined &&
      dto.ownerDiscordId === undefined &&
      !dto.botToken
    ) {
      throw new BadRequestException('Provide at least one field to save');
    }

    const updated = await this.bot.saveSettings(dto, admin.id);

    let autoStartWarning: string | null = null;
    const current = this.bot.getStatus();
    if (this.bot.isConfigured(updated) && current.status !== 'online' && current.status !== 'connecting') {
      try {
        await this.bot.connect(updated);
        await this.bot.markDesiredState('running');
      } catch (err: any) {
        // Saving must still succeed even if the bot can't connect right
        // now (e.g. a bad token) — the admin sees why in the response.
        autoStartWarning = err.message;
      }
    }

    return {
      message: 'Discord bot settings saved',
      settings: this.bot.serializeForAdmin(await this.bot.getSettings()),
      status: this.bot.getStatus(),
      autoStartWarning,
    };
  }

  @Get('status')
  async getStatus() {
    const settings = await this.bot.getSettings();
    return { status: this.bot.getStatus(), configured: this.bot.isConfigured(settings) };
  }

  @Post('test-connection')
  async testConnection(@Body() dto: TestDiscordConnectionDto) {
    const result = await this.bot.testConnection(dto);
    if (!result.ok) throw new BadRequestException(result.error);
    return { message: `Connected successfully as ${result.botTag} to "${result.guildName}"`, ...result };
  }

  @Post('start')
  async start() {
    try {
      const status = await this.bot.connect();
      await this.bot.markDesiredState('running');
      return { message: 'Bot starting', status };
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Post('stop')
  async stop() {
    await this.bot.stop();
    await this.bot.markDesiredState('stopped');
    return { message: 'Bot stopped', status: this.bot.getStatus() };
  }

  @Post('restart')
  async restart() {
    try {
      const status = await this.bot.restart();
      await this.bot.markDesiredState('running');
      return { message: 'Bot restarting', status };
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Get('logs')
  async logs(@Query('limit') limit?: string) {
    return { logs: await this.bot.recentLogs(limit ? Number(limit) : undefined) };
  }
}
