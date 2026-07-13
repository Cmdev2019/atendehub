import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

// Uso: @Roles(Role.ADMIN, Role.SUPERVISOR)
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
