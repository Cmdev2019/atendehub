import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtPayload, JwtStrategy } from './jwt.strategy';

// B-72 (M-08): o que o JwtStrategy recusa depois que a assinatura já passou —
// token do tipo errado e sessão encerrada por troca/reset de senha.
describe('JwtStrategy (B-72)', () => {
  const mockPrisma = { user: { findUnique: jest.fn() } };
  const mockBlacklist = { isBlacklisted: jest.fn() };
  const config = { get: jest.fn().mockReturnValue('segredo-de-teste') } as unknown as ConfigService;
  const strategy = new JwtStrategy(mockPrisma as any, mockBlacklist as any, config);

  const req = { headers: { authorization: 'Bearer token-x' } } as Request;
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: 'user-1',
    companyId: 'company-1',
    email: 'ana@empresa.com',
    role: 'AGENT',
    typ: 'access',
    iat: nowSec,
  };
  const dbUser = {
    id: 'user-1',
    companyId: 'company-1',
    name: 'Ana',
    email: 'ana@empresa.com',
    role: 'AGENT',
    avatarUrl: null,
    isActive: true,
    sessionsRevokedAt: null as Date | null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockBlacklist.isBlacklisted.mockResolvedValue(false);
  });

  it('aceita access token válido e não expõe sessionsRevokedAt', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(dbUser);

    const user = await strategy.validate(req, payload);

    expect(user).toEqual(expect.objectContaining({ id: 'user-1' }));
    expect(user).not.toHaveProperty('sessionsRevokedAt');
  });

  it.each([['refresh'], [undefined]])('recusa token com typ %s', async (typ) => {
    await expect(
      strategy.validate(req, { ...payload, typ: typ as JwtPayload['typ'] }),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('recusa token emitido antes do encerramento das sessões', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      ...dbUser,
      sessionsRevokedAt: new Date((nowSec + 5) * 1000),
    });

    await expect(strategy.validate(req, payload)).rejects.toThrow(UnauthorizedException);
  });

  it('aceita token emitido no mesmo segundo do encerramento (par novo da troca de senha)', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      ...dbUser,
      sessionsRevokedAt: new Date(nowSec * 1000 + 700),
    });

    await expect(strategy.validate(req, payload)).resolves.toEqual(
      expect.objectContaining({ id: 'user-1' }),
    );
  });
});
