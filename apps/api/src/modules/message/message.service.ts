import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { MessageType, MessageStatus, SenderType } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ListMessagesDto } from './dto/list-messages.dto';

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Garante que a conversa pertence à empresa ─────────────────────────────
  private async assertConversationOwnership(companyId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada');
    }

    return conversation;
  }

  // ── Listar mensagens de uma conversa (paginação por cursor) ───────────────
  async findAll(companyId: string, conversationId: string, query: ListMessagesDto) {
    await this.assertConversationOwnership(companyId, conversationId);

    const { type, senderType, before, limit = 50 } = query;

    // Busca a posição do cursor se informado
    let cursorCondition = {};
    if (before) {
      const cursorMsg = await this.prisma.message.findUnique({
        where: { id: before },
        select: { sentAt: true },
      });
      if (cursorMsg) {
        cursorCondition = { sentAt: { lt: cursorMsg.sentAt } };
      }
    }

    const where = {
      conversationId,
      isDeleted: false,
      ...(type && { type }),
      ...(senderType && { senderType }),
      ...cursorCondition,
    };

    const messages = await this.prisma.message.findMany({
      where,
      select: {
        id: true,
        senderType: true,
        content: true,
        type: true,
        status: true,
        isEdited: true,
        quotedMessageId: true,
        metadata: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        externalId: true,
        sender: {
          select: { id: true, name: true, avatarUrl: true, role: true },
        },
        attachments: {
          select: {
            id: true,
            url: true,
            mimeType: true,
            fileName: true,
            size: true,
            width: true,
            height: true,
            duration: true,
          },
        },
      },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });

    // Retorna em ordem cronológica (mais antiga primeiro)
    return {
      data: messages.reverse(),
      meta: {
        count: messages.length,
        hasMore: messages.length === limit,
        nextCursor: messages.length > 0 ? messages[0].id : null,
      },
    };
  }

  // ── Buscar mensagem por ID ─────────────────────────────────────────────────
  async findOne(companyId: string, conversationId: string, messageId: string) {
    await this.assertConversationOwnership(companyId, conversationId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: {
        id: true,
        senderType: true,
        content: true,
        type: true,
        status: true,
        isEdited: true,
        isDeleted: true,
        quotedMessageId: true,
        metadata: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        externalId: true,
        sender: {
          select: { id: true, name: true, avatarUrl: true, role: true },
        },
        attachments: {
          select: {
            id: true,
            url: true,
            mimeType: true,
            fileName: true,
            size: true,
          },
        },
      },
    });

    if (!message) throw new NotFoundException('Mensagem não encontrada');
    return message;
  }

  // ── Criar mensagem (enviada pelo agente) ──────────────────────────────────
  async createFromAgent(
    companyId: string,
    conversationId: string,
    senderId: string,
    content: string,
    type: MessageType = MessageType.TEXT,
    externalId?: string,
  ) {
    await this.assertConversationOwnership(companyId, conversationId);

    return this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        senderType: SenderType.AGENT,
        content,
        type,
        externalId,
        status: MessageStatus.SENT,
      },
      select: {
        id: true,
        senderType: true,
        content: true,
        type: true,
        status: true,
        sentAt: true,
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  // ── Criar mensagem recebida via webhook ───────────────────────────────────
  async createFromWebhook(data: {
    conversationId: string;
    content: string;
    type: MessageType;
    senderType: SenderType;
    externalId: string;
    senderId?: string;
    metadata?: Record<string, any>;
  }) {
    // Evita duplicatas pelo externalId
    const existing = await this.prisma.message.findFirst({
      where: { externalId: data.externalId },
      select: { id: true },
    });

    if (existing) return existing;

    return this.prisma.message.create({
      data: {
        conversationId: data.conversationId,
        senderId: data.senderId,
        senderType: data.senderType,
        content: data.content,
        type: data.type,
        externalId: data.externalId,
        status: MessageStatus.DELIVERED,
        metadata: data.metadata,
      },
    });
  }

  // ── Atualizar status da mensagem (ex: lida) ───────────────────────────────
  async updateStatus(externalId: string, status: MessageStatus) {
    return this.prisma.message.updateMany({
      where: { externalId },
      data: {
        status,
        ...(status === MessageStatus.DELIVERED && { deliveredAt: new Date() }),
        ...(status === MessageStatus.READ && { readAt: new Date() }),
      },
    });
  }

  // ── Marcar como deletada (soft delete) ───────────────────────────────────
  async softDelete(companyId: string, conversationId: string, messageId: string, userId: string) {
    await this.assertConversationOwnership(companyId, conversationId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: { senderId: true, senderType: true },
    });

    if (!message) throw new NotFoundException('Mensagem não encontrada');

    // Apenas o próprio agente pode apagar sua mensagem
    if (message.senderType === SenderType.AGENT && message.senderId !== userId) {
      throw new ForbiddenException('Você só pode apagar suas próprias mensagens');
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, content: null, type: MessageType.DELETED },
      select: { id: true, isDeleted: true, type: true },
    });
  }
}
