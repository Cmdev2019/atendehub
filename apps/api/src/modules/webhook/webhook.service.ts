import { Injectable, Logger } from '@nestjs/common';
import { MessageType, MessageStatus, SenderType } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ContactService } from '../contact/contact.service';
import { ConversationService } from '../conversation/conversation.service';
import { MessageService } from '../message/message.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { EventsService } from '../events/events.service';
import { MediaDownloadService } from './media-download.service';

// ─── Tipos dos payloads da Evolution API v2 ───────────────────────────────────
interface EvolutionMessageKey {
  remoteJid: string;   // ex: "5511999999999@s.whatsapp.net"
  fromMe: boolean;
  id: string;          // ID da mensagem no WhatsApp
}

interface EvolutionMessageContent {
  conversation?: string;
  imageMessage?: { caption?: string; mimetype: string; url?: string };
  videoMessage?: { caption?: string; mimetype: string; url?: string };
  audioMessage?: { mimetype: string; url?: string };
  documentMessage?: { title?: string; mimetype: string; url?: string };
  stickerMessage?: { url?: string };
  locationMessage?: { degreesLatitude: number; degreesLongitude: number };
  contactMessage?: { displayName: string };
  reactionMessage?: { text: string; key: EvolutionMessageKey };
  extendedTextMessage?: { text: string };
}

interface EvolutionMessage {
  key: EvolutionMessageKey;
  pushName?: string;         // nome do contato
  message?: EvolutionMessageContent;
  messageType?: string;
  messageTimestamp?: number;
  status?: string;
}

interface EvolutionWebhookPayload {
  event: string;
  instance: string;          // sessionName
  data: any;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactService: ContactService,
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService,
    private readonly whatsappService: WhatsappService,
    private readonly eventsService: EventsService,
    private readonly mediaDownloadService: MediaDownloadService,
  ) {}

  // ── Entry point — roteia pelo tipo de evento ──────────────────────────────
  async handleEvent(payload: EvolutionWebhookPayload): Promise<void> {
    const { event, instance, data } = payload;

    this.logger.log(`Webhook recebido: ${event} | instância: ${instance}`);

    try {
      switch (event) {
        case 'MESSAGES_UPSERT':
          await this.handleMessagesUpsert(instance, data);
          break;

        case 'MESSAGES_UPDATE':
          await this.handleMessagesUpdate(data);
          break;

        case 'MESSAGES_DELETE':
          await this.handleMessagesDelete(data);
          break;

        case 'CONNECTION_UPDATE':
          await this.handleConnectionUpdate(instance, data);
          break;

        case 'QRCODE_UPDATED':
          await this.handleQrCodeUpdate(instance, data);
          break;

        case 'CONTACTS_UPSERT':
          await this.handleContactsUpsert(instance, data);
          break;

        default:
          this.logger.debug(`Evento ignorado: ${event}`);
      }
    } catch (err: any) {
      this.logger.error(`Erro ao processar evento ${event}: ${err.message}`, err.stack);
    }
  }

  // ── MESSAGES_UPSERT — nova mensagem recebida ou enviada ───────────────────
  private async handleMessagesUpsert(sessionName: string, data: any): Promise<void> {
    const messages: EvolutionMessage[] = Array.isArray(data) ? data : [data];

    for (const msg of messages) {
      await this.processMessage(sessionName, msg);
    }
  }

  private async processMessage(sessionName: string, msg: EvolutionMessage): Promise<void> {
    const { key, pushName, message, messageTimestamp } = msg;

    if (!key?.remoteJid) return;

    // Ignora mensagens de grupos (@g.us)
    if (key.remoteJid.endsWith('@g.us')) {
      this.logger.debug(`Mensagem de grupo ignorada: ${key.remoteJid}`);
      return;
    }

    // Extrai número limpo: "5511999999999@s.whatsapp.net" → "5511999999999"
    const phone = key.remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');

    // Busca a conexão pelo sessionName para obter o companyId
    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { sessionName },
      select: { id: true, companyId: true },
    });

    if (!connection) {
      this.logger.warn(`Conexão não encontrada para sessão: ${sessionName}`);
      return;
    }

    const { companyId, id: whatsappConnectionId } = connection;

    // Upsert do contato
    const contact = await this.contactService.upsertFromWebhook(
      companyId,
      phone,
      pushName || phone,
    );

    // Contato bloqueado — ignora
    if (contact.isBlocked) {
      this.logger.debug(`Mensagem de contato bloqueado: ${phone}`);
      return;
    }

    // Upsert da conversa
    const conversation = await this.conversationService.upsertFromWebhook(
      companyId,
      contact.id,
      whatsappConnectionId,
    );

    // Guarda se a conversa já existia antes do upsert
    const existing = conversation.createdAt < new Date(Date.now() - 2000);

    // Determina tipo e conteúdo da mensagem
    const { type, content, mediaUrl, mimeType, fileName } = this.extractMessageContent(message);

    // Determina se é mensagem do agente (fromMe) ou do cliente
    const senderType = key.fromMe ? SenderType.AGENT : SenderType.CLIENT;

    // Persiste a mensagem com dedup por externalId
    const savedMessage = await this.messageService.createFromWebhook({
      conversationId: conversation.id,
      content,
      type,
      senderType,
      externalId: key.id,
      metadata: {
        timestamp: messageTimestamp,
        remoteJid: key.remoteJid,
      },
    });

    // ── Download de mídia e criação de Attachment ───────────────────────────
    if (this.isMediaType(type) && savedMessage) {
      this.downloadAndSaveMedia(
        savedMessage.id,
        companyId,
        sessionName,
        key.id,
        type,
        mediaUrl,
        mimeType,
        fileName,
      ).catch((err) => {
        this.logger.error(`Falha ao salvar mídia da msg ${key.id}: ${err.message}`);
      });
    }

    // Atualiza preview da conversa apenas para mensagens do cliente
    if (!key.fromMe && content) {
      await this.conversationService.updateLastMessage(conversation.id, content);
    }

    // ── Emite evento em tempo real ─────────────────────────────────────────
    const isNewConversation = !existing;

    if (isNewConversation) {
      this.eventsService.emitConversationCreated({
        companyId,
        conversation: {
          id: conversation.id,
          status: conversation.status,
          channel: conversation.channel,
          contact: {
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            avatarUrl: contact.avatarUrl,
          },
          whatsappConnectionId,
          createdAt: conversation.createdAt,
        },
      });
    }

    this.eventsService.emitNewMessage({
      companyId,
      conversationId: conversation.id,
      message: {
        id: savedMessage.id,
        senderType,
        content,
        type,
        status: savedMessage.status,
        sentAt: savedMessage.sentAt,
        externalId: key.id,
      },
    });

    this.logger.debug(`Mensagem processada: ${key.id} | ${phone} | ${type}`);
  }

  // ── MESSAGES_UPDATE — atualização de status (entregue, lido, etc.) ────────
  private async handleMessagesUpdate(data: any): Promise<void> {
    const updates = Array.isArray(data) ? data : [data];

    for (const update of updates) {
      const externalId = update.key?.id;
      const status = update.update?.status;

      if (!externalId || !status) continue;

      const statusMap: Record<string, MessageStatus> = {
        DELIVERY_ACK: MessageStatus.DELIVERED,
        READ: MessageStatus.READ,
        PLAYED: MessageStatus.READ,
      };

      const mappedStatus = statusMap[status];
      if (mappedStatus) {
        await this.messageService.updateStatus(externalId, mappedStatus);

        // Busca a mensagem para obter conversationId e companyId
        const msg = await this.prisma.message.findFirst({
          where: { externalId },
          select: {
            conversation: { select: { id: true, companyId: true } },
          },
        });

        if (msg?.conversation) {
          this.eventsService.emitMessageStatus({
            conversationId: msg.conversation.id,
            companyId: msg.conversation.companyId,
            externalId,
            status: mappedStatus,
          });
        }

        this.logger.debug(`Status atualizado: ${externalId} → ${mappedStatus}`);
      }
    }
  }

  // ── MESSAGES_DELETE — mensagem deletada no WhatsApp ───────────────────────
  private async handleMessagesDelete(data: any): Promise<void> {
    const keys = Array.isArray(data?.keys) ? data.keys : [data?.key].filter(Boolean);

    for (const key of keys) {
      if (!key?.id) continue;
      await this.prisma.message.updateMany({
        where: { externalId: key.id },
        data: { isDeleted: true, content: null, type: MessageType.DELETED },
      });
      this.logger.debug(`Mensagem deletada: ${key.id}`);
    }
  }

  // ── CONNECTION_UPDATE — mudança de estado da conexão ─────────────────────
  private async handleConnectionUpdate(sessionName: string, data: any): Promise<void> {
    const state = data?.state ?? data?.connection;
    const phone = data?.phoneNumber ?? data?.me?.id?.replace('@s.whatsapp.net', '');
    const profileName = data?.profileName ?? data?.me?.name;

    await this.whatsappService.handleConnectionUpdate(
      sessionName,
      state,
      phone,
      profileName,
    );

    // Emite evento em tempo real para a empresa
    const conn = await this.prisma.whatsAppConnection.findUnique({
      where: { sessionName },
      select: { id: true, companyId: true, status: true },
    });

    if (conn) {
      this.eventsService.emitConnectionStatus({
        companyId: conn.companyId,
        connectionId: conn.id,
        sessionName,
        status: conn.status,
        phone,
        profileName,
      });
    }
  }

  // ── QRCODE_UPDATED — novo QR Code gerado ─────────────────────────────────
  private async handleQrCodeUpdate(sessionName: string, data: any): Promise<void> {
    const qrCode = data?.qrcode?.base64 ?? data?.base64 ?? data?.qrcode;

    if (qrCode) {
      await this.whatsappService.handleQrCodeUpdate(sessionName, qrCode);
      this.logger.debug(`QR Code atualizado: ${sessionName}`);
    }
  }

  // ── CONTACTS_UPSERT — atualização de contatos ─────────────────────────────
  private async handleContactsUpsert(sessionName: string, data: any): Promise<void> {
    const contacts = Array.isArray(data) ? data : [data];

    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { sessionName },
      select: { companyId: true },
    });

    if (!connection) return;

    for (const c of contacts) {
      const phone = (c.id ?? '').replace('@s.whatsapp.net', '').replace('@c.us', '');
      const name = c.pushName ?? c.verifiedName ?? c.name;

      if (!phone || !name) continue;

      await this.contactService.upsertFromWebhook(
        connection.companyId,
        phone,
        name,
        c.profilePictureUrl,
      );
    }
  }

  // ── Extrai tipo e conteúdo de um objeto de mensagem da Evolution ──────────
  private extractMessageContent(message?: EvolutionMessageContent): {
    type: MessageType;
    content: string;
    mediaUrl?: string;
    mimeType?: string;
    fileName?: string;
  } {
    if (!message) return { type: MessageType.TEXT, content: '' };

    if (message.conversation) {
      return { type: MessageType.TEXT, content: message.conversation };
    }

    if (message.extendedTextMessage?.text) {
      return { type: MessageType.TEXT, content: message.extendedTextMessage.text };
    }

    if (message.imageMessage) {
      return {
        type: MessageType.IMAGE,
        content: message.imageMessage.caption ?? '',
        mediaUrl: message.imageMessage.url,
        mimeType: message.imageMessage.mimetype,
      };
    }

    if (message.videoMessage) {
      return {
        type: MessageType.VIDEO,
        content: message.videoMessage.caption ?? '',
        mediaUrl: message.videoMessage.url,
        mimeType: message.videoMessage.mimetype,
      };
    }

    if (message.audioMessage) {
      return {
        type: MessageType.AUDIO,
        content: '',
        mediaUrl: message.audioMessage.url,
        mimeType: message.audioMessage.mimetype,
      };
    }

    if (message.documentMessage) {
      return {
        type: MessageType.DOCUMENT,
        content: message.documentMessage.title ?? '',
        mediaUrl: message.documentMessage.url,
        mimeType: message.documentMessage.mimetype,
        fileName: message.documentMessage.title,
      };
    }

    if (message.stickerMessage) {
      return {
        type: MessageType.STICKER,
        content: '',
        mediaUrl: message.stickerMessage.url,
        mimeType: 'image/webp',
      };
    }

    if (message.locationMessage) {
      const { degreesLatitude, degreesLongitude } = message.locationMessage;
      return {
        type: MessageType.LOCATION,
        content: `${degreesLatitude},${degreesLongitude}`,
      };
    }

    if (message.contactMessage) {
      return { type: MessageType.CONTACT_CARD, content: message.contactMessage.displayName };
    }

    if (message.reactionMessage) {
      return { type: MessageType.REACTION, content: message.reactionMessage.text };
    }

    return { type: MessageType.TEXT, content: '' };
  }

  // ── Verifica se o tipo de mensagem contém mídia para download ─────────────
  private isMediaType(type: MessageType): boolean {
    const mediaTypes: MessageType[] = [
      MessageType.IMAGE,
      MessageType.VIDEO,
      MessageType.AUDIO,
      MessageType.DOCUMENT,
      MessageType.STICKER,
    ];
    return mediaTypes.includes(type);
  }

  // ── Baixa mídia e cria registro Attachment no banco ───────────────────────
  private async downloadAndSaveMedia(
    messageId: string,
    companyId: string,
    sessionName: string,
    externalMessageId: string,
    type: MessageType,
    mediaUrl?: string,
    mimeType?: string,
    fileName?: string,
  ): Promise<void> {
    const effectiveMimeType = mimeType ?? 'application/octet-stream';

    let result = null;

    // Estratégia 1: Se temos URL direta, tenta baixar diretamente
    if (mediaUrl) {
      result = await this.mediaDownloadService.downloadAndStore(
        mediaUrl,
        effectiveMimeType,
        companyId,
        fileName,
      );
    }

    // Estratégia 2: Se não tem URL ou download direto falhou,
    // usa o endpoint getBase64FromMediaMessage da Evolution API
    if (!result) {
      result = await this.mediaDownloadService.downloadFromEvolution(
        sessionName,
        externalMessageId,
        effectiveMimeType,
        companyId,
        fileName,
      );
    }

    if (!result) {
      this.logger.warn(
        `Não foi possível baixar mídia para msg ${externalMessageId}`,
      );
      return;
    }

    // Cria o registro Attachment no banco
    await this.prisma.attachment.create({
      data: {
        messageId,
        url: result.url,
        mimeType: result.mimeType,
        fileName: result.fileName ?? null,
        size: result.size,
      },
    });

    this.logger.debug(
      `Attachment criado para msg ${externalMessageId}: ${result.url}`,
    );
  }
}
