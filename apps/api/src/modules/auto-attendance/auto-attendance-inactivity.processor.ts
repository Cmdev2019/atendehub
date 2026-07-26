import { OnQueueFailed, OnQueueStalled, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';
import { AutoAttendanceEngineService } from './auto-attendance-engine.service';

export interface AutoAttendanceInactivityJobData {
  conversationId: string;
  companyId: string;
}

// Mesmo padrão do SlaCheckProcessor (apps/api/src/modules/sla/sla-check.processor.ts):
// job de disparo único agendado com delay = timeout configurado, reconsulta o
// estado atual antes de agir (a engine já faz essa checagem em
// handleInactivityTimeout — o contato pode ter respondido ou um agente pode
// ter assumido a conversa entre o agendamento e a execução do job).
@Processor(QUEUE_NAMES.AUTO_ATTENDANCE_INACTIVITY)
export class AutoAttendanceInactivityProcessor {
  private readonly logger = new Logger(AutoAttendanceInactivityProcessor.name);

  constructor(private readonly engine: AutoAttendanceEngineService) {}

  @Process()
  async handleTimeout(job: Job<AutoAttendanceInactivityJobData>): Promise<void> {
    const { conversationId, companyId } = job.data;
    try {
      await this.engine.handleInactivityTimeout(conversationId, companyId);
    } catch (err: any) {
      this.logger.error(
        `Job ${job.id} falhou ao processar inatividade da conversa ${conversationId} ` +
          `(tentativa ${job.attemptsMade}/${job.opts.attempts}): ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<AutoAttendanceInactivityJobData>, err: Error): void {
    this.logger.error(
      `Job ${job.id} (conversa ${job.data.conversationId}) falhou definitivamente após ` +
        `${job.attemptsMade} tentativa(s): ${err.message}`,
    );
  }

  @OnQueueStalled()
  onStalled(job: Job<AutoAttendanceInactivityJobData>): void {
    this.logger.warn(`Job ${job.id} (conversa ${job.data.conversationId}) travado (stalled)`);
  }
}
