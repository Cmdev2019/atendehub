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
import { QueueService } from './queue.service';
import { CreateQueueDto } from './dto/create-queue.dto';
import { UpdateQueueDto } from './dto/update-queue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('queues')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  // GET /api/v1/queues
  @Get()
  findAll(@CurrentUser() user: AuthUserDto) {
    return this.queueService.findAll(user.companyId);
  }

  // GET /api/v1/queues/:id
  @Get(':id')
  findOne(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.queueService.findOne(user.companyId, id);
  }

  // POST /api/v1/queues
  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthUserDto, @Body() dto: CreateQueueDto) {
    return this.queueService.create(user.companyId, dto);
  }

  // PATCH /api/v1/queues/:id
  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Body() dto: UpdateQueueDto,
  ) {
    return this.queueService.update(user.companyId, id, dto);
  }

  // DELETE /api/v1/queues/:id
  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.queueService.remove(user.companyId, id);
  }
}
