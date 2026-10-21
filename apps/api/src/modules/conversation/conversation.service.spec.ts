import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { ConversationStatus, Prisma, Role } from '@prisma/client';
import { ConversationService } from './conversation.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

// Isolamento multi-tenant (B4-3): o risco é o mesmo dos outros services —
// assign()/updateStatus() delegam a validação de posse pra findOne() por
// baixo dos panos; o que garante isolamento é o findFirst com { id, companyId }
// nunca ser contornado por um update direto com só { id }.
const mockPrisma = {
  // M-04/B-61: fuso da empresa
  company: { findUnique: jest.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) },
  conversation: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findFirstOrThrow: jest.fn(),
    create: jest.fn(),
    aggregate: jest.fn(),
  },
  // B-98: sem fluxo de auto-atendimento ativo, o expediente vale sempre
  autoAttendanceFlow: { findUnique: jest.fn().mockResolvedValue(null) },
  user: { findFirst: jest.fn() },
  department: { findFirst: jest.fn() },
  queue: { findFirst: jest.fn(), findUnique: jest.fn() },
  // B-67: o "Pegar próxima" é SQL cru (FOR UPDATE SKIP LOCKED)
  $queryRaw: jest.fn(),
};

const mockEventsService = {
  emitConversationAssigned: jest.fn(),
  emitConversationUpdated: jest.fn(),
};

const mockSlaQueue = {
  add: jest.fn(),
  getJob: jest.fn().mockResolvedValue(null),
};

const mockAuditLog = { record: jest.fn() };

// Erro que o Prisma lança ao bater no índice único parcial de conversa ativa
// por contato (B-49).
const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
const mockNotificationService = { create: jest.fn() };

describe('ConversationService — isolamento multi-tenant', () => {
  let service: ConversationService;
  const companyA = 'company-a';
  const conversationOfCompanyB = 'conversa-da-empresa-b';
  const requesterId = 'user-a';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSlaQueue.getJob.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsService, useValue: mockEventsService },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: getQueueToken(QUEUE_NAMES.SLA_CHECK), useValue: mockSlaQueue },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
  });

  // B-60: só mensagem do cliente incrementa as não lidas
  describe('updateLastMessage', () => {
    it('com countAsUnread, atualiza prévia/horário e incrementa as não lidas', async () => {
      await service.updateLastMessage('conv-1', 'Áudio', { countAsUnread: true });

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: expect.objectContaining({ lastMessagePreview: 'Áudio', unreadCount: { increment: 1 } }),
      });
    });

    it('sem countAsUnread (agente, robô), não mexe nas não lidas', async () => {
      await service.updateLastMessage('conv-1', 'Saudação', { countAsUnread: false });

      const { data } = mockPrisma.conversation.update.mock.calls.at(-1)[0];
      expect(data.lastMessagePreview).toBe('Saudação');
      expect(data).not.toHaveProperty('unreadCount');
    });
  });

  describe('findAll', () => {
    it('sempre filtra por companyId', async () => {
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);
      mockPrisma.conversation.count.mockResolvedValueOnce(0);

      await service.findAll(companyA, {});

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: companyA }) }),
      );
    });
  });

  describe('getStats (B-2, ampliado no B-32)', () => {
    it('sempre filtra por companyId em todas as contagens', async () => {
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.aggregate.mockResolvedValueOnce({ _sum: { unreadCount: 0 } });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      await service.getStats(companyA, requesterId);

      // 7 contagens (totalActive, waiting, open, resolvedToday,
      // unreadConversations, myOpen, slaBreached) — todas com companyId
      mockPrisma.conversation.count.mock.calls.forEach((call) => {
        expect(call[0].where).toEqual(expect.objectContaining({ companyId: companyA }));
      });
      expect(mockPrisma.conversation.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: companyA }) }),
      );
      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: companyA }) }),
      );
    });

    it('retorna as contagens no shape esperado', async () => {
      mockPrisma.conversation.count
        .mockResolvedValueOnce(10) // totalActive
        .mockResolvedValueOnce(4)  // waiting
        .mockResolvedValueOnce(6)  // open
        .mockResolvedValueOnce(2)  // resolvedToday
        .mockResolvedValueOnce(3)  // unreadConversations
        .mockResolvedValueOnce(5)  // myOpen
        .mockResolvedValueOnce(1); // slaBreached
      mockPrisma.conversation.aggregate.mockResolvedValueOnce({ _sum: { unreadCount: 15 } });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      const result = await service.getStats(companyA, requesterId);

      expect(result).toEqual({
        totalActive: 10,
        waiting: 4,
        open: 6,
        resolvedToday: 2,
        unreadCount: 15,
        unreadConversations: 3,
        myOpen: 5,
        slaBreached: 1,
        awaitingReply: 0,
        myAwaitingReply: 0,
      });
    });

    it('nunca conta conversas CLOSED nos totais ativos', async () => {
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.aggregate.mockResolvedValueOnce({ _sum: { unreadCount: null } });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      await service.getStats(companyA, requesterId);

      const totalActiveCall = mockPrisma.conversation.count.mock.calls[0][0];
      expect(totalActiveCall.where.status).toEqual({ not: ConversationStatus.CLOSED });
    });

    it('unreadCount vira 0 (não null) quando não há conversas', async () => {
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.aggregate.mockResolvedValueOnce({ _sum: { unreadCount: null } });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      const result = await service.getStats(companyA, requesterId);

      expect(result.unreadCount).toBe(0);
    });

    it('myOpen filtra OPEN atribuído só ao requisitante (via JWT, não parâmetro livre)', async () => {
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.aggregate.mockResolvedValueOnce({ _sum: { unreadCount: 0 } });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      await service.getStats(companyA, requesterId);

      const myOpenCall = mockPrisma.conversation.count.mock.calls[5][0];
      expect(myOpenCall.where).toEqual(
        expect.objectContaining({ status: ConversationStatus.OPEN, agentId: requesterId }),
      );
    });

    it('slaBreached conta conversas ativas com slaBreachedAt setado', async () => {
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.aggregate.mockResolvedValueOnce({ _sum: { unreadCount: 0 } });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      await service.getStats(companyA, requesterId);

      const slaCall = mockPrisma.conversation.count.mock.calls[6][0];
      expect(slaCall.where.slaBreachedAt).toEqual({ not: null });
    });

    it('awaitingReply/myAwaitingReply contam só conversas OPEN cuja última mensagem é do cliente', async () => {
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.aggregate.mockResolvedValueOnce({ _sum: { unreadCount: 0 } });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([
        { agentId: requesterId, messages: [{ senderType: 'CLIENT' }] }, // minha, aguardando
        { agentId: 'outro-agente', messages: [{ senderType: 'CLIENT' }] }, // de outro, aguardando
        { agentId: requesterId, messages: [{ senderType: 'AGENT' }] }, // minha, já respondida
        { agentId: requesterId, messages: [] }, // sem mensagem nenhuma ainda
      ]);

      const result = await service.getStats(companyA, requesterId);

      expect(result.awaitingReply).toBe(2);
      expect(result.myAwaitingReply).toBe(1);
    });
  });

  describe('findOne', () => {
    it('não encontra uma conversa que pertence a outra empresa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

      await expect(service.findOne(companyA, conversationOfCompanyB)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: conversationOfCompanyB, companyId: companyA } }),
      );
    });
  });

  // B-66 (ADR-0019, regras 2, 3 e 10): pegar da fila — quem chegar primeiro
  describe('attend', () => {
    const waiting = {
      id: 'conv-1',
      waitingSince: new Date(Date.now() - 90_000),
      waitSlaDueAt: new Date(Date.now() + 210_000),
      slaBreachedAt: null,
      queue: { maxWaitSecs: 300 },
    };
    const attended = {
      id: 'conv-1',
      status: ConversationStatus.OPEN,
      waitingSince: waiting.waitingSince,
      agent: { id: requesterId, name: 'Ana', avatarUrl: null },
      department: { id: 'dep-1', name: 'Receitas' },
    };

    it('fica com a conversa numa troca condicional, cancela o SLA, audita o ciclo e avisa todos', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE' });
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(waiting);
      mockPrisma.conversation.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.conversation.findFirstOrThrow.mockResolvedValueOnce(attended);

      const result = await service.attend(companyA, 'conv-1', requesterId);

      expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', companyId: companyA, status: ConversationStatus.WAITING, agentId: null },
        data: { status: ConversationStatus.OPEN, agentId: requesterId, slaBreachedAt: null, waitSlaDueAt: null },
      });
      expect(mockSlaQueue.getJob).toHaveBeenCalledWith('sla-check:conv-1');
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'conversation.attended',
          userId: requesterId,
          after: expect.objectContaining({ agentId: requesterId, maxWaitSecs: 300, breached: false }),
        }),
      );
      expect(mockAuditLog.record.mock.calls[0][0].after.waitSeconds).toBeGreaterThanOrEqual(90);
      expect(mockEventsService.emitConversationAssigned).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1', agentId: requesterId, status: ConversationStatus.OPEN }),
      );
      expect(result).toEqual(attended);
    });

    it('Offline: 409 "Fique Online para atender", sem tocar na conversa', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'OFFLINE' });

      await expect(service.attend(companyA, 'conv-1', requesterId)).rejects.toThrow(
        new ConflictException('Fique Online para atender'),
      );
      expect(mockPrisma.conversation.updateMany).not.toHaveBeenCalled();
    });

    it('chegou depois: 409 com o nome de quem está atendendo, sem auditoria nem evento', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE' });
      mockPrisma.conversation.findFirst
        .mockResolvedValueOnce(waiting)
        .mockResolvedValueOnce({ status: ConversationStatus.OPEN, agent: { name: 'Bruno' } });
      mockPrisma.conversation.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.attend(companyA, 'conv-1', requesterId)).rejects.toThrow(
        new ConflictException('Bruno já está atendendo'),
      );
      expect(mockAuditLog.record).not.toHaveBeenCalled();
      expect(mockEventsService.emitConversationAssigned).not.toHaveBeenCalled();
    });

    it('encerrada antes de atender: 400', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE' });
      mockPrisma.conversation.findFirst
        .mockResolvedValueOnce(waiting)
        .mockResolvedValueOnce({ status: ConversationStatus.CLOSED, agent: null });
      mockPrisma.conversation.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.attend(companyA, 'conv-1', requesterId)).rejects.toThrow(BadRequestException);
    });

    it('conversa de outra empresa: 404 sem tentar a troca', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE' });
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

      await expect(service.attend(companyA, conversationOfCompanyB, requesterId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.conversation.updateMany).not.toHaveBeenCalled();
    });
  });

  // B-67 (ADR-0019, regra 5): a mais antiga dos setores de quem pede, numa
  // instrução só — a concorrência real fica no e2e (queue-next)
  describe('attendNext — pegar próxima', () => {
    const online = { availability: 'ONLINE', departments: [{ id: 'dep-1' }, { id: 'dep-2' }] };
    const picked = (over: Record<string, unknown> = {}) => ({
      id: 'conv-1',
      waitingSince: new Date(Date.now() - 120_000),
      waitSlaDueAt: new Date(Date.now() + 180_000),
      slaBreachedAt: null,
      maxWaitSecs: 300,
      ...over,
    });
    const attended = {
      id: 'conv-1',
      status: ConversationStatus.OPEN,
      agent: { id: requesterId, name: 'Ana', avatarUrl: null },
      department: { id: 'dep-1', name: 'Receitas' },
    };
    // Tagged template: [partes do SQL, ...valores]
    const rawCall = () => {
      const [strings, ...values] = mockPrisma.$queryRaw.mock.calls[0];
      return { sql: (strings as string[]).join('?'), values };
    };

    it('atende a mais antiga dos setores de quem pede, cancela o SLA, audita o ciclo e avisa todos', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(online);
      mockPrisma.$queryRaw.mockResolvedValueOnce([picked()]);
      mockPrisma.conversation.findFirstOrThrow.mockResolvedValueOnce(attended);

      const result = await service.attendNext(companyA, requesterId);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: requesterId, companyId: companyA } }),
      );
      const { sql, values } = rawCall();
      expect(sql).toContain('FOR UPDATE SKIP LOCKED');
      expect(sql).toContain('ORDER BY COALESCE("waitingSince", "createdAt")');
      expect(values).toEqual([companyA, ['dep-1', 'dep-2'], requesterId]);
      expect(mockSlaQueue.getJob).toHaveBeenCalledWith('sla-check:conv-1');
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'conversation.attended',
          userId: requesterId,
          entityId: 'conv-1',
          after: expect.objectContaining({ agentId: requesterId, maxWaitSecs: 300, breached: false }),
        }),
      );
      expect(mockAuditLog.record.mock.calls[0][0].after.waitSeconds).toBeGreaterThanOrEqual(120);
      expect(mockEventsService.emitConversationAssigned).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1', agentId: requesterId, status: ConversationStatus.OPEN }),
      );
      expect(result).toEqual(attended);
    });

    it('pegou depois do prazo: a auditoria registra o estouro', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(online);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        picked({ waitSlaDueAt: new Date(Date.now() - 1000), slaBreachedAt: new Date() }),
      ]);
      mockPrisma.conversation.findFirstOrThrow.mockResolvedValueOnce(attended);

      await service.attendNext(companyA, requesterId);

      expect(mockAuditLog.record.mock.calls[0][0].after.breached).toBe(true);
    });

    it('Offline: 409 "Fique Online para atender", sem consultar a fila', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ ...online, availability: 'OFFLINE' });

      await expect(service.attendNext(companyA, requesterId)).rejects.toThrow(
        new ConflictException('Fique Online para atender'),
      );
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('quem não é de nenhum setor não tem fila: null, sem consultar', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ availability: 'ONLINE', departments: [] });

      await expect(service.attendNext(companyA, requesterId)).resolves.toBeNull();
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('nada esperando nos setores: null, sem auditoria nem evento', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(online);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await expect(service.attendNext(companyA, requesterId)).resolves.toBeNull();
      expect(mockAuditLog.record).not.toHaveBeenCalled();
      expect(mockEventsService.emitConversationAssigned).not.toHaveBeenCalled();
    });

    it('usuário de outra empresa: 404', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(service.attendNext(companyA, 'user-b')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  // B-66 (ADR-0019, regra 4): transferir — o atendente só as dele; supervisor
  // e admin transferem qualquer uma e puxam para si
  describe('assign — transferência', () => {
    const supervisor = { id: 'sup-1', role: Role.SUPERVISOR };
    const ana = { id: 'ana', role: Role.AGENT };
    const conv = (over: Record<string, unknown> = {}) => ({
      id: 'conv-1',
      status: ConversationStatus.OPEN,
      contact: { name: 'Fulano' },
      agent: { id: 'ana', name: 'Ana' },
      department: { id: 'dep-1', name: 'Receitas' },
      queue: { id: 'q-1', maxWaitSecs: 300 },
      waitingSince: null,
      waitSlaDueAt: null,
      slaBreachedAt: null,
      ...over,
    });
    const user = (id: string, name: string, availability = 'ONLINE') => ({ id, name, availability });
    const result = (
      agent: { id: string; name: string } | null,
      status: ConversationStatus = ConversationStatus.OPEN,
    ) => ({
      id: 'conv-1', status, waitingSince: null, agent, department: { id: 'dep-1', name: 'Receitas' },
    });

    it('nunca toca numa conversa de outra empresa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null); // findOne interno não acha

      await expect(
        service.assign(companyA, conversationOfCompanyB, { agentId: 'agente-hostil' }, supervisor),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.conversation.updateMany).not.toHaveBeenCalled();
      expect(mockAuditLog.record).not.toHaveBeenCalled();
    });

    // B-73 (M-07): atribuir punha em OPEN qualquer conversa, inclusive
    // encerrada — contornava a regra de que CLOSED não reabre.
    it('recusa (400) atribuir uma conversa encerrada, sem alterar nada', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(conv({ status: ConversationStatus.CLOSED }));

      await expect(service.assign(companyA, 'conv-1', { agentId: 'bruno' }, supervisor)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.conversation.updateMany).not.toHaveBeenCalled();
      expect(mockAuditLog.record).not.toHaveBeenCalled();
    });

    it('atendente transfere a conversa dele para um colega Online: troca condicional, auditoria e notificação', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(conv());
      mockPrisma.user.findFirst.mockResolvedValueOnce(user('bruno', 'Bruno'));
      mockPrisma.conversation.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.conversation.findFirstOrThrow.mockResolvedValueOnce(result({ id: 'bruno', name: 'Bruno' }));

      await service.assign(companyA, 'conv-1', { agentId: 'bruno' }, ana);

      expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', companyId: companyA, status: ConversationStatus.OPEN, agentId: 'ana' },
        data: expect.objectContaining({ agentId: 'bruno', status: ConversationStatus.OPEN }),
      });
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'conversation.assigned',
          before: { agentId: 'ana' },
          after: { agentId: 'bruno' },
        }),
      );
      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'bruno', type: 'conversation_assigned' }),
      );
    });

    it('atendente não transfere a conversa de um colega nem a puxa para si (403)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(conv({ agent: { id: 'bruno', name: 'Bruno' } }));

      await expect(service.assign(companyA, 'conv-1', { agentId: 'ana' }, ana)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.conversation.updateMany).not.toHaveBeenCalled();
    });

    it('atendente não tira conversa da fila pelo assign (403 — o caminho é o Atender)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(conv({ status: ConversationStatus.WAITING, agent: null }));

      await expect(service.assign(companyA, 'conv-1', { agentId: 'ana' }, ana)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('supervisor puxa para si a conversa de um atendente, sem notificar a si mesmo', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(conv());
      mockPrisma.user.findFirst.mockResolvedValueOnce(user('sup-1', 'Sueli'));
      mockPrisma.conversation.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.conversation.findFirstOrThrow.mockResolvedValueOnce(result({ id: 'sup-1', name: 'Sueli' }));

      await service.assign(companyA, 'conv-1', { agentId: 'sup-1' }, supervisor);

      expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ agentId: 'sup-1' }) }),
      );
      expect(mockNotificationService.create).not.toHaveBeenCalled();
    });

    it('destino Offline: 409 com o nome, sem alterar nada', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(conv());
      mockPrisma.user.findFirst.mockResolvedValueOnce(user('bruno', 'Bruno', 'OFFLINE'));

      await expect(service.assign(companyA, 'conv-1', { agentId: 'bruno' }, ana)).rejects.toThrow(
        new ConflictException('Bruno está Offline'),
      );
      expect(mockPrisma.conversation.updateMany).not.toHaveBeenCalled();
    });

    it('supervisor Offline puxando para si: 409 "Fique Online para atender"', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(conv());
      mockPrisma.user.findFirst.mockResolvedValueOnce(user('sup-1', 'Sueli', 'OFFLINE'));

      await expect(service.assign(companyA, 'conv-1', { agentId: 'sup-1' }, supervisor)).rejects.toThrow(
        new ConflictException('Fique Online para atender'),
      );
    });

    it('sem pessoa: volta para a fila do setor com espera e SLA novos', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(conv());
      mockPrisma.queue.findFirst.mockResolvedValueOnce({ id: 'q-1', maxWaitSecs: 300 });
      mockPrisma.conversation.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.conversation.findFirstOrThrow.mockResolvedValueOnce(result(null, ConversationStatus.WAITING));

      await service.assign(companyA, 'conv-1', {}, ana);

      expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', companyId: companyA, status: ConversationStatus.OPEN, agentId: 'ana' },
        data: {
          agentId: null,
          departmentId: 'dep-1',
          queueId: 'q-1',
          status: ConversationStatus.WAITING,
          waitingSince: expect.any(Date),
          waitSlaDueAt: expect.any(Date),
          slaBreachedAt: null,
        },
      });
      expect(mockSlaQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1', maxWaitSecs: 300 }),
        expect.objectContaining({ jobId: 'sla-check:conv-1' }),
      );
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'conversation.assigned', after: { agentId: null } }),
      );
      expect(mockEventsService.emitConversationAssigned).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: null, status: ConversationStatus.WAITING }),
      );
    });

    it('supervisor tira da fila para um atendente: fecha o ciclo da espera', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(
        conv({ status: ConversationStatus.WAITING, agent: null, waitingSince: new Date(Date.now() - 60_000) }),
      );
      mockPrisma.user.findFirst.mockResolvedValueOnce(user('ana', 'Ana'));
      mockPrisma.conversation.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.conversation.findFirstOrThrow.mockResolvedValueOnce(result({ id: 'ana', name: 'Ana' }));

      await service.assign(companyA, 'conv-1', { agentId: 'ana' }, supervisor);

      expect(mockSlaQueue.getJob).toHaveBeenCalledWith('sla-check:conv-1');
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'conversation.attended',
          userId: 'sup-1',
          after: expect.objectContaining({ agentId: 'ana' }),
        }),
      );
    });

    it('a conversa mudou no meio (alguém atendeu ou transferiu antes): 409, sem auditoria', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(conv());
      mockPrisma.user.findFirst.mockResolvedValueOnce(user('bruno', 'Bruno'));
      mockPrisma.conversation.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.assign(companyA, 'conv-1', { agentId: 'bruno' }, ana)).rejects.toThrow(
        ConflictException,
      );
      expect(mockAuditLog.record).not.toHaveBeenCalled();
    });

    it('responde 409 quando reativar a conversa colide com outra conversa ativa do contato (B-73)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(conv({ status: ConversationStatus.RESOLVED, agent: null }));
      mockPrisma.user.findFirst.mockResolvedValueOnce(user('agent-1', 'Agente'));
      mockPrisma.conversation.updateMany.mockRejectedValueOnce(p2002());

      await expect(service.assign(companyA, 'conv-1', { agentId: 'agent-1' }, supervisor)).rejects.toThrow(
        new ConflictException('Este contato já tem outra conversa ativa'),
      );
      expect(mockAuditLog.record).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('nunca chama conversation.update para uma conversa de outra empresa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null); // findOne interno não acha

      await expect(
        service.updateStatus(companyA, conversationOfCompanyB, {
          status: ConversationStatus.CLOSED,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    });

    // B-32: motivo do encerramento (RESOLVED/UNRESOLVED), informado pelo
    // atendente ao fechar — vira dado real pro dashboard/relatórios.
    it('persiste o motivo do encerramento (resolution) ao fechar a conversa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.OPEN,
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.CLOSED,
        companyId: companyA,
        resolution: 'RESOLVED',
      });

      await service.updateStatus(companyA, 'conv-1', {
        status: ConversationStatus.CLOSED,
        resolution: 'RESOLVED' as any,
      });

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ConversationStatus.CLOSED, resolution: 'RESOLVED' }),
        }),
      );
    });

    it('responde 409 ao reabrir uma RESOLVED quando o contato já tem outra conversa ativa (B-73)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.RESOLVED,
      });
      mockPrisma.conversation.update.mockRejectedValueOnce(p2002());

      await expect(
        service.updateStatus(companyA, 'conv-1', { status: ConversationStatus.WAITING }),
      ).rejects.toThrow(ConflictException);
    });

    // B-98 (L-10): sem zerar, uma 2ª espera da mesma conversa nunca era
    // alertada. B-66: voltar para a fila abre um ciclo novo e limpo.
    it('zera a marca de SLA ao sair da espera; ao voltar, abre um ciclo novo sem atendente', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', status: ConversationStatus.WAITING });
      mockPrisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1', status: ConversationStatus.OPEN, companyId: companyA });
      await service.updateStatus(companyA, 'conv-1', { status: ConversationStatus.OPEN });
      expect(mockPrisma.conversation.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ slaBreachedAt: null, waitSlaDueAt: null }),
      );

      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', status: ConversationStatus.RESOLVED });
      mockPrisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1', status: ConversationStatus.WAITING, companyId: companyA });
      await service.updateStatus(companyA, 'conv-1', { status: ConversationStatus.WAITING });
      expect(mockPrisma.conversation.update.mock.calls[1][0].data).toEqual(
        expect.objectContaining({
          agentId: null,
          waitingSince: expect.any(Date),
          waitSlaDueAt: null, // sem fila, sem prazo
          slaBreachedAt: null,
        }),
      );
    });

    it('não grava resolution em transições que não são para CLOSED', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.WAITING,
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.OPEN,
        companyId: companyA,
      });

      await service.updateStatus(companyA, 'conv-1', { status: ConversationStatus.OPEN });

      const call = mockPrisma.conversation.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('resolution');
    });

    // B-36: cancelar exige justificativa do atendente (validada no DTO,
    // aqui só confirma que o service persiste o que recebeu).
    it('persiste resolutionNote ao cancelar (resolution=CANCELLED)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.OPEN,
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({
        id: 'conv-1',
        status: ConversationStatus.CLOSED,
        companyId: companyA,
        resolution: 'CANCELLED',
        resolutionNote: 'Contato pediu pra falar depois, não retornou.',
      });

      await service.updateStatus(companyA, 'conv-1', {
        status: ConversationStatus.CLOSED,
        resolution: 'CANCELLED' as any,
        resolutionNote: 'Contato pediu pra falar depois, não retornou.',
      });

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ConversationStatus.CLOSED,
            resolution: 'CANCELLED',
            resolutionNote: 'Contato pediu pra falar depois, não retornou.',
          }),
        }),
      );
    });

    // B-66 (regra 4): sem isto, devolver a conversa de um colega para a fila e
    // atendê-la era um atalho para puxar conversa
    describe('permissões do atendente comum', () => {
      const ana = { id: 'ana', role: Role.AGENT };

      it('não muda o status da conversa de um colega (403)', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce({
          id: 'conv-1', status: ConversationStatus.OPEN, agent: { id: 'bruno' },
        });

        await expect(
          service.updateStatus(companyA, 'conv-1', { status: ConversationStatus.WAITING }, ana),
        ).rejects.toThrow(ForbiddenException);
        expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
      });

      it('encerra uma conversa da fila ("Encerrar sem atender", B-36)', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce({
          id: 'conv-1', status: ConversationStatus.WAITING, agent: null,
        });
        mockPrisma.conversation.update.mockResolvedValueOnce({
          id: 'conv-1', status: ConversationStatus.CLOSED, companyId: companyA,
        });

        await service.updateStatus(
          companyA, 'conv-1',
          { status: ConversationStatus.CLOSED, resolution: 'CANCELLED' as any, resolutionNote: 'Spam' },
          ana,
        );
        expect(mockPrisma.conversation.update).toHaveBeenCalled();
      });

      it('muda o status das conversas dele', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce({
          id: 'conv-1', status: ConversationStatus.OPEN, agent: { id: 'ana' },
        });
        mockPrisma.conversation.update.mockResolvedValueOnce({
          id: 'conv-1', status: ConversationStatus.CLOSED, companyId: companyA,
        });

        await service.updateStatus(
          companyA, 'conv-1', { status: ConversationStatus.CLOSED, resolution: 'RESOLVED' as any }, ana,
        );
        expect(mockPrisma.conversation.update).toHaveBeenCalled();
      });
    });
  });

  describe('markAsRead', () => {
    it('nunca chama conversation.update para uma conversa de outra empresa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null); // findOne interno não acha

      await expect(service.markAsRead(companyA, conversationOfCompanyB)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    });
  });
});
