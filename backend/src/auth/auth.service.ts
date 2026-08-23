import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../common/mail/mail.service';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  VerifyEmailDto,
  ResendOtpDto,
} from './dto';

type OtpPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

// All durations are configurable via env so self-hosters can tune session
// length without touching code; sane production defaults otherwise.
const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_TOKEN_TTL_DAYS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10);
const REMEMBER_ME_TTL_DAYS = parseInt(process.env.REMEMBER_ME_TTL_DAYS || '30', 10);
const OTP_TTL_MINUTES = parseInt(process.env.OTP_TTL_MINUTES || '10', 10);
const OTP_RESEND_COOLDOWN_SECONDS = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10);
const OTP_MAX_ATTEMPTS = 5;

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshTokenTtlDays: number;
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private mail: MailService) {}

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private hashValue(raw: string) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private generateOpaqueToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  private generateOtpCode() {
    // 6-digit numeric code, zero-padded (e.g. "004821").
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private sanitizeUser<T extends { passwordHash: string }>(user: T) {
    const { passwordHash, ...safe } = user;
    return safe;
  }

  // -----------------------------------------------------------------------
  // Session issuance (access token + rotating opaque refresh token)
  // -----------------------------------------------------------------------

  private async issueSession(
    user: { id: string; role: string; sessionVersion: number },
    rememberMe: boolean,
  ): Promise<IssuedSession> {
    const accessToken = this.jwt.sign(
      { sub: user.id, role: user.role, sessionVersion: user.sessionVersion },
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
    );

    const refreshToken = this.generateOpaqueToken();
    const ttlDays = rememberMe ? REMEMBER_ME_TTL_DAYS : REFRESH_TOKEN_TTL_DAYS;
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashValue(refreshToken),
        rememberMe,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken, refreshTokenTtlDays: ttlDays };
  }

  /** Validates + rotates a raw refresh token cookie value. Throws on any invalid/expired/revoked token. */
  async refreshSession(rawRefreshToken: string | undefined): Promise<IssuedSession> {
    if (!rawRefreshToken) throw new UnauthorizedException('Missing refresh token');

    const tokenHash = this.hashValue(rawRefreshToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || user.suspended) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Rotate: revoke the presented token and issue a brand new pair. This
    // limits the blast radius if a refresh token cookie is ever stolen (the
    // old value stops working the moment it's used once by anyone).
    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    return this.issueSession(user, record.rememberMe);
  }

  /** Revokes a single refresh token (this device only). Safe to call with an already-invalid token. */
  async logout(rawRefreshToken: string | undefined) {
    if (rawRefreshToken) {
      const tokenHash = this.hashValue(rawRefreshToken);
      await this.prisma.refreshToken
        .updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } })
        .catch(() => undefined);
    }
    return { success: true };
  }

  /**
   * Revokes every refresh token for the user and bumps sessionVersion (which
   * instantly invalidates all outstanding access tokens too, via JwtStrategy),
   * then issues a fresh session for the device that made this request — so
   * "log out everywhere" reads as "log out every *other* device" from the
   * caller's point of view.
   */
  async logoutAllSessions(userId: string): Promise<IssuedSession> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return this.issueSession(updated, false);
  }

  // -----------------------------------------------------------------------
  // OTP (email verification + password reset share the same mechanism)
  // -----------------------------------------------------------------------

  private async issueOtp(userId: string, purpose: OtpPurpose) {
    const latest = await this.prisma.emailOtp.findFirst({
      where: { userId, purpose },
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
        purpose,
        codeHash: this.hashValue(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
        lastSentAt: new Date(),
      },
    });
    return code;
  }

  private async verifyOtp(userId: string, purpose: OtpPurpose, code: string) {
    const record = await this.prisma.emailOtp.findFirst({
      where: { userId, purpose, consumedAt: null },
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

  // -----------------------------------------------------------------------
  // Register / Login
  // -----------------------------------------------------------------------

  async register(dto: RegisterDto) {
    // Blocks disposable/temporary email addresses per the admin-configured
    // allow/block list (Admin > Email Settings > Validation). This runs
    // before the uniqueness check so a blocked domain never leaks whether
    // an email is already registered.
    const emailCheck = await this.mail.validateEmailDomain(dto.email);
    if (!emailCheck.valid) throw new BadRequestException(emailCheck.error);

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) throw new ConflictException('Email or username already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: { email: dto.email, username: dto.username, passwordHash },
    });

    this.mail.sendTemplateAsync(
      'welcome',
      { to: user.email, userId: user.id, vars: { username: user.username } },
      {
        subject: 'Welcome to Bot Hosting Platform',
        title: 'Welcome aboard!',
        body: `Hey {{username}}, thanks for signing up. Verify your email to get started.`,
      },
    );

    const code = await this.issueOtp(user.id, 'EMAIL_VERIFICATION');
    await this.mail.sendVerificationOtp(user.email, code, OTP_TTL_MINUTES, user.id);

    // No session is issued here — the account can't log in until the email
    // is verified via POST /auth/verify-email.
    return { success: true, email: user.email };
  }

  async login(dto: LoginDto): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    if (user.suspended) throw new UnauthorizedException('Account suspended');
    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify your email before logging in');
    }

    return this.issueSession(user, !!dto.rememberMe);
  }

  // -----------------------------------------------------------------------
  // Email verification
  // -----------------------------------------------------------------------

  async verifyEmail(dto: VerifyEmailDto): Promise<IssuedSession | { success: true; alreadyVerified: true }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new BadRequestException('Invalid or expired code');
    if (user.emailVerified) return { success: true, alreadyVerified: true };

    await this.verifyOtp(user.id, 'EMAIL_VERIFICATION', dto.code);
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });

    // Verifying immediately logs the user in, so registration feels like a
    // single flow instead of "verify, then go log in again".
    return this.issueSession(updated, false);
  }

  async resendOtp(dto: ResendOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Always return the same shape whether or not the account exists (or is
    // already verified, or is mid-cooldown) so this endpoint can't be used
    // to enumerate registered emails or probe account state.
    if (!user) return { success: true };
    if (dto.purpose === 'EMAIL_VERIFICATION' && user.emailVerified) return { success: true };

    try {
      const code = await this.issueOtp(user.id, dto.purpose);
      if (dto.purpose === 'EMAIL_VERIFICATION') {
        await this.mail.sendVerificationOtp(user.email, code, OTP_TTL_MINUTES, user.id);
      } else {
        await this.mail.sendPasswordResetOtp(user.email, code, OTP_TTL_MINUTES, user.id);
      }
    } catch {
      // Cooldown or other issuance error — swallow it so the response shape
      // never differs based on account/rate-limit state.
    }
    return { success: true };
  }

  // -----------------------------------------------------------------------
  // Forgot / reset password
  // -----------------------------------------------------------------------

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) return { success: true };

    try {
      const code = await this.issueOtp(user.id, 'PASSWORD_RESET');
      await this.mail.sendPasswordResetOtp(user.email, code, OTP_TTL_MINUTES, user.id);
    } catch {
      // Rate-limited resend — stay silent, same response either way.
    }
    return { success: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new BadRequestException('Invalid or expired code');

    await this.verifyOtp(user.id, 'PASSWORD_RESET', dto.code);

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, sessionVersion: { increment: 1 } }, // invalidates existing access tokens
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.mail.sendTemplateAsync(
      'password_changed',
      { to: user.email, userId: user.id, vars: { username: user.username } },
      {
        subject: 'Your password was changed',
        title: 'Password changed',
        body: `Hi {{username}}, this is a confirmation that your password was just changed. If this wasn't you, contact support immediately.`,
      },
    );
    return { success: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<IssuedSession> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    // Revoke every other session but re-issue one for the device the user is
    // actually using right now, so changing your password doesn't also log
    // *you* out.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return this.issueSession(updated, false);
  }
}
