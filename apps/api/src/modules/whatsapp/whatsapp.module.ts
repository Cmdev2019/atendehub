import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { EvolutionService } from './evolution.service';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService, EvolutionService],
  exports: [WhatsappService, EvolutionService],
})
export class WhatsappModule {}
