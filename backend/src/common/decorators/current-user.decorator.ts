import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Pulls the authenticated user (attached by JwtAuthGuard) off the request. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
