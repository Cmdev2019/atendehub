import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

const mockPrisma = {
  conversation: { count: jest.fn() },
};

describe('DashboardService', () => {
  let service: DashboardService;
  const companyA = 'company-a';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('sempre filtra por companyId em todas as contagens', async () => {
    mockPrisma.conversation.count.mockResolvedValue(0);

    await service.getSummary(companyA);

    mockPrisma.conversation.count.mock.calls.forEach((call) => {
      expect(call[0].where).toEqual(expect.objectContaining({ companyId: companyA }));
    });
  });

  it('sem from/to, usa os últimos 30 dias terminando agora', async () => {
    mockPrisma.conversation.count.mockResolvedValue(0);
    const before = Date.now();

    const result = await service.getSummary(companyA);

    const spanMs = result.period.to.getTime() - result.period.from.getTime();
    expect(spanMs).toBe(30 * 24 * 60 * 60 * 1000);
    expect(result.period.to.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('usa from/to explícitos quando informados', async () => {
    mockPrisma.conversation.count.mockResolvedValue(0);

    const result = await service.getSummary(companyA, '2026-01-01T00:00:00.000Z', '2026-01-31T00:00:00.000Z');

    expect(result.period.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(result.period.to.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });

  it('retorna as contagens no shape esperado', async () => {
    mockPrisma.conversation.count
      .mockResolvedValueOnce(20) // totalConversations
      .mockResolvedValueOnce(15) // attended
      .mockResolvedValueOnce(5)  // notAttended
      .mockResolvedValueOnce(8)  // totalClosed
      .mockResolvedValueOnce(5)  // resolved
      .mockResolvedValueOnce(2)  // unresolved
      .mockResolvedValueOnce(1)  // cancelled
      .mockResolvedValueOnce(0); // unlabeled

    const result = await service.getSummary(companyA);

    expect(result.totalConversations).toBe(20);
    expect(result.attended).toBe(15);
    expect(result.notAttended).toBe(5);
    expect(result.totalClosed).toBe(8);
    expect(result.resolved).toBe(5);
    expect(result.unresolved).toBe(2);
    expect(result.cancelled).toBe(1);
    expect(result.unlabeled).toBe(0);
  });

  it('atendidas filtra agentId não nulo; não atendidas filtra agentId nulo', async () => {
    mockPrisma.conversation.count.mockResolvedValue(0);

    await service.getSummary(companyA);

    const attendedCall = mockPrisma.conversation.count.mock.calls[1][0];
    const notAttendedCall = mockPrisma.conversation.count.mock.calls[2][0];
    expect(attendedCall.where.agentId).toEqual({ not: null });
    expect(notAttendedCall.where.agentId).toBeNull();
  });

  it('resolvidas/não resolvidas/canceladas/sem registro só contam conversas CLOSED', async () => {
    mockPrisma.conversation.count.mockResolvedValue(0);

    await service.getSummary(companyA);

    [3, 4, 5, 6, 7].forEach((i) => {
      const call = mockPrisma.conversation.count.mock.calls[i][0];
      expect(call.where.status).toBe('CLOSED');
    });
  });

  it('canceladas filtra resolution=CANCELLED, separado de não resolvidas', async () => {
    mockPrisma.conversation.count.mockResolvedValue(0);

    await service.getSummary(companyA);

    const unresolvedCall = mockPrisma.conversation.count.mock.calls[5][0];
    const cancelledCall = mockPrisma.conversation.count.mock.calls[6][0];
    expect(unresolvedCall.where.resolution).toBe('UNRESOLVED');
    expect(cancelledCall.where.resolution).toBe('CANCELLED');
  });
});
