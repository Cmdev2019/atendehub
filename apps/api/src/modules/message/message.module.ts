import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { SendMessageService } from './send-message.service';
import { MessageController } from './message.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    WhatsappModule, // fornece EvolutionService
    EventsModule,   // fornece EventsService
  ],
  controllers: [MessageController],
  providers: [MessageService, SendMessageService],
  exports: [MessageService, SendMessageService],
})
export class MessageModule {}
