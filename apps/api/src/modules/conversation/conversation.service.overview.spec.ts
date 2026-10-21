import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ConversationStatus, Role, SenderType } from '../../generated/prisma/client';
import { ConversationService } from './conversation.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

// B-68 (parte 2): a visão do supervisor junta, por setor e por atendente, o
// que as consultas agrupadas devolvem. Aqui o foco é a montagem e o
// isolamento por empresa; os números contra o Postgres real ficam no e2e.
describe('ConversationService — visão do supervisor (B-68)', () => {
  let service: ConversationService;
  const companyId = 'company-a';
  const old = new Date('2026-10-21T12:00:00Z');
  const older = new Date('2026-10-21T11:30:00Z');

  const mockPrisma = {
    department: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    conversation: { groupBy: jest.fn(), findMany: jest.fn() },
  };

  // groupBy na ordem em que o serviço chama (espera, espera estourada,
  // atendimento, atendimento estourado, por atendente, estouro por atendente)
  const groups = (...rows: unknown[][]) => rows.forEach((r) => mockPrisma.conversation.groupBy.mockResolvedValueOnce(r));

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsService, useValue: {} },
        { provide: AuditLogService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: getQueueToken(QUEUE_NAMES.SLA_CHECK), useValue: {} },
      ],
    }).compile();
    service = module.get(ConversationService);

    mockPrisma.department.findMany.mockResolvedValue([
      { id: 'dep-r', name: 'Receitas', color: '#0f766e', isActive: true },
      { id: 'dep-u', name: 'Ultrassom', color: '#2563eb', isActive: true },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'ana', name: 'Ana', avatarUrl: null, role: Role.AGENT, availability: 'ONLINE', availabilityChangedAt: null, departments: [{ id: 'dep-r' }] },
      { id: 'bia', name: 'Bia', avatarUrl: null, role: Role.AGENT, availability: 'OFFLINE', availabilityChangedAt: null, departments: [{ id: 'dep-r' }, { id: 'dep-u' }] },
      { id: 'sue', name: 'Sueli', avatarUrl: null, role: Role.SUPERVISOR, availability: 'ONLINE', availabilityChangedAt: null, departments: [] },
    ]);
  });

  it('monta setores × atendentes com as contagens, a maior espera e quem espera resposta', async () => {
    groups(
      [
        { departmentId: 'dep-r', _count: { _all: 3 }, _min: { waitingSince: old } },
        { departmentId: null, _count: { _all: 1 }, _min: { waitingSince: older } },
      ],
      [{ departmentId: 'dep-r', _count: { _all: 1 } }],
      [{ departmentId: 'dep-r', _count: { _all: 2 } }, { departmentId: 'dep-u', _count: { _all: 1 } }],
      [{ departmentId: 'dep-u', _count: { _all: 1 } }],
      [{ agentId: 'ana', _count: { _all: 2 } }, { agentId: 'bia', _count: { _all: 1 } }],
      [{ agentId: 'bia', _count: { _all: 1 } }],
    );
    mockPrisma.conversation.findMany.mockResolvedValueOnce([
      { agentId: 'ana', messages: [{ senderType: SenderType.AGENT }] },
      { agentId: 'ana', messages: [{ senderType: SenderType.CLIENT }] },
      { agentId: 'bia', messages: [{ senderType: SenderType.CLIENT }] },
    ]);

    const overview = await service.getOverview(companyId);

    expect(overview.totals).toEqual({
      waiting: 4,
      oldestWaitingSince: older,
      waitSlaBreached: 1,
      inService: 3,
      serviceSlaBreached: 1,
      agentsOnline: 2,
      agentsTotal: 3,
    });
    expect(overview.departments).toEqual([
      expect.objectContaining({ id: 'dep-r', waiting: 3, oldestWaitingSince: old, waitSlaBreached: 1, inService: 2, serviceSlaBreached: 0, agentsOnline: 1, agentsTotal: 2 }),
      expect.objectContaining({ id: 'dep-u', waiting: 0, oldestWaitingSince: null, inService: 1, serviceSlaBreached: 1, agentsOnline: 0, agentsTotal: 1 }),
      // Conversa sem setor também espera: linha à parte, no fim
      expect.objectContaining({ id: null, name: 'Sem setor', waiting: 1, oldestWaitingSince: older }),
    ]);
    expect(overview.agents).toEqual([
      expect.objectContaining({ id: 'ana', availability: 'ONLINE', departmentIds: ['dep-r'], inService: 2, serviceSlaBreached: 0, awaitingReply: 1 }),
      // Offline com paciente esperando resposta — o painel destaca
      expect.objectContaining({ id: 'bia', availability: 'OFFLINE', inService: 1, serviceSlaBreached: 1, awaitingReply: 1 }),
      expect.objectContaining({ id: 'sue', role: Role.SUPERVISOR, inService: 0, awaitingReply: 0 }),
    ]);
  });

  it('sem conversa sem setor: não cria a linha "Sem setor"', async () => {
    groups([], [], [], [], [], []);
    mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

    const overview = await service.getOverview(companyId);

    expect(overview.departments.map((d) => d.name)).toEqual(['Receitas', 'Ultrassom']);
    expect(overview.totals).toMatchObject({ waiting: 0, oldestWaitingSince: null, inService: 0 });
  });

  it('toda consulta filtra pela empresa, e o estouro conta o prazo vencido mesmo antes do job', async () => {
    groups([], [], [], [], [], []);
    mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

    await service.getOverview(companyId);

    expect(mockPrisma.department.findMany.mock.calls[0][0].where).toEqual({ companyId });
    expect(mockPrisma.user.findMany.mock.calls[0][0].where).toEqual({ companyId, isActive: true });
    for (const [args] of mockPrisma.conversation.groupBy.mock.calls) {
      expect(args.where.companyId).toBe(companyId);
    }
    const [, waitBreached, , serviceBreached] = mockPrisma.conversation.groupBy.mock.calls.map(([args]) => args.where);
    expect(waitBreached).toMatchObject({ status: ConversationStatus.WAITING, OR: [{ slaBreachedAt: { not: null } }, { waitSlaDueAt: { lt: expect.any(Date) } }] });
    expect(serviceBreached).toMatchObject({ status: ConversationStatus.OPEN, OR: [{ serviceSlaBreachedAt: { not: null } }, { serviceSlaDueAt: { lt: expect.any(Date) } }] });
  });
});
