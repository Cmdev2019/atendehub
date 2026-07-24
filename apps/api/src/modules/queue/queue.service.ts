import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateQueueDto } from './dto/create-queue.dto';
import { UpdateQueueDto } from './dto/update-queue.dto';

const SELECT_FIELDS = {
  id: true,
  name: true,
  strategy: true,
  maxWaitSecs: true,
  greetingMsg: true,
  departmentId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class QueueService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Listar filas da empresa ────────────────────────────────────────────────
  async findAll(companyId: string) {
    return this.prisma.queue.findMany({
      where: { companyId },
      select: {
        ...SELECT_FIELDS,
        department: { select: { id: true, name: true, color: true } },
        _count: { select: { conversations: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ── Buscar fila por ID ─────────────────────────────────────────────────────
  async findOne(companyId: string, id: string) {
    const queue = await this.prisma.queue.findFirst({
      where: { id, companyId },
      select: {
        ...SELECT_FIELDS,
        department: { select: { id: true, name: true, color: true } },
        _count: { select: { conversations: true } },
      },
    });

    if (!queue) throw new NotFoundException('Fila não encontrada');
    return queue;
  }

  // ── Criar fila ──────────────────────────────────────────────────────────────
  async create(companyId: string, dto: CreateQueueDto) {
    const existing = await this.prisma.queue.findFirst({
      where: { companyId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Já existe uma fila com este nome');
    }

    if (dto.departmentId) {
      await this.assertDepartmentBelongsToCompany(companyId, dto.departmentId);
    }

    return this.prisma.queue.create({
      data: { companyId, ...dto },
      select: SELECT_FIELDS,
    });
  }

  // ── Atualizar fila ──────────────────────────────────────────────────────────
  async update(companyId: string, id: string, dto: UpdateQueueDto) {
    await this.findOne(companyId, id);

    if (dto.name) {
      const conflict = await this.prisma.queue.findFirst({
        where: { companyId, name: dto.name, NOT: { id } },
      });
      if (conflict) throw new ConflictException('Já existe uma fila com este nome');
    }

    if (dto.departmentId) {
      await this.assertDepartmentBelongsToCompany(companyId, dto.departmentId);
    }

    return this.prisma.queue.update({
      where: { id },
      data: dto,
      select: SELECT_FIELDS,
    });
  }

  // ── Remover fila ──────────────────────────────────────────────────────────
  async remove(companyId: string, id: string) {
    const queue = await this.prisma.queue.findFirst({
      where: { id, companyId },
      select: { _count: { select: { conversations: true } } },
    });

    if (!queue) throw new NotFoundException('Fila não encontrada');

    if (queue._count.conversations > 0) {
      throw new BadRequestException(
        'Não é possível remover uma fila com conversas associadas',
      );
    }

    await this.prisma.queue.delete({ where: { id } });
    return { message: 'Fila removida com sucesso' };
  }

  // ── Validação interna ───────────────────────────────────────────────────────
  private async assertDepartmentBelongsToCompany(companyId: string, departmentId: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id: departmentId, companyId },
    });
    if (!dept) throw new NotFoundException('Departamento não encontrado nesta empresa');
  }
}
