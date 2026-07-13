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
import { Role } from '@prisma/client';
import { WhatsappService } from './whatsapp.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  // GET /api/v1/whatsapp
  @Get()
  findAll(@CurrentUser() user: AuthUserDto) {
    return this.whatsappService.findAll(user.companyId);
  }

  // GET /api/v1/whatsapp/:id
  @Get(':id')
  findOne(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.whatsappService.findOne(user.companyId, id);
  }

  // POST /api/v1/whatsapp
  // Cria a conexão e já inicializa a instância na Evolution API
  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthUserDto, @Body() dto: CreateConnectionDto) {
    return this.whatsappService.create(user.companyId, dto);
  }

  // GET /api/v1/whatsapp/:id/qrcode
  // Retorna o QR Code para escanear
  @Get(':id/qrcode')
  @Roles(Role.ADMIN)
  getQrCode(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.whatsappService.getQrCode(user.companyId, id);
  }

  // GET /api/v1/whatsapp/:id/status
  // Sincroniza o status com a Evolution API
  @Get(':id/status')
  syncStatus(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.whatsappService.syncStatus(user.companyId, id);
  }

  // POST /api/v1/whatsapp/:id/disconnect
  @Post(':id/disconnect')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  disconnect(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.whatsappService.disconnect(user.companyId, id);
  }

  // PATCH /api/v1/whatsapp/:id
  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Body() dto: UpdateConnectionDto,
  ) {
    return this.whatsappService.update(user.companyId, id, dto);
  }

  // DELETE /api/v1/whatsapp/:id
  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.whatsappService.remove(user.companyId, id);
  }
}
