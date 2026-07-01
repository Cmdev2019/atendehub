import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  // GET /api/v1/conversations?status=&channel=&agentId=&departmentId=&search=&page=&limit=
  @Get()
  findAll(@CurrentUser() user: AuthUserDto, @Query() query: ListConversationsDto) {
    return this.conversationService.findAll(user.companyId, query);
  }

  // GET /api/v1/conversations/:id
  @Get(':id')
  findOne(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.conversationService.findOne(user.companyId, id);
  }

  // PATCH /api/v1/conversations/:id/assign
  @Patch(':id/assign')
  assign(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Body() dto: AssignConversationDto,
  ) {
    return this.conversationService.assign(user.companyId, id, dto);
  }

  // PATCH /api/v1/conversations/:id/status
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Body() dto: UpdateConversationStatusDto,
  ) {
    return this.conversationService.updateStatus(user.companyId, id, dto);
  }

  // PATCH /api/v1/conversations/:id/read
  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markAsRead(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.conversationService.markAsRead(user.companyId, id);
  }
}
