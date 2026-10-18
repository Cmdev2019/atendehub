import { Test, TestingModule } from '@nestjs/testing';
import { AutoAttendanceSessionService } from './auto-attendance-session.service';
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

describe('AutoAttendanceSessionService', () => {
  let service: AutoAttendanceSessionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoAttendanceSessionService,
        { provide: REDIS_CLIENT, useFactory: createFakeRedis },
      ],
    }).compile();

    service = module.get<AutoAttendanceSessionService>(AutoAttendanceSessionService);
  });

  it('uma conversa sem sessão gravada não está aguardando resposta de menu', async () => {
    expect(await service.isAwaitingMenuReply('conv-nunca-visto')).toBe(false);
  });

  it('setAwaitingMenuReply marca a conversa como aguardando', async () => {
    await service.setAwaitingMenuReply('conv-1');

    expect(await service.isAwaitingMenuReply('conv-1')).toBe(true);
  });

  it('clear remove a sessão', async () => {
    await service.setAwaitingMenuReply('conv-1');
    await service.clear('conv-1');

    expect(await service.isAwaitingMenuReply('conv-1')).toBe(false);
  });

  it('isAwaitingMenuReply falha fechado (retorna false) se o Redis estiver indisponível', async () => {
    const redisClient = (service as any).redis;
    jest.spyOn(redisClient, 'get').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    expect(await service.isAwaitingMenuReply('conv-1')).toBe(false);
  });

  it('setAwaitingMenuReply não propaga erro se o Redis estiver indisponível', async () => {
    const redisClient = (service as any).redis;
    jest.spyOn(redisClient, 'setex').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(service.setAwaitingMenuReply('conv-1')).resolves.toBeUndefined();
  });
});
