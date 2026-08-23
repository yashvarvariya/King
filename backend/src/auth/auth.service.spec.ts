import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import {
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../common/mail/mail.service';

// bcrypt.hash/compare are CPU-bound and slow at real cost=12; stub them so
// unit tests stay fast and deterministic without weakening real security.
jest.mock('bcrypt', () => ({
  hash: jest.fn(async (pw: string) => `hashed:${pw}`),
  compare: jest.fn(async (pw: string, hash: string) => hash === `hashed:${pw}`),
}));

function sha256(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: any;
    emailOtp: any;
    refreshToken: any;
  };
  let mail: { sendVerificationOtp: jest.Mock; sendPasswordResetOtp: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      emailOtp: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    mail = { sendVerificationOtp: jest.fn(), sendPasswordResetOtp: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: JwtService, useValue: { sign: jest.fn(() => 'signed.jwt.token') } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('creates an unverified user, sends an OTP email, and does not log them in', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.com', role: 'USER', sessionVersion: 0 });
      prisma.emailOtp.findFirst.mockResolvedValue(null);

      const result = await service.register({
        email: 'a@b.com',
        username: 'alice',
        password: 'password123',
        passwordConfirmation: 'password123',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'a@b.com', username: 'alice' }) }),
      );
      expect(mail.sendVerificationOtp).toHaveBeenCalledWith('a@b.com', expect.any(String), expect.any(Number));
      expect(result).toEqual({ success: true, email: 'a@b.com' });
    });

    it('rejects when email or username is already taken', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          email: 'a@b.com',
          username: 'alice',
          password: 'password123',
          passwordConfirmation: 'password123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const verifiedUser = {
      id: 'u1',
      email: 'a@b.com',
      passwordHash: 'hashed:password123',
      suspended: false,
      emailVerified: true,
      role: 'USER',
      sessionVersion: 0,
    };

    it('issues a session for valid, verified credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(verifiedUser);

      const result = await service.login({ email: 'a@b.com', password: 'password123' });
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('rejects an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'nope@b.com', password: 'x' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an incorrect password', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...verifiedUser, passwordHash: 'hashed:correct' });
      await expect(service.login({ email: 'a@b.com', password: 'wrong' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a suspended account even with correct credentials', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...verifiedUser, suspended: true });
      await expect(service.login({ email: 'a@b.com', password: 'password123' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an unverified account', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...verifiedUser, emailVerified: false });
      await expect(service.login({ email: 'a@b.com', password: 'password123' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('verifyEmail', () => {
    it('rejects an invalid or expired code', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', emailVerified: false });
      prisma.emailOtp.findFirst.mockResolvedValue(null);
      await expect(service.verifyEmail({ email: 'a@b.com', code: '000000' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('marks the user verified and logs them in on a correct code', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', emailVerified: false });
      prisma.emailOtp.findFirst.mockResolvedValue({
        id: 'otp1',
        attempts: 0,
        codeHash: sha256('123456'),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      });
      prisma.user.update.mockResolvedValue({ id: 'u1', role: 'USER', sessionVersion: 0 });

      const result = await service.verifyEmail({ email: 'a@b.com', code: '123456' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: { emailVerified: true } }),
      );
      expect((result as any).accessToken).toBe('signed.jwt.token');
    });
  });

  describe('forgotPassword / resetPassword', () => {
    it('issues an OTP and emails it when the account exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      prisma.emailOtp.findFirst.mockResolvedValue(null);

      const result = await service.forgotPassword({ email: 'a@b.com' });
      expect(prisma.emailOtp.create).toHaveBeenCalled();
      expect(mail.sendPasswordResetOtp).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('returns success without leaking whether the account exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.forgotPassword({ email: 'unknown@b.com' });
      expect(prisma.emailOtp.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetOtp).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('rejects an invalid reset code', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      prisma.emailOtp.findFirst.mockResolvedValue(null);
      await expect(
        service.resetPassword({ email: 'a@b.com', code: '000000', newPassword: 'newpassword1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates the password and bumps sessionVersion on a correct code', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      prisma.emailOtp.findFirst.mockResolvedValue({
        id: 'otp1',
        attempts: 0,
        codeHash: sha256('654321'),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      });

      const result = await service.resetPassword({ email: 'a@b.com', code: '654321', newPassword: 'newpassword1' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({ sessionVersion: { increment: 1 } }),
        }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  describe('changePassword', () => {
    it('rejects an incorrect current password', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', passwordHash: 'hashed:correct' });
      await expect(
        service.changePassword('u1', { currentPassword: 'wrong', newPassword: 'newpassword1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('updates the password, bumps sessionVersion, and re-issues a session', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', passwordHash: 'hashed:oldpass123' });
      prisma.user.update.mockResolvedValue({ id: 'u1', role: 'USER', sessionVersion: 1 });

      const result = await service.changePassword('u1', {
        currentPassword: 'oldpass123',
        newPassword: 'newpassword1',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sessionVersion: { increment: 1 } }) }),
      );
      expect(result.accessToken).toBe('signed.jwt.token');
    });
  });

  describe('logoutAllSessions', () => {
    it('bumps sessionVersion, revokes existing refresh tokens, and returns a fresh session', async () => {
      prisma.user.update.mockResolvedValue({ id: 'u1', role: 'USER', sessionVersion: 3 });
      const result = await service.logoutAllSessions('u1');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: { sessionVersion: { increment: 1 } } }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
      );
      expect(result.accessToken).toBe('signed.jwt.token');
    });
  });

  describe('refreshSession', () => {
    it('rejects a missing token', async () => {
      await expect(service.refreshSession(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown, revoked, or expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refreshSession('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rotates a valid token and returns a new session', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        rememberMe: false,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'USER', sessionVersion: 0, suspended: false });

      const result = await service.refreshSession('good-token');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rt1' } }),
      );
      expect(result.accessToken).toBe('signed.jwt.token');
    });
  });
});
