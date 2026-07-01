import { Module } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { ContactModule } from '../contact/contact.module';
import { ConversationModule } from '../conversation/conversation.module';
import { MessageModule } from '../message/message.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    ContactModule,
    ConversationModule,
    MessageModule,
    WhatsappModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
