import { Module } from '@nestjs/common';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService], // usado por user/contact/conversation/sla ao registrar ações sensíveis
})
export class AuditLogModule {}
