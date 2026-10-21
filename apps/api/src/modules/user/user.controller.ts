import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Role } from '../../generated/prisma/client';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // GET /api/v1/users
  @Get()
  @Roles(Role.SUPERVISOR)
  findAll(@CurrentUser() user: AuthUserDto, @Query() query: ListUsersDto) {
    return this.userService.findAll(user.companyId, query);
  }

  // GET /api/v1/users/:id
  @Get(':id')
  @Roles(Role.SUPERVISOR)
  findOne(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.userService.findOne(user.companyId, id);
  }

  // POST /api/v1/users
  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthUserDto, @Body() dto: CreateUserDto) {
    return this.userService.create(user.companyId, dto, user.id);
  }

  // PATCH /api/v1/users/me
  // Precisa vir ANTES de PATCH /:id na declaração — senão "me" seria
  // interpretado como o :id (rotas Express casam na ordem declarada).
  // Sem @Roles: qualquer usuário autenticado edita o próprio perfil; o DTO
  // (name/phone/avatarUrl) já impede escalar role/isActive por aqui.
  @Patch('me')
  updateOwnProfile(@CurrentUser() user: AuthUserDto, @Body() dto: UpdateOwnProfileDto) {
    return this.userService.updateOwnProfile(user.companyId, user.id, dto);
  }

  // PATCH /api/v1/users/me/availability
  // B-65 (ADR-0019): Online/Offline do próprio usuário. Sem :id — só se muda
  // o próprio estado. Sem @Roles: todo papel atende, inclusive ADMIN.
  @Patch('me/availability')
  updateOwnAvailability(@CurrentUser() user: AuthUserDto, @Body() dto: UpdateAvailabilityDto) {
    return this.userService.updateOwnAvailability(user.companyId, user.id, dto.availability);
  }

  // POST /api/v1/users/me/avatar
  // Multipart, campo `file` — mesmo padrão de messages/media, mas restrito
  // a imagem e com limite bem menor (é uma foto de perfil, não anexo de chat).
  @Post('me/avatar')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Avatar deve ser uma imagem'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: AuthUserDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.userService.updateAvatar(user.companyId, user.id, file);
  }

  // PATCH /api/v1/users/:id
  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userService.update(user.companyId, id, dto, user.id);
  }

  // PATCH /api/v1/users/:id/password
  // B-51: só o próprio usuário troca a própria senha — o `:id` precisa ser o
  // do token (conferido no service); trocar a de outra pessoa é o reset
  // administrativo (POST /:id/reset-password). Limite próprio, igual ao do
  // login: a rota confere a senha atual com bcrypt.
  @Patch(':id/password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changePassword(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.userService.changePassword(user.companyId, id, dto, user.id, user.sessionId);
  }

  // POST /api/v1/users/:id/reset-password
  @Post(':id/reset-password')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  resetPassword(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.userService.resetPassword(user.companyId, id, user.id);
  }

  // DELETE /api/v1/users/:id
  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.userService.remove(user.companyId, id, user.id);
  }
}
