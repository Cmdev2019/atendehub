import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { SendMessageService } from './send-message.service';
import { MessageController } from './message.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { EventsModule } from '../events/events.module';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [
    WhatsappModule, // fornece EvolutionService
    EventsModule,   // fornece EventsService
    ConversationModule, // B-66: responder da fila passa pelo attend
  ],
  controllers: [MessageController],
  providers: [MessageService, SendMessageService],
  exports: [MessageService, SendMessageService],
})
export class MessageModule {}
