import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateUsernameDto, RequestEmailChangeDto, ConfirmEmailChangeDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: any) {
    return this.users.me(user.id);
  }

  @Get('me/usage')
  usage(@CurrentUser() user: any) {
    return this.users.usage(user.id);
  }

  @Patch('me/username')
  updateUsername(@CurrentUser() user: any, @Body() dto: UpdateUsernameDto) {
    return this.users.updateUsername(user.id, dto);
  }

  // Email-change requests hit bcrypt + send an email, so they get the same
  // kind of throttle as login/register rather than the general API default.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/email/request-change')
  requestEmailChange(@CurrentUser() user: any, @Body() dto: RequestEmailChangeDto) {
    return this.users.requestEmailChange(user.id, dto);
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('me/email/confirm-change')
  confirmEmailChange(@CurrentUser() user: any, @Body() dto: ConfirmEmailChangeDto) {
    return this.users.confirmEmailChange(user.id, dto);
  }
}
