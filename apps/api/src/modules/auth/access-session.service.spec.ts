import { UnauthorizedException } from '@nestjs/common';
import { AccessSessionService } from './access-session.service';
import { JwtPayload } from './strategies/jwt.strategy';

// B-72 (M-08) / B-74 (M-09): o que torna um access token válido depois que a
// assinatura já passou — usado pelo JwtStrategy (HTTP) e pelo handshake do
// WebSocket.
describe('AccessSessionService', () => {
  const mockPrisma = { user: { findUnique: jest.fn() } };
  const mockBlacklist = { isBlacklisted: jest.fn() };
  const service = new AccessSessionService(mockPrisma as any, mockBlacklist as any);

  const token = 'token-x';
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

  it('aceita access token válido e não expõe campos internos', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(dbUser);

    const user = await service.validate(token, payload);

    expect(user).toEqual(expect.objectContaining({ id: 'user-1', companyId: 'company-1' }));
    expect(user).not.toHaveProperty('sessionsRevokedAt');
    expect(user).not.toHaveProperty('isActive');
  });

  it.each([['refresh'], [undefined]])('recusa token com typ %s', async (typ) => {
    await expect(
      service.validate(token, { ...payload, typ: typ as JwtPayload['typ'] }),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('recusa token na blacklist (logout) sem consultar o usuário', async () => {
    mockBlacklist.isBlacklisted.mockResolvedValueOnce(true);

    await expect(service.validate(token, payload)).rejects.toThrow('Token foi revogado');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('recusa usuário desativado', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...dbUser, isActive: false });

    await expect(service.validate(token, payload)).rejects.toThrow(UnauthorizedException);
  });

  it('recusa token emitido antes do encerramento das sessões', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      ...dbUser,
      sessionsRevokedAt: new Date((nowSec + 5) * 1000),
    });

    await expect(service.validate(token, payload)).rejects.toThrow('Sessão encerrada');
  });

  it('aceita token emitido no mesmo segundo do encerramento (par novo da troca de senha)', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      ...dbUser,
      sessionsRevokedAt: new Date(nowSec * 1000 + 700),
    });

    await expect(service.validate(token, payload)).resolves.toEqual(
      expect.objectContaining({ id: 'user-1' }),
    );
  });
});
