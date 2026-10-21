import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ConversationStatus, Role } from '@prisma/client';
import { ConversationService } from './conversation.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

// B4-6: cobre o PRODUTOR de jobs de SLA (B2-3/B2-4) — o outro lado da fila
// que o E2E da B2-5 já testa (agendar → delay real → processor). Aqui a fila
// é mockada; o que importa é que ConversationService chame slaQueue.add/
// getJob/job.remove com o jobId e delay certos, nos momentos certos.
// B-66: o prazo do ciclo vai gravado na conversa (`waitSlaDueAt`) e o delay
// do job é calculado a partir dele.
describe('ConversationService — produtor de SLA (ciclo de espera)', () => {
  let service: ConversationService;
  const companyId = 'company-1';
  const supervisor = { id: 'sup-1', role: Role.SUPERVISOR };

  const mockPrisma = {
    conversation: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
    queue: { findFirst: jest.fn() },
    // B-98: expediente do auto-atendimento (sem fluxo = sempre dentro)
    autoAttendanceFlow: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn() },
    department: { findFirst: jest.fn() },
  };
  const mockEvents = {
    emitConversationAssigned: jest.fn(),
    emitConversationUpdated: jest.fn(),
  };
  const mockAuditLog = { record: jest.fn() };
  const mockNotificationService = { create: jest.fn() };

  // job "vivo" que cancelSlaCheck consegue encontrar e remover
  const fakeExistingJob = { remove: jest.fn().mockResolvedValue(undefined) };
  const mockSlaQueue = { add: jest.fn(), getJob: jest.fn() };

  // O delay sai de `waitSlaDueAt - agora`: alguns ms abaixo do prazo cheio
  const expectDelayAbout = (call: number, ms: number) => {
    const { delay } = mockSlaQueue.add.mock.calls[call][1];
    expect(delay).toBeGreaterThan(ms - 1000);
    expect(delay).toBeLessThanOrEqual(ms);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    fakeExistingJob.remove.mockClear().mockResolvedValue(undefined);
    mockSlaQueue.getJob.mockResolvedValue(null); // por padrão, nenhum job pendente
    mockPrisma.conversation.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.conversation.findFirstOrThrow.mockResolvedValue({
      id: 'conv',
      status: ConversationStatus.OPEN,
      waitingSince: null,
      agent: null,
      department: null,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsService, useValue: mockEvents },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: getQueueToken(QUEUE_NAMES.SLA_CHECK), useValue: mockSlaQueue },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
  });

  describe('upsertFromWebhook — abre o ciclo ao criar conversa nova em WAITING', () => {
    it('grava o início e o prazo da espera e agenda o SLA para o prazo', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null); // não existe conversa aberta
      mockPrisma.queue.findFirst.mockResolvedValueOnce({ id: 'queue-1', maxWaitSecs: 120 });
      mockPrisma.conversation.create.mockResolvedValueOnce({ id: 'conv-novo', companyId });

      await service.upsertFromWebhook(companyId, 'contact-1', 'wa-conn-1', undefined, 'dept-1');

      const { data } = mockPrisma.conversation.create.mock.calls[0][0];
      expect(data.waitSlaDueAt.getTime() - data.waitingSince.getTime()).toBe(120_000);
      expect(mockSlaQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-novo', companyId, maxWaitSecs: 120 }),
        expect.objectContaining({ jobId: 'sla-check:conv-novo' }),
      );
      expectDelayAbout(0, 120_000);
    });

    it('NÃO agenda SLA quando o departamento não tem fila ativa configurada', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);
      mockPrisma.queue.findFirst.mockResolvedValueOnce(null); // sem fila ativa
      mockPrisma.conversation.create.mockResolvedValueOnce({ id: 'conv-sem-fila', companyId });

      await service.upsertFromWebhook(companyId, 'contact-1', 'wa-conn-1', undefined, 'dept-1');

      // Está na fila (tem início de espera), mas sem prazo
      const { data } = mockPrisma.conversation.create.mock.calls[0][0];
      expect(data.waitingSince).toBeInstanceOf(Date);
      expect(data.waitSlaDueAt).toBeNull();
      expect(mockSlaQueue.add).not.toHaveBeenCalled();
    });

    it('NÃO agenda SLA quando a conversa não tem departamento (sem departmentId não consulta fila)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);
      mockPrisma.conversation.create.mockResolvedValueOnce({ id: 'conv-sem-depto', companyId });

      await service.upsertFromWebhook(companyId, 'contact-1', 'wa-conn-1');

      expect(mockPrisma.queue.findFirst).not.toHaveBeenCalled();
      expect(mockSlaQueue.add).not.toHaveBeenCalled();
    });

    // B-98 (L-10): sem "espera" de verdade, não há SLA a medir
    it('NÃO agenda SLA para conversa aberta pela própria empresa (1ª mensagem fromMe)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);
      mockPrisma.queue.findFirst.mockResolvedValueOnce({ id: 'queue-1', maxWaitSecs: 120 });
      mockPrisma.conversation.create.mockResolvedValueOnce({ id: 'conv-empresa', companyId });

      await service.upsertFromWebhook(companyId, 'contact-1', 'wa-conn-1', undefined, 'dept-1', true);

      expect(mockPrisma.conversation.create.mock.calls[0][0].data.waitSlaDueAt).toBeNull();
      expect(mockSlaQueue.add).not.toHaveBeenCalled();
    });

    // B-112 (ADR-0019, regra 17): o relógio só anda no expediente. Antes
    // (B-98), quem chegava fora dele ficava sem SLA, nem depois da abertura.
    describe('relógio no expediente (B-112)', () => {
      const weekdays = { tue: [{ start: '08:00', end: '18:00' }], wed: [{ start: '08:00', end: '18:00' }] };
      const flow = (over: Record<string, unknown> = {}) => ({
        isActive: true,
        businessHours: weekdays,
        company: { timezone: 'America/Sao_Paulo' },
        ...over,
      });
      const arrive = async (id: string) => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);
        mockPrisma.queue.findFirst.mockResolvedValueOnce({ id: 'queue-1', maxWaitSecs: 120 });
        mockPrisma.conversation.create.mockResolvedValueOnce({ id, companyId });
        await service.upsertFromWebhook(companyId, 'contact-1', 'wa-conn-1', undefined, 'dept-1');
        return mockPrisma.conversation.create.mock.calls[0][0].data;
      };

      // terça 20:00 em São Paulo, com o expediente já fechado
      beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-20T23:00:00Z')));
      afterEach(() => jest.useRealTimers());

      it('chegou fora do expediente: o prazo conta da abertura e o job vai para ele', async () => {
        mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce(flow());

        const data = await arrive('conv-noite');

        // quarta 08:00 em São Paulo + 2 min
        expect(data.waitingSince.toISOString()).toBe('2026-10-20T23:00:00.000Z');
        expect(data.waitSlaDueAt.toISOString()).toBe('2026-10-21T11:02:00.000Z');
        expect(mockSlaQueue.add.mock.calls[0][1]).toMatchObject({ jobId: 'sla-check:conv-noite', delay: 43_320_000 });
      });

      it('auto-atendimento desligado: o horário não vale e o relógio anda o dia todo', async () => {
        mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce(flow({ isActive: false }));

        const data = await arrive('conv-sem-fluxo');

        expect(data.waitSlaDueAt.getTime() - data.waitingSince.getTime()).toBe(120_000);
      });

      it('expediente que nunca abre: fica na fila sem prazo nem job', async () => {
        mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce(flow({ businessHours: {} }));

        const data = await arrive('conv-sem-expediente');

        expect(data.waitingSince).toBeInstanceOf(Date);
        expect(data.waitSlaDueAt).toBeNull();
        expect(mockSlaQueue.add).not.toHaveBeenCalled();
      });
    });
  });

  describe('assign — tirar da fila para uma pessoa cancela o SLA', () => {
    const waiting = {
      id: 'conv-1',
      status: ConversationStatus.WAITING,
      contact: { name: 'Fulano' },
      agent: null,
      department: { id: 'dept-1' },
      queue: { id: 'queue-1', maxWaitSecs: 300 },
      waitingSince: new Date(),
      waitSlaDueAt: new Date(Date.now() + 300_000),
      slaBreachedAt: null,
    };

    it('remove o job pendente (jobId determinístico) e nunca reagenda', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(waiting); // findOne interno
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'agent-1', name: 'Agente', availability: 'ONLINE' });
      mockSlaQueue.getJob.mockResolvedValueOnce(fakeExistingJob);

      await service.assign(companyId, 'conv-1', { agentId: 'agent-1' }, supervisor);

      expect(mockSlaQueue.getJob).toHaveBeenCalledWith('sla-check:conv-1');
      expect(fakeExistingJob.remove).toHaveBeenCalled();
      expect(mockSlaQueue.add).not.toHaveBeenCalled();
    });

    it('não quebra quando não há job pendente para cancelar (getJob retorna null)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(waiting);
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'agent-1', name: 'Agente', availability: 'ONLINE' });
      mockSlaQueue.getJob.mockResolvedValueOnce(null);

      await expect(
        service.assign(companyId, 'conv-1', { agentId: 'agent-1' }, supervisor),
      ).resolves.toBeDefined();
      expect(fakeExistingJob.remove).not.toHaveBeenCalled();
    });
  });

  describe('assign — mandar para outro setor sem pessoa (volta para a fila)', () => {
    const waitingOld = {
      id: 'conv-2',
      status: ConversationStatus.WAITING,
      contact: { name: 'Ciclana' },
      agent: null,
      department: { id: 'dept-old' },
      queue: { id: 'queue-old', maxWaitSecs: 300 },
      waitingSince: new Date(),
      waitSlaDueAt: new Date(Date.now() + 300_000),
      slaBreachedAt: null,
    };

    it('abre o ciclo na fila do setor novo (cancela o job antigo antes de agendar)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(waitingOld);
      mockPrisma.department.findFirst.mockResolvedValueOnce({ id: 'dept-new' });
      mockPrisma.queue.findFirst.mockResolvedValueOnce({ id: 'queue-new', maxWaitSecs: 90 });
      mockSlaQueue.getJob.mockResolvedValueOnce(fakeExistingJob); // job antigo (fila do dept-old)

      await service.assign(companyId, 'conv-2', { departmentId: 'dept-new' }, supervisor);

      expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ departmentId: 'dept-new', queueId: 'queue-new', status: ConversationStatus.WAITING }),
        }),
      );
      expect(fakeExistingJob.remove).toHaveBeenCalled();
      expect(mockSlaQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-2', maxWaitSecs: 90 }),
        expect.objectContaining({ jobId: 'sla-check:conv-2' }),
      );
      expectDelayAbout(0, 90_000);
    });

    it('cancela o SLA (sem reagendar) quando o setor novo não tem fila ativa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(waitingOld);
      mockPrisma.department.findFirst.mockResolvedValueOnce({ id: 'dept-new' });
      mockPrisma.queue.findFirst.mockResolvedValueOnce(null); // sem fila ativa no setor novo
      mockSlaQueue.getJob.mockResolvedValueOnce(fakeExistingJob);

      await service.assign(companyId, 'conv-2', { departmentId: 'dept-new' }, supervisor);

      expect(fakeExistingJob.remove).toHaveBeenCalled();
      expect(mockSlaQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus — agenda/cancela ao entrar/sair de WAITING', () => {
    it('agenda o SLA do ciclo novo ao reentrar em WAITING (ex.: reabertura)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-3',
        status: ConversationStatus.RESOLVED, // não estava WAITING
        queue: { id: 'queue-1', maxWaitSecs: 60 },
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-3',
        status: ConversationStatus.WAITING,
        companyId,
      });

      await service.updateStatus(companyId, 'conv-3', { status: ConversationStatus.WAITING } as any);

      expect(mockSlaQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-3', maxWaitSecs: 60 }),
        expect.objectContaining({ jobId: 'sla-check:conv-3' }),
      );
      expectDelayAbout(0, 60_000);
    });

    it('cancela o SLA ao sair de WAITING por qualquer caminho fora do assign (ex.: RESOLVED direto)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-4',
        status: ConversationStatus.WAITING,
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-4',
        status: ConversationStatus.RESOLVED,
        companyId,
      });
      mockSlaQueue.getJob.mockResolvedValueOnce(fakeExistingJob);

      await service.updateStatus(companyId, 'conv-4', { status: ConversationStatus.RESOLVED } as any);

      expect(mockSlaQueue.getJob).toHaveBeenCalledWith('sla-check:conv-4');
      expect(fakeExistingJob.remove).toHaveBeenCalled();
    });

    it('não mexe no SLA em transições que não envolvem WAITING (OPEN → RESOLVED)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-5',
        status: ConversationStatus.OPEN,
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-5',
        status: ConversationStatus.RESOLVED,
        companyId,
      });

      await service.updateStatus(companyId, 'conv-5', { status: ConversationStatus.RESOLVED } as any);

      expect(mockSlaQueue.add).not.toHaveBeenCalled();
      expect(mockSlaQueue.getJob).not.toHaveBeenCalled();
    });
  });

  describe('idempotência do jobId (B2-4)', () => {
    it('sempre usa o mesmo jobId determinístico para a mesma conversa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);
      mockPrisma.queue.findFirst.mockResolvedValueOnce({ id: 'queue-1', maxWaitSecs: 30 });
      mockPrisma.conversation.create.mockResolvedValueOnce({ id: 'conv-idem', companyId });

      await service.upsertFromWebhook(companyId, 'contact-1', 'wa-conn-1', undefined, 'dept-1');

      const [, options] = mockSlaQueue.add.mock.calls[0];
      expect(options.jobId).toBe('sla-check:conv-idem');

      // Um 2º agendamento para a MESMA conversa (ex.: reentrada em WAITING)
      // sempre cancela o job anterior antes — nunca deixa dois jobs pendentes
      // com ids diferentes para a mesma conversa.
      mockSlaQueue.getJob.mockResolvedValueOnce(fakeExistingJob);
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-idem',
        status: ConversationStatus.RESOLVED,
        queue: { id: 'queue-1', maxWaitSecs: 30 },
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-idem',
        status: ConversationStatus.WAITING,
        companyId,
      });

      await service.updateStatus(companyId, 'conv-idem', { status: ConversationStatus.WAITING } as any);

      expect(fakeExistingJob.remove).toHaveBeenCalled(); // job antigo cancelado
      const secondCallOptions = mockSlaQueue.add.mock.calls[1][1];
      expect(secondCallOptions.jobId).toBe('sla-check:conv-idem'); // mesmo jobId de sempre
    });
  });
});
