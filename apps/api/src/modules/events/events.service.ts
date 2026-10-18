import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { roomsForConversation } from './scope-rooms';
import { EventsGateway, sessionRoom } from './events.gateway';
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
    private readonly prisma: PrismaService,
  ) {}

  // C-10/B-40: salas de quem pode ver a conversa — empresa inteira (ADMIN/
  // SUPERVISOR), departamento da conversa (ou "sem departamento") e o agente
  // atribuído. Lido do banco no momento do evento, para valer o departamento
  // e o agente atuais (transferências incluídas).
  private async conversationRooms(companyId: string, conversationId: string): Promise<string[]> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
      select: { departmentId: true, agentId: true },
    });
    return [`conversation:${conversationId}`, ...roomsForConversation(companyId, conversation)];
  }

  private emitToConversation(
    companyId: string,
    conversationId: string,
    event: string,
    payload: unknown,
    extraRooms: string[] = [],
  ): Promise<void> {
    return this.conversationRooms(companyId, conversationId)
      .then((rooms) => {
        this.gateway.server.to([...rooms, ...extraRooms]).emit(event, payload);
      })
      .catch((err) => this.logger.error(`Falha ao emitir ${event}: ${err.message}`));
  }

  // ── Nova mensagem recebida ────────────────────────────────────────────────
  emitNewMessage(payload: MessageNewPayload): void {
    const { companyId, conversationId } = payload;

    // Salas encadeadas numa única emissão: o Socket.IO entrega à UNIÃO das
    // salas, sem duplicar para sockets presentes em ambas.
    void this.emitToConversation(companyId, conversationId, 'message.new', payload);

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

    await this.emitToConversation(companyId, conversationId, 'message.updated', signedPayload);

    this.logger.debug(`message.updated → msg ${payload.messageId} (anexo pronto)`);
  }

  // ── Status de mensagem atualizado (entregue, lido) ────────────────────────
  emitMessageStatus(payload: MessageStatusPayload): void {
    const { companyId, conversationId } = payload;

    void this.emitToConversation(companyId, conversationId, 'message.status', payload);

    this.logger.debug(`message.status → ${payload.externalId} : ${payload.status}`);
  }

  // ── Nova conversa criada ──────────────────────────────────────────────────
  async emitConversationCreated(payload: ConversationCreatedPayload): Promise<void> {
    const { companyId } = payload;
    const signedPayload = await this.storage.presignDeep(payload);

    // Notifica quem pode ver a conversa nova (C-10/B-40 — antes, a empresa toda)
    await this.emitToConversation(
      companyId,
      payload.conversation.id,
      'conversation.created',
      signedPayload,
    );

    this.logger.debug(
      `conversation.created → company:${companyId} | id: ${payload.conversation.id}`,
    );
  }

  // ── Conversa atualizada (status, tags, etc.) ──────────────────────────────
  emitConversationUpdated(payload: ConversationUpdatedPayload): void {
    const { companyId, conversationId } = payload;

    void this.emitToConversation(companyId, conversationId, 'conversation.updated', payload);

    this.logger.debug(`conversation.updated → ${conversationId}`);
  }

  // ── Conversa atribuída a um agente ────────────────────────────────────────
  async emitConversationAssigned(payload: ConversationAssignedPayload): Promise<void> {
    const { companyId, conversationId, agentId } = payload;
    const signedPayload = await this.storage.presignDeep(payload);

    // Salas de escopo (o agente atribuído já entra por elas) — sem duplicar
    // para sockets presentes em mais de uma sala
    await this.emitToConversation(companyId, conversationId, 'conversation.assigned', signedPayload);

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

  // ── Encerramento de sessão (B-74 / M-09) ──────────────────────────────────
  // Sem isto, o socket aberto seguia recebendo eventos depois do logout, da
  // desativação do usuário ou da troca de senha. Via adapter do Redis, vale
  // para sockets em qualquer réplica. `keepSession` preserva a sessão de quem
  // trocou a própria senha: ela recebe tokens novos e não deve cair.
  disconnectUser(userId: string, keepSession?: string): void {
    const target = this.gateway.server.in(`agent:${userId}`);
    (keepSession ? target.except(sessionRoom(keepSession)) : target).disconnectSockets(true);
    this.logger.log(`Sockets do usuário ${userId} desconectados (sessão encerrada)`);
  }

  disconnectSession(jti: string): void {
    this.gateway.server.in(sessionRoom(jti)).disconnectSockets(true);
  }

  // ── SLA violado (conversa esperando muito tempo) ───────────────────────────
  emitSlaBreached(payload: SlaBreachedPayload): void {
    const { companyId, conversationId } = payload;

    // Quem pode ver a conversa (supervisores e o departamento dela)
    void this.emitToConversation(companyId, conversationId, 'sla.breached', payload);

    this.logger.warn(
      `sla.breached → ${conversationId} | aguardando ${payload.waitTimeSeconds}s (limite: ${payload.maxWaitSecs}s)`,
    );
  }
}
