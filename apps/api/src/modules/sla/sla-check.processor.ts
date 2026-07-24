import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConversationStatus, Role } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationService } from '../notification/notification.service';
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
    private readonly auditLog: AuditLogService,
    private readonly notificationService: NotificationService,
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

      // ── Registra auditoria (B1-4) ──────────────────────────────────────────
      await this.auditLog.record({
        companyId,
        action: 'sla.breached',
        entity: 'Conversation',
        entityId: conversationId,
        after: {
          slaBreachedAt: now.toISOString(),
          waitTimeSeconds,
          maxWaitSecs,
          queueId: conversation.queueId,
          queueName: conversation.queue?.name,
        },
      });

      // ── Notifica quem pode intervir (B1-3) ─────────────────────────────────
      // A conversa violou o SLA porque ninguém a atribuiu ainda — não há
      // agentId para notificar. Avisa SUPERVISOR/ADMIN/SUPER_ADMIN ativos da
      // empresa, que são quem consegue redistribuir/assumir a conversa.
      const responders = await this.prisma.user.findMany({
        where: {
          companyId,
          isActive: true,
          role: { in: [Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN] },
        },
        select: { id: true },
      });

      await Promise.all(
        responders.map((responder) =>
          this.notificationService.create({
            companyId,
            userId: responder.id,
            type: 'sla_breach',
            title: 'Conversa aguardando além do prazo',
            body: `${conversation.contact?.name ?? conversation.contact?.phone ?? 'Contato'} está esperando há ${waitTimeSeconds}s (limite: ${maxWaitSecs}s)`,
            data: { conversationId, queueId: conversation.queueId },
          }),
        ),
      );

      this.logger.log(
        `SLA breach registrado: conversa ${conversationId}, auditoria e ${responders.length} notificação(ões) criadas`,
      );
    } catch (err: any) {
      this.logger.error(
        `Job ${job.id} falhou ao verificar SLA da conversa ${conversationId} ` +
          `(tentativa ${job.attemptsMade}/${job.opts.attempts}): ${err.message}`,
        err.stack,
      );
      // Propaga para o Bull re-tentar (attempts/backoff globais em app.module.ts).
      // Como o job é de disparo único (delay = maxWaitSecs), engolir o erro aqui
      // faria uma falha transitória de banco perder o alerta de SLA para sempre.
      throw err;
    }
  }
}
