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
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
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
