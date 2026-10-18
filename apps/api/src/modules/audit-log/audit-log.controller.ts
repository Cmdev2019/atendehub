import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  // GET /api/v1/audit-logs?entity=&entityId=&userId=&page=&limit=
  @Get()
  @Roles(Role.ADMIN)
  findAll(@CurrentUser() user: AuthUserDto, @Query() query: ListAuditLogsDto) {
    return this.auditLogService.findAll(user.companyId, query);
  }
}
