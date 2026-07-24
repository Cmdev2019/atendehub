import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConversationStatus, Channel } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';
import { EventsService } from '../events/events.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';
import { SlaCheckJobData } from '../sla/sla-check.processor';

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
};

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly auditLog: AuditLogService,
    private readonly notificationService: NotificationService,
    @InjectQueue(QUEUE_NAMES.SLA_CHECK) private readonly slaQueue: Queue<SlaCheckJobData>,
  ) {}

  // ── SLA: agenda/cancela a checagem de violação (Fase B2) ───────────────────
  // jobId determinístico por conversa (B2-4): agendar sempre remove um job
  // pendente anterior da mesma conversa antes de criar o novo, então nunca
  // existe mais de uma checagem pendente por conversa — cobre tanto chamadas
  // duplicadas quanto reentrada em WAITING (ex.: reaberta depois de fechada)
  // com um temporizador limpo em vez do prazo antigo já vencido.
  private slaJobId(conversationId: string) {
    return `sla-check:${conversationId}`;
  }

  private async scheduleSlaCheck(
    conversationId: string,
    companyId: string,
    maxWaitSecs: number,
  ) {
    await this.cancelSlaCheck(conversationId);
    await this.slaQueue.add(
      { conversationId, companyId, maxWaitSecs, queuedAt: new Date() },
      { jobId: this.slaJobId(conversationId), delay: maxWaitSecs * 1000 },
    );
  }

  private async cancelSlaCheck(conversationId: string) {
    const job = await this.slaQueue.getJob(this.slaJobId(conversationId));
    if (!job) return;
    // Job já em execução não pode ser removido (Bull lança erro) — sem problema,
    // o processor reconsulta o status e não faz nada se não estiver mais WAITING
    await job.remove().catch(() => undefined);
  }

  // ── Listar conversas com filtros e paginação ──────────────────────────────
  async findAll(companyId: string, query: ListConversationsDto) {
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
        resolvedAt: true,
        closedAt: true,
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
          select: { id: true, name: true, strategy: true },
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

  // ── Atribuir agente / departamento ────────────────────────────────────────
  async assign(
    companyId: string,
    id: string,
    dto: AssignConversationDto,
    requesterId: string,
  ) {
    const before = await this.findOne(companyId, id);

    // Valida agente se informado
    if (dto.agentId) {
      const agent = await this.prisma.user.findFirst({
        where: { id: dto.agentId, companyId, isActive: true },
      });
      if (!agent) throw new NotFoundException('Agente não encontrado nesta empresa');
    }

    // Valida departamento se informado
    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, companyId },
      });
      if (!dept) throw new NotFoundException('Departamento não encontrado');
    }

    const updated = await this.prisma.conversation.update({
      where: { id },
      data: {
        agentId: dto.agentId ?? null,
        departmentId: dto.departmentId,
        // Se atribuiu um agente e a conversa estava em espera, move para OPEN
        ...(dto.agentId && { status: ConversationStatus.OPEN }),
      },
      select: {
        id: true,
        status: true,
        companyId: true,
        agentId: true,
        departmentId: true,
        agent: { select: { id: true, name: true, avatarUrl: true } },
        department: { select: { id: true, name: true } },
      },
    });

    // Atribuir agente tira a conversa da espera — cancela a checagem de SLA
    // pendente (se não cancelar, o processor ainda reconsulta o status e não
    // dispara o alerta, mas cancelar evita um job fantasma rodando à toa)
    if (dto.agentId) {
      await this.cancelSlaCheck(updated.id);
    } else if (
      dto.departmentId &&
      dto.departmentId !== before.department?.id &&
      updated.status === ConversationStatus.WAITING
    ) {
      // Reatribuição só de departamento (sem agente) numa conversa que segue
      // em espera: o prazo antigo era da fila do departamento anterior, então
      // reagenda para a fila ativa do departamento novo — senão o SLA seguiria
      // contando com o `maxWaitSecs` errado (ou nenhum, se a fila antiga nem
      // pertencia a este departamento).
      const queue = await this.prisma.queue.findFirst({
        where: { companyId, departmentId: dto.departmentId, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, maxWaitSecs: true },
      });

      await this.prisma.conversation.update({
        where: { id: updated.id },
        data: { queueId: queue?.id ?? null },
      });

      if (queue) {
        await this.scheduleSlaCheck(updated.id, companyId, queue.maxWaitSecs);
      } else {
        // Departamento novo não tem fila ativa — não há mais em cima do que
        // alertar com esse prazo antigo
        await this.cancelSlaCheck(updated.id);
      }
    }

    // Auditoria (B1-4): compara o agentId de fato antes/depois da mutação —
    // não o dto bruto, porque omitir `agentId` no body também desatribui
    // (`dto.agentId ?? null` lá em cima), e a auditoria tem que refletir o
    // que realmente aconteceu no banco, não só o que veio na requisição.
    const previousAgentId = before.agent?.id ?? null;
    if (updated.agentId !== previousAgentId) {
      await this.auditLog.record({
        companyId,
        userId: requesterId,
        action: 'conversation.assigned',
        entity: 'Conversation',
        entityId: updated.id,
        before: { agentId: previousAgentId },
        after: { agentId: updated.agentId },
      });
    }

    // Notifica o agente recém-atribuído (B1-3)
    if (updated.agentId && updated.agentId !== previousAgentId) {
      await this.notificationService.create({
        companyId,
        userId: updated.agentId,
        type: 'conversation_assigned',
        title: 'Nova conversa atribuída a você',
        body: before.contact?.name ?? before.contact?.phone ?? undefined,
        data: { conversationId: updated.id },
      });
    }

    // Emite evento em tempo real
    this.eventsService.emitConversationAssigned({
      companyId: updated.companyId,
      conversationId: updated.id,
      agentId: updated.agentId,
      departmentId: updated.departmentId,
      agent: updated.agent,
    });

    // Retorna sem expor campos internos
    const { companyId: _c, agentId: _a, departmentId: _d, ...response } = updated;
    return response;
  }

  // ── Atualizar status da conversa ──────────────────────────────────────────
  async updateStatus(companyId: string, id: string, dto: UpdateConversationStatusDto) {
    const conversation = await this.findOne(companyId, id);

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

    const now = new Date();
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === ConversationStatus.RESOLVED && { resolvedAt: now }),
        ...(dto.status === ConversationStatus.CLOSED && { closedAt: now }),
      },
      select: {
        id: true,
        status: true,
        companyId: true,
        resolvedAt: true,
        closedAt: true,
        updatedAt: true,
        queueId: true,
      },
    });

    // Reentrada em WAITING (ex.: reaberta) agenda um novo prazo de SLA; sair
    // de WAITING por qualquer outro caminho que não o assign() cancela o job
    if (!wasWaiting && updated.status === ConversationStatus.WAITING && updated.queueId) {
      const queue = await this.prisma.queue.findUnique({
        where: { id: updated.queueId },
        select: { maxWaitSecs: true },
      });
      if (queue) {
        await this.scheduleSlaCheck(updated.id, updated.companyId, queue.maxWaitSecs);
      }
    } else if (wasWaiting && updated.status !== ConversationStatus.WAITING) {
      await this.cancelSlaCheck(updated.id);
    }

    // Emite evento em tempo real
    this.eventsService.emitConversationUpdated({
      companyId: updated.companyId,
      conversationId: updated.id,
      changes: { status: updated.status },
    });

    // Retorna sem expor campos internos
    const { companyId: _c, queueId: _q, ...response } = updated;
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

  // ── Upsert via webhook (cria ou retorna conversa existente) ───────────────
  async upsertFromWebhook(
    companyId: string,
    contactId: string,
    whatsappConnectionId: string,
    channel: Channel = Channel.WHATSAPP,
    departmentId?: string | null,
  ) {
    // Verifica se já existe conversa aberta para este contato — SEM filtrar
    // por whatsappConnectionId: a conversa é com o CONTATO, não com uma
    // sessão específica da conexão. Filtrar também pela conexão fazia toda
    // conversa em aberto virar órfã (whatsappConnectionId de uma instância já
    // apagada) sempre que o WhatsApp era desconectado/reparado — o contato
    // ganhava uma conversa nova a cada reconexão e a antiga travava para
    // sempre (agente não conseguia responder: "sem conexão associada").
    const existing = await this.prisma.conversation.findFirst({
      where: {
        companyId,
        contactId,
        status: { in: [ConversationStatus.WAITING, ConversationStatus.OPEN] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      // Reaponta para a conexão atual caso a sessão tenha sido reparada
      // (senão o envio falha com "conexão não associada" numa conversa viva)
      if (existing.whatsappConnectionId !== whatsappConnectionId) {
        return this.prisma.conversation.update({
          where: { id: existing.id },
          data: { whatsappConnectionId },
        });
      }
      return existing;
    }

    // Resolve a fila ativa do departamento da conexão (B1-2): sem isso a
    // conversa nasce sempre com queueId null e o SLA (Fase B2) nunca tem
    // maxWaitSecs real para usar.
    let queue: { id: string; maxWaitSecs: number } | null = null;
    if (departmentId) {
      queue = await this.prisma.queue.findFirst({
        where: { companyId, departmentId, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, maxWaitSecs: true },
      });
    }

    // Cria nova conversa
    const created = await this.prisma.conversation.create({
      data: {
        companyId,
        contactId,
        whatsappConnectionId,
        channel,
        status: ConversationStatus.WAITING,
        departmentId: departmentId ?? undefined,
        queueId: queue?.id,
      },
    });

    // Produtor de SLA (B2-3): só agenda quando há fila ativa resolvida —
    // sem isso, `maxWaitSecs` não existe e não há em cima do que alertar.
    if (queue) {
      await this.scheduleSlaCheck(created.id, companyId, queue.maxWaitSecs);
    }

    return created;
  }

  // ── Atualizar preview e timestamp da última mensagem ──────────────────────
  async updateLastMessage(conversationId: string, preview: string) {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: preview.slice(0, 100),
        unreadCount: { increment: 1 },
      },
    });
  }
}
