import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MessageService } from './message.service';
import { ListMessagesDto } from './dto/list-messages.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('conversations/:conversationId/messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  // GET /api/v1/conversations/:conversationId/messages?limit=&before=&type=
  @Get()
  findAll(
    @CurrentUser() user: AuthUserDto,
    @Param('conversationId') conversationId: string,
    @Query() query: ListMessagesDto,
  ) {
    return this.messageService.findAll(user.companyId, conversationId, query);
  }

  // GET /api/v1/conversations/:conversationId/messages/:id
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUserDto,
    @Param('conversationId') conversationId: string,
    @Param('id') id: string,
  ) {
    return this.messageService.findOne(user.companyId, conversationId, id);
  }

  // DELETE /api/v1/conversations/:conversationId/messages/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser() user: AuthUserDto,
    @Param('conversationId') conversationId: string,
    @Param('id') id: string,
  ) {
    return this.messageService.softDelete(user.companyId, conversationId, id, user.id);
  }
}
