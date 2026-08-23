import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../common/mail/mail.service';
import {
  UpdateSmtpSettingsDto,
  UpdateEmailTemplateDto,
  UpdateEmailValidationSettingsDto,
} from './dto';

const SINGLETON_ID = 'singleton';

// The built-in notification types the platform can send. Seeded with
// defaults in prisma/seed.ts; admins edit the content (not the type) via
// Admin > Email Settings > Templates. Keeping this list here too lets the
// settings service self-heal (create-if-missing) if a new type is added
// after a DB already exists, without needing another migration/seed run.
const DEFAULT_TEMPLATES: Record<string, { subject: string; title: string; body: string; footer: string }> = {
  welcome: {
    subject: 'Welcome to Bot Hosting Platform',
    title: 'Welcome aboard!',
    body: 'Hey {{username}}, thanks for signing up. Verify your email to get started.',
    footer: '',
  },
  email_verification_otp: {
    subject: 'Verify your email',
    title: 'Verify your email',
    body:
      "Welcome! Your email verification code is:\n\n{{code}}\n\nThis code expires in {{expiresInMinutes}} minutes. If you didn't create an account, you can ignore this email.",
    footer: '',
  },
  password_reset_otp: {
    subject: 'Reset your password',
    title: 'Reset your password',
    body:
      "We received a request to reset your password. Your code is:\n\n{{code}}\n\nThis code expires in {{expiresInMinutes}} minutes. If you didn't request this, you can safely ignore this email.",
    footer: '',
  },
  password_changed: {
    subject: 'Your password was changed',
    title: 'Password changed',
    body: "Hi {{username}}, this is a confirmation that your password was just changed. If this wasn't you, contact support immediately.",
    footer: '',
  },
  account_suspended: {
    subject: 'Your account has been suspended',
    title: 'Account suspended',
    body: 'Hi {{username}}, your account has been suspended by an administrator. Contact support if you believe this is a mistake.',
    footer: '',
  },
  account_unsuspended: {
    subject: 'Your account has been reinstated',
    title: 'Account reinstated',
    body: 'Hi {{username}}, your account is no longer suspended and you can log in as normal.',
    footer: '',
  },
  subscription_activated: {
    subject: 'Your subscription is active',
    title: 'Subscription activated',
    body: 'Hi {{username}}, your {{plan_name}} subscription is now active. Thanks for subscribing!',
    footer: '',
  },
  subscription_expiring_soon: {
    subject: 'Your subscription is expiring soon',
    title: 'Expiring soon',
    body:
      'Hi {{username}}, your {{plan_name}} subscription expires in {{days_remaining}} day(s) on {{expiry_date}}. ' +
      'Renew to avoid interruption.',
    footer: '',
  },
  subscription_expired: {
    subject: 'Your subscription has expired',
    title: 'Subscription expired',
    body: "Hi {{username}}, your {{plan_name}} subscription has expired. Hosting access is suspended until it's renewed.",
    footer: '',
  },
  subscription_renewed: {
    subject: 'Your subscription was renewed',
    title: 'Subscription renewed',
    body: 'Hi {{username}}, your {{plan_name}} subscription has been renewed. All access is restored.',
    footer: '',
  },
};

@Injectable()
export class EmailSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // --- SMTP -----------------------------------------------------------

  async getSmtp() {
    const row = await this.prisma.emailSmtpSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });
    return {
      host: row.host || '',
      port: row.port,
      secure: row.secure,
      username: row.username || '',
      passwordSet: !!row.password,
      senderName: row.senderName,
      senderEmail: row.senderEmail || '',
      updatedAt: row.updatedAt,
    };
  }

  async updateSmtp(dto: UpdateSmtpSettingsDto, adminId: string) {
    const current = await this.prisma.emailSmtpSettings.findUnique({ where: { id: SINGLETON_ID } });
    await this.prisma.emailSmtpSettings.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        host: dto.host,
        port: dto.port,
        secure: dto.secure ?? false,
        username: dto.username,
        password: dto.password,
        senderName: dto.senderName || 'Bot Hosting Platform',
        senderEmail: dto.senderEmail,
        updatedById: adminId,
      },
      update: {
        host: dto.host,
        port: dto.port,
        secure: dto.secure ?? false,
        username: dto.username,
        // Keep the stored password if none was supplied on this update.
        password: dto.password ? dto.password : current?.password,
        senderName: dto.senderName || current?.senderName || 'Bot Hosting Platform',
        senderEmail: dto.senderEmail,
        updatedById: adminId,
      },
    });
    return this.getSmtp();
  }

  async sendTestEmail(to: string) {
    return this.mail.sendRaw({
      to,
      subject: 'Bot Hosting Platform — Test Email',
      html: '<p>This is a test email from your Bot Hosting Platform SMTP settings. If you received this, your configuration works.</p>',
      text: 'This is a test email from your Bot Hosting Platform SMTP settings. If you received this, your configuration works.',
      type: 'smtp_test',
    });
  }

  // --- Templates --------------------------------------------------------

  async listTemplates() {
    await this.ensureDefaultTemplates();
    return this.prisma.emailTemplate.findMany({ orderBy: { type: 'asc' } });
  }

  async getTemplate(type: string) {
    await this.ensureDefaultTemplates();
    const tpl = await this.prisma.emailTemplate.findUnique({ where: { type } });
    if (!tpl) throw new NotFoundException('Template not found');
    return tpl;
  }

  async updateTemplate(type: string, dto: UpdateEmailTemplateDto, adminId: string) {
    const existing = await this.prisma.emailTemplate.findUnique({ where: { type } });
    if (!existing) throw new NotFoundException('Template not found');
    return this.prisma.emailTemplate.update({
      where: { type },
      data: {
        subject: dto.subject,
        title: dto.title,
        body: dto.body,
        footer: dto.footer ?? '',
        updatedById: adminId,
      },
    });
  }

  private async ensureDefaultTemplates() {
    const existing = await this.prisma.emailTemplate.findMany({ select: { type: true } });
    const existingTypes = new Set(existing.map((t) => t.type));
    const missing = Object.entries(DEFAULT_TEMPLATES).filter(([type]) => !existingTypes.has(type));
    if (missing.length === 0) return;
    await this.prisma.$transaction(
      missing.map(([type, tpl]) => this.prisma.emailTemplate.create({ data: { type, ...tpl } })),
    );
  }

  // --- Validation (disposable / temporary email blocking) ---------------

  async getValidationSettingsPublic() {
    const row = await this.prisma.emailValidationSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });
    return { enabled: row.enabled, allowedDomains: row.allowedDomains, blockedDomains: row.blockedDomains };
  }

  async getValidationSettings() {
    return this.getValidationSettingsPublic().then(async (pub) => {
      const row = await this.prisma.emailValidationSettings.findUnique({ where: { id: SINGLETON_ID } });
      return { ...pub, updatedAt: row?.updatedAt };
    });
  }

  async updateValidationSettings(dto: UpdateEmailValidationSettingsDto, adminId: string) {
    const normalize = (list?: string[]) =>
      list ? Array.from(new Set(list.map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean))) : undefined;

    const current = await this.prisma.emailValidationSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });

    return this.prisma.emailValidationSettings.update({
      where: { id: SINGLETON_ID },
      data: {
        enabled: dto.enabled ?? current.enabled,
        allowedDomains: normalize(dto.allowedDomains) ?? current.allowedDomains,
        blockedDomains: normalize(dto.blockedDomains) ?? current.blockedDomains,
        updatedById: adminId,
      },
    });
  }

  async addDomain(field: 'allowedDomains' | 'blockedDomains', domain: string, adminId: string) {
    const normalized = domain.trim().toLowerCase().replace(/^@/, '');
    if (!normalized.includes('.')) throw new BadRequestException('Provide a valid domain, e.g. example.com');
    const current = await this.prisma.emailValidationSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });
    const list = new Set(current[field]);
    list.add(normalized);
    return this.prisma.emailValidationSettings.update({
      where: { id: SINGLETON_ID },
      data: { [field]: Array.from(list), updatedById: adminId },
    });
  }

  async removeDomain(field: 'allowedDomains' | 'blockedDomains', domain: string, adminId: string) {
    const normalized = domain.trim().toLowerCase();
    const current = await this.prisma.emailValidationSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });
    return this.prisma.emailValidationSettings.update({
      where: { id: SINGLETON_ID },
      data: { [field]: current[field].filter((d) => d !== normalized), updatedById: adminId },
    });
  }

  // --- Logs ---------------------------------------------------------

  async listLogs(limit = 100) {
    return this.prisma.emailLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }
}
