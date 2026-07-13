import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Listar departamentos da empresa ───────────────────────────────────────
  async findAll(companyId: string) {
    return this.prisma.department.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
            conversations: { where: { status: { in: ['WAITING', 'OPEN'] } } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ── Buscar departamento por ID com detalhes ───────────────────────────────
  async findOne(companyId: string, id: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
            isActive: true,
          },
        },
        queues: {
          select: { id: true, name: true, strategy: true, isActive: true },
        },
        _count: {
          select: { conversations: true },
        },
      },
    });

    if (!dept) throw new NotFoundException('Departamento não encontrado');
    return dept;
  }

  // ── Criar departamento ────────────────────────────────────────────────────
  async create(companyId: string, dto: CreateDepartmentDto) {
    const existing = await this.prisma.department.findFirst({
      where: { companyId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Já existe um departamento com este nome');
    }

    return this.prisma.department.create({
      data: { companyId, ...dto },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  // ── Atualizar departamento ────────────────────────────────────────────────
  async update(companyId: string, id: string, dto: UpdateDepartmentDto) {
    await this.findOne(companyId, id);

    if (dto.name) {
      const conflict = await this.prisma.department.findFirst({
        where: { companyId, name: dto.name, NOT: { id } },
      });
      if (conflict) throw new ConflictException('Já existe um departamento com este nome');
    }

    return this.prisma.department.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        isActive: true,
        updatedAt: true,
      },
    });
  }

  // ── Remover departamento ──────────────────────────────────────────────────
  async remove(companyId: string, id: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, companyId },
      select: { _count: { select: { conversations: true } } },
    });

    if (!dept) throw new NotFoundException('Departamento não encontrado');

    if (dept._count.conversations > 0) {
      throw new BadRequestException(
        'Não é possível remover um departamento com conversas associadas',
      );
    }

    await this.prisma.department.delete({ where: { id } });
    return { message: 'Departamento removido com sucesso' };
  }

  // ── Adicionar usuário ao departamento ─────────────────────────────────────
  async addUser(companyId: string, id: string, userId: string) {
    await this.findOne(companyId, id);

    // Verifica se o usuário pertence à mesma empresa
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado nesta empresa');

    return this.prisma.department.update({
      where: { id },
      data: { users: { connect: { id: userId } } },
      select: { id: true, name: true, users: { select: { id: true, name: true } } },
    });
  }

  // ── Remover usuário do departamento ──────────────────────────────────────
  async removeUser(companyId: string, id: string, userId: string) {
    await this.findOne(companyId, id);

    return this.prisma.department.update({
      where: { id },
      data: { users: { disconnect: { id: userId } } },
      select: { id: true, name: true, users: { select: { id: true, name: true } } },
    });
  }
}
