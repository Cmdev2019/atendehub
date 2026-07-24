import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

// HealthService cria seu próprio cliente `new Redis(...)` no construtor
// (mesmo padrão do TokenBlacklistService) — mocka o módulo `ioredis` inteiro
// para não tentar conectar num Redis de verdade.
const mockRedisInstance = {
  status: 'end',
  connect: jest.fn(),
  ping: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
};

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => mockRedisInstance),
}));

const mockPrisma = {
  $queryRaw: jest.fn(),
};

const mockConfig = { get: jest.fn().mockReturnValue(undefined) };

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedisInstance.status = 'end';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('reporta ready=true quando banco e redis respondem', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    mockRedisInstance.connect.mockResolvedValueOnce(undefined);
    mockRedisInstance.ping.mockResolvedValueOnce('PONG');

    const result = await service.checkReadiness();

    expect(result).toEqual({
      ready: true,
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('reporta database=down quando o Prisma lança erro, sem derrubar o redis check', async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    mockRedisInstance.connect.mockResolvedValueOnce(undefined);
    mockRedisInstance.ping.mockResolvedValueOnce('PONG');

    const result = await service.checkReadiness();

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual({ database: 'down', redis: 'up' });
  });

  it('reporta redis=down quando o ping falha', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    mockRedisInstance.connect.mockResolvedValueOnce(undefined);
    mockRedisInstance.ping.mockRejectedValueOnce(new Error('timeout'));

    const result = await service.checkReadiness();

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual({ database: 'up', redis: 'down' });
  });

  it('não tenta reconectar se o redis já está conectado (status != end/close)', async () => {
    mockRedisInstance.status = 'ready';
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    mockRedisInstance.ping.mockResolvedValueOnce('PONG');

    await service.checkReadiness();

    expect(mockRedisInstance.connect).not.toHaveBeenCalled();
  });
});
