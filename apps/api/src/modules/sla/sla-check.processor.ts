import { OnQueueFailed, OnQueueStalled, Process, Processor } from '@nestjs/bull';
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

// B-114 (ADR-0019, regras 18 a 21): o SLA do atendimento usa a mesma fila,
// com `kind: 'service'` e jobId próprio (`service-sla:<id da conversa>`)
export interface ServiceSlaJobData {
  kind: 'service';
  conversationId: string;
  companyId: string;
  maxServiceSecs: number; // prazo do setor, contado no expediente
  attendedAt: Date;       // início do atendimento
}

// Quem pode intervir numa conversa fora do prazo
const RESPONDER_ROLES = [Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN];

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
  async handleSlaCheck(job: Job<SlaCheckJobData | ServiceSlaJobData>): Promise<void> {
    if ('kind' in job.data && job.data.kind === 'service') {
      return this.handleServiceSla(job as Job<ServiceSlaJobData>);
    }
    const { conversationId, companyId, maxWaitSecs, queuedAt } = job.data as SlaCheckJobData;

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
          waitingSince: true,
          waitSlaDueAt: true,
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

      // ── B-66: o prazo vale o da conversa ─────────────────────────────────
      // Um job de um ciclo anterior (que não pôde ser removido a tempo) não
      // alerta o ciclo novo antes da hora. Sem prazo gravado (job antigo),
      // vale o agendamento do próprio job.
      if (conversation.waitSlaDueAt && conversation.waitSlaDueAt.getTime() > Date.now() + 1000) {
        this.logger.debug(
          `Conversa ${conversationId}: prazo atual ${conversation.waitSlaDueAt.toISOString()} ainda não venceu (job de outro ciclo)`,
        );
        return;
      }

      // ── SLA VIOLADO: marca timestamp e registra ───────────────────────────
      const now = new Date();
      const waitStart = conversation.waitingSince ?? new Date(queuedAt);
      const waitTimeSeconds = Math.floor((now.getTime() - waitStart.getTime()) / 1000);

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
        where: { companyId, isActive: true, role: { in: RESPONDER_ROLES } },
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

  // ── SLA do atendimento (B-114 / ADR-0019, regras 18 a 21) ──────────────────
  // A conversa segue em atendimento depois do prazo do setor: marca o estouro
  // e avisa quem está atendendo e quem pode intervir (supervisor e admin).
  private async handleServiceSla(job: Job<ServiceSlaJobData>): Promise<void> {
    const { conversationId, companyId, maxServiceSecs, attendedAt } = job.data;

    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          status: true,
          agentId: true,
          queueId: true,
          attendedAt: true,
          serviceSlaDueAt: true,
          serviceSlaBreachedAt: true,
          contact: { select: { id: true, name: true, phone: true } },
          queue: { select: { id: true, name: true, maxServiceSecs: true } },
        },
      });

      if (!conversation) {
        this.logger.warn(`Conversa ${conversationId} não encontrada (pode ter sido deletada)`);
        return;
      }

      // Encerrada, devolvida à fila ou já marcada: nada a alertar
      if (
        conversation.status !== ConversationStatus.OPEN ||
        !conversation.serviceSlaDueAt ||
        conversation.serviceSlaBreachedAt
      ) {
        this.logger.debug(`Conversa ${conversationId}: atendimento sem prazo pendente. SLA do atendimento OK.`);
        return;
      }

      // Job de um ciclo anterior (o relógio recomeça ao mudar de setor) não
      // alerta o ciclo novo antes da hora
      if (conversation.serviceSlaDueAt.getTime() > Date.now() + 1000) {
        this.logger.debug(
          `Conversa ${conversationId}: prazo do atendimento ${conversation.serviceSlaDueAt.toISOString()} ainda não venceu (job de outro ciclo)`,
        );
        return;
      }

      // Troca condicional: um job repetido não marca nem avisa duas vezes
      const now = new Date();
      const { count } = await this.prisma.conversation.updateMany({
        where: { id: conversationId, status: ConversationStatus.OPEN, serviceSlaBreachedAt: null },
        data: { serviceSlaBreachedAt: now },
      });
      if (count === 0) return;

      const serviceStart = conversation.attendedAt ?? new Date(attendedAt);
      const serviceTimeSeconds = Math.floor((now.getTime() - serviceStart.getTime()) / 1000);

      this.logger.warn(
        `⚠️  SLA do atendimento violado: conversa ${conversationId} em atendimento há ${serviceTimeSeconds}s (limite: ${maxServiceSecs}s)`,
      );

      this.eventsService.emitServiceSlaBreached({
        companyId,
        conversationId,
        agentId: conversation.agentId,
        contact: conversation.contact,
        queue: conversation.queue,
        serviceTimeSeconds,
        maxServiceSecs,
        breachedAt: now,
      });

      await this.auditLog.record({
        companyId,
        action: 'sla.service_breached',
        entity: 'Conversation',
        entityId: conversationId,
        after: {
          serviceSlaBreachedAt: now.toISOString(),
          serviceTimeSeconds,
          maxServiceSecs,
          agentId: conversation.agentId,
          queueId: conversation.queueId,
          queueName: conversation.queue?.name,
        },
      });

      // Regra 21: quem está atendendo e quem pode intervir, cada um uma vez
      const responders = await this.prisma.user.findMany({
        where: { companyId, isActive: true, role: { in: RESPONDER_ROLES } },
        select: { id: true },
      });
      const recipients = new Set([
        ...(conversation.agentId ? [conversation.agentId] : []),
        ...responders.map((responder) => responder.id),
      ]);

      await Promise.all(
        [...recipients].map((userId) =>
          this.notificationService.create({
            companyId,
            userId,
            type: 'service_sla_breach',
            title: 'Atendimento além do prazo',
            body: `${conversation.contact?.name ?? conversation.contact?.phone ?? 'Contato'} está em atendimento há ${serviceTimeSeconds}s (limite: ${maxServiceSecs}s)`,
            data: { conversationId, queueId: conversation.queueId },
          }),
        ),
      );
    } catch (err: any) {
      this.logger.error(
        `Job ${job.id} falhou ao verificar o SLA do atendimento da conversa ${conversationId} ` +
          `(tentativa ${job.attemptsMade}/${job.opts.attempts}): ${err.message}`,
        err.stack,
      );
      // Mesmo motivo do SLA da espera: engolir o erro perderia o alerta
      throw err;
    }
  }

  // ── Observabilidade (B6-3) ──────────────────────────────────────────────────
  // Aqui importa mais que no webhook: um job de SLA que falha definitivamente
  // é um alerta de SLA que nunca chegou a ninguém — silenciosamente.
  @OnQueueFailed()
  onFailed(job: Job<SlaCheckJobData | ServiceSlaJobData>, err: Error): void {
    this.logger.error(
      `Job ${job.id} (conversa ${job.data.conversationId}) falhou definitivamente após ` +
        `${job.attemptsMade} tentativa(s): ${err.message}`,
    );
  }

  @OnQueueStalled()
  onStalled(job: Job<SlaCheckJobData | ServiceSlaJobData>): void {
    this.logger.warn(
      `Job ${job.id} (conversa ${job.data.conversationId}) travado (stalled)`,
    );
  }
}
