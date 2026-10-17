import { ConfigService } from '@nestjs/config';
import { RedisThrottlerStorage } from './redis-throttler.storage';

// O storage cria o próprio cliente `new Redis(...)`. Aqui o `eval` é mockado
// para testar a tradução do retorno do script e o fail-open; o script Lua em
// si roda contra um Redis de verdade em test/rate-limit.e2e-spec.ts.
const mockEval = jest.fn();
const mockStatus = { value: 'connecting', readySoon: true };
jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    status: mockStatus.value,
    on: jest.fn(),
    once: jest.fn((event: string, cb: () => void) => {
      if (event === 'ready' && mockStatus.readySoon) setTimeout(cb, 10);
    }),
    eval: mockEval,
    disconnect: jest.fn(),
  })),
}));

const config = { get: jest.fn((_k: string, d?: unknown) => d) } as unknown as ConfigService;

describe('RedisThrottlerStorage (C-04)', () => {
  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    mockEval.mockReset();
    storage = new RedisThrottlerStorage(config);
  });

  it('usa chaves com prefixo próprio e repassa ttl, limite e bloqueio em ms', async () => {
    mockEval.mockResolvedValue([1, 60_000, 0, 0]);
    await storage.increment('abc', 60_000, 5, 60_000, 'default');
    expect(mockEval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      'throttle:abc:hits',
      'throttle:abc:block',
      60_000,
      5,
      60_000,
    );
  });

  it('converte o retorno do script para segundos, como o storage padrão', async () => {
    mockEval.mockResolvedValue([3, 41_200, 0, 0]);
    await expect(storage.increment('k', 60_000, 5, 60_000, 'default')).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 42,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('repassa o bloqueio', async () => {
    mockEval.mockResolvedValue([6, 60_000, 1, 59_001]);
    await expect(storage.increment('k', 60_000, 5, 60_000, 'default')).resolves.toMatchObject({
      isBlocked: true,
      timeToBlockExpire: 60,
    });
  });

  it('o boot espera a conexão com o Redis ficar pronta', async () => {
    mockStatus.readySoon = true;
    const s = new RedisThrottlerStorage(config);
    await expect(s.onModuleInit()).resolves.toBeUndefined();
  });

  it('o boot não trava se o Redis não responder (desiste após 3 s)', async () => {
    jest.useFakeTimers();
    mockStatus.readySoon = false;
    const s = new RedisThrottlerStorage(config);
    const init = s.onModuleInit();
    jest.advanceTimersByTime(3000);
    await expect(init).resolves.toBeUndefined();
    jest.useRealTimers();
    mockStatus.readySoon = true;
  });

  it('fail-open: com o Redis fora, libera a requisição em vez de dar erro', async () => {
    mockEval.mockRejectedValue(new Error("Stream isn't writeable and enableOfflineQueue options is false"));
    await expect(storage.increment('k', 60_000, 5, 60_000, 'default')).resolves.toEqual({
      totalHits: 0,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });
});
