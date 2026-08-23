import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, IssuedSession } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  VerifyEmailDto,
  ResendOtpDto,
} from './dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // The refresh token is only ever readable by the server (httpOnly), so a
  // stolen access token (which lives in frontend JS/localStorage and is
  // short-lived) can't be used to mint new sessions on its own.
  private setRefreshCookie(res: Response, session: IssuedSession) {
    res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: session.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
    });
  }

  // Login/register/OTP endpoints are brute-force / spam targets, so they get
  // much stricter limits than the API-wide default set in ThrottlerModule.forRoot().
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const session = await this.authService.login(dto);
    this.setRefreshCookie(res, session);
    return { accessToken: session.accessToken };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyEmail(dto);
    if ('refreshToken' in result) {
      this.setRefreshCookie(res, result);
      return { accessToken: result.accessToken };
    }
    return result;
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('resend-otp')
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  // Silent session renewal — called by the frontend on load so a valid
  // refresh cookie survives a full browser restart without asking the user
  // to log in again ("auto login" / "remember me").
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    try {
      const session = await this.authService.refreshSession(raw);
      this.setRefreshCookie(res, session);
      return { accessToken: session.accessToken };
    } catch (err) {
      this.clearRefreshCookie(res);
      throw err;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return user;
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.changePassword(user.id, dto);
    this.setRefreshCookie(res, session);
    return { accessToken: session.accessToken };
  }

  // Logs out this device only (revokes the current refresh token).
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    const result = await this.authService.logout(raw);
    this.clearRefreshCookie(res);
    return result;
  }

  // Logs out every other device/session and re-issues a fresh one for the caller.
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: any, @Res({ passthrough: true }) res: Response) {
    const session = await this.authService.logoutAllSessions(user.id);
    this.setRefreshCookie(res, session);
    return { accessToken: session.accessToken };
  }
}
