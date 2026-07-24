import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule, getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConversationStatus } from '@prisma/client';
import {
  SlaCheckProcessor,
  SlaCheckJobData,
} from '../src/modules/sla/sla-check.processor';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { EventsService } from '../src/modules/events/events.service';
import { AuditLogService } from '../src/modules/audit-log/audit-log.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import { QUEUE_NAMES } from '../src/shared/queues/queue-names';

/**
 * B2-5 — Teste E2E do SLA.
 *
 * Diferente dos specs unitários de sla-check.processor (que mockam a fila
 * inteira), este teste sobe a fila `sla-check` de verdade contra o Redis
 * local — mesma config de app.module.ts — para provar que o par real
 * agendar-com-delay → Bull dispara → processor reconsulta o status funciona
 * de ponta a ponta, não só que as funções internas são chamadas com os
 * argumentos certos.
 *
 * Prisma/Events/AuditLog/Notification continuam mockados: essa lógica já
 * tem cobertura própria (audit-log.service.spec.ts, notification.service.spec.ts)
 * e mockar evita o teste depender também de um Postgres de teste.
 *
 * Pré-requisito: Redis rodando em localhost:6379 (`docker compose up -d redis`).
 * Roda isolado do `npm test` normal via `npm run test:e2e` (sufixo .e2e-spec.ts
 * não bate no testRegex do jest.config.js principal).
 */
describe('SLA — E2E (fila Bull real + processor real)', () => {
  jest.setTimeout(20000);

  const SLA_SECS = 2; // curto para o teste rodar rápido (roadmap sugere 10s em validação manual)

  let module: TestingModule;
  let processor: SlaCheckProcessor;
  let slaQueue: Queue<SlaCheckJobData>;

  const mockPrisma = {
    conversation: { findUnique: jest.fn(), update: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const mockEvents = { emitSlaBreached: jest.fn() };
  const mockAuditLog = { record: jest.fn() };
  const mockNotification = { create: jest.fn() };

  const contact = { id: 'contact-1', name: 'Fulano', phone: '5512999999999' };
  const queueRef = { id: 'queue-1', name: 'Fila Padrão', maxWaitSecs: SLA_SECS };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
        BullModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            redis: {
              host: config.get<string>('REDIS_HOST', 'localhost'),
              port: config.get<number>('REDIS_PORT', 6379),
              password: config.get<string>('REDIS_PASSWORD'),
              // Prefixo isolado do 'bull:' usado pela API de verdade — jobs
              // deste teste nunca colidem com os de uma instância em dev.
              keyPrefix: 'bull:test:',
            },
          }),
        }),
        BullModule.registerQueue({ name: QUEUE_NAMES.SLA_CHECK }),
      ],
      providers: [
        SlaCheckProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsService, useValue: mockEvents },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: NotificationService, useValue: mockNotification },
      ],
    }).compile();

    processor = module.get(SlaCheckProcessor);
    slaQueue = module.get(getQueueToken(QUEUE_NAMES.SLA_CHECK));

    // Sem isso, o BullExplorer do @nestjs/bull nunca registra o @Process()
    // do processor como consumer real — job.finished() ficaria pendurado
    // para sempre.
    await module.init();

    // Limpeza defensiva: uma execução anterior que travou/foi encerrada à
    // força (timeout do Jest, Ctrl+C) pode deixar jobs órfãos no Redis com o
    // mesmo jobId determinístico — um job "stuck" de uma rodada antiga faz
    // add() desta rodada devolver o job velho em vez de agendar um novo.
    await slaQueue.obliterate({ force: true });
  });

  afterAll(async () => {
    await slaQueue.obliterate({ force: true });
    await slaQueue.close();
    await module.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Mesmo shape que ConversationService#scheduleSlaCheck produz — reproduzido
  // aqui em vez de instanciar ConversationService inteiro (que puxaria
  // dependências de outro domínio sem relação com o que este teste verifica).
  function scheduleRealJob(conversationId: string, overrides: Partial<SlaCheckJobData> = {}) {
    return slaQueue.add(
      {
        conversationId,
        companyId: 'company-1',
        maxWaitSecs: SLA_SECS,
        queuedAt: new Date(),
        ...overrides,
      },
      { jobId: `sla-check:${conversationId}`, delay: SLA_SECS * 1000 },
    );
  }

  it('dispara sla.breached, marca slaBreachedAt e audita quando a conversa segue WAITING após o prazo real', async () => {
    const conversationId = 'conv-breach';

    mockPrisma.conversation.findUnique.mockResolvedValueOnce({
      id: conversationId,
      status: ConversationStatus.WAITING,
      slaBreachedAt: null,
      agentId: null,
      queueId: queueRef.id,
      contact,
      queue: queueRef,
    });
    mockPrisma.conversation.update.mockResolvedValueOnce({});
    mockPrisma.user.findMany.mockResolvedValueOnce([
      { id: 'supervisor-1' },
      { id: 'supervisor-2' },
    ]);

    const startedAt = Date.now();
    const job = await scheduleRealJob(conversationId);
    await job.finished(); // espera o delay real do Bull + o processamento
    const elapsedMs = Date.now() - startedAt;

    // Prova que o delay do Bull foi respeitado de verdade (não é chamada direta)
    expect(elapsedMs).toBeGreaterThanOrEqual(SLA_SECS * 1000 - 200);

    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: conversationId },
      data: { slaBreachedAt: expect.any(Date) },
    });
    expect(mockEvents.emitSlaBreached).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        conversationId,
        contact,
        queue: queueRef,
        maxWaitSecs: SLA_SECS,
      }),
    );
    expect(mockAuditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        action: 'sla.breached',
        entity: 'Conversation',
        entityId: conversationId,
      }),
    );
    // Notifica todo SUPERVISOR+ ativo retornado pela query (2 no mock acima)
    expect(mockNotification.create).toHaveBeenCalledTimes(2);
    expect(mockNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'supervisor-1', type: 'sla_breach' }),
    );
  });

  it('NÃO marca breach quando a conversa foi atribuída antes do prazo estourar', async () => {
    const conversationId = 'conv-assigned-in-time';

    // Simula: um agente assumiu a conversa nos SLA_SECS entre o agendamento
    // e o disparo do job — quando o processor reconsulta, o status já é OPEN.
    mockPrisma.conversation.findUnique.mockResolvedValueOnce({
      id: conversationId,
      status: ConversationStatus.OPEN,
      slaBreachedAt: null,
      agentId: 'agent-1',
      queueId: queueRef.id,
      contact,
      queue: queueRef,
    });

    const job = await scheduleRealJob(conversationId);
    await job.finished();

    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    expect(mockEvents.emitSlaBreached).not.toHaveBeenCalled();
    expect(mockAuditLog.record).not.toHaveBeenCalled();
    expect(mockNotification.create).not.toHaveBeenCalled();
  });

  it('idempotência: reprocessar o mesmo job não duplica breach/auditoria/notificação', async () => {
    const conversationId = 'conv-retry';
    const jobData: SlaCheckJobData = {
      conversationId,
      companyId: 'company-1',
      maxWaitSecs: SLA_SECS,
      queuedAt: new Date(),
    };

    // 1ª execução: ainda WAITING, sem slaBreachedAt → registra o breach
    mockPrisma.conversation.findUnique.mockResolvedValueOnce({
      id: conversationId,
      status: ConversationStatus.WAITING,
      slaBreachedAt: null,
      agentId: null,
      queueId: queueRef.id,
      contact,
      queue: queueRef,
    });
    mockPrisma.conversation.update.mockResolvedValueOnce({});
    mockPrisma.user.findMany.mockResolvedValueOnce([]);

    await processor.handleSlaCheck({ data: jobData } as any);
    expect(mockPrisma.conversation.update).toHaveBeenCalledTimes(1);

    // 2ª execução (ex.: Bull re-tentando por algum motivo): slaBreachedAt já
    // setado no banco — o processor deve identificar e não repetir nada.
    mockPrisma.conversation.findUnique.mockResolvedValueOnce({
      id: conversationId,
      status: ConversationStatus.WAITING,
      slaBreachedAt: new Date(),
      agentId: null,
      queueId: queueRef.id,
      contact,
      queue: queueRef,
    });

    await processor.handleSlaCheck({ data: jobData } as any);

    expect(mockPrisma.conversation.update).toHaveBeenCalledTimes(1); // continua 1, não 2
    expect(mockEvents.emitSlaBreached).toHaveBeenCalledTimes(1);
    expect(mockAuditLog.record).toHaveBeenCalledTimes(1);
  });
});
