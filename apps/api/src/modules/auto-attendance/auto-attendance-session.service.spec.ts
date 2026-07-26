import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AutoAttendanceSessionService } from './auto-attendance-session.service';

// Mesmo padrão do token-blacklist.service.spec.ts (auth) — o service abre seu
// próprio cliente ioredis no construtor, então mockamos o módulo inteiro com
// uma store em memória isolada por teste.
jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => {
    const store = new Map<string, string>();
    return {
      on: jest.fn(),
      setex: jest.fn(async (key: string, _ttl: number, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      del: jest.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
      quit: jest.fn(async () => 'OK'),
    };
  }),
}));

const mockConfig = { get: jest.fn().mockReturnValue(undefined) };

describe('AutoAttendanceSessionService', () => {
  let service: AutoAttendanceSessionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoAttendanceSessionService,
        { provide: ConfigService, useValue: mockConfig },
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
