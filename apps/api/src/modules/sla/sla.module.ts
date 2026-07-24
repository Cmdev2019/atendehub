import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SlaCheckProcessor } from './sla-check.processor';
import { EventsModule } from '../events/events.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationModule } from '../notification/notification.module';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.SLA_CHECK,
    }),
    EventsModule,
    AuditLogModule,
    NotificationModule,
  ],
  providers: [SlaCheckProcessor],
})
export class SlaModule {}
