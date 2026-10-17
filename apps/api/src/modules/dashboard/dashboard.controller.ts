import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { ConversationScopeService } from '../../shared/conversation-scope/conversation-scope.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly scope: ConversationScopeService,
  ) {}

  // GET /api/v1/dashboard/summary?from=&to= (ISO 8601; default = últimos 30 dias)
  @Get('summary')
  // C-10/B-40: atendente vê os números só das conversas do seu escopo
  async getSummary(@CurrentUser() user: AuthUserDto, @Query() query: DashboardQueryDto) {
    const scope = await this.scope.conversationWhere(user);
    return this.dashboardService.getSummary(user.companyId, query.from, query.to, scope);
  }
}
