import { CanActivate, ExecutionContext, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';
import { BrandingService } from '../../branding/branding.service';
import { BillingService } from '../../billing/billing.service';

// Routes that must always work regardless of maintenance mode or suspension,
// so a suspended/blocked user (or anyone, during maintenance) can still sign
// in and the frontend can identify their state and render the right screen.
// Also includes the public landing-page data endpoints (plans/stats/
// runtimes catalog), since AppGate.tsx exempts '/' from the maintenance
// screen — the marketing homepage should keep working even while the app
// itself is down for maintenance.
const ALWAYS_ALLOWED_PREFIXES = ['/api/auth', '/api/branding', '/api/health', '/api/plans', '/api/stats', '/api/runtimes'];
const ADMIN_PREFIX = '/api/admin';
// Additionally allowed while suspended (but NOT during maintenance for
// non-admins, since maintenance is a separate, stricter gate).
const ALLOWED_WHILE_SUSPENDED_PREFIXES = [...ALWAYS_ALLOWED_PREFIXES, '/api/users/me'];

const ACTIVITY_UPDATE_THROTTLE_MS = 60 * 60 * 1000; // at most once/hour per user

/**
 * Cross-cutting access control that runs on every request, ahead of any
 * per-controller auth guard. It does three things:
 *  1. Enforces branding.maintenanceMode for everyone except admins.
 *  2. Blocks suspended users from anything except auth/branding/own-profile.
 *  3. Opportunistically records lastActiveAt for the free-plan 5-day
 *     inactivity auto-stop scheduler, throttled to ~once/hour/user.
 *
 * It deliberately does NOT replace JwtAuthGuard/JwtStrategy — it decodes the
 * bearer token independently (best-effort) purely to read `sub`/`role`, and
 * always returns true for requests it can't/shouldn't judge, leaving normal
 * 401 handling to the real auth guard on protected routes.
 */
@Injectable()
export class PlatformAccessGuard implements CanActivate {
  constructor(private prisma: PrismaService, private branding: BrandingService, private billing: BillingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const path: string = (req.originalUrl || req.url || '').split('?')[0];

    let claims: { sub: string; role?: string } | null = null;
    const authHeader = req.headers?.authorization as string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        claims = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET as string) as any;
      } catch {
        claims = null;
      }
    }

    const isAdminPath = path.startsWith(ADMIN_PREFIX);
    const isAlwaysAllowed = ALWAYS_ALLOWED_PREFIXES.some((p) => path.startsWith(p));

    // --- Maintenance mode -------------------------------------------------
    const branding = await this.branding.getCached();
    if (branding.maintenanceMode && !isAlwaysAllowed && !isAdminPath) {
      if (!claims || claims.role !== 'ADMIN') {
        throw new ServiceUnavailableException({
          maintenance: true,
          message: 'Maintenance — please come back later.',
        });
      }
    }

    if (!claims?.sub) return true;

    // --- Suspension ---------------------------------------------------------
    const isAllowedWhileSuspended = ALLOWED_WHILE_SUSPENDED_PREFIXES.some((p) => path.startsWith(p));
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { suspended: true, lastActiveAt: true },
    });

    if (user?.suspended && !isAllowedWhileSuspended) {
      throw new ForbiddenException({
        suspended: true,
        message: 'Your hosting has been suspended by the administrator. Please contact support.',
      });
    }

    // --- Billing suspension ---------------------------------------------
    // Distinct from the admin-ban `suspended` flag above: this reflects the
    // user's own Subscription status (suspended/expired), set by Billing
    // actions rather than a manual account ban, so renewing/unsuspending a
    // subscription never accidentally lifts an unrelated admin ban and
    // vice versa.
    if (!isAllowedWhileSuspended && !user?.suspended) {
      const billingSuspended = await this.billing.isBillingSuspended(claims.sub).catch(() => false);
      if (billingSuspended) {
        throw new ForbiddenException({
          suspended: true,
          billing: true,
          message: 'Your subscription is suspended or has expired. Renew your plan to restore access.',
        });
      }
    }

    // --- Activity tracking (for the Free-plan inactivity auto-stop) --------
    if (user && !user.suspended) {
      const stale = Date.now() - new Date(user.lastActiveAt).getTime() > ACTIVITY_UPDATE_THROTTLE_MS;
      if (stale) {
        this.prisma.user
          .update({ where: { id: claims.sub }, data: { lastActiveAt: new Date() } })
          .catch(() => undefined);
      }
    }

    return true;
  }
}
