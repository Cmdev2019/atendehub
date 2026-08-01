import { WebhookProcessor } from './webhook.processor';
import { WebhookMetricsService } from './webhook-metrics.service';
import { WebhookPermanentError } from './webhook.errors';

// B-39: o processor SEMPRE relança o erro pro Bull (nunca engole) — os testes
// de retry/DLQ vivem aqui, não em webhook.service.spec.ts (que testa
// handleEvent isoladamente, sem Bull de verdade envolvido).
describe('WebhookProcessor', () => {
  const mockWebhookService = { handleEvent: jest.fn() };
  const mockPrisma = {
    whatsAppConnection: { findUnique: jest.fn() },
    contact: { findFirst: jest.fn() },
    conversation: { findFirst: jest.fn() },
  };
  const mockDlqQueue = { add: jest.fn().mockResolvedValue(undefined) };
  let metrics: WebhookMetricsService;
  let processor: WebhookProcessor;

  const baseJob = (overrides: Partial<any> = {}): any => ({
    id: 1,
    data: { event: 'MESSAGES_UPSERT', instance: 'session-1', data: {}, requestId: 'req-1' },
    attemptsMade: 0,
    opts: { attempts: 3 },
    discard: jest.fn().mockResolvedValue(undefined),
    isDiscarded: jest.fn().mockReturnValue(false),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    metrics = new WebhookMetricsService();
    processor = new WebhookProcessor(
      mockWebhookService as any,
      mockPrisma as any,
      metrics,
      mockDlqQueue as any,
    );
  });

  describe('handleWebhookEvent — sucesso', () => {
    it('repassa o payload do job para WebhookService.handleEvent e registra a métrica de sucesso', async () => {
      mockWebhookService.handleEvent.mockResolvedValueOnce(undefined);
      const job = baseJob();

      await processor.handleWebhookEvent(job);

      expect(mockWebhookService.handleEvent).toHaveBeenCalledWith(job.data);
      expect(metrics.snapshot().processed).toBe(1);
    });
  });

  describe('handleWebhookEvent — falha transitória', () => {
    it.each([
      ['DB fora do ar (Prisma P1001)', Object.assign(new Error('DB fora do ar'), { code: 'P1001' })],
      ['ECONNRESET', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })],
      ['ETIMEDOUT', Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })],
      ['DNS (ENOTFOUND)', Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })],
      ['HTTP 500', Object.assign(new Error('Internal Server Error'), { response: { status: 500 } })],
      ['HTTP 429', Object.assign(new Error('Too Many Requests'), { response: { status: 429 } })],
    ])('propaga o erro pro Bull re-tentar em caso de %s (nunca engole, nunca faz discard)', async (_label, err) => {
      mockWebhookService.handleEvent.mockRejectedValueOnce(err);
      const job = baseJob();

      await expect(processor.handleWebhookEvent(job)).rejects.toThrow(err.message);

      expect(job.discard).not.toHaveBeenCalled();
      expect(metrics.snapshot().failedAttempts).toBe(1);
      expect(metrics.snapshot().retried).toBe(1); // attemptsMade=0, attempts=3 → ainda vai tentar de novo
    });

    it('na última tentativa (attemptsMade = attempts-1) não conta como retry agendado, mas ainda propaga', async () => {
      mockWebhookService.handleEvent.mockRejectedValueOnce(new Error('falhou de novo'));
      const job = baseJob({ attemptsMade: 2, opts: { attempts: 3 } }); // 3ª e última tentativa

      await expect(processor.handleWebhookEvent(job)).rejects.toThrow('falhou de novo');

      expect(job.discard).not.toHaveBeenCalled();
      expect(metrics.snapshot().retried).toBe(0);
    });
  });

  describe('handleWebhookEvent — falha permanente', () => {
    it('descarta o job (job.discard) mesmo com tentativas sobrando, e ainda assim propaga o erro', async () => {
      mockWebhookService.handleEvent.mockRejectedValueOnce(new WebhookPermanentError('payload irrecuperável'));
      const job = baseJob({ attemptsMade: 0, opts: { attempts: 8 } });

      await expect(processor.handleWebhookEvent(job)).rejects.toThrow('payload irrecuperável');

      expect(job.discard).toHaveBeenCalledTimes(1);
      expect(metrics.snapshot().retried).toBe(0);
    });
  });

  describe('onFailed — move para a DLQ (B-39)', () => {
    it('resolve tenant/conversationId, monta a entrada da DLQ com todo o contexto (status/reason inclusive) e nunca lança', async () => {
      mockPrisma.whatsAppConnection.findUnique.mockResolvedValueOnce({ companyId: 'company-1' });
      mockPrisma.contact.findFirst.mockResolvedValueOnce({ id: 'contact-1' });
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1' });
      const job = baseJob({
        id: 99,
        data: {
          event: 'MESSAGES_UPSERT',
          instance: 'session-1',
          data: { key: { id: 'wa-42', remoteJid: '5512999999999@s.whatsapp.net' } },
          requestId: 'req-99',
        },
        attemptsMade: 8,
      });

      await expect(processor.onFailed(job, new Error('esgotou tentativas'))).resolves.toBeUndefined();

      expect(mockPrisma.contact.findFirst).toHaveBeenCalledWith({
        where: { companyId: 'company-1', phone: '5512999999999' },
        select: { id: true },
      });
      expect(mockDlqQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          originalQueue: 'webhook',
          originalJobId: '99',
          payload: {
            event: 'MESSAGES_UPSERT',
            instance: 'session-1',
            data: { key: { id: 'wa-42', remoteJid: '5512999999999@s.whatsapp.net' } },
          },
          error: 'esgotou tentativas',
          attempts: 8,
          requestId: 'req-99',
          tenant: 'company-1',
          messageId: 'wa-42',
          conversationId: 'conv-1',
          status: 'MOVED_TO_DLQ',
          reason: 'Tentativas esgotadas (8/3)',
        }),
        { removeOnFail: false, attempts: 1 },
      );
      expect(metrics.snapshot().dlq).toBe(1);
    });

    it('conversationId fica null quando o contato ainda não existe (falha ocorreu antes da 1ª persistência)', async () => {
      mockPrisma.whatsAppConnection.findUnique.mockResolvedValueOnce({ companyId: 'company-1' });
      mockPrisma.contact.findFirst.mockResolvedValueOnce(null);
      const job = baseJob({
        data: {
          event: 'MESSAGES_UPSERT',
          instance: 'session-1',
          data: { key: { id: 'wa-1', remoteJid: '5512999999999@s.whatsapp.net' } },
        },
        attemptsMade: 3, // esgotou as tentativas (opts.attempts=3 do baseJob)
      });

      await processor.onFailed(job, new Error('falhou'));

      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
      expect(mockDlqQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: null }),
        expect.anything(),
      );
    });

    it('reason descreve erro permanente de forma distinta de tentativas esgotadas', async () => {
      mockPrisma.whatsAppConnection.findUnique.mockResolvedValueOnce({ companyId: 'company-1' });
      // job.discard() já foi chamado por handleWebhookEvent antes de relançar
      // (erro permanente) — isDiscarded() reflete isso mesmo com tentativas sobrando.
      const job = baseJob({ isDiscarded: jest.fn().mockReturnValue(true) });

      await processor.onFailed(job, new WebhookPermanentError('payload irrecuperável'));

      expect(mockDlqQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ reason: expect.stringContaining('Erro permanente') }),
        expect.anything(),
      );
    });

    it('extrai o messageId também quando o payload é um array de mensagens (formato real da Evolution)', async () => {
      mockPrisma.whatsAppConnection.findUnique.mockResolvedValueOnce({ companyId: 'company-1' });
      const job = baseJob({
        data: {
          event: 'MESSAGES_UPSERT',
          instance: 'session-1',
          data: [{ key: { id: 'wa-1' } }, { key: { id: 'wa-2' } }],
        },
        attemptsMade: 3,
      });

      await processor.onFailed(job, new Error('falhou'));

      expect(mockDlqQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'wa-1' }),
        expect.anything(),
      );
    });

    it('tenant fica null quando a sessão não corresponde a nenhuma conexão (não impede ir pra DLQ)', async () => {
      mockPrisma.whatsAppConnection.findUnique.mockResolvedValueOnce(null);
      const job = baseJob({ attemptsMade: 3 });

      await processor.onFailed(job, new Error('falhou'));

      expect(mockDlqQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ tenant: null }),
        expect.anything(),
      );
    });

    it('não move pra DLQ (nem chama Prisma/Sentry/dlqQueue) quando o Bull ainda vai retentar — regressão do achado da validação operacional', async () => {
      // Achado real na validação ao vivo do B-39: o evento 'failed' do Bull
      // dispara em TODA tentativa (bull/lib/queue.js#handleFailed), não só na
      // última. Sem este guard, uma falha transitória que o Bull ainda ia
      // retentar com sucesso criava uma entrada falsa na DLQ.
      const job = baseJob({ attemptsMade: 1, opts: { attempts: 3 } }); // 2ª de 3 tentativas ainda por vir

      await processor.onFailed(job, new Error('falha transitória, ainda tem tentativa sobrando'));

      expect(mockPrisma.whatsAppConnection.findUnique).not.toHaveBeenCalled();
      expect(mockDlqQueue.add).not.toHaveBeenCalled();
      expect(metrics.snapshot().dlq).toBe(0);
    });

    it('nunca lança mesmo se a própria DLQ falhar ao registrar (best-effort)', async () => {
      mockPrisma.whatsAppConnection.findUnique.mockResolvedValueOnce({ companyId: 'company-1' });
      mockDlqQueue.add.mockRejectedValueOnce(new Error('Redis fora do ar'));
      const job = baseJob({ attemptsMade: 3 });

      await expect(processor.onFailed(job, new Error('falhou'))).resolves.toBeUndefined();
    });
  });

  describe('onStalled', () => {
    it('não lança ao registrar um job travado', () => {
      const job = baseJob({ id: 4 });
      expect(() => processor.onStalled(job)).not.toThrow();
    });
  });
});
