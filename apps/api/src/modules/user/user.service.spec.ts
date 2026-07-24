import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UserService } from './user.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { StorageService } from '../../shared/storage/storage.service';

// Isolamento multi-tenant (B4-3) — mesma lógica do contact.service.spec.ts:
// o que importa é que a mutação nunca roda quando o registro é de outra
// empresa, não só que a resposta pareça certa.
const mockPrisma = {
  user: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  company: {
    findUnique: jest.fn(),
  },
};

const mockAuditLog = { record: jest.fn() };
const mockStorage = { upload: jest.fn() };

describe('UserService — isolamento multi-tenant', () => {
  let service: UserService;
  const companyA = 'company-a';
  const userOfCompanyB = 'user-da-empresa-b';
  const requesterId = 'user-a';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('findAll', () => {
    it('sempre filtra por companyId', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]);
      mockPrisma.user.count.mockResolvedValueOnce(0);

      await service.findAll(companyA, {});

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: companyA }) }),
      );
    });
  });

  describe('findOne', () => {
    it('não encontra um usuário que pertence a outra empresa', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(service.findOne(companyA, userOfCompanyB)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: userOfCompanyB, companyId: companyA } }),
      );
    });
  });

  describe('update', () => {
    it('nunca chama user.update para um usuário de outra empresa', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null); // findOne interno não acha

      await expect(
        service.update(companyA, userOfCompanyB, { name: 'Nome Hostil' }, requesterId),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('registra auditoria quando a role muda', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 'user-1',
        companyId: companyA,
        role: Role.AGENT,
        departments: [],
      });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'user-1', role: Role.SUPERVISOR });

      await service.update(companyA, 'user-1', { role: Role.SUPERVISOR }, requesterId);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.role_changed',
          before: { role: Role.AGENT },
          after: { role: Role.SUPERVISOR },
        }),
      );
    });

    it('não registra auditoria quando a role não muda', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 'user-1',
        companyId: companyA,
        role: Role.AGENT,
        departments: [],
      });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'user-1', role: Role.AGENT });

      await service.update(companyA, 'user-1', { name: 'Novo Nome' }, requesterId);

      expect(mockAuditLog.record).not.toHaveBeenCalled();
    });
  });

  describe('updateOwnProfile', () => {
    it('atualiza name/phone/avatarUrl do próprio usuário', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 'user-1',
        companyId: companyA,
        role: Role.AGENT,
        departments: [],
      });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'user-1', name: 'Novo Nome' });

      await service.updateOwnProfile(companyA, 'user-1', { name: 'Novo Nome' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' }, data: { name: 'Novo Nome' } }),
      );
    });

    it('nunca chama user.update quando o id não pertence à empresa do requisitante', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateOwnProfile(companyA, userOfCompanyB, { name: 'Nome Hostil' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updateAvatar', () => {
    const fakeFile = {
      buffer: Buffer.from('fake-image-bytes'),
      mimetype: 'image/png',
      originalname: 'foto.png',
      size: 16,
    } as Express.Multer.File;

    it('sobe o arquivo no storage e salva a URL retornada como avatarUrl', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 'user-1',
        companyId: companyA,
        role: Role.AGENT,
        departments: [],
      });
      mockStorage.upload.mockResolvedValueOnce({
        url: 'http://minio/bucket/company-a/avatars/foto.png',
        bucket: 'atendehub-media',
        key: 'company-a/avatars/foto.png',
        size: 16,
      });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'user-1', avatarUrl: 'http://minio/bucket/company-a/avatars/foto.png' });

      await service.updateAvatar(companyA, 'user-1', fakeFile);

      expect(mockStorage.upload).toHaveBeenCalledWith(
        fakeFile.buffer,
        'image/png',
        companyA,
        'foto.png',
        16,
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { avatarUrl: 'http://minio/bucket/company-a/avatars/foto.png' },
        }),
      );
    });

    it('rejeita arquivo vazio sem chamar o storage', async () => {
      const emptyFile = { ...fakeFile, buffer: Buffer.alloc(0) } as Express.Multer.File;

      await expect(service.updateAvatar(companyA, 'user-1', emptyFile)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('nunca sobe o arquivo quando o id não pertence à empresa do requisitante', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateAvatar(companyA, userOfCompanyB, fakeFile),
      ).rejects.toThrow(NotFoundException);
      expect(mockStorage.upload).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('nunca chama user.update para um usuário de outra empresa', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.changePassword(companyA, userOfCompanyB, {
          currentPassword: 'x',
          newPassword: 'y',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('nunca chama user.update para um usuário de outra empresa', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null); // findOne interno não acha

      await expect(
        service.remove(companyA, userOfCompanyB, 'quem-esta-pedindo'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('bloqueia um usuário tentando desativar a própria conta, mesmo dentro da empresa certa', async () => {
      await expect(
        service.remove(companyA, 'meu-proprio-id', 'meu-proprio-id'),
      ).rejects.toThrow(BadRequestException);
      // Nem chega a checar o banco — a guarda de auto-desativação vem antes
      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    });
  });
});
