import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { ConversationStatus, Role } from '../../generated/prisma/client';
import { ConversationService } from './conversation.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';
import { SLA_REQUEST_QUEUE } from './sla-request-queue';

// B-107: o Redis sem responder (ou fora do ar) não segura nem desfaz um pedido
// do painel. A troca, os prazos e a auditoria vão para o banco numa transação;
// o painel é avisado; a resposta sai; os jobs do SLA vão para o Redis depois,
// pelo produtor com prazo (SLA_REQUEST_QUEUE), na ordem dos pedidos de cada
// conversa. O robô e o webhook seguem com o cliente padrão, esperando o Bull
// como antes (D8). A reconciliação refaz pelo banco o job que faltar.
describe('ConversationService — SLA fora da resposta (B-107)', () => {
  let service: ConversationService;
  const companyId = 'company-1';
  const supervisor = { id: 'sup-1', role: Role.SUPERVISOR };

  const mockPrisma = {
    conversation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
    queue: { findFirst: jest.fn() },
    autoAttendanceFlow: { findUnique: jest.fn() },
    user: { findFirst: jest.fn() },
    department: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const mockEvents = { emitConversationAssigned: jest.fn(), emitConversationUpdated: jest.fn() };
  const mockAuditLog = { record: jest.fn() };
  const mockNotificationService = { create: jest.fn() };
  // Robô e webhook (BullModule, cliente padrão) × pedidos do painel (com prazo)
  const robotQueue = { add: jest.fn(), getJob: jest.fn() };
  const requestQueue = { add: jest.fn(), getJob: jest.fn() };

  const deferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  };
  const pendingFor = (promise: Promise<unknown>, ms = 50) =>
    Promise.race([promise.then(() => 'terminou'), new Promise((r) => setTimeout(() => r('pendente'), ms))]);
  const redisTimeout = () => new Error('Command timed out');

  const waiting = (over: Record<string, unknown> = {}) => ({
    id: 'conv-1',
    waitingSince: new Date(Date.now() - 60_000),
    waitSlaDueAt: new Date(Date.now() + 240_000),
    slaBreachedAt: null,
    queue: { maxWaitSecs: 300, maxServiceSecs: 600 },
    ...over,
  });
  const inService = (over: Record<string, unknown> = {}) => ({
    id: 'conv-1',
    status: ConversationStatus.OPEN,
    contact: { name: 'Fulano' },
    agent: { id: 'ana' },
    department: { id: 'dept-1' },
    queue: { id: 'queue-1', maxWaitSecs: 300, maxServiceSecs: 600 },
    waitingSince: null,
    waitSlaDueAt: null,
    slaBreachedAt: null,
    attendedAt: new Date(Date.now() - 120_000),
    serviceSlaDueAt: new Date(Date.now() + 480_000),
    serviceSlaBreachedAt: null,
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mockPrisma.$transaction.mockImplementation((run: (tx: unknown) => unknown) => run(mockPrisma));
    mockPrisma.conversation.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValue(null);
    mockPrisma.conversation.findFirstOrThrow.mockResolvedValue({
      id: 'conv-1',
      status: ConversationStatus.OPEN,
      waitingSince: null,
      agent: { id: 'ana', name: 'Ana', avatarUrl: null },
      department: { id: 'dept-1', name: 'Receitas' },
    });
    for (const queue of [robotQueue, requestQueue]) {
      queue.getJob.mockResolvedValue(null);
      queue.add.mockResolvedValue({});
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsService, useValue: mockEvents },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: getQueueToken(QUEUE_NAMES.SLA_CHECK), useValue: robotQueue },
        { provide: SLA_REQUEST_QUEUE, useValue: requestQueue },
      ],
    }).compile();

    service = module.get(ConversationService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('a resposta não espera o Redis', () => {
    it('Atender com o Redis travado: responde com a troca e a auditoria gravadas e o painel avisado', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE' });
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(waiting());
      requestQueue.getJob.mockReturnValue(new Promise(() => undefined)); // aceita e nunca responde

      const result = await service.attend(companyId, 'conv-1', 'ana');

      expect(result).toMatchObject({ id: 'conv-1', status: ConversationStatus.OPEN });
      expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ agentId: 'ana', serviceSlaDueAt: expect.any(Date) }) }),
      );
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'conversation.attended' }),
        mockPrisma,
      );
      expect(mockEvents.emitConversationAssigned).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1', status: ConversationStatus.OPEN }),
      );
      // A sincronização começou e ficou pendurada sozinha, fora da resposta
      expect(requestQueue.getJob).toHaveBeenCalledWith('sla-check:conv-1');
      expect(await pendingFor(service.whenSlaSynced())).toBe('pendente');
    });

    it('Atender com o Redis fora: a falha vai para o log com o id da conversa, sem virar erro', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE' });
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(waiting());
      requestQueue.getJob.mockRejectedValue(redisTimeout());

      await expect(service.attend(companyId, 'conv-1', 'ana')).resolves.toBeDefined();
      await service.whenSlaSynced();

      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringMatching(/conv-1.*atender.*Command timed out.*reconciliação/),
      );
      expect(requestQueue.add).not.toHaveBeenCalled();
    });

    it('Pegar próxima com o Redis fora: a conversa fica atendida com o prazo do setor gravado', async () => {
      const attendedAt = new Date();
      mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE', departments: [{ id: 'dept-1' }] });
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { id: 'conv-1', waitingSince: new Date(), waitSlaDueAt: null, slaBreachedAt: null, attendedAt, maxWaitSecs: 300, maxServiceSecs: 900 },
      ]);
      requestQueue.getJob.mockRejectedValue(redisTimeout());

      await expect(service.attendNext(companyId, 'ana')).resolves.toBeDefined();
      await service.whenSlaSynced();

      expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', companyId },
        data: { serviceSlaDueAt: new Date(attendedAt.getTime() + 900_000) },
      });
      expect(mockAuditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'conversation.attended' }), mockPrisma);
      expect(mockEvents.emitConversationAssigned).toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('pegar próxima'));
    });

    it('Transferir de volta para a fila com o Redis fora: o ciclo novo e a auditoria ficam no banco', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(inService());
      mockPrisma.queue.findFirst.mockResolvedValueOnce({ id: 'queue-1', maxWaitSecs: 300 });
      mockPrisma.conversation.findFirstOrThrow.mockResolvedValueOnce({
        id: 'conv-1', status: ConversationStatus.WAITING, waitingSince: new Date(), agent: null, department: { id: 'dept-1' },
      });
      requestQueue.getJob.mockRejectedValue(redisTimeout());

      await expect(service.assign(companyId, 'conv-1', {}, supervisor)).resolves.toMatchObject({
        status: ConversationStatus.WAITING,
      });
      await service.whenSlaSynced();

      expect(mockPrisma.conversation.updateMany.mock.calls[0][0].data).toMatchObject({
        status: ConversationStatus.WAITING,
        waitingSince: expect.any(Date),
        waitSlaDueAt: expect.any(Date),
      });
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'conversation.assigned', after: { agentId: null } }),
        mockPrisma,
      );
      expect(mockEvents.emitConversationAssigned).toHaveBeenCalledWith(
        expect.objectContaining({ status: ConversationStatus.WAITING }),
      );
    });

    it('Encerrar pelo painel com o Redis fora: status e auditoria do atendimento gravados, evento emitido', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(inService());
      mockPrisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1', status: ConversationStatus.CLOSED, companyId });
      requestQueue.getJob.mockRejectedValue(redisTimeout());

      await expect(
        service.updateStatus(companyId, 'conv-1', { status: ConversationStatus.CLOSED } as any, supervisor),
      ).resolves.toMatchObject({ status: ConversationStatus.CLOSED });
      await service.whenSlaSynced();

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'conv-1', companyId } }),
      );
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'conversation.service_closed' }),
        mockPrisma,
      );
      expect(mockEvents.emitConversationUpdated).toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('mudar o status'));
    });

    it('a troca perdida (409) não chega ao Redis', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE' });
      mockPrisma.conversation.findFirst
        .mockResolvedValueOnce(waiting())
        .mockResolvedValueOnce({ status: ConversationStatus.OPEN, agent: { name: 'Bruno' } });
      mockPrisma.conversation.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.attend(companyId, 'conv-1', 'ana')).rejects.toThrow('Bruno já está atendendo');
      await service.whenSlaSynced();

      expect(mockAuditLog.record).not.toHaveBeenCalled();
      expect(requestQueue.getJob).not.toHaveBeenCalled();
    });
  });

  describe('quem usa cada produtor (D8)', () => {
    it('pedidos do painel: o produtor com prazo; o padrão não é tocado', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE' });
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(waiting());

      await service.attend(companyId, 'conv-1', 'ana');
      await service.whenSlaSynced();

      expect(requestQueue.getJob).toHaveBeenCalledWith('sla-check:conv-1');
      expect(requestQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'service', conversationId: 'conv-1' }),
        expect.objectContaining({ jobId: 'service-sla:conv-1' }),
      );
      expect(robotQueue.getJob).not.toHaveBeenCalled();
      expect(robotQueue.add).not.toHaveBeenCalled();
    });

    it('webhook (conversa nova): o cliente padrão, esperado antes de devolver', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);
      mockPrisma.queue.findFirst.mockResolvedValueOnce({ id: 'queue-1', maxWaitSecs: 120, greetingMsg: null });
      mockPrisma.conversation.create.mockResolvedValueOnce({ id: 'conv-novo', companyId });

      await service.upsertFromWebhook(companyId, 'contact-1', 'wa-1', undefined, 'dept-1');

      expect(robotQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-novo' }),
        expect.objectContaining({ jobId: 'sla-check:conv-novo' }),
      );
      expect(requestQueue.getJob).not.toHaveBeenCalled();
      expect(requestQueue.add).not.toHaveBeenCalled();
    });

    it('robô (menu do auto-atendimento): o cliente padrão', async () => {
      mockPrisma.queue.findFirst.mockResolvedValueOnce({ id: 'queue-1', departmentId: 'dept-1', maxWaitSecs: 120 });
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ status: ConversationStatus.WAITING, agentId: null });
      mockPrisma.conversation.update.mockResolvedValueOnce({});

      await service.routeAutoAttendance(companyId, 'conv-1', { departmentId: 'dept-1' });

      expect(robotQueue.add).toHaveBeenCalled();
      expect(requestQueue.getJob).not.toHaveBeenCalled();
    });

    it('robô encerrando (sem usuário): o cliente padrão, e a falha do Redis segue chegando a quem chamou', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(inService());
      mockPrisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1', status: ConversationStatus.CLOSED, companyId });
      robotQueue.getJob.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(
        service.updateStatus(companyId, 'conv-1', { status: ConversationStatus.CLOSED } as any),
      ).rejects.toThrow('ECONNREFUSED');

      // O banco ficou consistente: o status e a auditoria foram na transação
      expect(mockPrisma.conversation.update).toHaveBeenCalled();
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'conversation.service_closed' }),
        mockPrisma,
      );
      expect(requestQueue.getJob).not.toHaveBeenCalled();
    });
  });

  describe('ordem das sincronizações', () => {
    it('na mesma conversa, a do pedido seguinte espera a anterior terminar', async () => {
      const calls: string[] = [];
      const firstGetJob = deferred<null>();
      requestQueue.getJob
        .mockImplementationOnce((id: string) => {
          calls.push(`getJob ${id}`);
          return firstGetJob.promise;
        })
        .mockImplementation(async (id: string) => {
          calls.push(`getJob ${id}`);
          return null;
        });
      requestQueue.add.mockImplementation(async (_data: unknown, opts: { jobId: string }) => {
        calls.push(`add ${opts.jobId}`);
      });

      // Atender (agenda o job do atendimento) e logo depois encerrar
      mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE' });
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(waiting()).mockResolvedValueOnce(inService());
      mockPrisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1', status: ConversationStatus.CLOSED, companyId });
      await service.attend(companyId, 'conv-1', 'ana');
      await service.updateStatus(companyId, 'conv-1', { status: ConversationStatus.CLOSED } as any, supervisor);

      expect(calls).toEqual(['getJob sla-check:conv-1']); // o encerramento espera
      firstGetJob.resolve(null);
      await service.whenSlaSynced();

      expect(calls).toEqual([
        'getJob sla-check:conv-1',
        'getJob service-sla:conv-1',
        'add service-sla:conv-1', // atender
        'getJob service-sla:conv-1', // encerrar: cancela o job que o atender criou
      ]);
    });

    it('conversas diferentes não esperam uma pela outra', async () => {
      const stuck = deferred<null>();
      requestQueue.getJob.mockImplementation((id: string) => (id.endsWith('conv-1') ? stuck.promise : Promise.resolve(null)));

      mockPrisma.user.findFirst.mockResolvedValue({ availability: 'ONLINE' });
      mockPrisma.conversation.findFirst
        .mockResolvedValueOnce(waiting())
        .mockResolvedValueOnce(waiting({ id: 'conv-2' }));
      await service.attend(companyId, 'conv-1', 'ana');
      await service.attend(companyId, 'conv-2', 'ana');
      await new Promise((r) => setImmediate(r));

      expect(requestQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-2' }),
        expect.objectContaining({ jobId: 'service-sla:conv-2' }),
      );
      stuck.resolve(null);
      await service.whenSlaSynced();
    });

    it('no desligamento, espera as pendentes por até 5 s', async () => {
      jest.useFakeTimers();
      try {
        mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE' });
        mockPrisma.conversation.findFirst.mockResolvedValueOnce(waiting());
        requestQueue.getJob.mockReturnValue(new Promise(() => undefined));
        await service.attend(companyId, 'conv-1', 'ana');

        let closed = false;
        const closing = service.onModuleDestroy().then(() => (closed = true));
        await jest.advanceTimersByTimeAsync(4900);
        expect(closed).toBe(false);
        await jest.advanceTimersByTimeAsync(100);
        await closing;
        expect(closed).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ── Reconciliação: o banco é a fonte de verdade ───────────────────────────
  describe('reconcileSla', () => {
    const t0 = Date.now();
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'conv-1',
      companyId,
      status: ConversationStatus.WAITING,
      waitingSince: new Date(t0 - 60_000),
      waitSlaDueAt: new Date(t0 + 240_000),
      slaBreachedAt: null,
      attendedAt: null,
      serviceSlaDueAt: null,
      serviceSlaBreachedAt: null,
      queue: { maxWaitSecs: 300, maxServiceSecs: 600 },
      ...over,
    });
    const serviceRow = (over: Record<string, unknown> = {}) =>
      row({
        status: ConversationStatus.OPEN,
        waitingSince: null,
        waitSlaDueAt: null,
        attendedAt: new Date(t0 - 120_000),
        serviceSlaDueAt: new Date(t0 + 480_000),
        ...over,
      });
    // Como o Bull devolve do Redis: datas em texto, `timestamp` + `delay`
    const job = (data: Record<string, unknown>, firesAt: number, over: Record<string, unknown> = {}) => ({
      data,
      timestamp: t0 - 60_000,
      opts: { delay: firesAt - (t0 - 60_000) },
      finishedOn: undefined,
      remove: jest.fn().mockResolvedValue(undefined),
      ...over,
    });
    const waitJob = (over: Record<string, unknown> = {}) =>
      job({ conversationId: 'conv-1', queuedAt: new Date(t0 - 60_000).toISOString() }, t0 + 240_000, over);

    it('na fila, com prazo e sem job (o Redis falhou ao criar): refaz o job para o prazo gravado', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(row());

      await expect(service.reconcileSla('conv-1')).resolves.toBe('rescheduled');

      expect(requestQueue.add).toHaveBeenCalledWith(
        { conversationId: 'conv-1', companyId, maxWaitSecs: 300, queuedAt: new Date(t0 - 60_000) },
        expect.objectContaining({ jobId: 'sla-check:conv-1' }),
      );
      const { delay } = requestQueue.add.mock.calls[0][1];
      expect(delay).toBeGreaterThan(238_000);
      expect(delay).toBeLessThanOrEqual(240_000);
      expect(robotQueue.add).not.toHaveBeenCalled();
    });

    it('job pendente do mesmo ciclo: não mexe — nada duplicado', async () => {
      const pending = waitJob();
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(row());
      requestQueue.getJob.mockResolvedValueOnce(pending);

      await expect(service.reconcileSla('conv-1')).resolves.toBe('ok');

      expect(pending.remove).not.toHaveBeenCalled();
      expect(requestQueue.add).not.toHaveBeenCalled();
    });

    it('job de outro ciclo (o cancelamento falhou): troca pelo do ciclo atual', async () => {
      const stale = waitJob({ data: { conversationId: 'conv-1', queuedAt: new Date(t0 - 3_600_000).toISOString() } });
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(row());
      requestQueue.getJob.mockResolvedValue(stale);

      await expect(service.reconcileSla('conv-1')).resolves.toBe('rescheduled');

      expect(stale.remove).toHaveBeenCalled();
      expect(requestQueue.add).toHaveBeenCalledTimes(1);
    });

    it('job do ciclo já finalizado sem o estouro marcado: refaz', async () => {
      const finished = waitJob({ finishedOn: t0 - 1000 });
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(row());
      requestQueue.getJob.mockResolvedValue(finished);

      await expect(service.reconcileSla('conv-1')).resolves.toBe('rescheduled');

      expect(finished.remove).toHaveBeenCalled();
      expect(requestQueue.add).toHaveBeenCalledTimes(1);
    });

    it('prazo já vencido e sem job: o job novo dispara na hora', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(row({ waitSlaDueAt: new Date(t0 - 5000) }));

      await expect(service.reconcileSla('conv-1')).resolves.toBe('rescheduled');

      expect(requestQueue.add.mock.calls[0][1]).toMatchObject({ jobId: 'sla-check:conv-1', delay: 0 });
    });

    it('job refeito na hora (prazo vencido) conta como pendente na rodada seguinte', async () => {
      const lateJob = job(
        { conversationId: 'conv-1', queuedAt: new Date(t0 - 60_000).toISOString() },
        t0 - 1000,
        { timestamp: t0 - 1000, opts: { delay: 0 } },
      );
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(row({ waitSlaDueAt: new Date(t0 - 5000) }));
      requestQueue.getJob.mockResolvedValueOnce(lateJob);

      await expect(service.reconcileSla('conv-1')).resolves.toBe('ok');
    });

    it('estouro já marcado: nada a fazer', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(row({ slaBreachedAt: new Date() }));

      await expect(service.reconcileSla('conv-1')).resolves.toBe('skipped');

      expect(requestQueue.getJob).not.toHaveBeenCalled();
      expect(requestQueue.add).not.toHaveBeenCalled();
    });

    it('conversa encerrada: o ciclo antigo não volta', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(
        row({ status: ConversationStatus.CLOSED, attendedAt: new Date(t0 - 120_000), serviceSlaDueAt: new Date(t0 + 1000) }),
      );

      await expect(service.reconcileSla('conv-1')).resolves.toBe('skipped');

      expect(requestQueue.add).not.toHaveBeenCalled();
    });

    it('conversa que não existe mais: nada a fazer', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(null);

      await expect(service.reconcileSla('conv-1')).resolves.toBe('skipped');
    });

    it('em atendimento, com prazo e sem job: refaz o job do atendimento', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(serviceRow());

      await expect(service.reconcileSla('conv-1')).resolves.toBe('rescheduled');

      expect(requestQueue.add).toHaveBeenCalledWith(
        { kind: 'service', conversationId: 'conv-1', companyId, maxServiceSecs: 600, attendedAt: new Date(t0 - 120_000) },
        expect.objectContaining({ jobId: 'service-sla:conv-1' }),
      );
    });

    it('em atendimento, com o job pendente do mesmo ciclo: não mexe', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(serviceRow());
      requestQueue.getJob.mockResolvedValueOnce(
        job({ kind: 'service', conversationId: 'conv-1', attendedAt: new Date(t0 - 120_000).toISOString() }, t0 + 480_000),
      );

      await expect(service.reconcileSla('conv-1')).resolves.toBe('ok');

      expect(requestQueue.add).not.toHaveBeenCalled();
    });

    it('setor sem prazo do atendimento: não agenda', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(
        serviceRow({ queue: { maxWaitSecs: 300, maxServiceSecs: null } }),
      );

      await expect(service.reconcileSla('conv-1')).resolves.toBe('skipped');

      expect(requestQueue.getJob).not.toHaveBeenCalled();
    });

    it('Redis sem resposta na reconciliação: o erro sobe para a rodada contar', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValueOnce(row());
      requestQueue.getJob.mockRejectedValueOnce(redisTimeout());

      await expect(service.reconcileSla('conv-1')).rejects.toThrow('Command timed out');
    });

    it('espera a sincronização pendente da conversa e só então relê o banco', async () => {
      const stuck = deferred<null>();
      mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE' });
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(waiting());
      requestQueue.getJob.mockReturnValueOnce(stuck.promise);
      await service.attend(companyId, 'conv-1', 'ana');

      mockPrisma.conversation.findUnique.mockResolvedValueOnce(serviceRow());
      const reconciling = service.reconcileSla('conv-1');
      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.conversation.findUnique).not.toHaveBeenCalled();

      stuck.resolve(null);
      await expect(reconciling).resolves.toBeDefined();
      expect(mockPrisma.conversation.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'conv-1' } }));
    });
  });
});
