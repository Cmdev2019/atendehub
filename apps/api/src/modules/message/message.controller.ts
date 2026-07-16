import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MessageService } from './message.service';
import { SendMessageService } from './send-message.service';
import { ListMessagesDto } from './dto/list-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SendMediaDto } from './dto/send-media.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('conversations/:conversationId/messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly sendMessageService: SendMessageService,
  ) {}

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

  // POST /api/v1/conversations/:conversationId/messages
  @Post()
  @HttpCode(HttpStatus.CREATED)
  send(
    @CurrentUser() user: AuthUserDto,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.sendMessageService.send(
      user.companyId,
      conversationId,
      user.id,
      user.role,
      dto,
    );
  }

  // POST /api/v1/conversations/:conversationId/messages/media
  // Envio de mídia com upload direto (print colado ou arquivo anexado):
  // multipart com campo `file` + `caption` opcional. Limite: 16MB.
  @Post('media')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 16 * 1024 * 1024 } }),
  )
  sendMedia(
    @CurrentUser() user: AuthUserDto,
    @Param('conversationId') conversationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SendMediaDto,
  ) {
    return this.sendMessageService.sendMedia(
      user.companyId,
      conversationId,
      user.id,
      user.role,
      file,
      dto.caption,
    );
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
