import { ConversationStatus } from '@prisma/client';
import { SlaCheckProcessor, SlaCheckJobData } from './sla-check.processor';

// B4-6/B4-7: versão unitária do processor (mocks, sem Redis/Bull real) —
// complementa o teste E2E da B2-5 (apps/api/test/sla.e2e-spec.ts), que prova
// o delay real do Bull mas roda isolado do `npm test`/coverage padrão. Aqui
// o foco é cobrir os ramos de decisão rapidamente.
describe('SlaCheckProcessor', () => {
  const mockPrisma = { conversation: { findUnique: jest.fn(), update: jest.fn() }, user: { findMany: jest.fn() } };
  const mockEventsService = { emitSlaBreached: jest.fn() };
  const mockAuditLog = { record: jest.fn() };
  const mockNotificationService = { create: jest.fn() };

  let processor: SlaCheckProcessor;

  const jobData: SlaCheckJobData = {
    conversationId: 'conv-1',
    companyId: 'company-1',
    maxWaitSecs: 60,
    queuedAt: new Date(Date.now() - 60_000),
  };
  const makeJob = (data: SlaCheckJobData = jobData) =>
    ({ id: 1, data, attemptsMade: 0, opts: { attempts: 3 } } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new SlaCheckProcessor(
      mockPrisma as any,
      mockEventsService as any,
      mockAuditLog as any,
      mockNotificationService as any,
    );
  });

  it('marca slaBreachedAt, emite evento, audita e notifica SUPERVISOR+ quando a conversa segue WAITING', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValueOnce({
      id: 'conv-1',
      status: ConversationStatus.WAITING,
      slaBreachedAt: null,
      agentId: null,
      queueId: 'queue-1',
      contact: { id: 'contact-1', name: 'Fulano', phone: '5512999999999' },
      queue: { id: 'queue-1', name: 'Fila', maxWaitSecs: 60 },
    });
    mockPrisma.conversation.update.mockResolvedValueOnce({});
    mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'sup-1' }, { id: 'sup-2' }]);

    await processor.handleSlaCheck(makeJob());

    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { slaBreachedAt: expect.any(Date) },
    });
    expect(mockEventsService.emitSlaBreached).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-1', conversationId: 'conv-1' }),
    );
    expect(mockAuditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sla.breached', entity: 'Conversation', entityId: 'conv-1' }),
    );
    expect(mockNotificationService.create).toHaveBeenCalledTimes(2);
  });

  it('não faz nada quando a conversa não é mais WAITING (já foi atendida)', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValueOnce({
      id: 'conv-1',
      status: ConversationStatus.OPEN,
      slaBreachedAt: null,
      agentId: 'agent-1',
      queueId: 'queue-1',
      contact: {},
      queue: {},
    });

    await processor.handleSlaCheck(makeJob());

    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    expect(mockEventsService.emitSlaBreached).not.toHaveBeenCalled();
    expect(mockAuditLog.record).not.toHaveBeenCalled();
    expect(mockNotificationService.create).not.toHaveBeenCalled();
  });

  it('não duplica quando o SLA já foi marcado antes (idempotência)', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValueOnce({
      id: 'conv-1',
      status: ConversationStatus.WAITING,
      slaBreachedAt: new Date(),
      agentId: null,
      queueId: 'queue-1',
      contact: {},
      queue: {},
    });

    await processor.handleSlaCheck(makeJob());

    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    expect(mockEventsService.emitSlaBreached).not.toHaveBeenCalled();
  });

  it('não quebra quando a conversa não existe mais (foi deletada)', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValueOnce(null);

    await expect(processor.handleSlaCheck(makeJob())).resolves.toBeUndefined();
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
  });

  it('relança o erro para o Bull re-tentar quando o banco falha', async () => {
    mockPrisma.conversation.findUnique.mockRejectedValueOnce(new Error('conexão perdida'));

    await expect(processor.handleSlaCheck(makeJob())).rejects.toThrow('conexão perdida');
  });
});
