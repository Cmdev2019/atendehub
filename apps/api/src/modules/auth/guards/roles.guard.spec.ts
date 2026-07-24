import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function makeContext(role: Role): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: { role } }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('libera acesso quando a rota não usa @Roles()', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(makeContext(Role.AGENT))).toBe(true);
  });

  it('libera acesso quando o usuário tem exatamente a role exigida', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

    expect(guard.canActivate(makeContext(Role.ADMIN))).toBe(true);
  });

  it('libera acesso quando o usuário tem uma role acima na hierarquia (SUPER_ADMIN > ADMIN)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

    expect(guard.canActivate(makeContext(Role.SUPER_ADMIN))).toBe(true);
  });

  it('bloqueia acesso quando o usuário tem uma role abaixo na hierarquia (AGENT tentando ADMIN)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

    expect(() => guard.canActivate(makeContext(Role.AGENT))).toThrow(
      ForbiddenException,
    );
  });

  it('libera acesso quando o usuário atende a pelo menos uma das roles exigidas', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ADMIN, Role.SUPERVISOR]);

    expect(guard.canActivate(makeContext(Role.SUPERVISOR))).toBe(true);
  });
});
