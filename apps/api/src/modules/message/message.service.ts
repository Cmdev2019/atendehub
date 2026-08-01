import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { MessageType, MessageStatus, SenderType, Prisma } from '@prisma/client';
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

  // ── Criação atômica com dedup por externalId (B-48) ───────────────────────
  // Substitui o antigo padrão findFirst()+create(): sob concorrência real
  // (dois workers do Bull processando o mesmo evento, ou o worker do
  // webhook correndo contra o próprio SendMessageService quando o eco da
  // mensagem que o agente acabou de enviar chega quase simultâneo — ver
  // SendMessageService#send/#sendMediaFile) o findFirst dos dois lados
  // acontecia ANTES de qualquer create existir, e nada impedia as duas
  // gravações. Sem essa janela: tenta criar direto, e só cai pro caminho de
  // "já existe" se o INSERT esbarrar mesmo no `@@unique([externalId])" do
  // schema — a checagem de unicidade passa a ser feita pelo Postgres dentro
  // da própria escrita, não por uma leitura solta antes dela.
  async createUnique<S extends Prisma.MessageSelect>(
    data: Prisma.MessageUncheckedCreateInput,
    select: S,
  ): Promise<{ message: Prisma.MessageGetPayload<{ select: S }>; isNew: boolean }> {
    try {
      const message = await this.prisma.message.create({ data, select });
      return { message, isNew: true };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        typeof data.externalId === 'string'
      ) {
        // Perdeu a corrida: outro processo já inseriu esse externalId entre
        // a hora que este create foi tentado e o commit dele. A linha
        // vencedora já existe e é a fonte da verdade — devolve ela.
        const message = await this.prisma.message.findUniqueOrThrow({
          where: { externalId: data.externalId },
          select,
        });
        return { message, isNew: false };
      }
      throw err;
    }
  }

  // ── Criar mensagem recebida via webhook ───────────────────────────────────
  // B-39: `isNew` no retorno é o que permite ao WebhookService distinguir um
  // processamento de verdade de um retry idempotente do Bull — sem ele, um
  // retry reprocessaria mídia/preview/auto-atendimento/eventos de uma
  // mensagem que já tinha sido tratada com sucesso na tentativa anterior
  // (dedup por externalId aqui já evitava duplicar a MENSAGEM, mas não os
  // efeitos colaterais em volta dela).
  async createFromWebhook(data: {
    conversationId: string;
    content: string;
    type: MessageType;
    senderType: SenderType;
    externalId: string;
    senderId?: string;
    metadata?: Record<string, any>;
  }): Promise<{ id: string; status: MessageStatus; sentAt: Date; isNew: boolean }> {
    const { message, isNew } = await this.createUnique(
      {
        conversationId: data.conversationId,
        senderId: data.senderId,
        senderType: data.senderType,
        content: data.content,
        type: data.type,
        externalId: data.externalId,
        status: MessageStatus.DELIVERED,
        metadata: data.metadata,
      },
      { id: true, status: true, sentAt: true },
    );

    return { ...message, isNew };
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
