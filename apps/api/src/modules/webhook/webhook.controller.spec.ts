import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bull';
import { WebhookController } from './webhook.controller';
import { WebhookMetricsService } from './webhook-metrics.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

// B4-4: o webhook é a única rota pública (sem login) de toda a API — a
// Evolution chama de fora, então a validação da apikey é a última linha de
// defesa contra injeção de eventos falsos. Fail-closed por padrão.
describe('WebhookController', () => {
  let controller: WebhookController;

  const mockQueue = { add: jest.fn(), getJobCounts: jest.fn() };
  const mockDlqQueue = { getJobCounts: jest.fn() };

  const API_KEY = 'chave-secreta-evolution';

  // B-39: config keyed por variável — antes era um mockReturnValue único
  // (servia só pra EVOLUTION_API_KEY); com WEBHOOK_ATTEMPTS/BACKOFF/TIMEOUT
  // novos, precisa responder por chave de verdade.
  const envValues: Record<string, string> = {};
  const mockConfig = {
    get: jest.fn((key: string, fallback?: any) => envValues[key] ?? fallback),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const key of Object.keys(envValues)) delete envValues[key];
    envValues.EVOLUTION_API_KEY = API_KEY;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: getQueueToken(QUEUE_NAMES.WEBHOOK), useValue: mockQueue },
        { provide: getQueueToken(QUEUE_NAMES.WEBHOOK_DLQ), useValue: mockDlqQueue },
        { provide: ConfigService, useValue: mockConfig },
        WebhookMetricsService,
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
  });

  describe('fail-closed', () => {
    it('lança 500 quando EVOLUTION_API_KEY não está configurada, mesmo com apikey no payload', async () => {
      delete envValues.EVOLUTION_API_KEY;

      await expect(
        controller.receiveEvolution({ apikey: 'qualquer-coisa', event: 'messages.upsert' }),
      ).rejects.toThrow(InternalServerErrorException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('validação da apikey', () => {
    it('rejeita com 403 quando não há apikey no payload nem no header', async () => {
      await expect(
        controller.receiveEvolution({ event: 'messages.upsert' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('rejeita com 403 quando a apikey do payload é inválida', async () => {
      await expect(
        controller.receiveEvolution({ apikey: 'chave-errada', event: 'messages.upsert' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('aceita quando a apikey do payload é válida', async () => {
      const result = await controller.receiveEvolution({
        apikey: API_KEY,
        event: 'messages.upsert',
        instance: 'session-1',
        data: { foo: 'bar' },
      });

      expect(result).toEqual({ received: true });
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('prioriza a apikey do header sobre a do corpo (header correto, corpo errado)', async () => {
      const result = await controller.receiveEvolution(
        { apikey: 'chave-errada-no-corpo', event: 'messages.upsert', instance: 'session-1' },
        API_KEY,
      );

      expect(result).toEqual({ received: true });
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('rejeita quando a apikey do header está incorreta, mesmo que o corpo esteja certo', async () => {
      await expect(
        controller.receiveEvolution(
          { apikey: API_KEY, event: 'messages.upsert', instance: 'session-1' },
          'header-errado',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('normalização do nome do evento', () => {
    it.each([
      ['messages.upsert', 'MESSAGES_UPSERT'],
      ['MESSAGES_UPSERT', 'MESSAGES_UPSERT'],
      ['connection.update', 'CONNECTION_UPDATE'],
      ['qrcode.updated', 'QRCODE_UPDATED'],
    ])('normaliza "%s" para "%s"', async (received, expected) => {
      await controller.receiveEvolution({
        apikey: API_KEY,
        event: received,
        instance: 'session-1',
        data: {},
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ event: expected }),
        expect.anything(),
      );
    });
  });

  describe('job enfileirado (B-39 — retry/backoff configurável via ENV)', () => {
    it('enfileira o job com instance/data repassados e as opções padrão de retry/backoff', async () => {
      await controller.receiveEvolution({
        apikey: API_KEY,
        event: 'messages.upsert',
        instance: 'session-42',
        data: { key: { id: 'msg-1' } },
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'MESSAGES_UPSERT',
          instance: 'session-42',
          data: { key: { id: 'msg-1' } },
        }),
        {
          attempts: 8,
          // B-39: multiplicador de backoff parametrizável exige estratégia
          // customizada (`webhookExponential`, registrada em webhook.module.ts)
          // — o Bull nativo (`type: 'exponential'`) tem multiplicador fixo em 2.
          backoff: { type: 'webhookExponential' },
          timeout: 30_000,
          removeOnComplete: 500,
          removeOnFail: 50,
        },
      );
    });

    it('respeita WEBHOOK_ATTEMPTS/WEBHOOK_TIMEOUT configurados via ENV', async () => {
      envValues.WEBHOOK_ATTEMPTS = '3';
      envValues.WEBHOOK_TIMEOUT = '15000';

      await controller.receiveEvolution({
        apikey: API_KEY,
        event: 'messages.upsert',
        instance: 'session-1',
        data: {},
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ attempts: 3, timeout: 15_000 }),
      );
    });

    it('inclui o requestId da requisição no job (correlação ponta a ponta)', async () => {
      await controller.receiveEvolution({
        apikey: API_KEY,
        event: 'messages.upsert',
        instance: 'session-1',
        data: {},
      });

      // getRequestId() fora do AsyncLocalStorage da requisição real (não há
      // middleware neste teste unitário) retorna undefined — o campo existe
      // no shape, só não tem valor fora de uma requisição HTTP de verdade.
      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: undefined }),
        expect.anything(),
      );
    });

    it('carrega o header de assinatura recebido para o job, quando presente', async () => {
      await controller.receiveEvolution(
        { apikey: API_KEY, event: 'messages.upsert', instance: 'session-1', data: {} },
        API_KEY,
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ receivedHeaders: { 'x-evolution-signature': API_KEY } }),
        expect.anything(),
      );
    });
  });

  describe('GET /webhooks/metrics', () => {
    it('devolve texto no formato Prometheus com os contadores e a profundidade ao vivo das filas', async () => {
      mockQueue.getJobCounts.mockResolvedValueOnce({ waiting: 2, active: 1, delayed: 0, failed: 0 });
      mockDlqQueue.getJobCounts.mockResolvedValueOnce({ waiting: 4, delayed: 0 });

      const text = await controller.metrics();

      expect(text).toContain('webhook_jobs_processed_total');
      expect(text).toContain(`webhook_queue_depth{queue="${QUEUE_NAMES.WEBHOOK}_waiting"} 2`);
      expect(text).toContain(`webhook_queue_depth{queue="${QUEUE_NAMES.WEBHOOK_DLQ}"} 4`);
    });
  });
});
