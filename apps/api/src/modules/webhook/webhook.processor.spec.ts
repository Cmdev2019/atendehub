import { WebhookProcessor } from './webhook.processor';

describe('WebhookProcessor', () => {
  const mockWebhookService = { handleEvent: jest.fn() };
  let processor: WebhookProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new WebhookProcessor(mockWebhookService as any);
  });

  it('repassa o payload do job para WebhookService.handleEvent', async () => {
    mockWebhookService.handleEvent.mockResolvedValueOnce(undefined);
    const job = {
      id: 1,
      data: { event: 'MESSAGES_UPSERT', instance: 'session-1', data: {} },
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as any;

    await processor.handleWebhookEvent(job);

    expect(mockWebhookService.handleEvent).toHaveBeenCalledWith(job.data);
  });

  it('propaga o erro para o Bull re-tentar quando handleEvent falha', async () => {
    const job = {
      id: 2,
      data: { event: 'MESSAGES_UPSERT', instance: 'session-1', data: {} },
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as any;
    mockWebhookService.handleEvent.mockRejectedValueOnce(new Error('DB fora do ar'));

    await expect(processor.handleWebhookEvent(job)).rejects.toThrow('DB fora do ar');
  });

  // B6-3: observabilidade de jobs falhos/travados
  describe('onFailed / onStalled', () => {
    it('não lança ao registrar um job que falhou definitivamente', () => {
      const job = { id: 3, attemptsMade: 3 } as any;
      expect(() => processor.onFailed(job, new Error('esgotou tentativas'))).not.toThrow();
    });

    it('não lança ao registrar um job travado', () => {
      const job = { id: 4 } as any;
      expect(() => processor.onStalled(job)).not.toThrow();
    });
  });
});
