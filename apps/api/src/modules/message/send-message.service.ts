import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { MessageType, MessageStatus, SenderType, Role, ConversationStatus } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EvolutionService } from '../whatsapp/evolution.service';
import { EventsService } from '../events/events.service';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class SendMessageService {
  private readonly logger = new Logger(SendMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolution: EvolutionService,
    private readonly eventsService: EventsService,
  ) {}

  async send(
    companyId: string,
    conversationId: string,
    senderId: string,
    senderRole: Role,
    dto: SendMessageDto,
  ) {
    // ── 1. Carrega a conversa com tudo que precisa ─────────────────────────
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
      select: {
        id: true,
        status: true,
        agentId: true,
        companyId: true,
        contact: {
          select: { id: true, phone: true, isBlocked: true },
        },
        whatsapp: {
          select: { id: true, sessionName: true, status: true },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada');
    }

    // ── 2. Regras de negócio ───────────────────────────────────────────────

    // Conversa fechada não aceita mensagem
    if (conversation.status === ConversationStatus.CLOSED) {
      throw new BadRequestException(
        'Não é possível enviar mensagens para uma conversa encerrada',
      );
    }

    // Contato bloqueado
    if (conversation.contact.isBlocked) {
      throw new BadRequestException('O contato está bloqueado');
    }

    // Apenas o agente atribuído, ADMIN ou SUPERVISOR podem enviar
    const canSend =
      senderRole === Role.ADMIN ||
      senderRole === Role.SUPERVISOR ||
      senderRole === Role.SUPER_ADMIN ||
      conversation.agentId === senderId;

    if (!canSend) {
      throw new ForbiddenException(
        'Você não está atribuído a esta conversa',
      );
    }

    // Conexão WhatsApp precisa estar ativa
    if (!conversation.whatsapp) {
      throw new BadRequestException(
        'Esta conversa não tem uma conexão WhatsApp associada',
      );
    }

    if (conversation.whatsapp.status !== 'CONNECTED') {
      throw new BadRequestException(
        `Conexão WhatsApp está ${conversation.whatsapp.status}. Reconecte antes de enviar mensagens`,
      );
    }

    const { sessionName } = conversation.whatsapp;
    const phone = conversation.contact.phone;

    // ── 3. Envia para a Evolution API ──────────────────────────────────────
    let externalId: string;

    try {
      if (dto.type === MessageType.TEXT) {
        const result = await this.evolution.sendTextMessage(
          sessionName,
          phone,
          dto.content!,
        );
        externalId = result.key?.id;
      } else {
        const mediaTypeMap: Record<string, 'image' | 'video' | 'document' | 'audio'> = {
          IMAGE: 'image',
          VIDEO: 'video',
          DOCUMENT: 'document',
          AUDIO: 'audio',
        };

        const result = await this.evolution.sendMediaMessage(
          sessionName,
          phone,
          dto.mediaUrl!,
          mediaTypeMap[dto.type],
          dto.caption,
          dto.fileName,
        );
        externalId = result.key?.id;
      }
    } catch (err: any) {
      this.logger.error(`Falha ao enviar mensagem: ${err.message}`);
      throw new BadRequestException(
        `Falha ao enviar mensagem via WhatsApp: ${err.message}`,
      );
    }

    // ── 4. Salva no banco ──────────────────────────────────────────────────
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        senderType: SenderType.AGENT,
        content: dto.type === MessageType.TEXT ? dto.content : (dto.caption ?? null),
        type: dto.type,
        status: MessageStatus.SENT,
        externalId,
        quotedMessageId: dto.quotedMessageId ?? null,
      },
      select: {
        id: true,
        senderType: true,
        content: true,
        type: true,
        status: true,
        sentAt: true,
        externalId: true,
        quotedMessageId: true,
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    // ── 5. Atualiza preview da conversa ────────────────────────────────────
    const preview =
      dto.type === MessageType.TEXT
        ? (dto.content ?? '')
        : `[${dto.type.toLowerCase()}]${dto.caption ? ` ${dto.caption}` : ''}`;

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: preview.slice(0, 100),
        // Se a conversa estava em espera, move para OPEN ao enviar
        ...(conversation.status === ConversationStatus.WAITING && {
          status: ConversationStatus.OPEN,
          agentId: senderId,
        }),
      },
    });

    // ── 6. Emite evento em tempo real ──────────────────────────────────────
    this.eventsService.emitNewMessage({
      companyId,
      conversationId,
      message: {
        id: message.id,
        senderType: message.senderType,
        content: message.content,
        type: message.type,
        status: message.status,
        sentAt: message.sentAt,
        externalId: message.externalId,
      },
    });

    this.logger.log(
      `Mensagem enviada: ${message.id} | conversa: ${conversationId} | tipo: ${dto.type}`,
    );

    return message;
  }
}
