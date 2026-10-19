import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [AuditLogModule, AuthModule, EventsModule, AvailabilityModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
