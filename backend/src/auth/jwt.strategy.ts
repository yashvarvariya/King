import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }

  async validate(payload: { sub: string; sessionVersion?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return null;
    // Tokens issued before a password reset/change or explicit "log out all
    // devices" carry the old sessionVersion and are rejected here.
    if (payload.sessionVersion !== undefined && payload.sessionVersion !== user.sessionVersion) {
      return null;
    }
    // Belt-and-suspenders: access tokens are only ever minted for verified
    // accounts, but reject here too in case that ever changes upstream.
    if (!user.emailVerified) return null;
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
