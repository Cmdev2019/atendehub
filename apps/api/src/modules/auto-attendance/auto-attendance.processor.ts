import { Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';
import { AutoAttendanceEngineService } from './auto-attendance-engine.service';
import { AutoAttendanceJobData } from './auto-attendance-jobs';

@Processor(QUEUE_NAMES.AUTO_ATTENDANCE)
export class AutoAttendanceProcessor {
  private readonly logger = new Logger(AutoAttendanceProcessor.name);

  constructor(private readonly engine: AutoAttendanceEngineService) {}

  @Process()
  async handle(job: Job<AutoAttendanceJobData>): Promise<void> {
    const data = job.data;
    switch (data.kind) {
      case 'greeting':
        await this.engine.handleNewConversation(data);
        return;
      case 'reply':
        await this.engine.handleReply(data);
        return;
      case 'activity':
        await this.engine.registerActivity(data.companyId, data.conversationId);
        return;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<AutoAttendanceJobData>, err: Error): void {
    this.logger.error(
      `Auto-atendimento (${job.data.kind}) da conversa ${job.data.conversationId} falhou: ${err.message}`,
    );
  }
}
