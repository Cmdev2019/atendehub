import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';

@Module({
  imports: [
    // JwtService necessário no Gateway para verificar token no handshake
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
  ],
  providers: [EventsGateway, EventsService],
  exports: [EventsService], // exportado para WebhookService, ConversationService, WhatsappService
})
export class EventsModule {}
