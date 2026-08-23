import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../common/mail/mail.service';
import { UpdateUsernameDto, RequestEmailChangeDto, ConfirmEmailChangeDto } from './dto';

// Mirrors AuthService's OTP mechanism (same EmailOtp table, same sha256
// code hashing) but scoped to the EMAIL_CHANGE purpose. Kept local to this
// service rather than reusing AuthService's private helpers, so the two
// modules stay decoupled — this is the only OTP flow UsersModule needs.
const OTP_TTL_MINUTES = parseInt(process.env.OTP_TTL_MINUTES || '10', 10);
const OTP_RESEND_COOLDOWN_SECONDS = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10);
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private mail: MailService) {}

  async me(userId: string) {
    const { passwordHash, ...user } = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return user;
  }

  async usage(userId: string) {
    const servers = await this.prisma.server.findMany({ where: { ownerId: userId } });
    return {
      serverCount: servers.length,
      runningCount: servers.filter((s) => s.status === 'RUNNING').length,
    };
  }

  // -----------------------------------------------------------------------
  // Change username — no email/password involved, so no re-auth or session
  // impact. Username isn't encoded in the JWT payload (only sub/role/
  // sessionVersion are), so the caller's existing access token stays valid.
  // -----------------------------------------------------------------------

  async updateUsername(userId: string, dto: UpdateUsernameDto) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing && existing.id !== userId) {
      throw new ConflictException('That username is already taken');
    }
    const { passwordHash, ...user } = await this.prisma.user.update({
      where: { id: userId },
      data: { username: dto.username },
    });
    return user;
  }

  // -----------------------------------------------------------------------
  // Change email — two-step, OTP-confirmed at the *new* address, so the
  // account's login email is never overwritten until ownership of the new
  // address is proven. `user.email` is left untouched until confirmation.
  // -----------------------------------------------------------------------

  private hashValue(raw: string) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private generateOtpCode() {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private async issueEmailChangeOtp(userId: string) {
    const latest = await this.prisma.emailOtp.findFirst({
      where: { userId, purpose: 'EMAIL_CHANGE' },
      orderBy: { createdAt: 'desc' },
    });
    if (latest && !latest.consumedAt) {
      const secondsSinceLastSend = (Date.now() - latest.lastSentAt.getTime()) / 1000;
      if (secondsSinceLastSend < OTP_RESEND_COOLDOWN_SECONDS) {
        throw new BadRequestException(
          `Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLastSend)}s before requesting another code`,
        );
      }
    }

    const code = this.generateOtpCode();
    await this.prisma.emailOtp.create({
      data: {
        userId,
        purpose: 'EMAIL_CHANGE',
        codeHash: this.hashValue(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
        lastSentAt: new Date(),
      },
    });
    return code;
  }

  private async verifyEmailChangeOtp(userId: string, code: string) {
    const record = await this.prisma.emailOtp.findFirst({
      where: { userId, purpose: 'EMAIL_CHANGE', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired code');
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Too many incorrect attempts — please request a new code');
    }
    if (record.codeHash !== this.hashValue(code)) {
      await this.prisma.emailOtp.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('Invalid or expired code');
    }
    await this.prisma.emailOtp.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  }

  async requestEmailChange(userId: string, dto: RequestEmailChangeDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const validPassword = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!validPassword) throw new UnauthorizedException('Current password is incorrect');

    if (dto.newEmail.toLowerCase() === user.email.toLowerCase()) {
      throw new BadRequestException('That is already your email address');
    }

    const domainCheck = await this.mail.validateEmailDomain(dto.newEmail);
    if (!domainCheck.valid) throw new BadRequestException(domainCheck.error);

    const inUse = await this.prisma.user.findUnique({ where: { email: dto.newEmail } });
    if (inUse) throw new ConflictException('That email is already in use');

    await this.prisma.user.update({ where: { id: userId }, data: { pendingEmail: dto.newEmail } });

    const code = await this.issueEmailChangeOtp(userId);
    await this.mail.sendEmailChangeOtp(dto.newEmail, code, OTP_TTL_MINUTES, userId);

    return { success: true, newEmail: dto.newEmail };
  }

  async confirmEmailChange(userId: string, dto: ConfirmEmailChangeDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.pendingEmail) throw new BadRequestException('No email change is pending');

    await this.verifyEmailChangeOtp(userId, dto.code);

    // Re-check uniqueness right before committing — another account could
    // have claimed this address in the window between request and confirm.
    const stillFree = await this.prisma.user.findFirst({
      where: { email: user.pendingEmail, id: { not: userId } },
    });
    if (stillFree) throw new ConflictException('That email is no longer available');

    const oldEmail = user.email;
    const newEmail = user.pendingEmail;
    const { passwordHash, ...updated } = await this.prisma.user.update({
      where: { id: userId },
      data: { email: newEmail, pendingEmail: null },
    });

    // Security notice to the *old* address — same pattern as
    // AuthService.changePassword's "your password was changed" email.
    this.mail.sendTemplateAsync(
      'email_changed',
      { to: oldEmail, userId, vars: { username: user.username, newEmail } },
      {
        subject: 'Your account email was changed',
        title: 'Email address changed',
        body: `Hi {{username}}, this is a confirmation that your account's email address was just changed to {{newEmail}}. If this wasn't you, contact support immediately.`,
      },
    );

    return updated;
  }
}
