import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { QueueService } from './queue.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

// Mock mínimo do PrismaService: só os métodos que o QueueService usa.
const mockPrisma = {
  queue: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  department: {
    findFirst: jest.fn(),
  },
};

describe('QueueService', () => {
  let service: QueueService;
  const companyId = 'company-1';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [QueueService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  // Isolamento multi-tenant (B4-3)
  describe('findAll', () => {
    it('sempre filtra por companyId', async () => {
      mockPrisma.queue.findMany.mockResolvedValueOnce([]);

      await service.findAll(companyId);

      expect(mockPrisma.queue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId } }),
      );
    });
  });

  describe('findOne', () => {
    it('não encontra uma fila que pertence a outra empresa', async () => {
      mockPrisma.queue.findFirst.mockResolvedValueOnce(null);

      await expect(service.findOne(companyId, 'queue-de-outra-empresa')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.queue.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'queue-de-outra-empresa', companyId } }),
      );
    });
  });

  describe('update', () => {
    it('nunca chama queue.update para uma fila de outra empresa', async () => {
      mockPrisma.queue.findFirst.mockResolvedValueOnce(null); // findOne interno não acha

      await expect(
        service.update(companyId, 'queue-de-outra-empresa', { name: 'Nome Hostil' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.queue.update).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('cria a fila quando o nome é único na empresa', async () => {
      mockPrisma.queue.findFirst.mockResolvedValueOnce(null); // sem conflito de nome
      mockPrisma.queue.create.mockResolvedValueOnce({
        id: 'queue-1',
        name: 'Suporte',
        strategy: 'ROUND_ROBIN',
        maxWaitSecs: 300,
        greetingMsg: null,
        departmentId: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(companyId, { name: 'Suporte' });

      expect(result.id).toBe('queue-1');
      expect(mockPrisma.queue.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId, name: 'Suporte' }) }),
      );
    });

    it('rejeita nome duplicado na mesma empresa', async () => {
      mockPrisma.queue.findFirst.mockResolvedValueOnce({ id: 'queue-existente' });

      await expect(service.create(companyId, { name: 'Suporte' })).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.queue.create).not.toHaveBeenCalled();
    });

    it('rejeita departmentId que não pertence à empresa', async () => {
      mockPrisma.queue.findFirst.mockResolvedValueOnce(null);
      mockPrisma.department.findFirst.mockResolvedValueOnce(null); // não encontrado nesta empresa

      await expect(
        service.create(companyId, { name: 'Suporte', departmentId: 'dept-de-outra-empresa' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.queue.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('remove a fila quando não há conversas associadas', async () => {
      mockPrisma.queue.findFirst.mockResolvedValueOnce({
        _count: { conversations: 0 },
      });
      mockPrisma.queue.delete.mockResolvedValueOnce({});

      const result = await service.remove(companyId, 'queue-1');

      expect(result).toEqual({ message: 'Fila removida com sucesso' });
      expect(mockPrisma.queue.delete).toHaveBeenCalledWith({ where: { id: 'queue-1' } });
    });

    it('bloqueia remoção quando a fila tem conversas associadas', async () => {
      mockPrisma.queue.findFirst.mockResolvedValueOnce({
        _count: { conversations: 3 },
      });

      await expect(service.remove(companyId, 'queue-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.queue.delete).not.toHaveBeenCalled();
    });

    it('lança NotFoundException para fila inexistente na empresa', async () => {
      mockPrisma.queue.findFirst.mockResolvedValueOnce(null);

      await expect(service.remove(companyId, 'queue-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
