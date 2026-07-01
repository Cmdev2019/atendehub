import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

// Hierarquia de permissões — cada role inclui as abaixo dela
const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 4,
  [Role.ADMIN]: 3,
  [Role.SUPERVISOR]: 2,
  [Role.AGENT]: 1,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Se não tem @Roles(), qualquer usuário autenticado pode acessar
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();

    const userLevel = ROLE_HIERARCHY[user.role as Role] ?? 0;
    const hasPermission = requiredRoles.some(
      (role) => userLevel >= ROLE_HIERARCHY[role],
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Acesso negado. Requer: ${requiredRoles.join(' ou ')}`,
      );
    }

    return true;
  }
}
