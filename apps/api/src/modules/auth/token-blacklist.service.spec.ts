import { Test, TestingModule } from '@nestjs/testing';
import { TokenBlacklistService } from './token-blacklist.service';
import { REDIS_CLIENT } from '../../shared/redis/redis.module';

// B-80: o serviço recebe o cliente Redis compartilhado (REDIS_CLIENT) — aqui
// uma store em memória isolada por teste no lugar dele.
function createFakeRedis() {
  const store = new Map<string, string>();
  return {
    setex: jest.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    exists: jest.fn(async (key: string) => (store.has(key) ? 1 : 0)),
    del: jest.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    keys: jest.fn(async (pattern: string) => {
      const prefix = pattern.replace('*', '');
      return [...store.keys()].filter((k) => k.startsWith(prefix));
    }),
  };
}

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenBlacklistService,
        { provide: REDIS_CLIENT, useFactory: createFakeRedis },
      ],
    }).compile();

    service = module.get<TokenBlacklistService>(TokenBlacklistService);
  });

  it('um token adicionado é reportado como blacklisted', async () => {
    await service.add('token-abc', 300);

    expect(await service.isBlacklisted('token-abc')).toBe(true);
  });

  it('um token nunca adicionado não é reportado como blacklisted', async () => {
    expect(await service.isBlacklisted('token-nunca-visto')).toBe(false);
  });

  it('remove() tira o token da blacklist', async () => {
    await service.add('token-xyz', 300);
    await service.remove('token-xyz');

    expect(await service.isBlacklisted('token-xyz')).toBe(false);
  });

  it('count() reflete o número de tokens atualmente blacklisted', async () => {
    await service.add('token-1', 300);
    await service.add('token-2', 300);

    expect(await service.count()).toBe(2);
  });

  it('isBlacklisted() falha aberto (retorna false) se o Redis estiver indisponível', async () => {
    const redisClient = (service as any).redis;
    jest.spyOn(redisClient, 'exists').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    // Fail-open é proposital: preferir deixar passar um token válido a
    // bloquear todo mundo se o Redis cair — o token ainda expira sozinho.
    expect(await service.isBlacklisted('qualquer-token')).toBe(false);
  });

  it('add() não propaga erro se o Redis estiver indisponível', async () => {
    const redisClient = (service as any).redis;
    jest.spyOn(redisClient, 'setex').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(service.add('token-abc', 300)).resolves.toBeUndefined();
  });
});
