import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { EvolutionService } from './evolution.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, EvolutionService],
  exports: [WhatsappService, EvolutionService],
})
export class WhatsappModule {}
