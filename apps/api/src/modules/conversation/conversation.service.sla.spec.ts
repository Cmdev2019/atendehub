import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ConversationStatus } from '@prisma/client';
import { ConversationService } from './conversation.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

// B4-6: cobre o PRODUTOR de jobs de SLA (B2-3/B2-4) — o outro lado da fila
// que o E2E da B2-5 já testa (agendar → delay real → processor). Aqui a fila
// é mockada; o que importa é que ConversationService chame slaQueue.add/
// getJob/job.remove com o jobId e delay certos, nos momentos certos.
describe('ConversationService — produtor de SLA (scheduleSlaCheck/cancelSlaCheck)', () => {
  let service: ConversationService;
  const companyId = 'company-1';

  const mockPrisma = {
    conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    queue: { findFirst: jest.fn(), findUnique: jest.fn() },
    user: { findFirst: jest.fn() },
    department: { findFirst: jest.fn() },
  };
  const mockEvents = {
    emitConversationAssigned: jest.fn(),
    emitConversationUpdated: jest.fn(),
  };
  const mockAuditLog = { record: jest.fn() };
  const mockNotificationService = { create: jest.fn() };

  // job "vivo" que cancelSlaCheck consegue encontrar e remover
  const fakeExistingJob = { remove: jest.fn().mockResolvedValue(undefined) };
  const mockSlaQueue = { add: jest.fn(), getJob: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    fakeExistingJob.remove.mockClear().mockResolvedValue(undefined);
    mockSlaQueue.getJob.mockResolvedValue(null); // por padrão, nenhum job pendente

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsService, useValue: mockEvents },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: getQueueToken(QUEUE_NAMES.SLA_CHECK), useValue: mockSlaQueue },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
  });

  describe('upsertFromWebhook — agenda ao criar conversa nova em WAITING', () => {
    it('agenda o SLA com o jobId e delay corretos quando o departamento tem fila ativa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null); // não existe conversa aberta
      mockPrisma.queue.findFirst.mockResolvedValueOnce({ id: 'queue-1', maxWaitSecs: 120 });
      mockPrisma.conversation.create.mockResolvedValueOnce({ id: 'conv-novo', companyId });

      await service.upsertFromWebhook(companyId, 'contact-1', 'wa-conn-1', undefined, 'dept-1');

      expect(mockSlaQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-novo',
          companyId,
          maxWaitSecs: 120,
        }),
        { jobId: 'sla-check:conv-novo', delay: 120_000 },
      );
    });

    it('NÃO agenda SLA quando o departamento não tem fila ativa configurada', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);
      mockPrisma.queue.findFirst.mockResolvedValueOnce(null); // sem fila ativa
      mockPrisma.conversation.create.mockResolvedValueOnce({ id: 'conv-sem-fila', companyId });

      await service.upsertFromWebhook(companyId, 'contact-1', 'wa-conn-1', undefined, 'dept-1');

      expect(mockSlaQueue.add).not.toHaveBeenCalled();
    });

    it('NÃO agenda SLA quando a conversa não tem departamento (sem departmentId não consulta fila)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);
      mockPrisma.conversation.create.mockResolvedValueOnce({ id: 'conv-sem-depto', companyId });

      await service.upsertFromWebhook(companyId, 'contact-1', 'wa-conn-1');

      expect(mockPrisma.queue.findFirst).not.toHaveBeenCalled();
      expect(mockSlaQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('assign — cancela o SLA ao atribuir um agente', () => {
    const conversationBase = {
      id: 'conv-1',
      status: ConversationStatus.WAITING,
      companyId,
      agentId: null,
      departmentId: 'dept-1',
      contact: { name: 'Fulano' },
      agent: null,
      department: { id: 'dept-1' },
    };

    it('remove o job pendente (jobId determinístico) quando um agente é atribuído', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(conversationBase); // findOne interno
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'agent-1' });
      mockSlaQueue.getJob.mockResolvedValueOnce(fakeExistingJob);
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.OPEN,
        companyId,
        agentId: 'agent-1',
        departmentId: 'dept-1',
        agent: { id: 'agent-1', name: 'Agente', avatarUrl: null },
        department: null,
      });

      await service.assign(companyId, 'conv-1', { agentId: 'agent-1' }, 'requester-1');

      expect(mockSlaQueue.getJob).toHaveBeenCalledWith('sla-check:conv-1');
      expect(fakeExistingJob.remove).toHaveBeenCalled();
      expect(mockSlaQueue.add).not.toHaveBeenCalled(); // atribuir agente só cancela, nunca reagenda
    });

    it('não quebra quando não há job pendente para cancelar (getJob retorna null)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(conversationBase);
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'agent-1' });
      mockSlaQueue.getJob.mockResolvedValueOnce(null);
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.OPEN,
        companyId,
        agentId: 'agent-1',
        departmentId: 'dept-1',
        agent: { id: 'agent-1', name: 'Agente', avatarUrl: null },
        department: null,
      });

      await expect(
        service.assign(companyId, 'conv-1', { agentId: 'agent-1' }, 'requester-1'),
      ).resolves.toBeDefined();
      expect(fakeExistingJob.remove).not.toHaveBeenCalled();
    });
  });

  describe('assign — reatribuição só de departamento (conversa segue WAITING)', () => {
    const conversationBase = {
      id: 'conv-2',
      status: ConversationStatus.WAITING,
      companyId,
      agentId: null,
      departmentId: 'dept-old',
      contact: { name: 'Ciclana' },
      agent: null,
      department: { id: 'dept-old' },
    };

    it('reagenda o SLA para a fila do departamento novo (cancela o antigo antes de agendar)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(conversationBase);
      mockPrisma.department.findFirst.mockResolvedValueOnce({ id: 'dept-new' });
      mockSlaQueue.getJob.mockResolvedValueOnce(fakeExistingJob); // job antigo (fila do dept-old)
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-2',
        status: ConversationStatus.WAITING,
        companyId,
        agentId: null,
        departmentId: 'dept-new',
        agent: null,
        department: { id: 'dept-new', name: 'Novo Depto' },
      });
      mockPrisma.queue.findFirst.mockResolvedValueOnce({ id: 'queue-new', maxWaitSecs: 90 });
      mockPrisma.conversation.update.mockResolvedValueOnce({}); // update do queueId

      await service.assign(companyId, 'conv-2', { departmentId: 'dept-new' }, 'requester-1');

      // cancela o job antigo antes de agendar o novo (scheduleSlaCheck chama cancelSlaCheck internamente)
      expect(fakeExistingJob.remove).toHaveBeenCalled();
      expect(mockSlaQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-2', maxWaitSecs: 90 }),
        { jobId: 'sla-check:conv-2', delay: 90_000 },
      );
    });

    it('cancela o SLA (sem reagendar) quando o departamento novo não tem fila ativa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(conversationBase);
      mockPrisma.department.findFirst.mockResolvedValueOnce({ id: 'dept-new' });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-2',
        status: ConversationStatus.WAITING,
        companyId,
        agentId: null,
        departmentId: 'dept-new',
        agent: null,
        department: { id: 'dept-new', name: 'Novo Depto' },
      });
      mockPrisma.queue.findFirst.mockResolvedValueOnce(null); // sem fila ativa no depto novo
      mockPrisma.conversation.update.mockResolvedValueOnce({});
      mockSlaQueue.getJob.mockResolvedValueOnce(fakeExistingJob);

      await service.assign(companyId, 'conv-2', { departmentId: 'dept-new' }, 'requester-1');

      expect(fakeExistingJob.remove).toHaveBeenCalled();
      expect(mockSlaQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus — agenda/cancela ao entrar/sair de WAITING', () => {
    it('agenda o SLA ao reentrar em WAITING (ex.: reabertura) quando a conversa tem queueId', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-3',
        status: ConversationStatus.RESOLVED, // não estava WAITING
        companyId,
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-3',
        status: ConversationStatus.WAITING,
        companyId,
        resolvedAt: null,
        closedAt: null,
        updatedAt: new Date(),
        queueId: 'queue-1',
      });
      mockPrisma.queue.findUnique.mockResolvedValueOnce({ maxWaitSecs: 60 });

      await service.updateStatus(companyId, 'conv-3', { status: ConversationStatus.WAITING } as any);

      expect(mockSlaQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-3', maxWaitSecs: 60 }),
        { jobId: 'sla-check:conv-3', delay: 60_000 },
      );
    });

    it('cancela o SLA ao sair de WAITING por qualquer caminho fora do assign (ex.: RESOLVED direto)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-4',
        status: ConversationStatus.WAITING,
        companyId,
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-4',
        status: ConversationStatus.RESOLVED,
        companyId,
        resolvedAt: new Date(),
        closedAt: null,
        updatedAt: new Date(),
        queueId: 'queue-1',
      });
      mockSlaQueue.getJob.mockResolvedValueOnce(fakeExistingJob);

      await service.updateStatus(companyId, 'conv-4', { status: ConversationStatus.RESOLVED } as any);

      expect(mockSlaQueue.getJob).toHaveBeenCalledWith('sla-check:conv-4');
      expect(fakeExistingJob.remove).toHaveBeenCalled();
    });

    it('não mexe no SLA em transições que não envolvem WAITING (OPEN → RESOLVED)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-5',
        status: ConversationStatus.OPEN,
        companyId,
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-5',
        status: ConversationStatus.RESOLVED,
        companyId,
        resolvedAt: new Date(),
        closedAt: null,
        updatedAt: new Date(),
        queueId: 'queue-1',
      });

      await service.updateStatus(companyId, 'conv-5', { status: ConversationStatus.RESOLVED } as any);

      expect(mockSlaQueue.add).not.toHaveBeenCalled();
      expect(mockSlaQueue.getJob).not.toHaveBeenCalled();
    });
  });

  describe('idempotência do jobId (B2-4)', () => {
    it('scheduleSlaCheck sempre usa o mesmo jobId determinístico para a mesma conversa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);
      mockPrisma.queue.findFirst.mockResolvedValueOnce({ id: 'queue-1', maxWaitSecs: 30 });
      mockPrisma.conversation.create.mockResolvedValueOnce({ id: 'conv-idem', companyId });

      await service.upsertFromWebhook(companyId, 'contact-1', 'wa-conn-1', undefined, 'dept-1');

      const [, options] = mockSlaQueue.add.mock.calls[0];
      expect(options.jobId).toBe('sla-check:conv-idem');

      // Uma 2ª chamada de scheduleSlaCheck para a MESMA conversa (ex.: reentrada em
      // WAITING) sempre cancela o job anterior antes — nunca deixa dois jobs
      // pendentes com jobs diferentes para a mesma conversa.
      mockSlaQueue.getJob.mockResolvedValueOnce(fakeExistingJob);
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-idem',
        status: ConversationStatus.RESOLVED,
        companyId,
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-idem',
        status: ConversationStatus.WAITING,
        companyId,
        resolvedAt: null,
        closedAt: null,
        updatedAt: new Date(),
        queueId: 'queue-1',
      });
      mockPrisma.queue.findUnique.mockResolvedValueOnce({ maxWaitSecs: 30 });

      await service.updateStatus(companyId, 'conv-idem', { status: ConversationStatus.WAITING } as any);

      expect(fakeExistingJob.remove).toHaveBeenCalled(); // job antigo cancelado
      const secondCallOptions = mockSlaQueue.add.mock.calls[1][1];
      expect(secondCallOptions.jobId).toBe('sla-check:conv-idem'); // mesmo jobId de sempre
    });
  });
});
