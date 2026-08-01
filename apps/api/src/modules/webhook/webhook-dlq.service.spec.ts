import { NotFoundException } from '@nestjs/common';
import { WebhookDlqService } from './webhook-dlq.service';

describe('WebhookDlqService (B-39)', () => {
  const mockWebhookQueue = { add: jest.fn() };
  const mockDlqQueue = { getJobs: jest.fn(), getJob: jest.fn() };
  const mockConfig = { get: jest.fn((_key: string, fallback?: any) => fallback) };

  let service: WebhookDlqService;

  const dlqEntry = (overrides: Partial<any> = {}) => ({
    originalQueue: 'webhook',
    originalJobId: '1',
    payload: { event: 'MESSAGES_UPSERT', instance: 'session-1', data: { key: { id: 'wa-1' } } },
    headers: {},
    error: 'DB fora do ar',
    stack: 'stack...',
    attempts: 8,
    lastException: 'DB fora do ar',
    timestamp: '2026-07-29T10:00:00.000Z',
    requestId: 'req-1',
    tenant: 'company-1',
    conversationId: null,
    messageId: 'wa-1',
    status: 'MOVED_TO_DLQ' as const,
    reason: 'Tentativas esgotadas (8/8)',
    ...overrides,
  });

  const makeJob = (id: string, data: any) => ({
    id,
    data,
    remove: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WebhookDlqService(mockWebhookQueue as any, mockDlqQueue as any, mockConfig as any);
  });

  describe('list', () => {
    it('lista só as entradas da própria empresa, mais recentes primeiro', async () => {
      mockDlqQueue.getJobs.mockResolvedValueOnce([
        makeJob('1', dlqEntry({ tenant: 'company-1', timestamp: '2026-07-29T10:00:00.000Z' })),
        makeJob('2', dlqEntry({ tenant: 'company-2', timestamp: '2026-07-29T11:00:00.000Z' })), // outra empresa
        makeJob('3', dlqEntry({ tenant: 'company-1', timestamp: '2026-07-29T12:00:00.000Z' })),
      ]);

      const result = await service.list('company-1');

      expect(result.map((r) => r.id)).toEqual(['3', '1']);
    });
  });

  describe('reprocess', () => {
    it('reenfileira o payload original na fila principal e remove da DLQ', async () => {
      const job = makeJob('1', dlqEntry({ tenant: 'company-1' }));
      mockDlqQueue.getJob.mockResolvedValueOnce(job);
      mockWebhookQueue.add.mockResolvedValueOnce({ id: 'novo-job-1' });

      const result = await service.reprocess('company-1', '1');

      expect(mockWebhookQueue.add).toHaveBeenCalledWith(
        { event: 'MESSAGES_UPSERT', instance: 'session-1', data: { key: { id: 'wa-1' } }, requestId: 'req-1' },
        expect.objectContaining({ attempts: expect.any(Number) }),
      );
      expect(job.remove).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ requeued: true, newJobId: 'novo-job-1' });
    });

    it('404 quando o job não existe (não vaza se existe de outra empresa)', async () => {
      mockDlqQueue.getJob.mockResolvedValueOnce(null);

      await expect(service.reprocess('company-1', 'inexistente')).rejects.toThrow(NotFoundException);
      expect(mockWebhookQueue.add).not.toHaveBeenCalled();
    });

    it('404 quando o job é de outra empresa (cross-tenant bloqueado)', async () => {
      mockDlqQueue.getJob.mockResolvedValueOnce(makeJob('1', dlqEntry({ tenant: 'company-2' })));

      await expect(service.reprocess('company-1', '1')).rejects.toThrow(NotFoundException);
      expect(mockWebhookQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('discard', () => {
    it('remove o job da DLQ sem reenfileirar', async () => {
      const job = makeJob('1', dlqEntry({ tenant: 'company-1' }));
      mockDlqQueue.getJob.mockResolvedValueOnce(job);

      const result = await service.discard('company-1', '1');

      expect(job.remove).toHaveBeenCalledTimes(1);
      expect(mockWebhookQueue.add).not.toHaveBeenCalled();
      expect(result).toEqual({ discarded: true });
    });

    it('404 cross-tenant, mesmo padrão do reprocess', async () => {
      mockDlqQueue.getJob.mockResolvedValueOnce(makeJob('1', dlqEntry({ tenant: 'company-2' })));

      await expect(service.discard('company-1', '1')).rejects.toThrow(NotFoundException);
    });
  });
});
