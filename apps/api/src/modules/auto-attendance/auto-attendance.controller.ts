import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsString } from 'class-validator';
import { Role } from '@prisma/client';
import { AutoAttendanceService } from './auto-attendance.service';
import { UpdateAutoAttendanceFlowDto } from './dto/update-auto-attendance-flow.dto';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

class ReorderMenuOptionsDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds: string[];
}

@Controller('auto-attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AutoAttendanceController {
  constructor(private readonly autoAttendanceService: AutoAttendanceService) {}

  // GET /api/v1/auto-attendance
  @Get()
  getFlow(@CurrentUser() user: AuthUserDto) {
    return this.autoAttendanceService.getFlow(user.companyId);
  }

  // PATCH /api/v1/auto-attendance
  @Patch()
  @Roles(Role.ADMIN)
  updateFlow(@CurrentUser() user: AuthUserDto, @Body() dto: UpdateAutoAttendanceFlowDto) {
    return this.autoAttendanceService.updateFlow(user.companyId, dto);
  }

  // GET /api/v1/auto-attendance/options
  @Get('options')
  listOptions(@CurrentUser() user: AuthUserDto) {
    return this.autoAttendanceService.listMenuOptions(user.companyId);
  }

  // POST /api/v1/auto-attendance/options
  @Post('options')
  @Roles(Role.ADMIN)
  createOption(@CurrentUser() user: AuthUserDto, @Body() dto: CreateMenuOptionDto) {
    return this.autoAttendanceService.createMenuOption(user.companyId, dto);
  }

  // PATCH /api/v1/auto-attendance/options/reorder — antes de ':id' para não colidir
  @Patch('options/reorder')
  @Roles(Role.ADMIN)
  reorderOptions(@CurrentUser() user: AuthUserDto, @Body() dto: ReorderMenuOptionsDto) {
    return this.autoAttendanceService.reorderMenuOptions(user.companyId, dto.orderedIds);
  }

  // PATCH /api/v1/auto-attendance/options/:id
  @Patch('options/:id')
  @Roles(Role.ADMIN)
  updateOption(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Body() dto: UpdateMenuOptionDto,
  ) {
    return this.autoAttendanceService.updateMenuOption(user.companyId, id, dto);
  }

  // DELETE /api/v1/auto-attendance/options/:id
  @Delete('options/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  removeOption(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.autoAttendanceService.removeMenuOption(user.companyId, id);
  }
}
