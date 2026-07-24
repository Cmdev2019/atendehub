import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

export interface RecordAuditLogParams {
  companyId: string;
  userId?: string | null;
  action: string;   // ex: "user.created", "conversation.assigned"
  entity: string;    // ex: "User", "Conversation"
  entityId: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Escrita explícita, chamada pelos services que fazem ações sensíveis
  // (decisão B1-4: sem interceptor global — cada service registra o que é
  // relevante para si, evitando logar todo PATCH genérico) ───────────────────
  async record(params: RecordAuditLogParams) {
    return this.prisma.auditLog.create({
      data: {
        companyId: params.companyId,
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        before: params.before ?? Prisma.JsonNull,
        after: params.after ?? Prisma.JsonNull,
      },
    });
  }

  // ── Listar auditoria da empresa, paginado (ADMIN/SUPER_ADMIN apenas) ──────
  async findAll(companyId: string, query: ListAuditLogsDto) {
    const { entity, entityId, userId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      companyId,
      ...(entity && { entity }),
      ...(entityId && { entityId }),
      ...(userId && { userId }),
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
