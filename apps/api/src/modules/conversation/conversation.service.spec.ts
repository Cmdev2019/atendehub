import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { ConversationStatus } from '@prisma/client';
import { ConversationService } from './conversation.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

// Isolamento multi-tenant (B4-3): o risco é o mesmo dos outros services —
// assign()/updateStatus() delegam a validação de posse pra findOne() por
// baixo dos panos; o que garante isolamento é o findFirst com { id, companyId }
// nunca ser contornado por um update direto com só { id }.
const mockPrisma = {
  conversation: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    aggregate: jest.fn(),
  },
  user: { findFirst: jest.fn() },
  department: { findFirst: jest.fn() },
  queue: { findFirst: jest.fn(), findUnique: jest.fn() },
};

const mockEventsService = {
  emitConversationAssigned: jest.fn(),
  emitConversationUpdated: jest.fn(),
};

const mockSlaQueue = {
  add: jest.fn(),
  getJob: jest.fn().mockResolvedValue(null),
};

const mockAuditLog = { record: jest.fn() };
const mockNotificationService = { create: jest.fn() };

describe('ConversationService — isolamento multi-tenant', () => {
  let service: ConversationService;
  const companyA = 'company-a';
  const conversationOfCompanyB = 'conversa-da-empresa-b';
  const requesterId = 'user-a';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSlaQueue.getJob.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsService, useValue: mockEventsService },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: getQueueToken(QUEUE_NAMES.SLA_CHECK), useValue: mockSlaQueue },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
  });

  describe('findAll', () => {
    it('sempre filtra por companyId', async () => {
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);
      mockPrisma.conversation.count.mockResolvedValueOnce(0);

      await service.findAll(companyA, {});

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: companyA }) }),
      );
    });
  });

  describe('getStats (B-2, ampliado no B-32)', () => {
    it('sempre filtra por companyId em todas as contagens', async () => {
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.aggregate.mockResolvedValueOnce({ _sum: { unreadCount: 0 } });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      await service.getStats(companyA, requesterId);

      // 7 contagens (totalActive, waiting, open, resolvedToday,
      // unreadConversations, myOpen, slaBreached) — todas com companyId
      mockPrisma.conversation.count.mock.calls.forEach((call) => {
        expect(call[0].where).toEqual(expect.objectContaining({ companyId: companyA }));
      });
      expect(mockPrisma.conversation.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: companyA }) }),
      );
      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: companyA }) }),
      );
    });

    it('retorna as contagens no shape esperado', async () => {
      mockPrisma.conversation.count
        .mockResolvedValueOnce(10) // totalActive
        .mockResolvedValueOnce(4)  // waiting
        .mockResolvedValueOnce(6)  // open
        .mockResolvedValueOnce(2)  // resolvedToday
        .mockResolvedValueOnce(3)  // unreadConversations
        .mockResolvedValueOnce(5)  // myOpen
        .mockResolvedValueOnce(1); // slaBreached
      mockPrisma.conversation.aggregate.mockResolvedValueOnce({ _sum: { unreadCount: 15 } });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      const result = await service.getStats(companyA, requesterId);

      expect(result).toEqual({
        totalActive: 10,
        waiting: 4,
        open: 6,
        resolvedToday: 2,
        unreadCount: 15,
        unreadConversations: 3,
        myOpen: 5,
        slaBreached: 1,
        awaitingReply: 0,
        myAwaitingReply: 0,
      });
    });

    it('nunca conta conversas CLOSED nos totais ativos', async () => {
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.aggregate.mockResolvedValueOnce({ _sum: { unreadCount: null } });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      await service.getStats(companyA, requesterId);

      const totalActiveCall = mockPrisma.conversation.count.mock.calls[0][0];
      expect(totalActiveCall.where.status).toEqual({ not: ConversationStatus.CLOSED });
    });

    it('unreadCount vira 0 (não null) quando não há conversas', async () => {
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.aggregate.mockResolvedValueOnce({ _sum: { unreadCount: null } });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      const result = await service.getStats(companyA, requesterId);

      expect(result.unreadCount).toBe(0);
    });

    it('myOpen filtra OPEN atribuído só ao requisitante (via JWT, não parâmetro livre)', async () => {
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.aggregate.mockResolvedValueOnce({ _sum: { unreadCount: 0 } });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      await service.getStats(companyA, requesterId);

      const myOpenCall = mockPrisma.conversation.count.mock.calls[5][0];
      expect(myOpenCall.where).toEqual(
        expect.objectContaining({ status: ConversationStatus.OPEN, agentId: requesterId }),
      );
    });

    it('slaBreached conta conversas ativas com slaBreachedAt setado', async () => {
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.aggregate.mockResolvedValueOnce({ _sum: { unreadCount: 0 } });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      await service.getStats(companyA, requesterId);

      const slaCall = mockPrisma.conversation.count.mock.calls[6][0];
      expect(slaCall.where.slaBreachedAt).toEqual({ not: null });
    });

    it('awaitingReply/myAwaitingReply contam só conversas OPEN cuja última mensagem é do cliente', async () => {
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.aggregate.mockResolvedValueOnce({ _sum: { unreadCount: 0 } });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([
        { agentId: requesterId, messages: [{ senderType: 'CLIENT' }] }, // minha, aguardando
        { agentId: 'outro-agente', messages: [{ senderType: 'CLIENT' }] }, // de outro, aguardando
        { agentId: requesterId, messages: [{ senderType: 'AGENT' }] }, // minha, já respondida
        { agentId: requesterId, messages: [] }, // sem mensagem nenhuma ainda
      ]);

      const result = await service.getStats(companyA, requesterId);

      expect(result.awaitingReply).toBe(2);
      expect(result.myAwaitingReply).toBe(1);
    });
  });

  describe('findOne', () => {
    it('não encontra uma conversa que pertence a outra empresa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

      await expect(service.findOne(companyA, conversationOfCompanyB)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: conversationOfCompanyB, companyId: companyA } }),
      );
    });
  });

  describe('assign', () => {
    it('nunca chama conversation.update para uma conversa de outra empresa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null); // findOne interno não acha

      await expect(
        service.assign(
          companyA,
          conversationOfCompanyB,
          { agentId: 'agente-hostil' },
          requesterId,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
      expect(mockAuditLog.record).not.toHaveBeenCalled();
    });

    it('registra auditoria e notifica o agente ao atribuir uma conversa de verdade', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.WAITING,
        contact: { name: 'Fulano' },
        agent: null,
        department: null,
      });
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'agent-1' });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.OPEN,
        companyId: companyA,
        agentId: 'agent-1',
        departmentId: null,
        agent: { id: 'agent-1', name: 'Agente', avatarUrl: null },
        department: null,
      });

      await service.assign(companyA, 'conv-1', { agentId: 'agent-1' }, requesterId);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'conversation.assigned',
          before: { agentId: null },
          after: { agentId: 'agent-1' },
        }),
      );
      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'agent-1', type: 'conversation_assigned' }),
      );
    });
  });

  describe('updateStatus', () => {
    it('nunca chama conversation.update para uma conversa de outra empresa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null); // findOne interno não acha

      await expect(
        service.updateStatus(companyA, conversationOfCompanyB, {
          status: ConversationStatus.CLOSED,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    });

    // B-32: motivo do encerramento (RESOLVED/UNRESOLVED), informado pelo
    // atendente ao fechar — vira dado real pro dashboard/relatórios.
    it('persiste o motivo do encerramento (resolution) ao fechar a conversa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.OPEN,
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.CLOSED,
        companyId: companyA,
        resolution: 'RESOLVED',
      });

      await service.updateStatus(companyA, 'conv-1', {
        status: ConversationStatus.CLOSED,
        resolution: 'RESOLVED' as any,
      });

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ConversationStatus.CLOSED, resolution: 'RESOLVED' }),
        }),
      );
    });

    it('não grava resolution em transições que não são para CLOSED', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.WAITING,
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.OPEN,
        companyId: companyA,
      });

      await service.updateStatus(companyA, 'conv-1', { status: ConversationStatus.OPEN });

      const call = mockPrisma.conversation.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('resolution');
    });

    // B-36: cancelar exige justificativa do atendente (validada no DTO,
    // aqui só confirma que o service persiste o que recebeu).
    it('persiste resolutionNote ao cancelar (resolution=CANCELLED)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.OPEN,
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.CLOSED,
        companyId: companyA,
        resolution: 'CANCELLED',
        resolutionNote: 'Contato pediu pra falar depois, não retornou.',
      });

      await service.updateStatus(companyA, 'conv-1', {
        status: ConversationStatus.CLOSED,
        resolution: 'CANCELLED' as any,
        resolutionNote: 'Contato pediu pra falar depois, não retornou.',
      });

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ConversationStatus.CLOSED,
            resolution: 'CANCELLED',
            resolutionNote: 'Contato pediu pra falar depois, não retornou.',
          }),
        }),
      );
    });
  });

  describe('markAsRead', () => {
    it('nunca chama conversation.update para uma conversa de outra empresa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null); // findOne interno não acha

      await expect(service.markAsRead(companyA, conversationOfCompanyB)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    });
  });
});
