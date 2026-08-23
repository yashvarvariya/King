import { Module } from '@nestjs/common';
import { DiscordBotController } from './discord-bot.controller';
import { DiscordBotService } from './discord-bot.service';
import { DiscordCommandsService } from './discord-commands.service';
import { BillingModule } from '../billing/billing.module';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [BillingModule, PlansModule],
  controllers: [DiscordBotController],
  providers: [DiscordBotService, DiscordCommandsService],
  exports: [DiscordBotService],
})
export class DiscordBotModule {}
