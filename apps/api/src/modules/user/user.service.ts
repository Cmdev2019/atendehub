import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

// Campos seguros para retornar — nunca expõe passwordHash
const USER_SELECT = {
  id: true,
  companyId: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  avatarUrl: true,
  isActive: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ── Listar com paginação e filtros ────────────────────────────────────────
  async findAll(companyId: string, query: ListUsersDto) {
    const { search, role, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      companyId,
      ...(role && { role }),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── Buscar por ID ─────────────────────────────────────────────────────────
  async findOne(companyId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
      select: {
        ...USER_SELECT,
        departments: {
          select: { id: true, name: true, color: true },
        },
      },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  // ── Criar usuário ─────────────────────────────────────────────────────────
  async create(companyId: string, dto: CreateUserDto, requesterId: string) {
    // Verifica limite do plano
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { maxAgents: true, _count: { select: { users: { where: { isActive: true } } } } },
    });

    if (company && company._count.users >= company.maxAgents) {
      throw new BadRequestException(
        `Limite de ${company.maxAgents} usuários atingido para o plano atual`,
      );
    }

    // Verifica e-mail duplicado na empresa
    const existing = await this.prisma.user.findFirst({
      where: { companyId, email: dto.email.toLowerCase().trim() },
    });

    if (existing) {
      throw new ConflictException('Já existe um usuário com este e-mail');
    }

    // SUPER_ADMIN só pode ser criado por outro SUPER_ADMIN
    if (dto.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Não é permitido criar usuário SUPER_ADMIN');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const created = await this.prisma.user.create({
      data: {
        companyId,
        name: dto.name,
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        role: dto.role ?? Role.AGENT,
        phone: dto.phone,
        avatarUrl: dto.avatarUrl,
      },
      select: USER_SELECT,
    });

    await this.auditLog.record({
      companyId,
      userId: requesterId,
      action: 'user.created',
      entity: 'User',
      entityId: created.id,
      after: { name: created.name, email: created.email, role: created.role },
    });

    return created;
  }

  // ── Atualizar usuário ─────────────────────────────────────────────────────
  async update(companyId: string, id: string, dto: UpdateUserDto, requesterId: string) {
    const before = await this.findOne(companyId, id); // garante que pertence à empresa

    if (dto.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Não é permitido atribuir role SUPER_ADMIN');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT,
    });

    // Mudança de role é a ação sensível aqui — edições de nome/telefone/avatar
    // não entram na auditoria v1 (decisão B1-4, ver Registro de decisões)
    if (dto.role && dto.role !== before.role) {
      await this.auditLog.record({
        companyId,
        userId: requesterId,
        action: 'user.role_changed',
        entity: 'User',
        entityId: id,
        before: { role: before.role },
        after: { role: updated.role },
      });
    }

    return updated;
  }

  // ── Trocar senha ──────────────────────────────────────────────────────────
  async changePassword(companyId: string, id: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
      select: { passwordHash: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');

    const match = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!match) throw new BadRequestException('Senha atual incorreta');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    return { message: 'Senha atualizada com sucesso' };
  }

  // ── Desativar usuário (soft delete) ───────────────────────────────────────
  async remove(companyId: string, id: string, requesterId: string) {
    if (id === requesterId) {
      throw new BadRequestException('Você não pode desativar sua própria conta');
    }

    await this.findOne(companyId, id);

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });

    await this.auditLog.record({
      companyId,
      userId: requesterId,
      action: 'user.deactivated',
      entity: 'User',
      entityId: id,
      before: { isActive: true },
      after: { isActive: false },
    });

    return updated;
  }
}
