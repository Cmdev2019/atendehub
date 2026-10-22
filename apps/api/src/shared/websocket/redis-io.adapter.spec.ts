import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_ADAPTER_CONNECT_TIMEOUT_MS, RedisIoAdapter } from './redis-io.adapter';

// Cada `new Redis()`/`duplicate()` devolve um cliente falso; `readySoon`
// decide se o evento 'ready' chega ou nunca chega (Redis fora do ar).
const redisState = { readySoon: true };
interface FakeClient {
  once: jest.Mock;
  duplicate: jest.Mock;
  disconnect: jest.Mock;
}
const clients: FakeClient[] = [];

function fakeClient(): FakeClient {
  const client: FakeClient = {
    once: jest.fn((event: string, cb: () => void) => {
      if (event === 'ready' && redisState.readySoon) setTimeout(cb, 10);
    }),
    duplicate: jest.fn(() => fakeClient()),
    disconnect: jest.fn(),
  };
  clients.push(client);
  return client;
}

jest.mock('ioredis', () => ({ Redis: jest.fn().mockImplementation(() => fakeClient()) }));
jest.mock('@socket.io/redis-adapter', () => ({ createAdapter: jest.fn(() => 'adapter') }));

const app = {
  get: jest.fn(() => ({ get: (_k: string, d?: unknown) => d }) as unknown as ConfigService),
} as unknown as INestApplicationContext;

describe('RedisIoAdapter (B-44)', () => {
  beforeEach(() => {
    clients.length = 0;
    redisState.readySoon = true;
  });

  it('com o Redis no ar, configura o adapter', async () => {
    const adapter = new RedisIoAdapter(app);
    await adapter.connectToRedis();
    expect((adapter as any).adapterConstructor).toBe('adapter');
    expect(clients.every((c) => c.disconnect.mock.calls.length === 0)).toBe(true);
  });

  it('com o Redis sem responder, desiste no prazo em vez de travar o boot', async () => {
    jest.useFakeTimers();
    redisState.readySoon = false;
    const adapter = new RedisIoAdapter(app);

    const connecting = adapter.connectToRedis();
    jest.advanceTimersByTime(REDIS_ADAPTER_CONNECT_TIMEOUT_MS);
    await expect(connecting).resolves.toBeUndefined();

    expect((adapter as any).adapterConstructor).toBeUndefined();
    // os dois clientes (pub e sub) são desligados para não ficarem reconectando
    expect(clients).toHaveLength(2);
    expect(clients.every((c) => c.disconnect.mock.calls.length === 1)).toBe(true);
    jest.useRealTimers();
  });

  it('no encerramento da API (dispose), desliga os dois clientes do adapter', async () => {
    const adapter = new RedisIoAdapter(app);
    await adapter.connectToRedis();

    await adapter.dispose();

    expect(clients).toHaveLength(2);
    expect(clients.every((c) => c.disconnect.mock.calls.length === 1)).toBe(true);
  });
});
