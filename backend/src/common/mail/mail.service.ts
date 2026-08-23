import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  fromName: string;
  fromEmail: string;
}

/**
 * Sends transactional email (OTP codes for verification / password reset,
 * plus whatever other notification types Admin > Email Settings > Templates
 * defines).
 *
 * Connection details come from the admin-editable EmailSmtpSettings row
 * first; if that row has no host configured, falls back to the SMTP_* env
 * vars; if neither is set, falls back further to just logging the message
 * (with the actual code/link) to the console — so the platform stays fully
 * usable in dev/self-hosted setups that haven't wired up a mail provider.
 *
 * Every send attempt (sent / skipped / failed) is recorded in EmailLog so
 * Admin > Email Settings > Logs can show whether delivery is actually
 * working without digging through server logs.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporterCache: nodemailer.Transporter | null = null;
  private transporterCacheKey: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------
  // SMTP config resolution: DB row (admin-configured) > env vars > none.
  // ---------------------------------------------------------------------
  private async getSmtpConfig(): Promise<SmtpConfig | null> {
    const row = await this.prisma.emailSmtpSettings.findUnique({ where: { id: 'singleton' } }).catch(() => null);

    if (row?.host) {
      return {
        host: row.host,
        port: row.port,
        secure: row.secure,
        user: row.username || undefined,
        pass: row.password || undefined,
        fromName: row.senderName || 'Bot Hosting Platform',
        fromEmail: row.senderEmail || row.username || 'no-reply@localhost',
      };
    }

    if (process.env.SMTP_HOST) {
      return {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        fromName: process.env.MAIL_FROM_NAME || 'Bot Hosting Platform',
        fromEmail: process.env.MAIL_FROM || 'no-reply@localhost',
      };
    }

    return null;
  }

  private buildTransporter(config: SmtpConfig): nodemailer.Transporter {
    const key = JSON.stringify(config);
    if (this.transporterCache && this.transporterCacheKey === key) {
      return this.transporterCache;
    }
    this.transporterCache = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
    this.transporterCacheKey = key;
    return this.transporterCache;
  }

  private async logSend(opts: {
    type: string;
    toEmail: string;
    status: 'sent' | 'skipped' | 'failed';
    error?: string | null;
    userId?: string | null;
  }) {
    try {
      await this.prisma.emailLog.create({
        data: {
          type: opts.type,
          toEmail: opts.toEmail,
          status: opts.status,
          error: opts.error ?? null,
          userId: opts.userId ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write EmailLog row: ${(err as Error).message}`);
    }
  }

  /** Low-level send used both by templated emails and the admin "test email" button. */
  async sendRaw(opts: {
    to: string;
    subject: string;
    html: string;
    text: string;
    type?: string;
    userId?: string | null;
  }): Promise<{ skipped: boolean; reason?: string }> {
    const type = opts.type || 'raw';
    const config = await this.getSmtpConfig();

    if (!config) {
      const reason = 'SMTP is not configured — see Admin > Email Settings.';
      this.logger.warn(
        `[dev-mail] ${reason}\nTo: ${opts.to}\nSubject: ${opts.subject}\n${opts.text}`,
      );
      await this.logSend({ type, toEmail: opts.to, status: 'skipped', error: reason, userId: opts.userId });
      return { skipped: true, reason };
    }

    try {
      const transporter = this.buildTransporter(config);
      const from = `"${config.fromName}" <${config.fromEmail}>`;
      await transporter.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text });
      await this.logSend({ type, toEmail: opts.to, status: 'sent', userId: opts.userId });
      return { skipped: false };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Failed to send email to ${opts.to}: ${message}`);
      await this.logSend({ type, toEmail: opts.to, status: 'failed', error: message, userId: opts.userId });
      return { skipped: false, reason: message };
    }
  }

  private renderPlaceholder(str: string, vars: Record<string, string | number>): string {
    return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) =>
      vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : '',
    );
  }

  private wrapHtml(title: string, body: string, footer: string): string {
    return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
    <h2 style="margin:0 0 16px 0;font-size:20px">${title}</h2>
    <div style="line-height:1.6;font-size:14px;white-space:pre-line">${body}</div>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5" />
    <div style="font-size:12px;color:#888888;white-space:pre-line">${footer}</div>
  </div>`;
  }

  /**
   * Sends one of the admin-editable notification types (see EmailTemplate /
   * prisma/seed.ts for the built-in set: welcome, email_verification_otp,
   * password_reset_otp, password_changed, account_suspended, ...).
   *
   * If no template row exists for `type` yet (e.g. a fresh DB before the
   * seed has run), falls back to `fallback` so verification/reset email
   * never silently breaks.
   */
  async sendTemplate(
    type: string,
    opts: { to: string; userId?: string | null; vars?: Record<string, string | number> },
    fallback?: { subject: string; title: string; body: string; footer?: string },
  ): Promise<{ skipped: boolean; reason?: string }> {
    const tpl = await this.prisma.emailTemplate.findUnique({ where: { type } }).catch(() => null);
    const source = tpl ?? (fallback ? { ...fallback, footer: fallback.footer ?? '' } : null);

    if (!source) {
      const reason = `No email template configured for "${type}"`;
      await this.logSend({ type, toEmail: opts.to, status: 'skipped', error: reason, userId: opts.userId });
      return { skipped: true, reason };
    }

    const vars = opts.vars ?? {};
    const subject = this.renderPlaceholder(source.subject, vars);
    const title = this.renderPlaceholder(source.title, vars);
    const body = this.renderPlaceholder(source.body, vars);
    const footer = this.renderPlaceholder(source.footer || '', vars);

    return this.sendRaw({
      to: opts.to,
      subject,
      html: this.wrapHtml(title, body, footer),
      text: `${title}\n\n${body}\n\n${footer}`,
      type,
      userId: opts.userId,
    });
  }

  /** Fire-and-forget variant for call sites that shouldn't await delivery. */
  sendTemplateAsync(
    type: string,
    opts: { to: string; userId?: string | null; vars?: Record<string, string | number> },
    fallback?: { subject: string; title: string; body: string; footer?: string },
  ) {
    this.sendTemplate(type, opts, fallback).catch((err) => {
      this.logger.error(`Unexpected error sending "${type}": ${(err as Error).message}`);
    });
  }

  async sendVerificationOtp(to: string, code: string, expiresInMinutes: number, userId?: string) {
    await this.sendTemplate(
      'email_verification_otp',
      { to, userId, vars: { code, expiresInMinutes } },
      {
        subject: 'Verify your email',
        title: 'Verify your email',
        body:
          `Welcome! Your email verification code is:\n\n{{code}}\n\n` +
          `This code expires in {{expiresInMinutes}} minutes. If you didn't create an account, you can ignore this email.`,
      },
    );
  }

  async sendPasswordResetOtp(to: string, code: string, expiresInMinutes: number, userId?: string) {
    await this.sendTemplate(
      'password_reset_otp',
      { to, userId, vars: { code, expiresInMinutes } },
      {
        subject: 'Reset your password',
        title: 'Reset your password',
        body:
          `We received a request to reset your password. Your code is:\n\n{{code}}\n\n` +
          `This code expires in {{expiresInMinutes}} minutes. If you didn't request this, you can safely ignore this email.`,
      },
    );
  }

  async sendEmailChangeOtp(to: string, code: string, expiresInMinutes: number, userId?: string) {
    await this.sendTemplate(
      'email_change_otp',
      { to, userId, vars: { code, expiresInMinutes } },
      {
        subject: 'Confirm your new email address',
        title: 'Confirm your new email address',
        body:
          `We received a request to change the email address on your account to this one. Your confirmation code is:\n\n{{code}}\n\n` +
          `This code expires in {{expiresInMinutes}} minutes. If you didn't request this, you can safely ignore this email — your account email won't change.`,
      },
    );
  }

  /**
   * Checks an email's domain against the admin-configured allow/block lists
   * (Admin > Email Settings > Validation — used to block disposable /
   * temporary email providers at registration time). Returns `{ valid: true
   * }` when validation is disabled or the row doesn't exist yet.
   */
  async validateEmailDomain(email: string): Promise<{ valid: boolean; error?: string }> {
    const settings = await this.prisma.emailValidationSettings.findUnique({ where: { id: 'singleton' } }).catch(() => null);
    if (!settings || !settings.enabled) return { valid: true };

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return { valid: false, error: 'Please enter a valid email address.' };

    const blocked = settings.blockedDomains.map((d) => d.toLowerCase());
    const allowed = settings.allowedDomains.map((d) => d.toLowerCase());
    const unsupported = 'This email provider is not supported. Please use a personal email address.';

    if (blocked.includes(domain)) return { valid: false, error: unsupported };
    if (allowed.length > 0 && !allowed.includes(domain)) return { valid: false, error: unsupported };
    return { valid: true };
  }
}
