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
import { DepartmentService } from './department.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { AddUserToDepartmentDto } from './dto/add-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  // GET /api/v1/departments
  @Get()
  findAll(@CurrentUser() user: AuthUserDto) {
    return this.departmentService.findAll(user.companyId);
  }

  // GET /api/v1/departments/:id
  @Get(':id')
  findOne(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.departmentService.findOne(user.companyId, id);
  }

  // POST /api/v1/departments
  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthUserDto, @Body() dto: CreateDepartmentDto) {
    return this.departmentService.create(user.companyId, dto);
  }

  // PATCH /api/v1/departments/:id
  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentService.update(user.companyId, id, dto);
  }

  // DELETE /api/v1/departments/:id
  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.departmentService.remove(user.companyId, id);
  }

  // POST /api/v1/departments/:id/users
  @Post(':id/users')
  @Roles(Role.ADMIN)
  addUser(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Body() dto: AddUserToDepartmentDto,
  ) {
    return this.departmentService.addUser(user.companyId, id, dto.userId);
  }

  // DELETE /api/v1/departments/:id/users/:userId
  @Delete(':id/users/:userId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  removeUser(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.departmentService.removeUser(user.companyId, id, userId);
  }
}
