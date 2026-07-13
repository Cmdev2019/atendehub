import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MessageType, Role } from '@prisma/client';
import { SendMessageService } from './send-message.service';
import { SendMessageDto } from './dto/send-message.dto';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

// ─── Job data structure ────────────────────────────────────────────────────────
export interface SendMessageJobData {
  companyId: string;
  conversationId: string;
  senderId: string;
  senderRole: Role;
  dto: SendMessageDto;
}

/**
 * Processor que consome jobs de envio de mensagens da fila.
 *
 * Responsabilidades:
 * - Enviar mensagens via Evolution API
 * - Retry automático (configurado no BullModule.forRoot)
 * - Log de erros persistentes após todas as tentativas
 *
 * O BullMQ automaticamente:
 * - Retenta jobs que lançam exceção
 * - Aplica backoff exponencial
 * - Move para 'failed' após esgotar tentativas
 */
@Processor(QUEUE_NAMES.MESSAGE_SEND)
export class MessageSendProcessor {
  private readonly logger = new Logger(MessageSendProcessor.name);

  constructor(private readonly sendMessageService: SendMessageService) {}

  @Process()
  async handleSendMessage(job: Job<SendMessageJobData>): Promise<void> {
    const { companyId, conversationId, senderId, senderRole, dto } = job.data;

    this.logger.debug(
      `Processando job ${job.id}: envio de ${dto.type} para conversa ${conversationId}`,
    );

    try {
      await this.sendMessageService.send(
        companyId,
        conversationId,
        senderId,
        senderRole,
        dto,
      );

      this.logger.log(
        `Job ${job.id} concluído: mensagem enviada com sucesso`,
      );
    } catch (err: any) {
      this.logger.error(
        `Job ${job.id} falhou (tentativa ${job.attemptsMade}/${job.opts.attempts}): ${err.message}`,
      );
      // Propaga o erro para que o Bull registre a falha e tente novamente
      throw err;
    }
  }
}
