import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';

@Module({
  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService], // exportado para uso no WebhookModule
})
export class MessageModule {}
