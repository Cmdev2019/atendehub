import { BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job, JobOptions } from 'bull';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';
import { EventsService } from '../events/events.service';
import { MediaDownloadService } from './media-download.service';

export interface MediaDownloadJobData {
  messageId: string;
  conversationId: string;
  companyId: string;
  sessionName: string;
  externalMessageId: string;
  mimeType: string;
  fileName?: string;
}

// B-76 (M-01): o download da mídia recebida tinha uma tentativa só, em
// segundo plano e engolindo o erro — uma falha passageira da Evolution ou do
// storage perdia o anexo para sempre. Agora é um job com retry; o id do job é
// o da mensagem, então reenfileirar não duplica.
export const MEDIA_DOWNLOAD_JOB_OPTIONS: JobOptions = {
  attempts: 6,
  backoff: { type: 'exponential', delay: 10_000 }, // 10s, 20s, 40s... ~5 min no total
  removeOnComplete: 500,
  removeOnFail: 200,
};

export const mediaDownloadJobId = (messageId: string) => `media:${messageId}`;

// B-77 (M-03): por que a mensagem ficou sem anexo — gravado em
// `Message.metadata.mediaError` e mostrado ao atendente no lugar do arquivo.
// Antes o descarte era silencioso: o balão ficava com o placeholder para
// sempre.
export const MEDIA_ERROR = {
  UNSUPPORTED_TYPE: 'unsupported_type', // tipo fora das listas do storage
  DOWNLOAD_FAILED: 'download_failed', // tentativas esgotadas
} as const;

@Processor(QUEUE_NAMES.MEDIA_DOWNLOAD)
export class MediaDownloadProcessor {
  private readonly logger = new Logger(MediaDownloadProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaDownloadService: MediaDownloadService,
    private readonly eventsService: EventsService,
  ) {}

  @Process()
  async handle(job: Job<MediaDownloadJobData>): Promise<void> {
    const { messageId, conversationId, companyId, sessionName, externalMessageId, mimeType, fileName } =
      job.data;

    // Idempotente: uma tentativa anterior pode ter gravado o anexo e caído
    // antes de terminar.
    const existing = await this.prisma.attachment.findFirst({
      where: { messageId },
      select: { id: true },
    });
    if (existing) return;

    // Lança em qualquer falha — o Bull agenda a próxima tentativa. Tipo não
    // aceito pelo storage é permanente: tentar de novo não muda nada.
    let result;
    try {
      result = await this.mediaDownloadService.downloadFromEvolution(
        sessionName,
        externalMessageId,
        mimeType,
        companyId,
        fileName,
      );
    } catch (err) {
      if (err instanceof BadRequestException) {
        this.logger.warn(`Mídia da msg ${externalMessageId} recusada pelo storage: ${err.message}`);
        await this.markMediaError(job.data, MEDIA_ERROR.UNSUPPORTED_TYPE);
        return;
      }
      throw err;
    }

    const attachment = await this.prisma.attachment.create({
      data: {
        messageId,
        url: result.url,
        mimeType: result.mimeType,
        fileName: result.fileName ?? null,
        size: result.size,
      },
    });

    // O message.new já foi emitido — avisa a UI que o anexo ficou pronto
    // (troca o placeholder pela mídia real, sem F5).
    await this.eventsService.emitMessageUpdated({
      companyId,
      conversationId,
      messageId,
      attachment: {
        id: attachment.id,
        url: attachment.url,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
      },
    });

    this.logger.debug(`Attachment criado para msg ${externalMessageId}`);
  }

  @OnQueueFailed()
  async onFailed(job: Job<MediaDownloadJobData>, err: Error) {
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      this.logger.warn(
        `Download de mídia da msg ${job.data.externalMessageId} falhou (tentativa ${job.attemptsMade}/${attempts}): ${err.message}`,
      );
      return;
    }
    this.logger.error(
      `Mídia da msg ${job.data.externalMessageId} não baixada após ${attempts} tentativas: ${err.message}`,
    );
    await this.markMediaError(job.data, MEDIA_ERROR.DOWNLOAD_FAILED).catch((markErr: Error) =>
      this.logger.error(`Falha ao registrar mídia perdida da msg ${job.data.externalMessageId}: ${markErr.message}`),
    );
  }

  private async markMediaError(data: MediaDownloadJobData, mediaError: string): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: data.messageId },
      select: { metadata: true },
    });
    if (!message) return;

    const metadata = (message.metadata ?? {}) as Prisma.JsonObject;
    await this.prisma.message.update({
      where: { id: data.messageId },
      data: { metadata: { ...metadata, mediaError } },
    });
    await this.eventsService.emitMessageUpdated({
      companyId: data.companyId,
      conversationId: data.conversationId,
      messageId: data.messageId,
      mediaError,
    });
  }
}
