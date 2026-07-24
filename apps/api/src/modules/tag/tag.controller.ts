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
import { TagService } from './tag.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('tags')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TagController {
  constructor(private readonly tagService: TagService) {}

  // GET /api/v1/tags
  @Get()
  findAll(@CurrentUser() user: AuthUserDto) {
    return this.tagService.findAll(user.companyId);
  }

  // POST /api/v1/tags
  @Post()
  @Roles(Role.SUPERVISOR)
  create(@CurrentUser() user: AuthUserDto, @Body() dto: CreateTagDto) {
    return this.tagService.create(user.companyId, dto);
  }

  // PATCH /api/v1/tags/:id
  @Patch(':id')
  @Roles(Role.SUPERVISOR)
  update(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tagService.update(user.companyId, id, dto);
  }

  // DELETE /api/v1/tags/:id
  @Delete(':id')
  @Roles(Role.SUPERVISOR)
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.tagService.remove(user.companyId, id);
  }
}
