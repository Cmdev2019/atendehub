import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Availability, ConversationStatus, Channel, SenderType, Prisma } from '@prisma/client';
import { ScopeUser, seesWholeCompany } from '../../shared/conversation-scope/conversation-scope.service';
import { loadCompanyTimeZone, resolveTimeZone, startOfDayInZone } from '../../shared/time/company-time';
import { addBusinessTime, BusinessHours } from '../../shared/time/business-hours';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { isUniqueConstraintViolation } from '../../shared/prisma/prisma-errors.util';
import { formatStructuredLog } from '../../shared/logging/structured-log.util';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';
import { EventsService } from '../events/events.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';
import { SlaCheckJobData } from '../sla/sla-check.processor';

// B-73 (M-07): o índice único parcial do B-49 permite uma só conversa ativa
// (WAITING/OPEN) por contato. Reativar uma RESOLVED quando o contato já abriu
// outra batia nele e respondia 500; agora é um 409 com o motivo.
function rethrowActiveConversationConflict(err: unknown): never {
  if (isUniqueConstraintViolation(err)) {
    throw new ConflictException('Este contato já tem outra conversa ativa');
  }
  throw err;
}

// Campos padrão para listagem
const CONVERSATION_LIST_SELECT = {
  id: true,
  status: true,
  channel: true,
  unreadCount: true,
  lastMessageAt: true,
  lastMessagePreview: true,
  createdAt: true,
  contact: {
    select: { id: true, name: true, phone: true, avatarUrl: true },
  },
  agent: {
    select: { id: true, name: true, avatarUrl: true },
  },
  department: {
    select: { id: true, name: true, color: true },
  },
  whatsapp: {
    select: { id: true, name: true, phone: true },
  },
  tags: {
    select: { id: true, name: true, color: true },
  },
  _count: {
    select: { messages: true },
  },
  // B-66 (ADR-0019, regra 15): início da espera atual e prazo do SLA dela —
  // o "tempo na fila" deixa de partir do createdAt
  waitingSince: true,
  waitSlaDueAt: true,
  slaBreachedAt: true,
};

// Resposta de atender/transferir (B-66) — sem campos internos
const ASSIGNMENT_SELECT = {
  id: true,
  status: true,
  waitingSince: true,
  agent: { select: { id: true, name: true, avatarUrl: true } },
  department: { select: { id: true, name: true } },
};

// Ciclo de espera (ADR-0019, regras 13 a 15): entrar ou voltar na fila abre
// um ciclo novo. `waitSlaDueAt` null = sem SLA (sem fila, conversa aberta pela
// empresa ou expediente que nunca abre).
interface WaitCycle {
  waitingSince: Date;
  waitSlaDueAt: Date | null;
  slaBreachedAt: null;
}

// Relógio dos SLAs (B-112, regra 17): o expediente e o fuso em que ele vale.
// `hours` null = sem horário configurado, o relógio anda o dia todo.
interface SlaClock {
  hours: BusinessHours | null;
  timeZone: string;
}

// O que é preciso da conversa para fechar o ciclo ao sair da fila
interface WaitingConversation {
  id: string;
  waitingSince: Date | null;
  waitSlaDueAt: Date | null;
  slaBreachedAt: Date | null;
  queue: { maxWaitSecs: number } | null;
}

// Linha que o "Pegar próxima" (B-67) devolve do SQL cru: a conversa já
// atendida, com o prazo e a marca de violação de antes da troca
interface PickedConversation {
  id: string;
  waitingSince: Date | null;
  waitSlaDueAt: Date | null;
  slaBreachedAt: Date | null;
  maxWaitSecs: number | null;
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly auditLog: AuditLogService,
    private readonly notificationService: NotificationService,
    @InjectQueue(QUEUE_NAMES.SLA_CHECK) private readonly slaQueue: Queue<SlaCheckJobData>,
  ) {}

  // B-112 (ADR-0019, regra 17): o relógio dos SLAs só anda no expediente do
  // fluxo de auto-atendimento ativo, no fuso da empresa. Antes (B-98), quem
  // chegava fora do expediente ficava sem SLA nenhum, nem depois da abertura.
  // Sem fluxo ativo ou sem horário configurado, o relógio anda o dia todo.
  private async loadSlaClock(companyId: string): Promise<SlaClock> {
    const flow = await this.prisma.autoAttendanceFlow.findUnique({
      where: { companyId },
      select: { isActive: true, businessHours: true, company: { select: { timezone: true } } },
    });
    return {
      hours: flow?.isActive ? ((flow.businessHours as BusinessHours | null) ?? null) : null,
      timeZone: resolveTimeZone(flow?.company?.timezone),
    };
  }

  // ── SLA: agenda/cancela a checagem de violação (Fase B2) ───────────────────
  // jobId determinístico por conversa (B2-4): agendar sempre remove um job
  // pendente anterior da mesma conversa antes de criar o novo, então nunca
  // existe mais de uma checagem pendente por conversa — cobre tanto chamadas
  // duplicadas quanto reentrada em WAITING (ex.: reaberta depois de fechada)
  // com um temporizador limpo em vez do prazo antigo já vencido.
  private slaJobId(conversationId: string) {
    return `sla-check:${conversationId}`;
  }

  // B-66: o job vale para o prazo gravado no ciclo (`waitSlaDueAt`). Ciclo
  // sem prazo cancela o job pendente de um ciclo anterior.
  private async syncWaitSla(
    conversationId: string,
    companyId: string,
    cycle: WaitCycle,
    maxWaitSecs?: number,
  ) {
    await this.cancelSlaCheck(conversationId);
    if (!cycle.waitSlaDueAt || !maxWaitSecs) return;
    await this.slaQueue.add(
      { conversationId, companyId, maxWaitSecs, queuedAt: cycle.waitingSince },
      {
        jobId: this.slaJobId(conversationId),
        delay: Math.max(0, cycle.waitSlaDueAt.getTime() - Date.now()),
      },
    );
  }

  // `clock` null = ciclo sem SLA (sem fila, ou conversa aberta pela empresa)
  private waitCycleData(
    queue: { maxWaitSecs: number } | null,
    clock: SlaClock | null,
    now = new Date(),
  ): WaitCycle {
    return {
      waitingSince: now,
      waitSlaDueAt:
        queue && clock ? addBusinessTime(now, queue.maxWaitSecs, clock.hours, clock.timeZone) : null,
      slaBreachedAt: null,
    };
  }

  // Fila ativa do setor — a mais antiga, se houver mais de uma (B1-2)
  private activeQueueOf(companyId: string, departmentId: string) {
    return this.prisma.queue.findFirst({
      where: { companyId, departmentId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, maxWaitSecs: true, greetingMsg: true },
    });
  }

  private async cancelSlaCheck(conversationId: string) {
    const job = await this.slaQueue.getJob(this.slaJobId(conversationId));
    if (!job) return;
    // Job já em execução não pode ser removido (Bull lança erro) — sem problema,
    // o processor reconsulta o status e não faz nada se não estiver mais WAITING
    await job.remove().catch(() => undefined);
  }

  // ── Listar conversas com filtros e paginação ──────────────────────────────
  // C-10/B-40: `scope` (ConversationScopeService) restringe a listagem ao que
  // o usuário pode ver — `{}` para quem vê a empresa toda.
  async findAll(companyId: string, query: ListConversationsDto, scope: Prisma.ConversationWhereInput = {}) {
    const { status, channel, agentId, departmentId, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      companyId,
      // Sem filtro explícito, a fila mostra só tickets ativos — sem isso,
      // toda conversa encerrada permanece visível na Caixa de Entrada para
      // sempre. Quem quiser ver encerradas pede status=CLOSED explicitamente.
      ...(status ? { status } : { status: { not: ConversationStatus.CLOSED } }),
      ...(channel && { channel }),
      ...(agentId && { agentId }),
      ...(departmentId && { departmentId }),
      AND: [scope],
      ...(search && {
        contact: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        select: CONVERSATION_LIST_SELECT,
        orderBy: [
          { lastMessageAt: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Métricas agregadas (B-2, ampliado no B-32) — contagens reais da ────────
  // empresa inteira, independentes de paginação (a listagem em findAll() só
  // reflete a página carregada no front). `userId` é sempre o requisitante
  // (do JWT) — "minhas"/"minhas sem resposta" são sempre sobre quem chamou,
  // nunca um parâmetro livre (evitaria vazar contagem de outro agente).
  async getStats(companyId: string, userId: string, scope: Prisma.ConversationWhereInput = {}) {
    // "Hoje" no fuso da empresa (M-04/B-61) — no fuso do servidor (UTC), o
    // dia virava às 21h no Brasil
    const startOfToday = startOfDayInZone(new Date(), await loadCompanyTimeZone(this.prisma, companyId));

    // C-10/B-40: os números do atendente são só do que ele pode ver
    const activeWhere = { companyId, status: { not: ConversationStatus.CLOSED }, AND: [scope] };

    const [
      totalActive,
      waiting,
      open,
      resolvedToday,
      unreadAgg,
      unreadConversations,
      myOpen,
      slaBreached,
      openConversations,
    ] = await Promise.all([
      this.prisma.conversation.count({ where: activeWhere }),
      this.prisma.conversation.count({
        where: { ...activeWhere, status: ConversationStatus.WAITING },
      }),
      this.prisma.conversation.count({
        where: { ...activeWhere, status: ConversationStatus.OPEN },
      }),
      this.prisma.conversation.count({
        where: { companyId, resolvedAt: { gte: startOfToday }, AND: [scope] },
      }),
      this.prisma.conversation.aggregate({
        where: activeWhere,
        _sum: { unreadCount: true },
      }),
      this.prisma.conversation.count({
        where: { ...activeWhere, unreadCount: { gt: 0 } },
      }),
      this.prisma.conversation.count({
        where: { ...activeWhere, status: ConversationStatus.OPEN, agentId: userId },
      }),
      this.prisma.conversation.count({
        where: { ...activeWhere, slaBreachedAt: { not: null } },
      }),
      // "Sem resposta" (B-32) não é um campo direto — precisa saber quem
      // mandou a ÚLTIMA mensagem de cada conversa em atendimento. `take: 1`
      // por conversa (via nested select) evita N+1 de verdade: o Postgres
      // resolve isso como um lateral join, uma única query.
      this.prisma.conversation.findMany({
        where: { ...activeWhere, status: ConversationStatus.OPEN },
        select: {
          agentId: true,
          messages: { take: 1, orderBy: { sentAt: 'desc' }, select: { senderType: true } },
        },
      }),
    ]);

    const awaitingReplyConversations = openConversations.filter(
      (conv) => conv.messages[0]?.senderType === SenderType.CLIENT,
    );

    return {
      totalActive,
      waiting,
      open,
      resolvedToday,
      unreadCount: unreadAgg._sum.unreadCount ?? 0,
      unreadConversations,
      myOpen,
      slaBreached,
      awaitingReply: awaitingReplyConversations.length,
      myAwaitingReply: awaitingReplyConversations.filter((conv) => conv.agentId === userId).length,
    };
  }

  // ── Buscar conversa por ID com detalhes completos ─────────────────────────
  async findOne(companyId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        channel: true,
        unreadCount: true,
        lastMessageAt: true,
        lastMessagePreview: true,
        slaBreachedAt: true,
        waitingSince: true, // B-66
        waitSlaDueAt: true, // B-66
        resolvedAt: true,
        closedAt: true,
        resolution: true,
        resolutionNote: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        contact: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatarUrl: true,
            isBlocked: true,
          },
        },
        agent: {
          select: { id: true, name: true, email: true, avatarUrl: true, role: true },
        },
        department: {
          select: { id: true, name: true, color: true },
        },
        queue: {
          select: { id: true, name: true, strategy: true, maxWaitSecs: true },
        },
        whatsapp: {
          select: { id: true, name: true, phone: true, profileName: true },
        },
        tags: {
          select: { id: true, name: true, color: true },
        },
        notes: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { messages: true } },
      },
    });

    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    return conversation;
  }

  // ── Atender: pegar a conversa da fila para si (B-66 / ADR-0019) ──────────
  // Regras 2, 3 e 10: só quem está Online, e quem chegar primeiro fica com a
  // conversa. A passagem WAITING → OPEN é uma atualização condicional — com
  // dois pedidos ao mesmo tempo, o banco deixa passar um só (ADR-0004). Quem
  // perdeu recebe 409 com o nome de quem está atendendo. É também o caminho
  // da 1ª resposta de ADMIN/SUPERVISOR numa conversa em espera
  // (SendMessageService), antes de a mensagem sair.
  async attend(companyId: string, conversationId: string, requesterId: string) {
    const requester = await this.prisma.user.findFirst({
      where: { id: requesterId, companyId },
      select: { availability: true },
    });
    if (!requester) throw new NotFoundException('Usuário não encontrado');
    if (requester.availability !== Availability.ONLINE) {
      throw new ConflictException('Fique Online para atender');
    }

    const before = await this.prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
      select: {
        id: true,
        waitingSince: true,
        waitSlaDueAt: true,
        slaBreachedAt: true,
        queue: { select: { maxWaitSecs: true } },
      },
    });
    if (!before) throw new NotFoundException('Conversa não encontrada');

    const now = new Date();
    const { count } = await this.prisma.conversation.updateMany({
      where: { id: conversationId, companyId, status: ConversationStatus.WAITING, agentId: null },
      data: {
        status: ConversationStatus.OPEN,
        agentId: requesterId,
        // B-98 (L-10): saiu da espera, a marca de SLA violado não vale mais
        slaBreachedAt: null,
        waitSlaDueAt: null,
      },
    });
    if (count === 0) throw await this.notInQueueError(companyId, conversationId);

    await this.closeWaitCycle(companyId, before, requesterId, requesterId, now);
    return this.emitAssignment(companyId, conversationId);
  }

  // ── Pegar próxima (B-67 / ADR-0019, regra 5) ─────────────────────────────
  // Atende a conversa que espera há mais tempo nos setores de quem pede —
  // supervisor e admin também, pelos setores de que são membros. Escolher e
  // atender é uma instrução só no Postgres: o `FOR UPDATE SKIP LOCKED` pula a
  // conversa que outro pedido acabou de travar, então pedidos simultâneos
  // recebem conversas diferentes, e o Atender não pega a mesma (ADR-0004).
  // Conversa sem setor fica de fora — continua no botão Atender. Nada
  // esperando: null (o controller responde 204).
  async attendNext(companyId: string, requesterId: string) {
    const requester = await this.prisma.user.findFirst({
      where: { id: requesterId, companyId },
      select: { availability: true, departments: { select: { id: true } } },
    });
    if (!requester) throw new NotFoundException('Usuário não encontrado');
    if (requester.availability !== Availability.ONLINE) {
      throw new ConflictException('Fique Online para atender');
    }
    const departmentIds = requester.departments.map((d) => d.id);
    if (departmentIds.length === 0) return null;

    // SQL cru porque o Prisma não tem SKIP LOCKED. Ele roda sem o papel do
    // RLS (B-83): o companyId do WHERE é o que separa as empresas. O CTE
    // guarda o prazo e a marca de violação de antes da troca, para a
    // auditoria do ciclo. Sem waitingSince (a migração do B-66 preencheu),
    // vale o createdAt.
    const now = new Date();
    const [picked] = await this.prisma.$queryRaw<PickedConversation[]>`
      WITH next AS (
        SELECT "id", "waitSlaDueAt", "slaBreachedAt"
        FROM "conversations"
        WHERE "companyId" = ${companyId}
          AND "status" = 'WAITING'
          AND "agentId" IS NULL
          AND "departmentId" = ANY(${departmentIds}::text[])
        ORDER BY COALESCE("waitingSince", "createdAt"), "id"
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "conversations" AS c
      SET "status" = 'OPEN',
          "agentId" = ${requesterId},
          "slaBreachedAt" = NULL,
          "waitSlaDueAt" = NULL,
          "updatedAt" = NOW() AT TIME ZONE 'UTC'
      FROM next
      WHERE c."id" = next."id"
      RETURNING c."id", c."waitingSince", next."waitSlaDueAt", next."slaBreachedAt",
        (SELECT q."maxWaitSecs" FROM "queues" q WHERE q."id" = c."queueId") AS "maxWaitSecs"`;
    if (!picked) return null;

    const { maxWaitSecs, ...cycle } = picked;
    await this.closeWaitCycle(
      companyId,
      { ...cycle, queue: maxWaitSecs === null ? null : { maxWaitSecs } },
      requesterId,
      requesterId,
      now,
    );
    return this.emitAssignment(companyId, picked.id);
  }

  // Por que a conversa não está mais na fila — a mensagem que quem perdeu vê
  private async notInQueueError(companyId: string, conversationId: string) {
    const current = await this.prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
      select: { status: true, agent: { select: { name: true } } },
    });
    if (current?.status === ConversationStatus.CLOSED) {
      return new BadRequestException('Esta conversa já foi encerrada');
    }
    if (current?.agent) return new ConflictException(`${current.agent.name} já está atendendo`);
    return new ConflictException('Esta conversa não está na fila');
  }

  // Saiu da fila com alguém (regras 13 e 16): o SLA da espera termina — o job
  // pendente é cancelado — e o ciclo vai para a auditoria
  private async closeWaitCycle(
    companyId: string,
    conversation: WaitingConversation,
    agentId: string,
    actorId: string,
    now: Date,
  ) {
    await this.cancelSlaCheck(conversation.id);
    await this.auditLog.record({
      companyId,
      userId: actorId,
      action: 'conversation.attended',
      entity: 'Conversation',
      entityId: conversation.id,
      after: {
        agentId,
        waitSeconds: conversation.waitingSince
          ? Math.round((now.getTime() - conversation.waitingSince.getTime()) / 1000)
          : null,
        maxWaitSecs: conversation.queue?.maxWaitSecs ?? null,
        breached:
          !!conversation.slaBreachedAt || (!!conversation.waitSlaDueAt && now > conversation.waitSlaDueAt),
      },
    });
  }

  // Lê o estado novo, avisa em tempo real e devolve a resposta. Com o status
  // no evento, a conversa sai (ou volta) da fila de todos na hora.
  private async emitAssignment(companyId: string, conversationId: string) {
    const updated = await this.prisma.conversation.findFirstOrThrow({
      where: { id: conversationId, companyId },
      select: ASSIGNMENT_SELECT,
    });

    void this.eventsService.emitConversationAssigned({
      companyId,
      conversationId,
      agentId: updated.agent?.id ?? null,
      departmentId: updated.department?.id ?? null,
      agent: updated.agent,
      status: updated.status,
      waitingSince: updated.waitingSince,
    });

    return updated;
  }

  // ── Transferir (B-66 / ADR-0019, regra 4) ─────────────────────────────────
  // Para uma pessoa — que precisa estar Online — ou para um setor. O atendente
  // transfere as conversas que estão com ele; supervisor e admin transferem
  // qualquer uma e puxam para si a de outro atendente (regra do responsável,
  // 2026-10-19). Sem pessoa, a conversa volta para a fila do setor com espera
  // e SLA novos — antes ficava OPEN sem ninguém.
  async assign(
    companyId: string,
    id: string,
    dto: AssignConversationDto,
    requester: ScopeUser,
  ) {
    const before = await this.findOne(companyId, id);

    // B-73 (M-07): atribuir agente punha a conversa em OPEN sem olhar o status
    // — uma conversa encerrada voltava a ficar ativa, contornando a regra do
    // updateStatus (CLOSED não reabre). Encerrada não recebe atribuição.
    if (before.status === ConversationStatus.CLOSED) {
      throw new BadRequestException('Não é possível atribuir uma conversa encerrada');
    }

    const previousAgentId = before.agent?.id ?? null;
    if (!seesWholeCompany(requester) && previousAgentId !== requester.id) {
      throw new ForbiddenException('Você só transfere as conversas que estão com você');
    }

    const targetAgentId = dto.agentId ?? null;
    if (targetAgentId) {
      const target = await this.prisma.user.findFirst({
        where: { id: targetAgentId, companyId, isActive: true },
        select: { id: true, name: true, availability: true },
      });
      if (!target) throw new NotFoundException('Agente não encontrado nesta empresa');
      // Regra 10: Offline não recebe conversa nova, nem por transferência
      if (target.availability !== Availability.ONLINE) {
        throw new ConflictException(
          target.id === requester.id ? 'Fique Online para atender' : `${target.name} está Offline`,
        );
      }
    }

    // Valida departamento se informado
    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, companyId },
      });
      if (!dept) throw new NotFoundException('Departamento não encontrado');
    }

    const departmentId = dto.departmentId ?? before.department?.id ?? null;
    const now = new Date();
    let queue: { id: string; maxWaitSecs: number } | null = null;
    let cycle: WaitCycle | null = null;
    let data: Prisma.ConversationUncheckedUpdateManyInput;

    if (targetAgentId) {
      data = {
        agentId: targetAgentId,
        departmentId,
        status: ConversationStatus.OPEN,
        slaBreachedAt: null,
        waitSlaDueAt: null,
      };
    } else {
      queue = departmentId ? await this.activeQueueOf(companyId, departmentId) : null;
      cycle = this.waitCycleData(queue, queue && (await this.loadSlaClock(companyId)), now);
      data = {
        agentId: null,
        departmentId,
        queueId: queue?.id ?? null,
        status: ConversationStatus.WAITING,
        ...cycle,
      };
    }

    // Troca condicional: só vale se a conversa segue como foi lida. Se alguém
    // atendeu ou transferiu no meio, quem chegou depois recebe 409.
    const { count } = await this.prisma.conversation
      .updateMany({ where: { id, companyId, status: before.status, agentId: previousAgentId }, data })
      .catch(rethrowActiveConversationConflict);
    if (count === 0) {
      throw new ConflictException('A conversa mudou de mãos agora há pouco. Atualize a tela e tente de novo');
    }

    if (cycle) {
      // Voltou para a fila: SLA do ciclo novo (ou nenhum, sem prazo)
      await this.syncWaitSla(id, companyId, cycle, queue?.maxWaitSecs);
    } else if (targetAgentId && before.status === ConversationStatus.WAITING) {
      await this.closeWaitCycle(companyId, before, targetAgentId, requester.id, now);
    }

    // Auditoria (B1-4): mudança real de agentId — desatribuir também conta
    if (targetAgentId !== previousAgentId) {
      await this.auditLog.record({
        companyId,
        userId: requester.id,
        action: 'conversation.assigned',
        entity: 'Conversation',
        entityId: id,
        before: { agentId: previousAgentId },
        after: { agentId: targetAgentId },
      });
    }

    // Notifica quem recebeu a conversa (B1-3) — não quem a puxou para si
    if (targetAgentId && targetAgentId !== previousAgentId && targetAgentId !== requester.id) {
      await this.notificationService.create({
        companyId,
        userId: targetAgentId,
        type: 'conversation_assigned',
        title: 'Nova conversa atribuída a você',
        body: before.contact?.name ?? before.contact?.phone ?? undefined,
        data: { conversationId: id },
      });
    }

    return this.emitAssignment(companyId, id);
  }

  // ── Atualizar status da conversa ──────────────────────────────────────────
  // `requester` ausente = o próprio sistema (auto-atendimento).
  async updateStatus(
    companyId: string,
    id: string,
    dto: UpdateConversationStatusDto,
    requester?: ScopeUser,
  ) {
    const conversation = await this.findOne(companyId, id);

    // B-66 (ADR-0019, regra 4): o atendente comum só mexe no status das
    // conversas que estão com ele — senão devolver a de um colega para a fila
    // e atendê-la seria um atalho para "puxar" conversa. Encerrar uma da fila
    // ("Encerrar sem atender", B-36) continua liberado.
    if (requester && !seesWholeCompany(requester)) {
      const own = conversation.agent?.id === requester.id;
      const closingFromQueue =
        conversation.status === ConversationStatus.WAITING && dto.status === ConversationStatus.CLOSED;
      if (!own && !closingFromQueue) {
        throw new ForbiddenException('Você só muda o status das conversas que estão com você');
      }
    }

    // Regras de transição de status
    const invalidTransitions: Partial<Record<ConversationStatus, ConversationStatus[]>> = {
      [ConversationStatus.CLOSED]: [
        ConversationStatus.WAITING,
        ConversationStatus.OPEN,
        ConversationStatus.RESOLVED,
      ],
    };

    const blockedTargets = invalidTransitions[conversation.status] ?? [];
    if (blockedTargets.includes(dto.status)) {
      throw new BadRequestException(
        `Não é possível mudar de ${conversation.status} para ${dto.status}`,
      );
    }

    const wasWaiting = conversation.status === ConversationStatus.WAITING;
    const entersQueue = !wasWaiting && dto.status === ConversationStatus.WAITING;

    const now = new Date();
    // Voltar para a fila abre um ciclo novo (regra 14) — e na fila ninguém
    // está com a conversa (regra 1)
    const cycle = entersQueue
      ? this.waitCycleData(conversation.queue, conversation.queue && (await this.loadSlaClock(companyId)), now)
      : null;

    const updated = await this.prisma.conversation
      .update({
        where: { id },
        data: {
          status: dto.status,
          ...(cycle && { agentId: null, ...cycle }),
          // B-98 (L-10): fora da espera, a marca de SLA violado é zerada
          ...(dto.status !== ConversationStatus.WAITING && { slaBreachedAt: null, waitSlaDueAt: null }),
          ...(dto.status === ConversationStatus.RESOLVED && { resolvedAt: now }),
          ...(dto.status === ConversationStatus.CLOSED && {
            closedAt: now,
            resolution: dto.resolution,
            resolutionNote: dto.resolutionNote,
          }),
        },
        select: {
          id: true,
          status: true,
          companyId: true,
          resolvedAt: true,
          closedAt: true,
          resolution: true,
          resolutionNote: true,
          updatedAt: true,
        },
      })
      .catch(rethrowActiveConversationConflict);

    // Reentrada em WAITING (ex.: reaberta) agenda o SLA do ciclo novo; sair
    // de WAITING por aqui cancela o job
    if (cycle) {
      await this.syncWaitSla(updated.id, updated.companyId, cycle, conversation.queue?.maxWaitSecs);
    } else if (wasWaiting && updated.status !== ConversationStatus.WAITING) {
      await this.cancelSlaCheck(updated.id);
    }

    // Emite evento em tempo real
    this.eventsService.emitConversationUpdated({
      companyId: updated.companyId,
      conversationId: updated.id,
      changes: {
        status: updated.status,
        ...(cycle && { agentId: null, agent: null, waitingSince: cycle.waitingSince }),
      },
    });

    // Retorna sem expor campos internos
    const { companyId: _c, ...response } = updated;
    return response;
  }

  // ── Zerar contador de não lidas ───────────────────────────────────────────
  async markAsRead(companyId: string, id: string) {
    await this.findOne(companyId, id);

    return this.prisma.conversation.update({
      where: { id },
      data: { unreadCount: 0 },
      select: { id: true, unreadCount: true },
    });
  }

  // ── Roteamento pelo menu de auto-atendimento (B-35) ───────────────────────
  // Deliberadamente separado de assign(): não atribui agente nem gera
  // auditoria/notificação "conversa atribuída a você" (ninguém foi atribuído
  // ainda, só encaminhada) — só reposiciona departamento/fila e abre a espera
  // na fila de destino (B-66: ciclo novo, com o prazo da fila do setor).
  async routeAutoAttendance(
    companyId: string,
    conversationId: string,
    target: { departmentId?: string; queueId?: string },
  ) {
    let queue: { id: string; departmentId: string | null; maxWaitSecs: number } | null = null;

    if (target.queueId) {
      queue = await this.prisma.queue.findFirst({
        where: { id: target.queueId, companyId },
        select: { id: true, departmentId: true, maxWaitSecs: true },
      });
    } else if (target.departmentId) {
      queue = await this.prisma.queue.findFirst({
        where: { companyId, departmentId: target.departmentId, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, departmentId: true, maxWaitSecs: true },
      });
    }

    // Se alguém já atendeu enquanto o paciente escolhia, não há espera a abrir
    const current = await this.prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
      select: { status: true, agentId: true },
    });
    const stillWaiting = current?.status === ConversationStatus.WAITING && !current.agentId;
    const cycle = stillWaiting ? this.waitCycleData(queue, queue && (await this.loadSlaClock(companyId))) : null;

    const departmentId = target.departmentId ?? queue?.departmentId ?? null;
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        departmentId: departmentId ?? undefined,
        queueId: queue?.id ?? undefined,
        ...cycle,
      },
    });

    if (cycle) await this.syncWaitSla(conversationId, companyId, cycle, queue?.maxWaitSecs);

    this.eventsService.emitConversationUpdated({
      companyId,
      conversationId,
      changes: {
        departmentId,
        queueId: queue?.id ?? null,
        ...(cycle && { waitingSince: cycle.waitingSince }),
      },
    });
  }

  // ── Upsert via webhook (cria ou retorna conversa existente) ───────────────
  // Devolve `isNew` explícito (B-35) — antes, quem chamava tinha que adivinhar
  // se a conversa acabou de nascer comparando `createdAt` contra um limiar de
  // 2s (heurística frágil, sujeita a falso negativo sob latência). O
  // auto-atendimento só pode disparar a saudação/menu numa conversa
  // realmente nova, então essa ambiguidade deixou de ser aceitável.
  //
  // B-49: o findFirst abaixo sozinho não bastava sob concorrência real — dois
  // workers processando duas mensagens do MESMO contato quase ao mesmo tempo
  // (nem precisa de retry do Bull: cliente mandando 2 mensagens seguidas já
  // é o bastante) os dois liam "não existe" antes de qualquer create
  // terminar, e nasciam 2 conversas WAITING pro mesmo contato — pior que
  // duplicar mensagem, porque a conversa do cliente fica "split-brain" entre
  // 2 tickets (um agente responde numa, mensagens futuras resolvem pra
  // outra). O findFirst continua aqui como fast-path — a maioria das
  // mensagens cai numa conversa JÁ existente, então ler antes evita tentar
  // um INSERT fadado a falhar em quase toda chamada. Quem fecha a corrida de
  // verdade é o índice único PARCIAL do Postgres (`conversations_active_
  // per_contact_key`, migration do B-49 — não expressável via `@@unique` do
  // Prisma, que não tem `WHERE` na DSL) + a captura de P2002 no create().
  async upsertFromWebhook(
    companyId: string,
    contactId: string,
    whatsappConnectionId: string,
    channel: Channel = Channel.WHATSAPP,
    departmentId?: string | null,
    // B-98 (L-10): conversa aberta pela própria empresa (1ª mensagem fromMe)
    // não está "esperando atendimento" — sem SLA
    startedByCompany = false,
  ): Promise<{
    conversation: Awaited<ReturnType<typeof this.prisma.conversation.create>>;
    isNew: boolean;
    queue: { id: string; maxWaitSecs: number; greetingMsg: string | null } | null;
  }> {
    // Verifica se já existe conversa aberta para este contato — SEM filtrar
    // por whatsappConnectionId: a conversa é com o CONTATO, não com uma
    // sessão específica da conexão. Filtrar também pela conexão fazia toda
    // conversa em aberto virar órfã (whatsappConnectionId de uma instância já
    // apagada) sempre que o WhatsApp era desconectado/reparado — o contato
    // ganhava uma conversa nova a cada reconexão e a antiga travava para
    // sempre (agente não conseguia responder: "sem conexão associada").
    const existing = await this.findActiveConversation(companyId, contactId);

    if (existing) {
      return this.reconnectIfNeeded(existing, whatsappConnectionId);
    }

    // Resolve a fila ativa do departamento da conexão (B1-2): sem isso a
    // conversa nasce sempre com queueId null e o SLA (Fase B2) nunca tem
    // maxWaitSecs real para usar.
    let queue: { id: string; maxWaitSecs: number; greetingMsg: string | null } | null = null;
    if (departmentId) {
      queue = await this.prisma.queue.findFirst({
        where: { companyId, departmentId, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, maxWaitSecs: true, greetingMsg: true },
      });
    }

    // Produtor de SLA (B2-3): só há prazo quando há fila ativa resolvida —
    // sem isso, `maxWaitSecs` não existe e não há em cima do que alertar.
    // B-98 (L-10): nem para conversa aberta pela empresa. B-112: fora do
    // expediente, o prazo começa a contar na abertura. B-66: o ciclo de
    // espera (início e prazo) vai gravado na própria conversa.
    const cycle = this.waitCycleData(
      queue,
      queue && !startedByCompany ? await this.loadSlaClock(companyId) : null,
    );

    try {
      const created = await this.prisma.conversation.create({
        data: {
          companyId,
          contactId,
          whatsappConnectionId,
          channel,
          status: ConversationStatus.WAITING,
          departmentId: departmentId ?? undefined,
          queueId: queue?.id,
          waitingSince: cycle.waitingSince,
          waitSlaDueAt: cycle.waitSlaDueAt,
        },
      });

      if (cycle.waitSlaDueAt) {
        await this.syncWaitSla(created.id, companyId, cycle, queue?.maxWaitSecs);
      }

      return { conversation: created, isNew: true, queue };
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        // Perdeu a corrida: outro processo já criou (ou reabriu) a conversa
        // ativa deste contato entre o findFirst acima e este create. A linha
        // vencedora já existe — mesmo tratamento do caminho "existing" logo
        // no topo, nunca duplica nem derruba o processamento do webhook.
        // Observabilidade (PRR pós-hardening B-49, 2026-08-01 — mesmo gap
        // encontrado e corrigido em MessageService no B-48): sem este log,
        // uma corrida de "split-brain" evitada com sucesso não deixava
        // nenhum rastro — impossível monitorar em produção com que
        // frequência a proteção é de fato exercitada. `formatStructuredLog`
        // (ACR 2026-08-01) pelo mesmo motivo do MessageService — formato
        // consistente com o resto do projeto, não string ad-hoc.
        this.logger.warn(
          formatStructuredLog('IdempotencyCollisionResolved', { resource: 'Conversation', contactId }),
        );
        const winner = await this.findActiveConversation(companyId, contactId);
        if (!winner) throw err; // não deveria acontecer — o índice garante que existe
        return this.reconnectIfNeeded(winner, whatsappConnectionId);
      }
      throw err;
    }
  }

  private async findActiveConversation(companyId: string, contactId: string) {
    return this.prisma.conversation.findFirst({
      where: {
        companyId,
        contactId,
        status: { in: [ConversationStatus.WAITING, ConversationStatus.OPEN] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async reconnectIfNeeded(
    conversation: NonNullable<Awaited<ReturnType<typeof this.findActiveConversation>>>,
    whatsappConnectionId: string,
  ) {
    // Reaponta para a conexão atual caso a sessão tenha sido reparada (senão
    // o envio falha com "conexão não associada" numa conversa viva).
    if (conversation.whatsappConnectionId !== whatsappConnectionId) {
      const updated = await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { whatsappConnectionId },
      });
      return { conversation: updated, isNew: false, queue: null };
    }
    return { conversation, isNew: false, queue: null };
  }

  // ── Atualizar preview e timestamp da última mensagem ──────────────────────
  // B-60: `countAsUnread` explícito — só mensagem do cliente conta como não
  // lida. Antes toda chamada incrementava, inclusive a resposta automática do
  // auto-atendimento (o robô deixava a conversa "não lida").
  async updateLastMessage(
    conversationId: string,
    preview: string,
    { countAsUnread }: { countAsUnread: boolean },
  ) {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: preview.slice(0, 100),
        ...(countAsUnread && { unreadCount: { increment: 1 } }),
      },
    });
  }
}
