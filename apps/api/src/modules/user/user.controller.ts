import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
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
  @Patch(':id/password')
  changePassword(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.userService.changePassword(user.companyId, id, dto);
  }

  // DELETE /api/v1/users/:id
  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.userService.remove(user.companyId, id, user.id);
  }
}
