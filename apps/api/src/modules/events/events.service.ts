import { Injectable, Logger } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { StorageService } from '../../shared/storage/storage.service';

// ─── Payloads tipados por evento ─────────────────────────────────────────────

export interface MessageNewPayload {
  conversationId: string;
  companyId: string;
  message: {
    id: string;
    senderType: string;
    content: string | null;
    type: string;
    status: string;
    sentAt: Date | string;
    externalId?: string | null;
  };
}

export interface MessageStatusPayload {
  conversationId: string;
  companyId: string;
  externalId: string;
  status: string;
}

export interface ConversationCreatedPayload {
  companyId: string;
  conversation: {
    id: string;
    status: string;
    channel: string;
    contact: { id: string; name: string; phone: string; avatarUrl?: string | null };
    whatsappConnectionId?: string | null;
    createdAt: Date | string;
  };
}

export interface ConversationUpdatedPayload {
  companyId: string;
  conversationId: string;
  changes: Record<string, any>;
}

export interface ConversationAssignedPayload {
  companyId: string;
  conversationId: string;
  agentId: string | null;
  departmentId: string | null;
  agent?: { id: string; name: string; avatarUrl?: string | null } | null;
}

export interface ConnectionStatusPayload {
  companyId: string;
  connectionId: string;
  sessionName: string;
  status: string;
  phone?: string | null;
  profileName?: string | null;
}

export interface SlaBreachedPayload {
  companyId: string;
  conversationId: string;
  contact: { id: string; name: string; phone: string };
  queue: { id: string; name: string; maxWaitSecs: number } | null;
  waitTimeSeconds: number;
  maxWaitSecs: number;
  breachedAt: Date | string;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly gateway: EventsGateway,
    private readonly storage: StorageService,
  ) {}

  // ── Nova mensagem recebida ────────────────────────────────────────────────
  emitNewMessage(payload: MessageNewPayload): void {
    const { companyId, conversationId } = payload;

    // Salas encadeadas numa única emissão: o Socket.IO entrega à UNIÃO das
    // salas, sem duplicar para sockets presentes em ambas.
    this.gateway.server
      .to(`conversation:${conversationId}`)
      .to(`company:${companyId}`)
      .emit('message.new', payload);

    this.logger.debug(`message.new → conversation:${conversationId}`);
  }

  // ── Mensagem atualizada (anexo de mídia pronto após o message.new) ────────
  // B-38: `attachment.url` sai gravado como URL interna do MinIO — troca por
  // URL assinada antes de emitir (mesmo tratamento da resposta HTTP, ver
  // MediaPresignInterceptor).
  async emitMessageUpdated(payload: {
    companyId: string;
    conversationId: string;
    messageId: string;
    attachment: { id: string; url: string; mimeType: string; fileName?: string | null };
  }): Promise<void> {
    const { companyId, conversationId } = payload;
    const signedPayload = await this.storage.presignDeep(payload);

    this.gateway.server
      .to(`conversation:${conversationId}`)
      .to(`company:${companyId}`)
      .emit('message.updated', signedPayload);

    this.logger.debug(`message.updated → msg ${payload.messageId} (anexo pronto)`);
  }

  // ── Status de mensagem atualizado (entregue, lido) ────────────────────────
  emitMessageStatus(payload: MessageStatusPayload): void {
    const { companyId, conversationId } = payload;

    this.gateway.server
      .to(`conversation:${conversationId}`)
      .to(`company:${companyId}`)
      .emit('message.status', payload);

    this.logger.debug(`message.status → ${payload.externalId} : ${payload.status}`);
  }

  // ── Nova conversa criada ──────────────────────────────────────────────────
  async emitConversationCreated(payload: ConversationCreatedPayload): Promise<void> {
    const { companyId } = payload;
    const signedPayload = await this.storage.presignDeep(payload);

    // Notifica todos da empresa sobre nova conversa na fila
    this.gateway.server
      .to(`company:${companyId}`)
      .emit('conversation.created', signedPayload);

    this.logger.debug(
      `conversation.created → company:${companyId} | id: ${payload.conversation.id}`,
    );
  }

  // ── Conversa atualizada (status, tags, etc.) ──────────────────────────────
  emitConversationUpdated(payload: ConversationUpdatedPayload): void {
    const { companyId, conversationId } = payload;

    this.gateway.server
      .to(`conversation:${conversationId}`)
      .to(`company:${companyId}`)
      .emit('conversation.updated', payload);

    this.logger.debug(`conversation.updated → ${conversationId}`);
  }

  // ── Conversa atribuída a um agente ────────────────────────────────────────
  async emitConversationAssigned(payload: ConversationAssignedPayload): Promise<void> {
    const { companyId, conversationId, agentId } = payload;
    const signedPayload = await this.storage.presignDeep(payload);

    // União das salas: conversa + empresa + agente atribuído (sem duplicar
    // para sockets presentes em mais de uma sala)
    let broadcast = this.gateway.server
      .to(`conversation:${conversationId}`)
      .to(`company:${companyId}`);

    if (agentId) {
      broadcast = broadcast.to(`agent:${agentId}`);
    }

    broadcast.emit('conversation.assigned', signedPayload);

    this.logger.debug(
      `conversation.assigned → ${conversationId} | agente: ${agentId ?? 'nenhum'}`,
    );
  }

  // ── Status da conexão WhatsApp mudou ─────────────────────────────────────
  emitConnectionStatus(payload: ConnectionStatusPayload): void {
    const { companyId } = payload;

    this.gateway.server
      .to(`company:${companyId}`)
      .emit('connection.status', payload);

    this.logger.debug(
      `connection.status → company:${companyId} | ${payload.sessionName} : ${payload.status}`,
    );
  }

  // ── SLA violado (conversa esperando muito tempo) ───────────────────────────
  emitSlaBreached(payload: SlaBreachedPayload): void {
    const { companyId, conversationId } = payload;

    // União das salas: empresa (supervisores/disponíveis) + conversa em questão
    this.gateway.server
      .to(`company:${companyId}`)
      .to(`conversation:${conversationId}`)
      .emit('sla.breached', payload);

    this.logger.warn(
      `sla.breached → ${conversationId} | aguardando ${payload.waitTimeSeconds}s (limite: ${payload.maxWaitSecs}s)`,
    );
  }
}
