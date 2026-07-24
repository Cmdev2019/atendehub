import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';

export interface CreateNotificationParams {
  companyId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Criação interna — chamada por outros services (assign, SLA), não é
  // exposta como rota pública própria ────────────────────────────────────────
  async create(params: CreateNotificationParams) {
    return this.prisma.notification.create({
      data: {
        companyId: params.companyId,
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data,
      },
    });
  }

  // ── Listar notificações do próprio usuário, paginado ──────────────────────
  async findAll(companyId: string, userId: string, query: ListNotificationsDto) {
    const { unreadOnly, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      companyId,
      userId,
      ...(unreadOnly && { readAt: null }),
    };

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Marcar uma notificação como lida (só a própria) ───────────────────────
  async markAsRead(companyId: string, userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, companyId, userId },
    });
    if (!notification) throw new NotFoundException('Notificação não encontrada');

    return this.prisma.notification.update({
      where: { id },
      data: { readAt: notification.readAt ?? new Date() },
    });
  }

  // ── Marcar todas as notificações do usuário como lidas ────────────────────
  async markAllAsRead(companyId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { companyId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { message: `${result.count} notificação(ões) marcada(s) como lida(s)` };
  }
}
