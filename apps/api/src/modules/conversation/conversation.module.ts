import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { EventsModule } from '../events/events.module';
import { TagModule } from '../tag/tag.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationModule } from '../notification/notification.module';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';
import { slaRequestQueueProvider } from './sla-request-queue';
import { SlaReconciliationService } from './sla-reconciliation.service';

@Module({
  imports: [
    EventsModule,
    TagModule,
    AuditLogModule,
    NotificationModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SLA_CHECK }),
  ],
  controllers: [ConversationController],
  // B-107: produtor da fila do SLA com prazo por comando (pedidos do painel)
  // e a reconciliação dos jobs a partir do banco
  providers: [ConversationService, slaRequestQueueProvider, SlaReconciliationService],
  exports: [ConversationService],
})
export class ConversationModule {}
