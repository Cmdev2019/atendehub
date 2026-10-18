import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { EventsService } from '../events/events.service';
import { Role } from '@prisma/client';

jest.mock('bcrypt');

const mockPrisma: any = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  company: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};
// A callback de $transaction roda contra o mesmo mock (tx compartilha a
// mesma "forma" do client fora da transação — suficiente pra unit test). A
// forma em lista (revokeAllSessions) só espera as operações.
mockPrisma.$transaction = jest.fn((arg: any) =>
  Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma),
);

const mockJwtService = {
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
  decode: jest.fn(),
};

const mockConfig = {
  get: jest.fn(),
};

const mockTokenBlacklist = {
  add: jest.fn(),
};

const mockEvents = {
  disconnectUser: jest.fn(),
  disconnectSession: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  const dbUser = {
    id: 'user-1',
    companyId: 'company-1',
    name: 'Fulano',
    email: 'fulano@empresa.com',
    role: Role.AGENT,
    avatarUrl: null,
    passwordHash: 'hash-armazenado',
    isActive: true,
    company: { isActive: true },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue(undefined); // usa os defaults do código (15m/7d etc.)
    mockJwtService.signAsync.mockResolvedValue('token-assinado');
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', typ: 'refresh' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: TokenBlacklistService, useValue: mockTokenBlacklist },
        { provide: EventsService, useValue: mockEvents },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('validateUser', () => {
    it('retorna null quando o usuário não existe ou está inativo (filtrado na query)', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      const result = await service.validateUser('inexistente@empresa.com', 'qualquer');

      expect(result).toBeNull();
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'inexistente@empresa.com', isActive: true },
        }),
      );
    });

    it('retorna null quando a empresa do usuário está inativa', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        ...dbUser,
        company: { isActive: false },
      });

      const result = await service.validateUser(dbUser.email, 'senha-certa');

      expect(result).toBeNull();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('retorna null quando a senha está errada', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(dbUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      const result = await service.validateUser(dbUser.email, 'senha-errada');

      expect(result).toBeNull();
    });

    it('retorna o usuário sem o hash da senha quando as credenciais são válidas', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(dbUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      const result = await service.validateUser(dbUser.email, 'senha-certa');

      expect(result).toEqual(
        expect.objectContaining({ id: dbUser.id, email: dbUser.email }),
      );
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('company');
    });
  });

  describe('login', () => {
    it('gera os tokens e persiste o refresh token hasheado com validade de 7 dias', async () => {
      const authUser = {
        id: dbUser.id,
        companyId: dbUser.companyId,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
        avatarUrl: dbUser.avatarUrl,
      };
      mockPrisma.refreshToken.create.mockResolvedValueOnce({});

      const result = await service.login(authUser);

      expect(result.accessToken).toBe('token-assinado');
      expect(result.refreshToken).toBe('token-assinado');
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: authUser.id,
            // nunca o token em texto puro — só o hash SHA-256 (64 hex chars)
            token: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        }),
      );
    });
  });

  describe('registerCompany (B-9)', () => {
    const dto = {
      companyName: 'Café & Cia!!',
      name: 'Nova Admin',
      email: 'NovaAdmin@Empresa.com',
      password: 'Senha123',
    };

    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hash-da-senha-nova');
      mockPrisma.refreshToken.create.mockResolvedValue({});
    });

    it('rejeita com ConflictException quando o e-mail já existe (busca global, não por empresa)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'user-existente' });

      await expect(service.registerCompany(dto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'novaadmin@empresa.com' },
      });
      expect(mockPrisma.company.create).not.toHaveBeenCalled();
    });

    it('gera um slug normalizado (sem acento/pontuação) a partir do nome da empresa', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null); // e-mail livre
      mockPrisma.company.findUnique.mockResolvedValueOnce(null); // slug livre de primeira
      mockPrisma.company.create.mockResolvedValueOnce({ id: 'company-1', name: dto.companyName, slug: 'cafe-cia' });
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'user-1', companyId: 'company-1', name: dto.name,
        email: 'novaadmin@empresa.com', role: Role.ADMIN, avatarUrl: null,
      });

      await service.registerCompany(dto);

      expect(mockPrisma.company.findUnique).toHaveBeenCalledWith({
        where: { slug: 'cafe-cia' },
        select: { id: true },
      });
      expect(mockPrisma.company.create).toHaveBeenCalledWith({
        data: { name: 'Café & Cia!!', slug: 'cafe-cia' },
      });
    });

    it('resolve colisão de slug com sufixo numérico incremental', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.company.findUnique
        .mockResolvedValueOnce({ id: 'ja-existe' }) // "cafe-cia" ocupado
        .mockResolvedValueOnce(null); // "cafe-cia-2" livre
      mockPrisma.company.create.mockResolvedValueOnce({ id: 'company-2', name: dto.companyName, slug: 'cafe-cia-2' });
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'user-2', companyId: 'company-2', name: dto.name,
        email: 'novaadmin@empresa.com', role: Role.ADMIN, avatarUrl: null,
      });

      await service.registerCompany(dto);

      expect(mockPrisma.company.create).toHaveBeenCalledWith({
        data: { name: 'Café & Cia!!', slug: 'cafe-cia-2' },
      });
    });

    it('cria a empresa com o solicitante como ADMIN e devolve tokens (auto-login)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.company.findUnique.mockResolvedValueOnce(null);
      mockPrisma.company.create.mockResolvedValueOnce({ id: 'company-3', name: dto.companyName, slug: 'cafe-cia' });
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'user-3', companyId: 'company-3', name: dto.name,
        email: 'novaadmin@empresa.com', role: Role.ADMIN, avatarUrl: null,
      });

      const result = await service.registerCompany(dto);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          companyId: 'company-3',
          name: 'Nova Admin',
          email: 'novaadmin@empresa.com', // e-mail normalizado (lowercase/trim)
          passwordHash: 'hash-da-senha-nova',
          role: Role.ADMIN,
        },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 12);
      // Mesmo formato de resposta do login (F0-4/login) — front reaproveita sem mudança de contrato
      expect(result.accessToken).toBe('token-assinado');
      expect(result.refreshToken).toBe('token-assinado');
      expect(result.user).toEqual(
        expect.objectContaining({ id: 'user-3', companyId: 'company-3', role: Role.ADMIN }),
      );
    });
  });

  describe('refresh', () => {
    const storedToken = {
      id: 'rt-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { ...dbUser, company: { isActive: true } },
    };

    it('rejeita quando o refresh token não existe', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce(null);

      await expect(service.refresh('token-invalido')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    // B-72 (M-08): sem `typ: refresh`, nem chega a consultar o banco.
    it('rejeita um access token usado como refresh token', async () => {
      mockJwtService.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', typ: 'access' });

      await expect(service.refresh('access-token')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('rejeita token com assinatura inválida sem consultar o banco', async () => {
      mockJwtService.verifyAsync.mockRejectedValueOnce(new Error('invalid signature'));

      await expect(service.refresh('forjado')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('rejeita quando o refresh token acabou de ser rotacionado (corrida entre abas), sem encerrar as sessões', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce({
        ...storedToken,
        revokedAt: new Date(),
      });

      await expect(service.refresh('token-revogado')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    // B-72 (M-08): reuso fora da janela de corrida = cópia roubada.
    it('reuso de refresh token revogado há mais tempo encerra todas as sessões do usuário', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce({
        ...storedToken,
        revokedAt: new Date(Date.now() - 5 * 60_000),
      });
      mockPrisma.user.update.mockResolvedValueOnce({});
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 2 });

      await expect(service.refresh('token-roubado')).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { sessionsRevokedAt: expect.any(Date) },
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
      // B-74 (M-09): os sockets do usuário caem junto.
      expect(mockEvents.disconnectUser).toHaveBeenCalledWith('user-1', undefined);
    });

    it('rejeita quando o refresh token expirou', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce({
        ...storedToken,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh('token-expirado')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejeita quando o usuário está inativo', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce({
        ...storedToken,
        user: { ...storedToken.user, isActive: false },
      });

      await expect(service.refresh('token-valido')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('revoga o token atual de forma atômica e emite um novo par ao suceder', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce(storedToken);
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.refreshToken.create.mockResolvedValueOnce({});

      const result = await service.refresh('token-valido');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: storedToken.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result.accessToken).toBe('token-assinado');
      // Sem isActive/company/passwordHash no usuário devolvido.
      expect(result.user).not.toHaveProperty('isActive');
    });

    // B-72 (M-08): duas renovações simultâneas com o mesmo token — só a que
    // revogou primeiro ganha o par novo.
    it('perde a corrida da rotação: 401 e nenhum token novo', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce(storedToken);
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.refresh('token-valido')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('assina access e refresh com typ distintos', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce(storedToken);
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.refreshToken.create.mockResolvedValueOnce({});

      await service.refresh('token-valido');

      const typs = mockJwtService.signAsync.mock.calls.map(([payload]) => payload.typ);
      expect(typs).toEqual(['access', 'refresh']);
    });
  });

  describe('logout', () => {
    it('revoga o refresh token correspondente', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.logout('meu-refresh-token');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: null }),
          data: { revokedAt: expect.any(Date) },
        }),
      );
      expect(mockTokenBlacklist.add).not.toHaveBeenCalled();
    });

    it('blacklista o access token quando informado e ainda não expirou', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
      const futureExp = Math.floor(Date.now() / 1000) + 300;
      mockJwtService.decode.mockReturnValueOnce({ exp: futureExp });

      await service.logout('meu-refresh-token', 'meu-access-token');

      expect(mockTokenBlacklist.add).toHaveBeenCalledWith(
        'meu-access-token',
        expect.any(Number),
      );
    });

    // B-74 (M-09): só os sockets desta sessão caem — outros aparelhos do
    // mesmo usuário seguem conectados.
    it('derruba o socket da sessão do access token', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
      const futureExp = Math.floor(Date.now() / 1000) + 300;
      mockJwtService.decode.mockReturnValue({ exp: futureExp, jti: 'sessao-1' });

      await service.logout('meu-refresh-token', 'meu-access-token');
      mockJwtService.decode.mockReset();

      expect(mockEvents.disconnectSession).toHaveBeenCalledWith('sessao-1');
      expect(mockEvents.disconnectUser).not.toHaveBeenCalled();
    });

    it('não blacklista um access token que já expirou', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
      const pastExp = Math.floor(Date.now() / 1000) - 10;
      mockJwtService.decode.mockReturnValueOnce({ exp: pastExp });

      await service.logout('meu-refresh-token', 'access-token-expirado');

      expect(mockTokenBlacklist.add).not.toHaveBeenCalled();
    });
  });
});
