import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { MessageType, MessageStatus, SenderType, Role, ConversationStatus } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { StorageService } from '../../shared/storage/storage.service';
import { EvolutionService } from '../whatsapp/evolution.service';
import { EventsService } from '../events/events.service';
import { SendMessageDto } from './dto/send-message.dto';

// Arquivo recebido via multer (memory storage)
interface UploadedMediaFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class SendMessageService {
  private readonly logger = new Logger(SendMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly evolution: EvolutionService,
    private readonly eventsService: EventsService,
  ) {}

  // ── Carrega a conversa e aplica as regras de envio (compartilhado) ────────
  private async prepareSend(
    companyId: string,
    conversationId: string,
    senderId: string,
    senderRole: Role,
  ) {
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

    return conversation;
  }

  async send(
    companyId: string,
    conversationId: string,
    senderId: string,
    senderRole: Role,
    dto: SendMessageDto,
  ) {
    const conversation = await this.prepareSend(
      companyId,
      conversationId,
      senderId,
      senderRole,
    );

    const { sessionName } = conversation.whatsapp!;
    const phone = conversation.contact.phone;

    // ── 3. Envia para a Evolution API ──────────────────────────────────────
    let externalId: string | undefined;

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

    // ── 5. Cria registro Attachment para mensagens de mídia ───────────────
    if (dto.type !== MessageType.TEXT && dto.mediaUrl) {
      await this.prisma.attachment.create({
        data: {
          messageId: message.id,
          url: dto.mediaUrl,
          mimeType: this.getMimeTypeFromMessageType(dto.type),
          fileName: dto.fileName ?? null,
        },
      });
    }

    // ── 6. Atualiza preview da conversa ────────────────────────────────────
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

    // ── 7. Emite evento em tempo real ──────────────────────────────────────
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

  // ── Envio de mídia com upload direto (print colado, arquivo anexado) ──────
  // Recebe o arquivo do navegador (multipart), armazena no MinIO (URL usada
  // pelo painel) e envia à Evolution em BASE64 — o container da Evolution não
  // resolve a URL localhost do MinIO.
  async sendMedia(
    companyId: string,
    conversationId: string,
    senderId: string,
    senderRole: Role,
    file: UploadedMediaFile,
    caption?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo de mídia ausente ou vazio');
    }

    const conversation = await this.prepareSend(
      companyId,
      conversationId,
      senderId,
      senderRole,
    );

    const { sessionName } = conversation.whatsapp!;
    const phone = conversation.contact.phone;

    const mimeType = file.mimetype || 'application/octet-stream';
    const type = this.getMessageTypeFromMime(mimeType);
    const mediaTypeMap: Record<string, 'image' | 'video' | 'document' | 'audio'> = {
      IMAGE: 'image',
      VIDEO: 'video',
      AUDIO: 'audio',
      DOCUMENT: 'document',
    };

    // ── 1. Armazena no MinIO (URL consumida pelo painel/Attachment) ────────
    const stored = await this.storage.upload(
      file.buffer,
      mimeType,
      companyId,
      file.originalname,
      file.size,
    );

    // ── 2. Envia à Evolution como base64 ───────────────────────────────────
    let externalId: string | undefined;
    try {
      const result = await this.evolution.sendMediaMessage(
        sessionName,
        phone,
        file.buffer.toString('base64'),
        mediaTypeMap[type],
        caption,
        file.originalname,
      );
      externalId = result.key?.id;
    } catch (err: any) {
      this.logger.error(`Falha ao enviar mídia: ${err.message}`);
      throw new BadRequestException(
        `Falha ao enviar mídia via WhatsApp: ${err.message}`,
      );
    }

    // ── 3. Persiste mensagem + attachment ──────────────────────────────────
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        senderType: SenderType.AGENT,
        content: caption ?? null,
        type,
        status: MessageStatus.SENT,
        externalId,
      },
      select: {
        id: true,
        senderType: true,
        content: true,
        type: true,
        status: true,
        sentAt: true,
        externalId: true,
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    const attachment = await this.prisma.attachment.create({
      data: {
        messageId: message.id,
        url: stored.url,
        mimeType,
        fileName: file.originalname ?? null,
        size: file.size,
      },
    });

    // ── 4. Preview da conversa ──────────────────────────────────────────────
    const preview = `[${type.toLowerCase()}]${caption ? ` ${caption}` : ''}`;
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: preview.slice(0, 100),
        ...(conversation.status === ConversationStatus.WAITING && {
          status: ConversationStatus.OPEN,
          agentId: senderId,
        }),
      },
    });

    // ── 5. Eventos em tempo real ────────────────────────────────────────────
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
    this.eventsService.emitMessageUpdated({
      companyId,
      conversationId,
      messageId: message.id,
      attachment: {
        id: attachment.id,
        url: attachment.url,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
      },
    });

    this.logger.log(
      `Mídia enviada: ${message.id} | conversa: ${conversationId} | tipo: ${type} | ${file.size} bytes`,
    );

    // Resposta inclui o attachment — o painel renderiza a mídia imediatamente
    return { ...message, attachments: [attachment] };
  }

  // ── Helper: MessageType a partir do MIME type do arquivo ───────────────────
  private getMessageTypeFromMime(mimeType: string): MessageType {
    if (mimeType.startsWith('image/')) return MessageType.IMAGE;
    if (mimeType.startsWith('video/')) return MessageType.VIDEO;
    if (mimeType.startsWith('audio/')) return MessageType.AUDIO;
    return MessageType.DOCUMENT;
  }

  // ── Helper: mapeia MessageType para MIME type genérico ─────────────────────
  private getMimeTypeFromMessageType(type: MessageType): string {
    const map: Partial<Record<MessageType, string>> = {
      [MessageType.IMAGE]: 'image/jpeg',
      [MessageType.VIDEO]: 'video/mp4',
      [MessageType.AUDIO]: 'audio/mpeg',
      [MessageType.DOCUMENT]: 'application/octet-stream',
    };
    return map[type] ?? 'application/octet-stream';
  }
}
