import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { WebhookDlqController } from './webhook-dlq.controller';
import { WebhookDlqService } from './webhook-dlq.service';
import { WebhookMetricsService } from './webhook-metrics.service';
import { MediaDownloadService } from './media-download.service';
import { WebhookProcessor } from './webhook.processor';
import { ContactModule } from '../contact/contact.module';
import { ConversationModule } from '../conversation/conversation.module';
import { MessageModule } from '../message/message.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { EventsModule } from '../events/events.module';
import { AutoAttendanceModule } from '../auto-attendance/auto-attendance.module';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';
import { WEBHOOK_BACKOFF_STRATEGY, buildWebhookBackoffStrategy } from './webhook-queue.config';

@Module({
  imports: [
    // B-39: registerQueueAsync (não registerQueue) só na fila `webhook` —
    // precisa do ConfigService pra montar a estratégia de backoff customizada
    // (WEBHOOK_BACKOFF_INITIAL/WEBHOOK_BACKOFF_MULTIPLIER; o `exponential`
    // nativo do Bull tem multiplicador fixo em 2, não parametrizável).
    BullModule.registerQueueAsync({
      name: QUEUE_NAMES.WEBHOOK,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        settings: {
          backoffStrategies: {
            [WEBHOOK_BACKOFF_STRATEGY]: buildWebhookBackoffStrategy(config),
          },
        },
      }),
    }),
    // DLQ — sem processor registrado (nada consome automaticamente).
    BullModule.registerQueue({ name: QUEUE_NAMES.WEBHOOK_DLQ }),
    ContactModule,
    ConversationModule,
    MessageModule,
    WhatsappModule,
    EventsModule,
    AutoAttendanceModule,
  ],
  controllers: [WebhookController, WebhookDlqController],
  providers: [
    WebhookService,
    MediaDownloadService,
    WebhookProcessor,
    WebhookDlqService,
    WebhookMetricsService,
  ],
})
export class WebhookModule {}
