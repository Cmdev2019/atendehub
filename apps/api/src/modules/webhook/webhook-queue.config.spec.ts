import { buildWebhookBackoffStrategy, buildWebhookJobOptions, WEBHOOK_BACKOFF_STRATEGY } from './webhook-queue.config';

describe('webhook-queue.config (B-39)', () => {
  const mockConfig = (values: Record<string, string> = {}) => ({
    get: jest.fn((key: string, fallback?: any) => values[key] ?? fallback),
  });

  describe('buildWebhookJobOptions', () => {
    it('usa os defaults documentados quando nenhuma ENV está configurada', () => {
      const opts = buildWebhookJobOptions(mockConfig() as any);

      expect(opts).toEqual({
        attempts: 8,
        backoff: { type: WEBHOOK_BACKOFF_STRATEGY },
        timeout: 30_000,
        removeOnComplete: 500,
        removeOnFail: 50,
      });
    });

    it('lê WEBHOOK_ATTEMPTS/WEBHOOK_TIMEOUT/WEBHOOK_REMOVE_ON_* da ENV', () => {
      const opts = buildWebhookJobOptions(
        mockConfig({
          WEBHOOK_ATTEMPTS: '5',
          WEBHOOK_TIMEOUT: '10000',
          WEBHOOK_REMOVE_ON_COMPLETE: '10',
          WEBHOOK_REMOVE_ON_FAIL: '0',
        }) as any,
      );

      expect(opts).toEqual({
        attempts: 5,
        backoff: { type: WEBHOOK_BACKOFF_STRATEGY },
        timeout: 10_000,
        removeOnComplete: 10,
        removeOnFail: 0,
      });
    });

    it('ignora valor inválido/não-numérico e cai no default (nunca gera NaN nas opções do Bull)', () => {
      const opts = buildWebhookJobOptions(mockConfig({ WEBHOOK_ATTEMPTS: 'abacate' }) as any);
      expect(opts.attempts).toBe(8);
    });
  });

  describe('buildWebhookBackoffStrategy', () => {
    it('com os defaults (initial=5000, multiplier=2), reproduz a série 5s/10s/20s/40s...', () => {
      const strategy = buildWebhookBackoffStrategy(mockConfig() as any);

      expect(strategy(0)).toBe(5000);
      expect(strategy(1)).toBe(10_000);
      expect(strategy(2)).toBe(20_000);
      expect(strategy(3)).toBe(40_000);
    });

    it('respeita WEBHOOK_BACKOFF_INITIAL/WEBHOOK_BACKOFF_MULTIPLIER customizados', () => {
      const strategy = buildWebhookBackoffStrategy(
        mockConfig({ WEBHOOK_BACKOFF_INITIAL: '1000', WEBHOOK_BACKOFF_MULTIPLIER: '3' }) as any,
      );

      expect(strategy(0)).toBe(1000);
      expect(strategy(1)).toBe(3000);
      expect(strategy(2)).toBe(9000);
    });

    it('multiplicador 1 gera backoff constante (retry sem crescimento exponencial, se alguém configurar assim)', () => {
      const strategy = buildWebhookBackoffStrategy(
        mockConfig({ WEBHOOK_BACKOFF_INITIAL: '2000', WEBHOOK_BACKOFF_MULTIPLIER: '1' }) as any,
      );

      expect(strategy(0)).toBe(2000);
      expect(strategy(5)).toBe(2000);
    });
  });
});
