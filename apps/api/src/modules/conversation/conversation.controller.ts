import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { TagService } from '../tag/tag.service';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { ConversationScopeGuard } from '../../shared/conversation-scope/conversation-scope.guard';
import { ConversationScopeService } from '../../shared/conversation-scope/conversation-scope.service';

// C-10/B-40: ConversationScopeGuard barra (404) toda rota com :id fora do
// escopo do usuário; listagem e stats filtram pelo mesmo escopo.
@Controller('conversations')
@UseGuards(JwtAuthGuard, ConversationScopeGuard)
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly tagService: TagService,
    private readonly scope: ConversationScopeService,
  ) {}

  // GET /api/v1/conversations?status=&channel=&agentId=&departmentId=&search=&page=&limit=
  @Get()
  async findAll(@CurrentUser() user: AuthUserDto, @Query() query: ListConversationsDto) {
    return this.conversationService.findAll(user.companyId, query, await this.scope.conversationWhere(user));
  }

  // GET /api/v1/conversations/stats
  // Precisa vir ANTES de GET /:id na declaração — senão "stats" seria
  // interpretado como o :id (rotas Express casam na ordem declarada).
  @Get('stats')
  async getStats(@CurrentUser() user: AuthUserDto) {
    return this.conversationService.getStats(user.companyId, user.id, await this.scope.conversationWhere(user));
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
    return this.conversationService.assign(user.companyId, id, dto, user.id);
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

  // POST /api/v1/conversations/:id/tags/:tagId
  @Post(':id/tags/:tagId')
  addTag(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Param('tagId') tagId: string,
  ) {
    return this.tagService.assignToConversation(user.companyId, id, tagId);
  }

  // DELETE /api/v1/conversations/:id/tags/:tagId
  @Delete(':id/tags/:tagId')
  @HttpCode(HttpStatus.OK)
  removeTag(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Param('tagId') tagId: string,
  ) {
    return this.tagService.removeFromConversation(user.companyId, id, tagId);
  }
}
