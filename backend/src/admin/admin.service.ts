import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../common/mail/mail.service';
import { ServersService } from '../servers/servers.service';
import { UpdateQuotasDto, CreateUserDto, AdminCreateServerDto } from './dto';

const OTP_TTL_MINUTES = parseInt(process.env.OTP_TTL_MINUTES || '10', 10);

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private mail: MailService, private servers: ServersService) {}

  // ---------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------

  async stats() {
    const [
      totalUsers,
      totalServers,
      runningServers,
      stoppedServers,
      premiumUsers,
      freeUsers,
      suspendedUsers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.server.count(),
      this.prisma.server.count({ where: { status: 'RUNNING' } }),
      this.prisma.server.count({ where: { status: { not: 'RUNNING' } } }),
      this.prisma.user.count({ where: { isPremium: true } }),
      this.prisma.user.count({ where: { isPremium: false } }),
      this.prisma.user.count({ where: { suspended: true } }),
    ]);
    return {
      totalUsers,
      totalServers,
      runningServers,
      stoppedServers,
      premiumUsers,
      freeUsers,
      suspendedUsers,
    };
  }

  // ---------------------------------------------------------------------
  // User management
  // ---------------------------------------------------------------------

  listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        suspended: true,
        emailVerified: true,
        isPremium: true,
        premiumSince: true,
        lastActiveAt: true,
        maxServers: true,
        maxMemoryMb: true,
        maxDiskMb: true,
        maxCpuPercent: true,
        backupLimit: true,
        createdAt: true,
        _count: { select: { servers: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) throw new ConflictException('Email or username already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const { passwordHash: _omit, ...user } = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash,
        role: dto.role || 'USER',
        isPremium: dto.isPremium || false,
        premiumSince: dto.isPremium ? new Date() : null,
        // Admin-created accounts are pre-verified so they can log in immediately.
        emailVerified: true,
      },
    });
    return user;
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Tear down every owned server (container + host files) before removing
    // the account, using the normal admin-bypass remove() path — file
    // manager/hosting cleanup logic itself is untouched.
    const ownedServers = await this.prisma.server.findMany({ where: { ownerId: userId } });
    for (const server of ownedServers) {
      await this.servers.remove(server.id, userId, true).catch(() => undefined);
    }

    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true };
  }

  async setSuspended(userId: string, suspended: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { suspended } });

    this.mail.sendTemplateAsync(
      suspended ? 'account_suspended' : 'account_unsuspended',
      { to: updated.email, userId: updated.id, vars: { username: updated.username } },
      suspended
        ? {
            subject: 'Your account has been suspended',
            title: 'Account suspended',
            body: 'Hi {{username}}, your account has been suspended by an administrator. Contact support if you believe this is a mistake.',
          }
        : {
            subject: 'Your account has been reinstated',
            title: 'Account reinstated',
            body: 'Hi {{username}}, your account is no longer suspended and you can log in as normal.',
          },
    );

    return updated;
  }

  /** Generates a new temporary password, invalidates existing sessions, and returns it to the admin. */
  async resetPassword(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true, temporaryPassword: tempPassword };
  }

  /** Forces the account back into an unverified state and emails a fresh verification OTP. */
  async resetEmailVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({ where: { id: userId }, data: { emailVerified: false } });

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    await this.prisma.emailOtp.create({
      data: {
        userId,
        purpose: 'EMAIL_VERIFICATION',
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      },
    });
    await this.mail.sendVerificationOtp(user.email, code, OTP_TTL_MINUTES);

    return { success: true };
  }

  async grantPremium(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id: userId },
      data: { isPremium: true, premiumSince: user.premiumSince ?? new Date() },
    });
  }

  async removePremium(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({ where: { id: userId }, data: { isPremium: false } });
  }

  async updateQuotas(userId: string, dto: UpdateQuotasDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({ where: { id: userId }, data: dto });
  }

  async setRole(userId: string, role: 'USER' | 'ADMIN') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({ where: { id: userId }, data: { role } });
  }

  // ---------------------------------------------------------------------
  // Server management (admin bypasses ownership + quota checks throughout)
  // ---------------------------------------------------------------------

  listAllServers() {
    return this.prisma.server.findMany({
      include: { owner: { select: { username: true, email: true, isPremium: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createServerForUser(dto: AdminCreateServerDto) {
    const owner = await this.prisma.user.findUnique({ where: { id: dto.ownerId } });
    if (!owner) throw new NotFoundException('Target user not found');
    // bypassQuota=true: admins can create unlimited servers for any user,
    // ignoring both the Free-plan single-server cap and maxServers.
    return this.servers.create(
      dto.ownerId,
      { name: dto.name, runtime: dto.runtime, startupCommand: dto.startupCommand } as any,
      true,
    );
  }

  deleteServer(serverId: string, adminId: string) {
    return this.servers.remove(serverId, adminId, true);
  }

  forceStop(serverId: string, adminId: string) {
    return this.servers.stop(serverId, adminId, true);
  }

  forceRestart(serverId: string, adminId: string) {
    return this.servers.restart(serverId, adminId, true);
  }

  forceKill(serverId: string, adminId: string) {
    return this.servers.kill(serverId, adminId, true);
  }

  async updateServerResources(
    serverId: string,
    dto: { memoryLimitMb?: number; cpuLimitPercent?: number; diskLimitMb?: number },
  ) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');
    if (
      (dto.memoryLimitMb !== undefined && dto.memoryLimitMb < 64) ||
      (dto.cpuLimitPercent !== undefined && dto.cpuLimitPercent < 10) ||
      (dto.diskLimitMb !== undefined && dto.diskLimitMb < 100)
    ) {
      throw new BadRequestException('Resource values are below the allowed minimum');
    }
    return this.prisma.server.update({ where: { id: serverId }, data: dto });
  }
}
