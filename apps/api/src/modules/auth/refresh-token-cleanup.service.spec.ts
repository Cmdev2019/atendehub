import { Test, TestingModule } from '@nestjs/testing';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

const mockPrisma = {
  refreshToken: {
    deleteMany: jest.fn(),
  },
};

describe('RefreshTokenCleanupService', () => {
  let service: RefreshTokenCleanupService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenCleanupService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RefreshTokenCleanupService>(RefreshTokenCleanupService);
  });

  it('remove tokens expirados ou revogados, nunca os válidos', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValueOnce({ count: 3 });

    await service.handleCleanup();

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { expiresAt: { lt: expect.any(Date) } },
          { revokedAt: { not: null } },
        ],
      },
    });
  });

  it('não lança erro quando nada é removido', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.handleCleanup()).resolves.toBeUndefined();
  });
});
