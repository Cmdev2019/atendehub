import { Module } from '@nestjs/common';
import { DepartmentController } from './department.controller';
import { DepartmentService } from './department.service';
import { EventsModule } from '../events/events.module';

@Module({
  // B-113: mudar os membros de um setor reconecta o socket deles
  imports: [EventsModule],
  controllers: [DepartmentController],
  providers: [DepartmentService],
  exports: [DepartmentService],
})
export class DepartmentModule {}
