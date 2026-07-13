import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUserDto } from '../dto/auth-response.dto';

// Uso: @CurrentUser() user: AuthUserDto
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserDto => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
