import { Injectable, Logger } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

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

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly gateway: EventsGateway) {}

  // ── Nova mensagem recebida ────────────────────────────────────────────────
  emitNewMessage(payload: MessageNewPayload): void {
    const { companyId, conversationId } = payload;

    // Emite para todos na sala da conversa (agente que está com ela aberta)
    this.gateway.server
      .to(`conversation:${conversationId}`)
      .emit('message.new', payload);

    // Emite também para a sala da empresa (para atualizar lista de conversas)
    this.gateway.server
      .to(`company:${companyId}`)
      .emit('message.new', payload);

    this.logger.debug(`message.new → conversation:${conversationId}`);
  }

  // ── Status de mensagem atualizado (entregue, lido) ────────────────────────
  emitMessageStatus(payload: MessageStatusPayload): void {
    const { companyId, conversationId } = payload;

    this.gateway.server
      .to(`conversation:${conversationId}`)
      .emit('message.status', payload);

    this.gateway.server
      .to(`company:${companyId}`)
      .emit('message.status', payload);

    this.logger.debug(`message.status → ${payload.externalId} : ${payload.status}`);
  }

  // ── Nova conversa criada ──────────────────────────────────────────────────
  emitConversationCreated(payload: ConversationCreatedPayload): void {
    const { companyId } = payload;

    // Notifica todos da empresa sobre nova conversa na fila
    this.gateway.server
      .to(`company:${companyId}`)
      .emit('conversation.created', payload);

    this.logger.debug(
      `conversation.created → company:${companyId} | id: ${payload.conversation.id}`,
    );
  }

  // ── Conversa atualizada (status, tags, etc.) ──────────────────────────────
  emitConversationUpdated(payload: ConversationUpdatedPayload): void {
    const { companyId, conversationId } = payload;

    this.gateway.server
      .to(`conversation:${conversationId}`)
      .emit('conversation.updated', payload);

    this.gateway.server
      .to(`company:${companyId}`)
      .emit('conversation.updated', payload);

    this.logger.debug(`conversation.updated → ${conversationId}`);
  }

  // ── Conversa atribuída a um agente ────────────────────────────────────────
  emitConversationAssigned(payload: ConversationAssignedPayload): void {
    const { companyId, conversationId, agentId } = payload;

    // Notifica a sala da conversa
    this.gateway.server
      .to(`conversation:${conversationId}`)
      .emit('conversation.assigned', payload);

    // Notifica toda a empresa (lista de conversas precisa atualizar)
    this.gateway.server
      .to(`company:${companyId}`)
      .emit('conversation.assigned', payload);

    // Notifica o agente específico (para ele saber que recebeu uma atribuição)
    if (agentId) {
      this.gateway.server
        .to(`agent:${agentId}`)
        .emit('conversation.assigned', payload);
    }

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
}
