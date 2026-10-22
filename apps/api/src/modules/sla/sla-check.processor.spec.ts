import { ConversationStatus } from '../../generated/prisma/client';
import { ServiceSlaJobData, SlaCheckProcessor, SlaCheckJobData } from './sla-check.processor';

// B4-6/B4-7: versão unitária do processor (mocks, sem Redis/Bull real) —
// complementa o teste E2E da B2-5 (apps/api/test/sla.e2e-spec.ts), que prova
// o delay real do Bull mas roda isolado do `npm test`/coverage padrão. Aqui
// o foco é cobrir os ramos de decisão rapidamente.
describe('SlaCheckProcessor', () => {
  const mockPrisma = {
    conversation: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const mockEventsService = { emitSlaBreached: jest.fn(), emitServiceSlaBreached: jest.fn() };
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

  // B-66: o prazo vale o gravado na conversa
  it('job de um ciclo anterior não alerta antes do prazo do ciclo atual', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValueOnce({
      id: 'conv-1',
      status: ConversationStatus.WAITING,
      slaBreachedAt: null,
      waitingSince: new Date(),
      waitSlaDueAt: new Date(Date.now() + 120_000), // o ciclo novo ainda tem 2 min
      agentId: null,
      queueId: 'queue-1',
      contact: {},
      queue: {},
    });

    await processor.handleSlaCheck(makeJob());

    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    expect(mockEventsService.emitSlaBreached).not.toHaveBeenCalled();
  });

  // B-107: com o Redis fora, o cancelamento do job falha e ele fica para trás
  it('job de outro ciclo não alerta um ciclo atual sem prazo (sobra de um cancelamento que falhou)', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValueOnce({
      id: 'conv-1',
      status: ConversationStatus.WAITING,
      slaBreachedAt: null,
      waitingSince: new Date(), // ciclo novo, numa fila sem prazo
      waitSlaDueAt: null,
      agentId: null,
      queueId: null,
      contact: {},
      queue: null,
    });

    await processor.handleSlaCheck(makeJob()); // queuedAt de 1 min atrás: outro ciclo

    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    expect(mockEventsService.emitSlaBreached).not.toHaveBeenCalled();
  });

  it('sem prazo gravado, o job do mesmo ciclo segue valendo pelo agendamento dele', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValueOnce({
      id: 'conv-1',
      status: ConversationStatus.WAITING,
      slaBreachedAt: null,
      waitingSince: jobData.queuedAt, // o mesmo início: o job é deste ciclo
      waitSlaDueAt: null,
      agentId: null,
      queueId: 'queue-1',
      contact: { id: 'contact-1', name: 'Fulano', phone: '5512999999999' },
      queue: { id: 'queue-1', name: 'Fila', maxWaitSecs: 60 },
    });
    mockPrisma.conversation.update.mockResolvedValueOnce({});
    mockPrisma.user.findMany.mockResolvedValueOnce([]);

    await processor.handleSlaCheck(makeJob());

    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { slaBreachedAt: expect.any(Date) },
    });
  });

  it('prazo vencido: o tempo de espera conta do início do ciclo gravado', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValueOnce({
      id: 'conv-1',
      status: ConversationStatus.WAITING,
      slaBreachedAt: null,
      waitingSince: new Date(Date.now() - 300_000),
      waitSlaDueAt: new Date(Date.now() - 1000),
      agentId: null,
      queueId: 'queue-1',
      contact: { id: 'contact-1', name: 'Fulano', phone: '5512999999999' },
      queue: { id: 'queue-1', name: 'Fila', maxWaitSecs: 60 },
    });
    mockPrisma.conversation.update.mockResolvedValueOnce({});
    mockPrisma.user.findMany.mockResolvedValueOnce([]);

    await processor.handleSlaCheck(makeJob());

    const [{ waitTimeSeconds }] = mockEventsService.emitSlaBreached.mock.calls[0];
    expect(waitTimeSeconds).toBeGreaterThanOrEqual(299);
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

  // B-114 (ADR-0019, regras 18 a 21): o job do atendimento, na mesma fila
  describe('SLA do atendimento', () => {
    const serviceJob: ServiceSlaJobData = {
      kind: 'service',
      conversationId: 'conv-1',
      companyId: 'company-1',
      maxServiceSecs: 600,
      attendedAt: new Date(Date.now() - 600_000),
    };
    const makeServiceJob = () => ({ id: 2, data: serviceJob, attemptsMade: 0, opts: { attempts: 3 } } as any);
    const inService = (over: Record<string, unknown> = {}) => ({
      id: 'conv-1',
      status: ConversationStatus.OPEN,
      agentId: 'ana',
      queueId: 'queue-1',
      attendedAt: serviceJob.attendedAt,
      serviceSlaDueAt: new Date(Date.now() - 1000),
      serviceSlaBreachedAt: null,
      contact: { id: 'contact-1', name: 'Fulano', phone: '5512999999999' },
      queue: { id: 'queue-1', name: 'Fila Receitas', maxServiceSecs: 600 },
      ...over,
    });

    it('passou do prazo em atendimento: marca, emite, audita e avisa quem atende e os supervisores', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(inService());
      mockPrisma.conversation.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'sup-1' }, { id: 'admin-1' }]);

      await processor.handleSlaCheck(makeServiceJob());

      // Troca condicional: só marca o que segue em atendimento sem marca
      expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', status: ConversationStatus.OPEN, serviceSlaBreachedAt: null },
        data: { serviceSlaBreachedAt: expect.any(Date) },
      });
      expect(mockEventsService.emitServiceSlaBreached).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1', agentId: 'ana', maxServiceSecs: 600 }),
      );
      expect(mockEventsService.emitServiceSlaBreached.mock.calls[0][0].serviceTimeSeconds).toBeGreaterThanOrEqual(600);
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sla.service_breached', entityId: 'conv-1' }),
      );
      const notified = mockNotificationService.create.mock.calls.map(([n]) => n.userId).sort();
      expect(notified).toEqual(['admin-1', 'ana', 'sup-1']);
      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'service_sla_breach', userId: 'ana' }),
      );
      // O SLA da espera não é tocado
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
      expect(mockEventsService.emitSlaBreached).not.toHaveBeenCalled();
    });

    it('quem atende também é supervisor: um aviso só', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(inService({ agentId: 'sup-1' }));
      mockPrisma.conversation.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'sup-1' }]);

      await processor.handleSlaCheck(makeServiceJob());

      expect(mockNotificationService.create).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['encerrada', { status: ConversationStatus.CLOSED }],
      ['devolvida à fila', { status: ConversationStatus.WAITING, serviceSlaDueAt: null }],
      ['já marcada', { serviceSlaBreachedAt: new Date() }],
      ['job de outro ciclo (recomeçou ao mudar de setor)', { serviceSlaDueAt: new Date(Date.now() + 120_000) }],
    ])('não alerta: %s', async (_name, over) => {
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(inService(over));

      await processor.handleSlaCheck(makeServiceJob());

      expect(mockPrisma.conversation.updateMany).not.toHaveBeenCalled();
      expect(mockEventsService.emitServiceSlaBreached).not.toHaveBeenCalled();
      expect(mockNotificationService.create).not.toHaveBeenCalled();
    });

    it('outro disparo marcou no meio: não avisa de novo', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(inService());
      mockPrisma.conversation.updateMany.mockResolvedValueOnce({ count: 0 });

      await processor.handleSlaCheck(makeServiceJob());

      expect(mockEventsService.emitServiceSlaBreached).not.toHaveBeenCalled();
      expect(mockAuditLog.record).not.toHaveBeenCalled();
      expect(mockNotificationService.create).not.toHaveBeenCalled();
    });

    it('relança o erro para o Bull re-tentar quando o banco falha', async () => {
      mockPrisma.conversation.findUnique.mockRejectedValueOnce(new Error('conexão perdida'));

      await expect(processor.handleSlaCheck(makeServiceJob())).rejects.toThrow('conexão perdida');
    });
  });

  // B6-3: observabilidade de jobs falhos/travados
  describe('onFailed / onStalled', () => {
    it('não lança ao registrar um job de SLA que falhou definitivamente', () => {
      expect(() => processor.onFailed(makeJob(), new Error('esgotou tentativas'))).not.toThrow();
    });

    it('não lança ao registrar um job de SLA travado', () => {
      expect(() => processor.onStalled(makeJob())).not.toThrow();
    });
  });
});
