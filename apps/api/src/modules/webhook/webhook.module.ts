import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { MediaDownloadService } from './media-download.service';
import { WebhookProcessor } from './webhook.processor';
import { ContactModule } from '../contact/contact.module';
import { ConversationModule } from '../conversation/conversation.module';
import { MessageModule } from '../message/message.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { EventsModule } from '../events/events.module';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.WEBHOOK,
    }),
    ContactModule,
    ConversationModule,
    MessageModule,
    WhatsappModule,
    EventsModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService, MediaDownloadService, WebhookProcessor],
})
export class WebhookModule {}
