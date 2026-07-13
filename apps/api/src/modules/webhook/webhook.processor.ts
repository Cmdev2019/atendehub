import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { WebhookService } from './webhook.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

// ─── Job data structure ────────────────────────────────────────────────────────
export interface WebhookJobData {
  event: string;
  instance: string;
  data: any;
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
 */
@Processor(QUEUE_NAMES.WEBHOOK)
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Process()
  async handleWebhookEvent(job: Job<WebhookJobData>): Promise<void> {
    const { event, instance } = job.data;

    this.logger.debug(
      `Processando job ${job.id}: evento ${event} da instância ${instance}`,
    );

    try {
      await this.webhookService.handleEvent(job.data);

      this.logger.log(`Job ${job.id} concluído: evento ${event} processado`);
    } catch (err: any) {
      this.logger.error(
        `Job ${job.id} falhou (tentativa ${job.attemptsMade}/${job.opts.attempts}): ${err.message}`,
        err.stack,
      );
      // Propaga o erro para que o Bull registre a falha e tente novamente
      throw err;
    }
  }
}
