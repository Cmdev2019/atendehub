import { RetentionService } from './retention.service';

describe('RetentionService (B-101)', () => {
  const prisma = {
    notification: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
    auditLog: { deleteMany: jest.fn().mockResolvedValue({ count: 7 }) },
  };
  const now = new Date('2026-10-18T04:00:00.000Z');
  const make = (env: Record<string, string>) =>
    new RetentionService(prisma as any, { get: (k: string) => env[k] } as any);

  beforeEach(() => jest.clearAllMocks());

  it('padrão: apaga só notificações lidas há mais de 90 dias e guarda a auditoria', async () => {
    const result = await make({}).purge(now);

    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { readAt: { not: null, lt: new Date('2026-07-20T04:00:00.000Z') } },
    });
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({ notifications: 3, auditLogs: 0 });
  });

  it('com AUDIT_LOG_RETENTION_DAYS definido, purga a auditoria mais antiga que o prazo', async () => {
    await make({ AUDIT_LOG_RETENTION_DAYS: '365' }).purge(now);

    expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2025-10-18T04:00:00.000Z') } },
    });
  });

  it('0 desliga a purga de notificações; valor inválido também', async () => {
    await make({ NOTIFICATION_RETENTION_DAYS: '0' }).purge(now);
    await make({ NOTIFICATION_RETENTION_DAYS: 'abc' }).purge(now);
    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });
});
