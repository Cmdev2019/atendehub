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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '../../generated/prisma/client';
import { ConversationService } from './conversation.service';
import { TagService } from '../tag/tag.service';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { UpdateConversationStatusDto } from './dto/update-conversation-status.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';
import { ConversationScopeGuard } from '../../shared/conversation-scope/conversation-scope.guard';
import { ConversationScopeService } from '../../shared/conversation-scope/conversation-scope.service';
import { SingleFlight } from '../../shared/concurrency/single-flight';

// C-10/B-40: ConversationScopeGuard barra (404) toda rota com :id fora do
// escopo do usuário; listagem e stats filtram pelo mesmo escopo.
@Controller('conversations')
@UseGuards(ConversationScopeGuard)
export class ConversationController {
  // B-84 (M-10): GET /stats faz 9 consultas; vários pedidos simultâneos do
  // mesmo usuário (abas, rajada de eventos) dividem uma só execução.
  private readonly statsFlight = new SingleFlight<Awaited<ReturnType<ConversationService['getStats']>>>();

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
    return this.statsFlight.run(`${user.companyId}:${user.id}`, async () =>
      this.conversationService.getStats(user.companyId, user.id, await this.scope.conversationWhere(user)),
    );
  }

  // GET /api/v1/conversations/overview
  // B-68 (parte 2): visão do supervisor — setores × atendentes. Supervisor e
  // admin veem a empresa toda (B-40), então os números são da empresa.
  // Antes de GET /:id pelo mesmo motivo do /stats.
  @Get('overview')
  @Roles(Role.SUPERVISOR)
  getOverview(@CurrentUser() user: AuthUserDto) {
    return this.conversationService.getOverview(user.companyId);
  }

  // GET /api/v1/conversations/:id
  @Get(':id')
  findOne(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.conversationService.findOne(user.companyId, id);
  }

  // POST /api/v1/conversations/:id/attend
  // B-66 (ADR-0019): pegar a conversa da fila para si — quem chegar primeiro
  // fica com ela; o outro recebe 409 "Fulano já está atendendo"
  @Post(':id/attend')
  @HttpCode(HttpStatus.OK)
  attend(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.conversationService.attend(user.companyId, id, user.id);
  }

  // POST /api/v1/conversations/next
  // B-67 (ADR-0019, regra 5): atende a conversa que espera há mais tempo nos
  // setores de quem chama. Nada esperando: 204, sem corpo.
  @Post('next')
  @HttpCode(HttpStatus.OK)
  async attendNext(@CurrentUser() user: AuthUserDto, @Res({ passthrough: true }) res: Response) {
    const conversation = await this.conversationService.attendNext(user.companyId, user.id);
    if (!conversation) res.status(HttpStatus.NO_CONTENT);
    return conversation ?? undefined;
  }

  // PATCH /api/v1/conversations/:id/assign
  // B-66: transferência — o papel decide quem pode mexer em qual conversa
  @Patch(':id/assign')
  assign(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Body() dto: AssignConversationDto,
  ) {
    return this.conversationService.assign(user.companyId, id, dto, user);
  }

  // PATCH /api/v1/conversations/:id/status
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Body() dto: UpdateConversationStatusDto,
  ) {
    return this.conversationService.updateStatus(user.companyId, id, dto, user);
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
