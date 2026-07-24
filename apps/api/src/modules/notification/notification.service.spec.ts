import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

// Isolamento multi-tenant (B4-3): o risco específico aqui não é só companyId
// — é userId. Sem o filtro `userId` além de `companyId`, um agente poderia
// ler ou marcar como lida a notificação de um colega da MESMA empresa.
const mockPrisma = {
  notification: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
};

describe('NotificationService', () => {
  let service: NotificationService;
  const companyA = 'company-a';
  const userA = 'user-a';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  describe('findAll', () => {
    it('filtra sempre por companyId E userId — nunca as notificações de outro agente', async () => {
      mockPrisma.notification.findMany.mockResolvedValueOnce([]);
      mockPrisma.notification.count.mockResolvedValueOnce(0);

      await service.findAll(companyA, userA, {});

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: companyA, userId: userA }),
        }),
      );
    });
  });

  describe('markAsRead', () => {
    it('não marca como lida uma notificação de outro usuário da mesma empresa', async () => {
      mockPrisma.notification.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.markAsRead(companyA, userA, 'notificacao-de-outro-agente'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'notificacao-de-outro-agente', companyId: companyA, userId: userA },
      });
      expect(mockPrisma.notification.update).not.toHaveBeenCalled();
    });

    it('marca a própria notificação como lida', async () => {
      mockPrisma.notification.findFirst.mockResolvedValueOnce({ id: 'notif-1', readAt: null });
      mockPrisma.notification.update.mockResolvedValueOnce({});

      await service.markAsRead(companyA, userA, 'notif-1');

      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'notif-1' } }),
      );
    });
  });

  describe('markAllAsRead', () => {
    it('só afeta as notificações não lidas do próprio usuário', async () => {
      mockPrisma.notification.updateMany.mockResolvedValueOnce({ count: 3 });

      const result = await service.markAllAsRead(companyA, userA);

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { companyId: companyA, userId: userA, readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(result.message).toContain('3');
    });
  });
});
