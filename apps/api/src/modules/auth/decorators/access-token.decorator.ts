import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator que extrai o JWT token bruto do header Authorization.
 *
 * Uso:
 * ```
 * @Get('revoke')
 * async revoke(@AccessToken() token: string) {
 *   // token contém o JWT completo
 * }
 * ```
 */
export const AccessToken = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return undefined;
    }

    return authHeader.replace('Bearer ', '').trim();
  },
);
