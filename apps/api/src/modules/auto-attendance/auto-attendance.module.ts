import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AutoAttendanceController } from './auto-attendance.controller';
import { AutoAttendanceService } from './auto-attendance.service';
import { AutoAttendanceEngineService } from './auto-attendance-engine.service';
import { AutoAttendanceSessionService } from './auto-attendance-session.service';
import { AutoAttendanceInactivityProcessor } from './auto-attendance-inactivity.processor';
import { ConversationModule } from '../conversation/conversation.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { EventsModule } from '../events/events.module';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.AUTO_ATTENDANCE_INACTIVITY }),
    ConversationModule,
    WhatsappModule,
    EventsModule,
  ],
  controllers: [AutoAttendanceController],
  providers: [
    AutoAttendanceService,
    AutoAttendanceEngineService,
    AutoAttendanceSessionService,
    AutoAttendanceInactivityProcessor,
  ],
  exports: [AutoAttendanceEngineService],
})
export class AutoAttendanceModule {}
