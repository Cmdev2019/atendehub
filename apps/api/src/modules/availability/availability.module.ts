import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { EventsModule } from '../events/events.module';

// B-65: fora do UserModule para o AuthModule (logout) também usar, sem ciclo —
// o UserModule importa o AuthModule.
@Module({
  imports: [AuditLogModule, EventsModule],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
