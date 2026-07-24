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
});
