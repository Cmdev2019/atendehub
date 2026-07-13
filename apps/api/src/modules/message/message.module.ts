import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MessageService } from './message.service';
import { SendMessageService } from './send-message.service';
import { MessageSendProcessor } from './message-send.processor';
import { MessageController } from './message.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { EventsModule } from '../events/events.module';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.MESSAGE_SEND,
    }),
    WhatsappModule, // fornece EvolutionService
    EventsModule,   // fornece EventsService
  ],
  controllers: [MessageController],
  providers: [MessageService, SendMessageService, MessageSendProcessor],
  exports: [MessageService, SendMessageService],
})
export class MessageModule {}
