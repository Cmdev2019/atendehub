import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

const mockPrisma = {
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

describe('AuditLogService', () => {
  let service: AuditLogService;
  const companyA = 'company-a';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditLogService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  describe('findAll', () => {
    it('sempre filtra por companyId — isolamento multi-tenant (B4-3)', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
      mockPrisma.auditLog.count.mockResolvedValueOnce(0);

      await service.findAll(companyA, {});

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: companyA }) }),
      );
    });
  });

  describe('record', () => {
    it('grava companyId, ação, entidade e o par before/after', async () => {
      mockPrisma.auditLog.create.mockResolvedValueOnce({});

      await service.record({
        companyId: companyA,
        userId: 'user-1',
        action: 'user.role_changed',
        entity: 'User',
        entityId: 'user-2',
        before: { role: 'AGENT' },
        after: { role: 'SUPERVISOR' },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          companyId: companyA,
          userId: 'user-1',
          action: 'user.role_changed',
          entity: 'User',
          entityId: 'user-2',
          before: { role: 'AGENT' },
          after: { role: 'SUPERVISOR' },
        },
      });
    });

    it('usa Prisma.JsonNull quando before/after não são informados', async () => {
      mockPrisma.auditLog.create.mockResolvedValueOnce({});

      await service.record({
        companyId: companyA,
        action: 'contact.deleted',
        entity: 'Contact',
        entityId: 'contact-1',
      });

      const call = mockPrisma.auditLog.create.mock.calls[0][0];
      expect(call.data.userId).toBeNull();
      expect(call.data.before).toBeDefined();
      expect(call.data.after).toBeDefined();
    });
  });
});
