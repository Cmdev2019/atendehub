import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // GET /api/v1/notifications?unreadOnly=&page=&limit=
  @Get()
  findAll(@CurrentUser() user: AuthUserDto, @Query() query: ListNotificationsDto) {
    return this.notificationService.findAll(user.companyId, user.id, query);
  }

  // PATCH /api/v1/notifications/:id/read
  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markAsRead(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.notificationService.markAsRead(user.companyId, user.id, id);
  }

  // PATCH /api/v1/notifications/read-all
  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  markAllAsRead(@CurrentUser() user: AuthUserDto) {
    return this.notificationService.markAllAsRead(user.companyId, user.id);
  }
}
