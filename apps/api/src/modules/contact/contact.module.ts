import { Module } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';

@Module({
  controllers: [ContactController],
  providers: [ContactService],
  exports: [ContactService], // exportado para uso no WebhookModule
})
export class ContactModule {}
