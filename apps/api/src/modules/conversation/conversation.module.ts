import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';

@Module({
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService], // exportado para uso no WebhookModule
})
export class ConversationModule {}
