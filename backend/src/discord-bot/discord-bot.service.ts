import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordCommandsService, errorEmbed } from './discord-commands.service';
import { SaveDiscordSettingsDto, TestDiscordConnectionDto } from './dto';

const RECONNECT_BASE_DELAY_MS = 5000;
const RECONNECT_MAX_DELAY_MS = 5 * 60 * 1000;

export interface DiscordBotStatus {
  status: 'stopped' | 'connecting' | 'online' | 'error';
  lastError: string | null;
  lastConnectedAt: string | null;
  botTag: string | null;
}

export interface SerializedDiscordSettings {
  botTokenSet: boolean;
  botTokenPreview: string;
  clientId: string;
  guildId: string;
  ownerDiscordId: string;
  desiredState: string;
  updatedAt: Date;
}

@Injectable()
export class DiscordBotService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DiscordBotService.name);

  // discord.js is loaded lazily (dynamic import, wrapped in try/catch) even
  // though it's now a listed dependency — this is deliberate insurance so
  // an app started before `npm install` has pulled it in (or in a minimal
  // deployment that never configures a bot) doesn't crash on boot; every
  // other feature keeps working and the admin just sees a clear error the
  // moment they try to start the bot.
  private client: any = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private manuallyStopped = true;

  private state: DiscordBotStatus = { status: 'stopped', lastError: null, lastConnectedAt: null, botTag: null };

  constructor(private readonly prisma: PrismaService, private readonly commands: DiscordCommandsService) {}

  async onApplicationBootstrap() {
    // Picks back up after a panel restart, as long as the admin hadn't
    // explicitly pressed Stop since (desiredState tracks that). The bot
    // also auto-starts the moment its settings are completed — see
    // DiscordBotController.saveSettings.
    await this.autoStart();
  }

  async onModuleDestroy() {
    await this.stop();
  }

  private async loadDiscordJs(): Promise<any | null> {
    try {
      return await import('discord.js');
    } catch {
      return null;
    }
  }

  // ---- Settings store -----------------------------------------------------

  async getSettings() {
    return this.prisma.discordBotSettings.upsert({ where: { id: 'singleton' }, create: { id: 'singleton' }, update: {} });
  }

  serializeForAdmin(settings: any): SerializedDiscordSettings {
    return {
      botTokenSet: !!settings.botToken,
      botTokenPreview: settings.botToken
        ? `${'•'.repeat(Math.max(0, settings.botToken.length - 4))}${settings.botToken.slice(-4)}`
        : '',
      clientId: settings.clientId || '',
      guildId: settings.guildId || '',
      ownerDiscordId: settings.ownerDiscordId || '',
      desiredState: settings.desiredState || 'stopped',
      updatedAt: settings.updatedAt,
    };
  }

  isConfigured(settings: any): boolean {
    return !!(settings.botToken && settings.clientId && settings.guildId && settings.ownerDiscordId);
  }

  async saveSettings(dto: SaveDiscordSettingsDto, adminId: string) {
    const current = await this.getSettings();
    const row = await this.prisma.discordBotSettings.update({
      where: { id: 'singleton' },
      data: {
        botToken: dto.botToken !== undefined && dto.botToken !== '' ? dto.botToken.trim() : current.botToken,
        clientId: dto.clientId !== undefined ? dto.clientId.trim() : current.clientId,
        guildId: dto.guildId !== undefined ? dto.guildId.trim() : current.guildId,
        ownerDiscordId: dto.ownerDiscordId !== undefined ? dto.ownerDiscordId.trim() : current.ownerDiscordId,
        updatedById: adminId,
      },
    });
    return row;
  }

  private async setDesiredState(state: 'running' | 'stopped') {
    await this.prisma.discordBotSettings.update({ where: { id: 'singleton' }, data: { desiredState: state } });
  }

  // ---- Command/status logging ---------------------------------------------

  async logCommand(opts: { discordUserId?: string; discordUsername?: string; command: string; status: string; detail?: string }) {
    try {
      await this.prisma.discordCommandLog.create({
        data: {
          discordUserId: opts.discordUserId,
          discordUsername: opts.discordUsername,
          command: opts.command,
          status: opts.status,
          detail: opts.detail,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write DiscordCommandLog: ${(err as Error).message}`);
    }
  }

  recentLogs(limit = 100) {
    const n = Math.min(Math.max(Number(limit) || 100, 1), 500);
    return this.prisma.discordCommandLog.findMany({ orderBy: { createdAt: 'desc' }, take: n });
  }

  getStatus(): DiscordBotStatus {
    return { ...this.state };
  }

  // ---- Connection lifecycle ------------------------------------------------

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async registerSlashCommands(discordjs: any, settings: any) {
    const { REST, Routes, SlashCommandBuilder } = discordjs;
    const body = this.commands.commands.map((cmd) => {
      const builder = new SlashCommandBuilder().setName(cmd.name).setDescription(cmd.description);
      for (const opt of cmd.options || []) {
        if (opt.type === 'string') {
          builder.addStringOption((o: any) => {
            o.setName(opt.name).setDescription(opt.description);
            if (opt.required) o.setRequired(true);
            return o;
          });
        } else {
          builder.addIntegerOption((o: any) => {
            o.setName(opt.name).setDescription(opt.description);
            if (opt.required) o.setRequired(true);
            if (opt.minValue !== undefined) o.setMinValue(opt.minValue);
            return o;
          });
        }
      }
      return builder.toJSON();
    });
    const rest = new REST({ version: '10' }).setToken(settings.botToken);
    await rest.put(Routes.applicationGuildCommands(settings.clientId, settings.guildId), { body });
  }

  private wireEvents(discordjs: any) {
    const { Events } = discordjs;

    this.client.once(Events.ClientReady, (c: any) => {
      this.reconnectAttempts = 0;
      this.state.status = 'online';
      this.state.lastError = null;
      this.state.lastConnectedAt = new Date().toISOString();
      this.state.botTag = c.user.tag;
      this.logger.log(`Logged in as ${c.user.tag}`);
    });

    this.client.on(Events.ShardDisconnect, () => {
      if (this.manuallyStopped) return;
      this.state.status = 'connecting';
      this.logger.warn('Disconnected — will attempt to reconnect');
      this.scheduleReconnect();
    });

    this.client.on(Events.Error, (err: Error) => {
      this.state.status = 'error';
      this.state.lastError = err.message;
      this.logger.error(`Client error: ${err.message}`);
      if (!this.manuallyStopped) this.scheduleReconnect();
    });

    this.client.on(Events.InteractionCreate, async (interaction: any) => {
      if (!interaction.isChatInputCommand()) return;

      // Read the owner id fresh from the store on every interaction (not a
      // value captured when the client connected) — so editing Owner
      // Discord ID in Admin > Discord Bot takes effect on the very next
      // command instead of requiring a manual restart.
      const settings = await this.getSettings();
      const owner = settings.ownerDiscordId;
      if (!owner || interaction.user.id !== owner) {
        await this.logCommand({
          discordUserId: interaction.user.id,
          discordUsername: interaction.user.tag,
          command: interaction.commandName,
          status: 'denied',
          detail: 'Not the configured owner',
        });
        try {
          await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        } catch (e: any) {
          this.logger.error(`Failed to send permission-denied reply: ${e.message}`);
        }
        return;
      }

      const cmd = this.commands.findCommand(interaction.commandName);
      if (!cmd) return;

      try {
        const reply = await cmd.execute({
          getString: (name: string, required?: boolean) => interaction.options.getString(name, required),
          getInteger: (name: string) => interaction.options.getInteger(name),
          performedByLabel: interaction.user.tag,
        });
        await interaction.reply(reply);
        await this.logCommand({
          discordUserId: interaction.user.id,
          discordUsername: interaction.user.tag,
          command: interaction.commandName,
          status: 'success',
        });
      } catch (err: any) {
        this.logger.error(`Command "${interaction.commandName}" failed: ${err.message}`);
        await this.logCommand({
          discordUserId: interaction.user.id,
          discordUsername: interaction.user.tag,
          command: interaction.commandName,
          status: 'error',
          detail: err.message,
        });
        const payload = errorEmbed(`Something went wrong running this command: ${err.message}`);
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ ...payload, ephemeral: true });
          } else {
            await interaction.reply({ ...payload, ephemeral: true });
          }
        } catch (e: any) {
          this.logger.error(`Failed to send error reply: ${e.message}`);
        }
      }
    });
  }

  private scheduleReconnect() {
    this.clearReconnectTimer();
    this.reconnectAttempts += 1;
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (this.reconnectAttempts - 1), RECONNECT_MAX_DELAY_MS);
    this.logger.log(`Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      if (this.manuallyStopped) return;
      // Re-read from the store (not a captured snapshot) so a token/ID
      // change made while disconnected takes effect on the very next
      // reconnect attempt instead of requiring a manual restart.
      this.getSettings()
        .then((s) => this.connect(s))
        .catch((err) => this.logger.error(`Reconnect attempt failed: ${err.message}`));
    }, delay);
    this.reconnectTimer.unref?.();
  }

  async connect(settingsOverride?: any): Promise<DiscordBotStatus> {
    const settings = settingsOverride || (await this.getSettings());
    if (!this.isConfigured(settings)) {
      throw new Error('Bot Token, Client ID, Guild ID, and Owner Discord ID must all be set before starting the bot.');
    }

    const discordjs = await this.loadDiscordJs();
    if (!discordjs) {
      this.state.status = 'error';
      this.state.lastError = 'The "discord.js" package is not installed. Run `npm install` in backend/.';
      throw new Error(this.state.lastError);
    }

    // Tear down any previous client before starting a fresh one.
    if (this.client) {
      try {
        this.client.removeAllListeners();
        await this.client.destroy();
      } catch {
        // ignore
      }
      this.client = null;
    }

    this.manuallyStopped = false;
    this.state.status = 'connecting';
    this.state.lastError = null;

    const { Client, GatewayIntentBits } = discordjs;
    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
    this.wireEvents(discordjs);

    await this.registerSlashCommands(discordjs, settings);
    await this.client.login(settings.botToken);

    return this.getStatus();
  }

  async stop() {
    this.manuallyStopped = true;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    if (this.client) {
      try {
        this.client.removeAllListeners();
        await this.client.destroy();
      } catch (e: any) {
        this.logger.error(`Error while stopping: ${e.message}`);
      }
      this.client = null;
    }
    this.state.status = 'stopped';
    this.state.botTag = null;
  }

  async restart(): Promise<DiscordBotStatus> {
    await this.stop();
    return this.connect();
  }

  // Test Connection: verifies the token/IDs work without leaving a bot
  // running — logs in, confirms guild access, then logs back out.
  async testConnection(dto: TestDiscordConnectionDto): Promise<{ ok: boolean; error?: string; botTag?: string; guildName?: string }> {
    const settings = await this.getSettings();
    const botToken = dto.botToken || settings.botToken;
    const clientId = dto.clientId || settings.clientId;
    const guildId = dto.guildId || settings.guildId;

    const discordjs = await this.loadDiscordJs();
    if (!discordjs) {
      return { ok: false, error: 'The "discord.js" package is not installed. Run `npm install` in backend/.' };
    }
    if (!botToken || !clientId || !guildId) {
      return { ok: false, error: 'Bot Token, Client ID, and Guild ID are required to test.' };
    }

    const { Client, GatewayIntentBits, Events } = discordjs;
    const testClient = new Client({ intents: [GatewayIntentBits.Guilds] });

    try {
      const result = await new Promise<{ ok: true; botTag: string; guildName: string }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for Discord to respond.')), 15000);
        testClient.once(Events.ClientReady, async (c: any) => {
          clearTimeout(timeout);
          try {
            const guild = await c.guilds.fetch(guildId);
            resolve({ ok: true, botTag: c.user.tag, guildName: guild.name });
          } catch (err: any) {
            reject(new Error(`Logged in as ${c.user.tag}, but couldn't access Guild ID ${guildId}: ${err.message}`));
          }
        });
        testClient.login(botToken).catch(reject);
      });
      return result;
    } catch (err: any) {
      return { ok: false, error: err.message };
    } finally {
      try {
        await testClient.destroy();
      } catch {
        // ignore
      }
    }
  }

  async autoStart() {
    const settings = await this.getSettings();
    if (!this.isConfigured(settings)) return;
    if (settings.desiredState !== 'running') return;
    try {
      await this.connect(settings);
    } catch (err: any) {
      this.logger.error(`Auto-start failed: ${err.message}`);
    }
  }

  /** Convenience used by the controller after settings are saved / start / restart, to persist the admin's intent. */
  async markDesiredState(state: 'running' | 'stopped') {
    await this.setDesiredState(state);
  }
}
