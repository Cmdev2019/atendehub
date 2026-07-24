import { Module } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';
import { TagModule } from '../tag/tag.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [TagModule, AuditLogModule],
  controllers: [ContactController],
  providers: [ContactService],
  exports: [ContactService], // exportado para uso no WebhookModule
})
export class ContactModule {}
