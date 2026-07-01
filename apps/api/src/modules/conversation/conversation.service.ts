import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConversationStatus, Channel } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';
import { EventsService } from '../events/events.service';

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
  ) {}

  // ── Listar conversas com filtros e paginação ──────────────────────────────
  async findAll(companyId: string, query: ListConversationsDto) {
    const { status, channel, agentId, departmentId, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      companyId,
      ...(status && { status }),
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
  async assign(companyId: string, id: string, dto: AssignConversationDto) {
    await this.findOne(companyId, id);

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

    // Emite evento em tempo real
    this.eventsService.emitConversationAssigned({
      companyId: updated.companyId,
      conversationId: updated.id,
      agentId: updated.agentId,
      departmentId: updated.departmentId,
      agent: updated.agent,
    });

    return updated;
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
      },
    });

    // Emite evento em tempo real
    this.eventsService.emitConversationUpdated({
      companyId: updated.companyId,
      conversationId: updated.id,
      changes: { status: updated.status },
    });

    return updated;
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
  ) {
    // Verifica se já existe conversa aberta para este contato + conexão
    const existing = await this.prisma.conversation.findFirst({
      where: {
        companyId,
        contactId,
        whatsappConnectionId,
        status: { in: [ConversationStatus.WAITING, ConversationStatus.OPEN] },
      },
    });

    if (existing) return existing;

    // Cria nova conversa
    return this.prisma.conversation.create({
      data: {
        companyId,
        contactId,
        whatsappConnectionId,
        channel,
        status: ConversationStatus.WAITING,
      },
    });
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
