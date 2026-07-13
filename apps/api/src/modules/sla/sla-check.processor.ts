import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConversationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

// ─── Job data structure ────────────────────────────────────────────────────────
export interface SlaCheckJobData {
  conversationId: string;
  companyId: string;
  maxWaitSecs: number;  // SLA em segundos (ex: 300 = 5min)
  queuedAt: Date;       // Momento em que entrou na fila
}

/**
 * Processor que monitora violações de SLA.
 *
 * Quando uma conversa entra na fila (status WAITING), um job é agendado com
 * delay igual ao SLA da fila. Se a conversa ainda estiver aguardando quando
 * o job executar, o SLA foi violado.
 *
 * Ações ao detectar violação:
 * - Marca slaBreachedAt na conversa
 * - Emite evento Socket.IO para alertar agentes
 * - Registra auditoria
 */
@Processor(QUEUE_NAMES.SLA_CHECK)
export class SlaCheckProcessor {
  private readonly logger = new Logger(SlaCheckProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  @Process()
  async handleSlaCheck(job: Job<SlaCheckJobData>): Promise<void> {
    const { conversationId, companyId, maxWaitSecs, queuedAt } = job.data;

    this.logger.debug(
      `Verificando SLA da conversa ${conversationId} (limite: ${maxWaitSecs}s)`,
    );

    try {
      // Busca a conversa atual
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          status: true,
          slaBreachedAt: true,
          agentId: true,
          queueId: true,
          contact: {
            select: { id: true, name: true, phone: true },
          },
          queue: {
            select: { id: true, name: true, maxWaitSecs: true },
          },
        },
      });

      if (!conversation) {
        this.logger.warn(`Conversa ${conversationId} não encontrada (pode ter sido deletada)`);
        return;
      }

      // ── Verifica se ainda está aguardando atendimento ─────────────────────
      if (conversation.status !== ConversationStatus.WAITING) {
        this.logger.debug(
          `Conversa ${conversationId} já foi atendida (status: ${conversation.status}). SLA OK.`,
        );
        return;
      }

      // ── Verifica se SLA já foi marcado anteriormente ──────────────────────
      if (conversation.slaBreachedAt) {
        this.logger.debug(
          `SLA da conversa ${conversationId} já foi marcado em ${conversation.slaBreachedAt}`,
        );
        return;
      }

      // ── SLA VIOLADO: marca timestamp e registra ───────────────────────────
      const now = new Date();
      const waitTimeSeconds = Math.floor((now.getTime() - new Date(queuedAt).getTime()) / 1000);

      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { slaBreachedAt: now },
      });

      this.logger.warn(
        `⚠️  SLA violado: conversa ${conversationId} aguardando há ${waitTimeSeconds}s (limite: ${maxWaitSecs}s)`,
      );

      // ── Emite evento Socket.IO para alertar agentes ───────────────────────
      this.eventsService.emitSlaBreached({
        companyId,
        conversationId,
        contact: conversation.contact,
        queue: conversation.queue,
        waitTimeSeconds,
        maxWaitSecs,
        breachedAt: now,
      });

      // ── Registra auditoria ─────────────────────────────────────────────────
      await this.prisma.auditLog.create({
        data: {
          companyId,
          action: 'sla.breached',
          entity: 'Conversation',
          entityId: conversationId,
          before: Prisma.JsonNull,
          after: {
            slaBreachedAt: now.toISOString(),
            waitTimeSeconds,
            maxWaitSecs,
            queueId: conversation.queueId,
            queueName: conversation.queue?.name,
          },
        },
      });

      this.logger.log(
        `SLA breach registrado: conversa ${conversationId}, auditoria criada`,
      );
    } catch (err: any) {
      this.logger.error(
        `Erro ao verificar SLA da conversa ${conversationId}: ${err.message}`,
        err.stack,
      );
      // Não propaga o erro — falhas de SLA não devem parar o sistema
    }
  }
}
