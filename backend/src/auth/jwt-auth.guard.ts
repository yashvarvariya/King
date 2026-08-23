import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    // Bug fix: this used to hard-reject suspended users at the auth-guard
    // level, which also blocked GET /auth/me — the one endpoint the
    // frontend needs to *discover* that a logged-in user is suspended so it
    // can render the Suspended screen. Cross-cutting suspension enforcement
    // (blocking dashboard/hosting/file-manager/etc.) is handled globally by
    // PlatformAccessGuard, which explicitly allows /api/auth/* through for
    // exactly this reason. Login/refresh (auth.service.ts) still refuse to
    // issue brand-new sessions to a suspended account.
    return user;
  }

  getRequest(context: ExecutionContext) {
    const type = context.getType();
    if (type === 'ws') {
      return context.switchToWs().getClient().handshake;
    }
    return super.getRequest(context);
  }
}
