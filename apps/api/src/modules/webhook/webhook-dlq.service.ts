import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';
import { WebhookJobData } from './webhook.processor';
import { WebhookDlqEntry } from './webhook-dlq.types';
import { buildWebhookJobOptions } from './webhook-queue.config';
import { formatWebhookLog } from './webhook-log.util';

export interface WebhookDlqSummary {
  id: string;
  event: string;
  instance: string;
  error: string;
  attempts: number;
  timestamp: string;
  requestId: string | null;
  conversationId: string | null;
  messageId: string | null;
  status: string;
  reason: string;
}

// ── B-39: administração da dead letter queue ────────────────────────────────
// Toda operação é filtrada por tenant (companyId do ADMIN autenticado) —
// a DLQ carrega payload real de webhook (conteúdo de mensagem de cliente),
// então listar/reprocessar/descartar sem esse filtro vazaria dado de uma
// empresa pra outra. Item sem tenant resolvido (falha ocorreu antes da
// conexão WhatsApp ser identificada) não aparece pra ninguém por aqui —
// ver ressalva no relatório de B-39.
@Injectable()
export class WebhookDlqService {
  private readonly logger = new Logger(WebhookDlqService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.WEBHOOK) private readonly webhookQueue: Queue<WebhookJobData>,
    @InjectQueue(QUEUE_NAMES.WEBHOOK_DLQ) private readonly dlqQueue: Queue<WebhookDlqEntry>,
    private readonly config: ConfigService,
  ) {}

  async list(companyId: string): Promise<WebhookDlqSummary[]> {
    const jobs = await this.dlqQueue.getJobs(['waiting', 'delayed', 'paused']);

    return jobs
      .filter((job) => job.data.tenant === companyId)
      .map((job) => this.toSummary(job))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  // Reprocessar cria a mensagem sem duplicar: o payload original volta pra
  // fila principal com a MESMA política de retry, e a persistência a
  // jusante (Contact/Conversation/Message) já dedupe por externalId
  // (webhook.service.ts) — reprocessar 2x o mesmo item da DLQ é seguro.
  async reprocess(companyId: string, jobId: string): Promise<{ requeued: boolean; newJobId: string | number }> {
    const job = await this.findOwnedJob(companyId, jobId);

    const newJob = await this.webhookQueue.add(
      { ...job.data.payload, requestId: job.data.requestId ?? undefined },
      buildWebhookJobOptions(this.config),
    );

    await job.remove();

    this.logger.log(
      formatWebhookLog('WebhookReprocessed', {
        queue: QUEUE_NAMES.WEBHOOK_DLQ,
        dlqJob: jobId,
        newJob: newJob.id,
        tenant: companyId,
        requestId: job.data.requestId,
        messageId: job.data.messageId,
        conversationId: job.data.conversationId,
      }),
    );

    return { requeued: true, newJobId: newJob.id };
  }

  async discard(companyId: string, jobId: string): Promise<{ discarded: boolean }> {
    const job = await this.findOwnedJob(companyId, jobId);
    await job.remove();

    this.logger.log(`DLQ: job ${jobId} (tenant ${companyId}) descartado manualmente`);

    return { discarded: true };
  }

  private async findOwnedJob(companyId: string, jobId: string): Promise<Job<WebhookDlqEntry>> {
    const job = await this.dlqQueue.getJob(jobId);

    // 404 (não 403) em ambos os casos — não vaza se o item existe mas é de
    // outra empresa, mesmo padrão já usado no resto da API (ver B-38/B-39
    // critério de aceite no roadmap).
    if (!job || job.data.tenant !== companyId) {
      throw new NotFoundException('Item não encontrado na fila de falhas');
    }

    return job;
  }

  private toSummary(job: Job<WebhookDlqEntry>): WebhookDlqSummary {
    return {
      id: String(job.id),
      event: job.data.payload.event,
      instance: job.data.payload.instance,
      error: job.data.error,
      attempts: job.data.attempts,
      timestamp: job.data.timestamp,
      requestId: job.data.requestId,
      conversationId: job.data.conversationId,
      messageId: job.data.messageId,
      status: job.data.status,
      reason: job.data.reason,
    };
  }
}
