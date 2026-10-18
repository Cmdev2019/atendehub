import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NoteService } from './note.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { ConversationScopeGuard } from '../../shared/conversation-scope/conversation-scope.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('conversations/:conversationId/notes')
// C-10/B-40: conversa fora do escopo do usuário responde 404
@UseGuards(ConversationScopeGuard)
export class NoteController {
  constructor(private readonly noteService: NoteService) {}

  // GET /api/v1/conversations/:conversationId/notes
  @Get()
  findAll(
    @CurrentUser() user: AuthUserDto,
    @Param('conversationId') conversationId: string,
  ) {
    return this.noteService.findAll(user.companyId, conversationId);
  }

  // POST /api/v1/conversations/:conversationId/notes
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthUserDto,
    @Param('conversationId') conversationId: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.noteService.create(user.companyId, conversationId, user.id, dto);
  }

  // PATCH /api/v1/conversations/:conversationId/notes/:id
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserDto,
    @Param('conversationId') conversationId: string,
    @Param('id') id: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.noteService.update(
      user.companyId,
      conversationId,
      id,
      user.id,
      user.role,
      dto,
    );
  }

  // DELETE /api/v1/conversations/:conversationId/notes/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser() user: AuthUserDto,
    @Param('conversationId') conversationId: string,
    @Param('id') id: string,
  ) {
    return this.noteService.remove(
      user.companyId,
      conversationId,
      id,
      user.id,
      user.role,
    );
  }
}
