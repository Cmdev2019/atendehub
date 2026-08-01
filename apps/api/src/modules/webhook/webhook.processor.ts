import { InjectQueue, OnQueueFailed, OnQueueStalled, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
import * as Sentry from '@sentry/node';
import { WebhookService } from './webhook.service';
import { WebhookMetricsService } from './webhook-metrics.service';
import { classifyWebhookError, WebhookErrorClass } from './webhook.errors';
import { WebhookDlqEntry } from './webhook-dlq.types';
import { formatWebhookLog, WORKER_ID } from './webhook-log.util';
import { extractPhoneFromJid } from '../../shared/whatsapp/jid.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

// ─── Job data structure ────────────────────────────────────────────────────────
export interface WebhookJobData {
  event: string;
  instance: string;
  data: any;
  // B-39: correlação ponta a ponta (HTTP → job → log → DLQ). Opcional só
  // pra não quebrar quem já construía WebhookJobData sem esse campo (specs
  // antigas, por exemplo) — sempre preenchido pelo controller de verdade.
  requestId?: string;
  // Subconjunto dos headers HTTP recebidos com valor de negócio (não o dump
  // bruto de todos os headers — evita reter lixo/PII desnecessária em Redis).
  receivedHeaders?: Record<string, string>;
}

/**
 * Processor que consome jobs de webhook da Evolution API.
 *
 * Responsabilidades:
 * - Processar eventos assincronamente (evita timeout no webhook)
 * - Download de mídias
 * - Criação de Contact, Conversation, Message
 * - Emissão de eventos Socket.IO
 *
 * O webhook controller adiciona o job e retorna 200 imediatamente.
 * Este processor processa em background.
 *
 * B-39: o job SEMPRE relança a exceção pro Bull (nunca a engole) — é o que
 * faz `attempts`/`backoff` (webhook-queue.config.ts) terem efeito de verdade.
 * Falha definitiva (tentativas esgotadas ou erro permanente via
 * `job.discard()`) é capturada em `onFailed`, que move o job pra DLQ.
 */
@Processor(QUEUE_NAMES.WEBHOOK)
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly prisma: PrismaService,
    private readonly metrics: WebhookMetricsService,
    @InjectQueue(QUEUE_NAMES.WEBHOOK_DLQ) private readonly dlqQueue: Queue,
  ) {}

  @Process()
  async handleWebhookEvent(job: Job<WebhookJobData>): Promise<void> {
    const { event, instance, requestId } = job.data;
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts?.attempts ?? 1;
    const startedAt = Date.now();

    const baseFields = {
      queue: QUEUE_NAMES.WEBHOOK,
      processor: WebhookProcessor.name,
      worker: WORKER_ID,
      job: job.id,
      event,
      instance,
      attempt: `${attempt}/${maxAttempts}`,
      requestId,
      traceId: requestId, // sem tracing distribuído (APM) no projeto — requestId é a correlação disponível
    };

    this.logger.debug(formatWebhookLog('WebhookJobStarted', baseFields));

    try {
      await this.webhookService.handleEvent(job.data);

      const elapsedTime = Date.now() - startedAt;
      this.metrics.recordSuccess(elapsedTime);

      this.logger.log(formatWebhookLog('WebhookJobSucceeded', { ...baseFields, elapsedTime: `${elapsedTime}ms` }));
    } catch (err: any) {
      const elapsedTime = Date.now() - startedAt;
      const classification = classifyWebhookError(err);

      // Erro permanente: retentar não muda o resultado — pula direto pra
      // falha definitiva mesmo com tentativas sobrando (onFailed → DLQ).
      if (classification === 'permanent') {
        await job.discard();
      }

      const willRetry = classification !== 'permanent' && attempt < maxAttempts;
      this.metrics.recordFailedAttempt(classification);
      if (willRetry) this.metrics.recordRetryScheduled();

      this.logger.error(
        formatWebhookLog(willRetry ? 'WebhookRetry' : 'WebhookFailed', {
          ...baseFields,
          elapsedTime: `${elapsedTime}ms`,
          classification,
          errorCode: err.code ?? err.response?.status ?? err.name,
          error: err.message,
        }),
        err.stack,
      );

      // Propaga o erro para que o Bull registre a falha e tente novamente
      // (ou, se discarded, feche o job como failed sem mais tentativas).
      throw err;
    }
  }

  // ── Falha definitiva (B-39) ─────────────────────────────────────────────────
  // O evento 'failed' do Bull dispara em TODA tentativa que lança, não só na
  // última — confirmado lendo `bull/lib/queue.js#handleFailed` (chama
  // `job.moveToFailed()` e emite 'failed' incondicionalmente; é o próprio
  // `moveToFailed` que decide, internamente, se agenda um retry ou marca
  // falha terminal). Achado durante a validação operacional do B-39: sem
  // este guard, TODA falha transitória — mesmo uma que o Bull ainda vai
  // retentar com sucesso goleiro — criava uma entrada na DLQ, inflando-a
  // com falsos positivos. Só prossegue pra DLQ/Sentry/métrica quando o Bull
  // não vai tentar de novo: tentativas esgotadas OU `job.discard()` (erro
  // permanente, ver handleWebhookEvent).
  @OnQueueFailed()
  async onFailed(job: Job<WebhookJobData>, err: Error): Promise<void> {
    const maxAttempts = job.opts?.attempts ?? job.attemptsMade;
    const isDiscarded = typeof (job as any).isDiscarded === 'function' && (job as any).isDiscarded();
    const willRetry = job.attemptsMade < maxAttempts && !isDiscarded;

    if (willRetry) {
      // Nada a fazer aqui — WebhookRetry (handleWebhookEvent) já logou essa
      // tentativa; o Bull agenda o próximo attempt sozinho.
      return;
    }

    const { event, instance, data, requestId, receivedHeaders } = job.data;
    const classification = classifyWebhookError(err);

    const baseFields = {
      queue: QUEUE_NAMES.WEBHOOK,
      processor: WebhookProcessor.name,
      worker: WORKER_ID,
      job: job.id,
      event,
      instance,
      attempt: `${job.attemptsMade}/${maxAttempts}`,
      requestId,
      traceId: requestId,
    };

    this.logger.error(
      formatWebhookLog('WebhookFailed', { ...baseFields, definitivo: true, error: err.message }),
    );

    try {
      const tenant = await this.resolveTenant(instance);
      const messageId = this.extractMessageId(data);
      const conversationId = await this.resolveConversationId(tenant, data);
      const reason = this.buildDlqReason(classification, job.attemptsMade, maxAttempts, err);

      const dlqEntry: WebhookDlqEntry = {
        originalQueue: QUEUE_NAMES.WEBHOOK,
        originalJobId: String(job.id),
        payload: { event, instance, data },
        headers: receivedHeaders ?? {},
        error: err.message,
        stack: err.stack ?? null,
        attempts: job.attemptsMade,
        lastException: err.message,
        timestamp: new Date().toISOString(),
        requestId: requestId ?? null,
        tenant,
        conversationId,
        messageId,
        status: 'MOVED_TO_DLQ',
        reason,
      };

      // Fila sem processor: só acumula, nunca processa sozinha. Sai por
      // reprocessamento manual (WebhookDlqService#reprocess) ou descarte
      // (WebhookDlqService#discard).
      await this.dlqQueue.add(dlqEntry, { removeOnFail: false, attempts: 1 });

      Sentry.captureException(err, {
        tags: { queue: QUEUE_NAMES.WEBHOOK, event, instance, tenant: tenant ?? 'desconhecido' },
        extra: { jobId: job.id, attempts: job.attemptsMade, requestId, messageId, conversationId },
      });

      this.metrics.recordMovedToDlq();

      this.logger.error(
        formatWebhookLog('WebhookMovedToDLQ', {
          ...baseFields,
          tenant: tenant ?? 'desconhecido',
          messageId,
          conversationId,
          reason,
        }),
      );
    } catch (dlqErr: any) {
      // Best-effort: se até registrar na DLQ falhar (ex.: Redis caiu bem
      // nesse instante), o job original já está perdido de qualquer forma —
      // loga alto e segue. Nunca deixa uma exceção aqui vazar pro Bull.
      this.logger.error(
        `Falha ao mover job ${job.id} para ${QUEUE_NAMES.WEBHOOK_DLQ}: ${dlqErr.message}`,
        dlqErr.stack,
      );
    }
  }

  @OnQueueStalled()
  onStalled(job: Job<WebhookJobData>): void {
    this.logger.warn(
      formatWebhookLog('WebhookStalled', {
        queue: QUEUE_NAMES.WEBHOOK,
        processor: WebhookProcessor.name,
        worker: WORKER_ID,
        job: job.id,
      }) + ' — worker pode ter caído no meio do processamento',
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private buildDlqReason(
    classification: WebhookErrorClass,
    attemptsMade: number,
    maxAttempts: number,
    err: Error,
  ): string {
    if (classification === 'permanent') {
      return `Erro permanente — não retentável (${err.message})`;
    }
    return `Tentativas esgotadas (${attemptsMade}/${maxAttempts})`;
  }

  private async resolveTenant(sessionName: string): Promise<string | null> {
    try {
      const connection = await this.prisma.whatsAppConnection.findUnique({
        where: { sessionName },
        select: { companyId: true },
      });
      return connection?.companyId ?? null;
    } catch {
      // Se nem o Postgres responde, não há tenant a resolver — a entrada
      // na DLQ ainda é criada, só sem esse campo.
      return null;
    }
  }

  // Best-effort: casa o remetente da 1ª mensagem do payload com uma
  // conversa já existente. Não CRIA nada (só leitura) — se a conversa ainda
  // não existia quando o processamento falhou, fica null; reprocessar da
  // DLQ resolve isso normalmente pelo fluxo principal.
  private async resolveConversationId(tenant: string | null, data: any): Promise<string | null> {
    if (!tenant) return null;

    const first = Array.isArray(data) ? data[0] : data;
    const phone = extractPhoneFromJid(first?.key?.remoteJid);
    if (!phone) return null;

    try {
      const contact = await this.prisma.contact.findFirst({
        where: { companyId: tenant, phone },
        select: { id: true },
      });
      if (!contact) return null;

      const conversation = await this.prisma.conversation.findFirst({
        where: { companyId: tenant, contactId: contact.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      return conversation?.id ?? null;
    } catch {
      return null;
    }
  }

  // Best-effort a partir do payload cru da Evolution — não depende de
  // nenhum processamento ter tido sucesso (falha pode ter ocorrido antes
  // mesmo da mensagem ser persistida).
  private extractMessageId(data: any): string | null {
    const first = Array.isArray(data) ? data[0] : data;
    return first?.key?.id ?? null;
  }
}
