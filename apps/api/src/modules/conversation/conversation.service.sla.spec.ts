import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ConversationStatus, Role } from '../../generated/prisma/client';
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
    // B-67: o "Pegar próxima" é SQL cru
    $queryRaw: jest.fn(),
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

    it('não mexe no SLA da espera em transições que não envolvem WAITING (OPEN → RESOLVED)', async () => {
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
      // B-114: só o job do atendimento é cancelado — resolver encerra o atendimento
      expect(mockSlaQueue.getJob.mock.calls).toEqual([['service-sla:conv-5']]);
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

  // B-114 (ADR-0019, regras 18 a 21): o relógio do atendimento abre quando a
  // conversa sai da fila com alguém e fecha ao encerrar; o prazo é do setor
  describe('SLA do atendimento (B-114)', () => {
    const queueOf = (maxServiceSecs: number | null, id = 'queue-1') => ({ id, maxWaitSecs: 300, maxServiceSecs });
    const serviceAdds = () => mockSlaQueue.add.mock.calls.filter(([data]) => data.kind === 'service');
    const dataOfUpdate = () => mockPrisma.conversation.updateMany.mock.calls[0][0].data;

    // Conversa em atendimento com a Ana, no setor 1, com 10 min de prazo
    const inService = (over: Record<string, unknown> = {}) => ({
      id: 'conv-1',
      status: ConversationStatus.OPEN,
      contact: { name: 'Fulano' },
      agent: { id: 'ana' },
      department: { id: 'dept-1' },
      queue: queueOf(600),
      attendedAt: new Date(Date.now() - 120_000),
      serviceSlaDueAt: new Date(Date.now() + 480_000),
      serviceSlaBreachedAt: null,
      ...over,
    });

    describe('abre o ciclo ao sair da fila com alguém', () => {
      const waitingIn = (queue: ReturnType<typeof queueOf>) => ({
        id: 'conv-1',
        waitingSince: new Date(Date.now() - 60_000),
        waitSlaDueAt: new Date(Date.now() + 240_000),
        slaBreachedAt: null,
        queue,
      });

      it('Atender: grava o início e o prazo do setor e agenda o job do atendimento', async () => {
        mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE' });
        mockPrisma.conversation.findFirst.mockResolvedValueOnce(waitingIn(queueOf(600)));

        await service.attend(companyId, 'conv-1', 'ana');

        const data = dataOfUpdate();
        expect(data.serviceSlaDueAt.getTime() - data.attendedAt.getTime()).toBe(600_000);
        expect(data.serviceSlaBreachedAt).toBeNull();
        expect(serviceAdds()).toHaveLength(1);
        expect(serviceAdds()[0]).toEqual([
          expect.objectContaining({ kind: 'service', conversationId: 'conv-1', companyId, maxServiceSecs: 600 }),
          expect.objectContaining({ jobId: 'service-sla:conv-1' }),
        ]);
        const { delay } = serviceAdds()[0][1];
        expect(delay).toBeGreaterThan(599_000);
        expect(delay).toBeLessThanOrEqual(600_000);
      });

      it('setor sem prazo do atendimento: abre o ciclo sem prazo nem job', async () => {
        mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE' });
        mockPrisma.conversation.findFirst.mockResolvedValueOnce(waitingIn(queueOf(null)));

        await service.attend(companyId, 'conv-1', 'ana');

        expect(dataOfUpdate()).toMatchObject({ attendedAt: expect.any(Date), serviceSlaDueAt: null });
        expect(serviceAdds()).toHaveLength(0);
      });

      describe('com o expediente fechado (B-112)', () => {
        // terça 20:00 em São Paulo
        beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-20T23:00:00Z')));
        afterEach(() => jest.useRealTimers());

        it('o prazo do atendimento só corre a partir da abertura', async () => {
          mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE' });
          mockPrisma.conversation.findFirst.mockResolvedValueOnce(waitingIn(queueOf(600)));
          mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce({
            isActive: true,
            businessHours: { wed: [{ start: '08:00', end: '18:00' }] },
            company: { timezone: 'America/Sao_Paulo' },
          });

          await service.attend(companyId, 'conv-1', 'ana');

          // quarta 08:00 em São Paulo + 10 min
          expect(dataOfUpdate().serviceSlaDueAt.toISOString()).toBe('2026-10-21T11:10:00.000Z');
        });
      });

      it('Pegar próxima: o prazo vem do setor da conversa escolhida, gravado depois da troca', async () => {
        const attendedAt = new Date();
        mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE', departments: [{ id: 'dept-1' }] });
        mockPrisma.$queryRaw.mockResolvedValueOnce([
          { id: 'conv-1', waitingSince: new Date(Date.now() - 60_000), waitSlaDueAt: null, slaBreachedAt: null, attendedAt, maxWaitSecs: 300, maxServiceSecs: 900 },
        ]);

        await service.attendNext(companyId, 'ana');

        expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith({
          where: { id: 'conv-1', companyId, agentId: 'ana', attendedAt },
          data: { serviceSlaDueAt: new Date(attendedAt.getTime() + 900_000) },
        });
        expect(serviceAdds()[0][0]).toMatchObject({ kind: 'service', maxServiceSecs: 900 });
      });

      it('Pegar próxima: o ciclo mudou no meio (transferida de setor) — não agenda o prazo velho', async () => {
        mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE', departments: [{ id: 'dept-1' }] });
        mockPrisma.$queryRaw.mockResolvedValueOnce([
          { id: 'conv-1', waitingSince: new Date(), waitSlaDueAt: null, slaBreachedAt: null, attendedAt: new Date(), maxWaitSecs: 300, maxServiceSecs: 900 },
        ]);
        mockPrisma.conversation.updateMany.mockResolvedValueOnce({ count: 0 });

        await service.attendNext(companyId, 'ana');

        expect(serviceAdds()).toHaveLength(0);
      });

      it('supervisor tira da fila para um atendente: abre o ciclo com o prazo do setor', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce({
          ...inService({ status: ConversationStatus.WAITING, agent: null, attendedAt: null, serviceSlaDueAt: null }),
          waitingSince: new Date(),
          waitSlaDueAt: null,
          slaBreachedAt: null,
        });
        mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'ana', name: 'Ana', availability: 'ONLINE' });

        await service.assign(companyId, 'conv-1', { agentId: 'ana' }, supervisor);

        const data = dataOfUpdate();
        expect(data.serviceSlaDueAt.getTime() - data.attendedAt.getTime()).toBe(600_000);
        expect(serviceAdds()).toHaveLength(1);
      });
    });

    describe('transferência em atendimento (regra 20)', () => {
      it('para outra pessoa do mesmo setor: o relógio continua', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce(inService());
        mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'bruno', name: 'Bruno', availability: 'ONLINE' });

        await service.assign(companyId, 'conv-1', { agentId: 'bruno' }, supervisor);

        const data = dataOfUpdate();
        expect(data).toMatchObject({ agentId: 'bruno', status: ConversationStatus.OPEN });
        expect(data).not.toHaveProperty('attendedAt');
        expect(data).not.toHaveProperty('serviceSlaDueAt');
        expect(mockSlaQueue.getJob).not.toHaveBeenCalledWith('service-sla:conv-1');
        expect(serviceAdds()).toHaveLength(0);
      });

      it('para outro setor: recomeça com o prazo do setor novo, cuja fila passa a ser a da conversa', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce(inService());
        mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'carla', name: 'Carla', availability: 'ONLINE' });
        mockPrisma.department.findFirst.mockResolvedValueOnce({ id: 'dept-2' });
        mockPrisma.queue.findFirst.mockResolvedValueOnce(queueOf(900, 'queue-2'));
        mockSlaQueue.getJob.mockResolvedValueOnce(fakeExistingJob); // job do ciclo antigo

        await service.assign(companyId, 'conv-1', { agentId: 'carla', departmentId: 'dept-2' }, supervisor);

        const data = dataOfUpdate();
        expect(data).toMatchObject({ departmentId: 'dept-2', queueId: 'queue-2', serviceSlaBreachedAt: null });
        expect(data.serviceSlaDueAt.getTime() - data.attendedAt.getTime()).toBe(900_000);
        expect(mockSlaQueue.getJob).toHaveBeenCalledWith('service-sla:conv-1');
        expect(fakeExistingJob.remove).toHaveBeenCalled();
        expect(serviceAdds()[0][0]).toMatchObject({ maxServiceSecs: 900 });
      });
    });

    describe('fecha o ciclo', () => {
      it('ao encerrar: cancela o job e audita quanto durou e se estourou', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce(
          inService({ serviceSlaDueAt: new Date(Date.now() - 1000), serviceSlaBreachedAt: new Date() }),
        );
        mockPrisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1', status: ConversationStatus.CLOSED, companyId });

        await service.updateStatus(companyId, 'conv-1', { status: ConversationStatus.CLOSED } as any, supervisor);

        expect(mockSlaQueue.getJob).toHaveBeenCalledWith('service-sla:conv-1');
        expect(mockAuditLog.record).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'conversation.service_closed',
            userId: supervisor.id,
            entityId: 'conv-1',
            after: expect.objectContaining({ agentId: 'ana', maxServiceSecs: 600, breached: true }),
          }),
        );
        expect(mockAuditLog.record.mock.calls[0][0].after.serviceSeconds).toBeGreaterThanOrEqual(120);
      });

      it('encerrar sem atender (direto da fila): não há atendimento a registrar', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce(
          inService({ status: ConversationStatus.WAITING, agent: null, attendedAt: null, serviceSlaDueAt: null }),
        );
        mockPrisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1', status: ConversationStatus.CLOSED, companyId });

        await service.updateStatus(companyId, 'conv-1', { status: ConversationStatus.CLOSED } as any, supervisor);

        expect(mockAuditLog.record).not.toHaveBeenCalled();
      });

      it('devolver à fila pelo status: limpa o ciclo e cancela o job, sem auditar duração', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce(inService());
        mockPrisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1', status: ConversationStatus.WAITING, companyId });

        await service.updateStatus(companyId, 'conv-1', { status: ConversationStatus.WAITING } as any, supervisor);

        expect(mockPrisma.conversation.update.mock.calls[0][0].data).toMatchObject({
          attendedAt: null,
          serviceSlaDueAt: null,
          serviceSlaBreachedAt: null,
        });
        expect(mockSlaQueue.getJob).toHaveBeenCalledWith('service-sla:conv-1');
        expect(mockAuditLog.record).not.toHaveBeenCalled();
      });
    });
  });
});
