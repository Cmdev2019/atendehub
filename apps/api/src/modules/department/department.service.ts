import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

// B-116 (decisão do responsável em 2026-10-21): o admin cria os setores
// conforme a necessidade — até 20 ativos por empresa, por enquanto. Conta como
// os limites de usuários e de conexões: só os ativos (desativar libera a vaga).
export const MAX_ACTIVE_DEPARTMENTS = 20;

const DEPARTMENT_SELECT = {
  id: true,
  name: true,
  description: true,
  color: true,
  isActive: true,
};

@Injectable()
export class DepartmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

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
    return this.withActiveDepartmentSlot(companyId, async (tx) => {
      const existing = await tx.department.findFirst({
        where: { companyId, name: dto.name },
      });

      if (existing) {
        throw new ConflictException('Já existe um departamento com este nome');
      }

      return tx.department.create({
        data: { companyId, ...dto },
        select: { ...DEPARTMENT_SELECT, createdAt: true },
      });
    });
  }

  // ── Atualizar departamento ────────────────────────────────────────────────
  async update(companyId: string, id: string, dto: UpdateDepartmentDto) {
    const current = await this.findOne(companyId, id);

    if (dto.name) {
      const conflict = await this.prisma.department.findFirst({
        where: { companyId, name: dto.name, NOT: { id } },
      });
      if (conflict) throw new ConflictException('Já existe um departamento com este nome');
    }

    const save = (client: Pick<Prisma.TransactionClient, 'department'>) =>
      client.department.update({
        where: { id },
        data: dto,
        select: { ...DEPARTMENT_SELECT, updatedAt: true },
      });

    // B-116: reativar um setor ocupa uma vaga, como criar
    if (dto.isActive === true && !current.isActive) {
      return this.withActiveDepartmentSlot(companyId, save);
    }
    return save(this.prisma);
  }

  // B-116: só passa se a empresa tiver vaga de setor ativo. A trava na linha
  // da empresa enfileira as criações e reativações simultâneas — sem ela, duas
  // ao mesmo tempo contariam 19 e as duas passariam (ADR-0004: a garantia fica
  // no banco). Dentro da transação o RLS não vale (B-83): os filtros por
  // companyId são explícitos.
  private withActiveDepartmentSlot<T>(
    companyId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "companies" WHERE "id" = ${companyId} FOR UPDATE`;
      const active = await tx.department.count({ where: { companyId, isActive: true } });
      if (active >= MAX_ACTIVE_DEPARTMENTS) {
        throw new BadRequestException(
          `Limite de ${MAX_ACTIVE_DEPARTMENTS} setores ativos atingido. Desative ou exclua um setor para abrir outro`,
        );
      }
      return work(tx);
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
    await this.assertCompanyUser(companyId, userId);

    const updated = await this.prisma.department.update({
      where: { id },
      data: { users: { connect: { id: userId } } },
      select: { id: true, name: true, users: { select: { id: true, name: true } } },
    });

    // B-113: as salas do socket dependem dos setores — reconecta já com o
    // setor novo, como na troca de papel (B-74)
    this.events.disconnectUser(userId);
    return updated;
  }

  // ── Remover usuário do departamento ──────────────────────────────────────
  async removeUser(companyId: string, id: string, userId: string) {
    await this.findOne(companyId, id);
    // B-113: antes, um id de outra empresa passava direto — e agora ainda
    // derrubaria os sockets dele
    await this.assertCompanyUser(companyId, userId);

    const updated = await this.prisma.department.update({
      where: { id },
      data: { users: { disconnect: { id: userId } } },
      select: { id: true, name: true, users: { select: { id: true, name: true } } },
    });

    this.events.disconnectUser(userId);
    return updated;
  }

  // Verifica se o usuário pertence à mesma empresa
  private async assertCompanyUser(companyId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { id: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado nesta empresa');
  }
}
