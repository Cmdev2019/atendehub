import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AutoAttendanceAction } from '@prisma/client';
import { AutoAttendanceService } from './auto-attendance.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

const mockPrisma = {
  autoAttendanceFlow: { findUnique: jest.fn(), upsert: jest.fn() },
  autoAttendanceMenuOption: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  department: { findFirst: jest.fn() },
  queue: { findFirst: jest.fn() },
  $transaction: jest.fn(),
};

describe('AutoAttendanceService', () => {
  let service: AutoAttendanceService;
  const companyId = 'company-1';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AutoAttendanceService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<AutoAttendanceService>(AutoAttendanceService);
  });

  describe('getFlow', () => {
    it('devolve um flow desativado "vazio" quando a empresa nunca configurou nada', async () => {
      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce(null);

      const flow = await service.getFlow(companyId);

      expect(flow).toEqual(
        expect.objectContaining({ id: null, isActive: false, menuOptions: [] }),
      );
    });

    it('devolve o flow real (com opções) quando já existe', async () => {
      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce({
        id: 'flow-1',
        isActive: true,
        menuOptions: [{ id: 'opt-1', order: 1, label: 'Suporte' }],
      });

      const flow = await service.getFlow(companyId);

      expect(flow).toEqual(
        expect.objectContaining({ id: 'flow-1', isActive: true }),
      );
    });
  });

  describe('updateFlow', () => {
    it('faz upsert por companyId (cria se não existe, atualiza se existe)', async () => {
      mockPrisma.autoAttendanceFlow.upsert.mockResolvedValueOnce({ id: 'flow-1', isActive: true });

      await service.updateFlow(companyId, { isActive: true });

      expect(mockPrisma.autoAttendanceFlow.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId },
          create: { companyId, isActive: true },
          update: { isActive: true },
        }),
      );
    });
  });

  describe('createMenuOption', () => {
    it('cria o flow da empresa automaticamente se ainda não existir (upsert)', async () => {
      mockPrisma.autoAttendanceFlow.upsert.mockResolvedValueOnce({ id: 'flow-1' });
      mockPrisma.autoAttendanceMenuOption.create.mockResolvedValueOnce({ id: 'opt-1' });

      await service.createMenuOption(companyId, {
        order: 1,
        label: 'Suporte',
        action: AutoAttendanceAction.END_CONVERSATION,
      });

      expect(mockPrisma.autoAttendanceFlow.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId } }),
      );
      expect(mockPrisma.autoAttendanceMenuOption.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ flowId: 'flow-1', order: 1 }) }),
      );
    });

    it('recusa ROUTE_TO_DEPARTMENT sem departamento válido da mesma empresa', async () => {
      mockPrisma.autoAttendanceFlow.upsert.mockResolvedValueOnce({ id: 'flow-1' });
      mockPrisma.department.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createMenuOption(companyId, {
          order: 1,
          label: 'Financeiro',
          action: AutoAttendanceAction.ROUTE_TO_DEPARTMENT,
          departmentId: 'dept-de-outra-empresa',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.autoAttendanceMenuOption.create).not.toHaveBeenCalled();
    });

    it('recusa ROUTE_TO_QUEUE sem queueId', async () => {
      mockPrisma.autoAttendanceFlow.upsert.mockResolvedValueOnce({ id: 'flow-1' });

      await expect(
        service.createMenuOption(companyId, {
          order: 1,
          label: 'Fila X',
          action: AutoAttendanceAction.ROUTE_TO_QUEUE,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateMenuOption / removeMenuOption — isolamento multi-tenant', () => {
    it('não edita uma opção que não pertence a um flow desta empresa', async () => {
      mockPrisma.autoAttendanceMenuOption.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateMenuOption(companyId, 'opt-de-outra-empresa', { label: 'Novo nome' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('não exclui uma opção que não pertence a um flow desta empresa', async () => {
      mockPrisma.autoAttendanceMenuOption.findFirst.mockResolvedValueOnce(null);

      await expect(service.removeMenuOption(companyId, 'opt-de-outra-empresa')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.autoAttendanceMenuOption.delete).not.toHaveBeenCalled();
    });

    it('exclui normalmente quando a opção pertence a esta empresa', async () => {
      mockPrisma.autoAttendanceMenuOption.findFirst.mockResolvedValueOnce({ id: 'opt-1' });

      const result = await service.removeMenuOption(companyId, 'opt-1');

      expect(mockPrisma.autoAttendanceMenuOption.delete).toHaveBeenCalledWith({ where: { id: 'opt-1' } });
      expect(result).toEqual({ success: true });
    });
  });

  describe('reorderMenuOptions', () => {
    it('recusa quando a lista não bate com o conjunto real de opções do flow', async () => {
      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce({ id: 'flow-1' });
      mockPrisma.autoAttendanceMenuOption.findMany.mockResolvedValueOnce([{ id: 'opt-1' }, { id: 'opt-2' }]);

      await expect(service.reorderMenuOptions(companyId, ['opt-1'])).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('reordena em 2 passes (offset negativo depois posição final) para não colidir com a constraint única', async () => {
      mockPrisma.autoAttendanceFlow.findUnique
        .mockResolvedValueOnce({ id: 'flow-1' }) // checagem inicial
        .mockResolvedValueOnce({ id: 'flow-1' }); // dentro de listMenuOptions() no retorno
      mockPrisma.autoAttendanceMenuOption.findMany
        .mockResolvedValueOnce([{ id: 'opt-1' }, { id: 'opt-2' }])
        .mockResolvedValueOnce([]); // 2ª chamada: listMenuOptions no retorno

      await service.reorderMenuOptions(companyId, ['opt-2', 'opt-1']);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      const txArgs = mockPrisma.$transaction.mock.calls[0][0];
      expect(txArgs).toHaveLength(4); // 2 opções × (offset negativo + posição final)
    });
  });
});
