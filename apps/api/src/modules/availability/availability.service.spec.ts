import { NotFoundException } from '@nestjs/common';
import { Availability } from '@prisma/client';
import { AvailabilityService } from './availability.service';

// B-65 (ADR-0019): a troca é condicional — só quando o estado muda de fato há
// evento e auditoria; e nunca atravessa empresas.
describe('AvailabilityService', () => {
  const mockPrisma = {
    user: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const mockEvents = { emitUserAvailability: jest.fn() };
  const mockAuditLog = { record: jest.fn() };

  const service = new AvailabilityService(mockPrisma as any, mockEvents as any, mockAuditLog as any);
  const owner = { id: 'user-1', companyId: 'company-a' };

  beforeEach(() => jest.clearAllMocks());

  it('troca o estado com atualização condicional, emite o evento e audita', async () => {
    mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.set(owner, Availability.ONLINE, 'self');

    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', companyId: 'company-a', availability: { not: Availability.ONLINE } },
      data: { availability: Availability.ONLINE, availabilityChangedAt: expect.any(Date) },
    });
    expect(mockEvents.emitUserAvailability).toHaveBeenCalledWith({
      companyId: 'company-a',
      userId: 'user-1',
      availability: Availability.ONLINE,
      changedAt: expect.any(Date),
    });
    expect(mockAuditLog.record).toHaveBeenCalledWith({
      companyId: 'company-a',
      userId: 'user-1',
      action: 'user.availability_changed',
      entity: 'User',
      entityId: 'user-1',
      before: { availability: Availability.OFFLINE },
      after: { availability: Availability.ONLINE, reason: 'self' },
    });
    expect(result).toEqual({ availability: Availability.ONLINE, availabilityChangedAt: expect.any(Date) });
  });

  it('registra quem fez a troca quando não é o próprio usuário (desativação)', async () => {
    mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.set(owner, Availability.OFFLINE, 'deactivated', 'admin-1');

    expect(mockAuditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        before: { availability: Availability.ONLINE },
        after: { availability: Availability.OFFLINE, reason: 'deactivated' },
      }),
    );
  });

  it('já no estado pedido: devolve o atual sem evento nem auditoria', async () => {
    const changedAt = new Date('2026-10-19T10:00:00Z');
    mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.user.findFirst.mockResolvedValueOnce({
      availability: Availability.ONLINE,
      availabilityChangedAt: changedAt,
    });

    const result = await service.set(owner, Availability.ONLINE, 'self');

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1', companyId: 'company-a' },
      select: { availability: true, availabilityChangedAt: true },
    });
    expect(result).toEqual({ availability: Availability.ONLINE, availabilityChangedAt: changedAt });
    expect(mockEvents.emitUserAvailability).not.toHaveBeenCalled();
    expect(mockAuditLog.record).not.toHaveBeenCalled();
  });

  it('usuário de outra empresa: 404 sem evento nem auditoria', async () => {
    mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.user.findFirst.mockResolvedValueOnce(null);

    await expect(service.set(owner, Availability.ONLINE, 'self')).rejects.toThrow(NotFoundException);
    expect(mockEvents.emitUserAvailability).not.toHaveBeenCalled();
    expect(mockAuditLog.record).not.toHaveBeenCalled();
  });
});
