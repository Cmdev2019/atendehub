import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { Role } from '@prisma/client';

jest.mock('bcrypt');

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockJwtService = {
  signAsync: jest.fn(),
  decode: jest.fn(),
};

const mockConfig = {
  get: jest.fn(),
};

const mockTokenBlacklist = {
  add: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: TokenBlacklistService, useValue: mockTokenBlacklist },
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

  describe('refresh', () => {
    const storedToken = {
      id: 'rt-1',
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

    it('rejeita quando o refresh token já foi revogado', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce({
        ...storedToken,
        revokedAt: new Date(),
      });

      await expect(service.refresh('token-revogado')).rejects.toThrow(
        UnauthorizedException,
      );
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

    it('revoga o token atual e emite um novo par ao suceder', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce(storedToken);
      mockPrisma.refreshToken.update.mockResolvedValueOnce({});
      mockPrisma.refreshToken.create.mockResolvedValueOnce({});

      const result = await service.refresh('token-valido');

      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: storedToken.id },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result.accessToken).toBe('token-assinado');
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

    it('não blacklista um access token que já expirou', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
      const pastExp = Math.floor(Date.now() / 1000) - 10;
      mockJwtService.decode.mockReturnValueOnce({ exp: pastExp });

      await service.logout('meu-refresh-token', 'access-token-expirado');

      expect(mockTokenBlacklist.add).not.toHaveBeenCalled();
    });
  });
});
