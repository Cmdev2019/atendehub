import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TokenBlacklistService } from './token-blacklist.service';

// TokenBlacklistService cria seu próprio cliente `new Redis(...)` no
// construtor (não é injetado) — sem mockar o módulo `ioredis`, o teste
// tentaria conectar num Redis de verdade. Cada `new Redis()` aqui devolve
// uma store em memória isolada, então cada teste começa limpo.
jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => {
    const store = new Map<string, string>();
    return {
      on: jest.fn(),
      setex: jest.fn(async (key: string, _ttl: number, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      exists: jest.fn(async (key: string) => (store.has(key) ? 1 : 0)),
      del: jest.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
      keys: jest.fn(async (pattern: string) => {
        const prefix = pattern.replace('*', '');
        return [...store.keys()].filter((k) => k.startsWith(prefix));
      }),
      quit: jest.fn(async () => 'OK'),
    };
  }),
}));

const mockConfig = { get: jest.fn().mockReturnValue(undefined) };

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenBlacklistService,
        { provide: ConfigService, useValue: mockConfig },
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
