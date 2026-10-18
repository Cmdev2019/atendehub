import { Controller, Get, Post, Delete, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { Role } from '@prisma/client';
import { WebhookDlqService } from './webhook-dlq.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

// ── B-39: administração da DLQ do webhook ────────────────────────────────────
// Endpoint de reprocessamento manual pedido no critério de aceite do item —
// ADMIN da própria empresa (nunca cross-tenant, ver WebhookDlqService).
@Controller('webhooks/dlq')
export class WebhookDlqController {
  constructor(private readonly dlqService: WebhookDlqService) {}

  // GET /api/v1/webhooks/dlq
  @Get()
  @Roles(Role.ADMIN)
  list(@CurrentUser() user: AuthUserDto) {
    return this.dlqService.list(user.companyId);
  }

  // POST /api/v1/webhooks/dlq/:jobId/reprocess
  @Post(':jobId/reprocess')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  reprocess(@CurrentUser() user: AuthUserDto, @Param('jobId') jobId: string) {
    return this.dlqService.reprocess(user.companyId, jobId);
  }

  // DELETE /api/v1/webhooks/dlq/:jobId
  @Delete(':jobId')
  @Roles(Role.ADMIN)
  discard(@CurrentUser() user: AuthUserDto, @Param('jobId') jobId: string) {
    return this.dlqService.discard(user.companyId, jobId);
  }
}
