import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { UpdateAutoAttendanceFlowDto } from './dto/update-auto-attendance-flow.dto';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';

const FLOW_SELECT = {
  id: true,
  isActive: true,
  greetingMessage: true,
  businessHours: true,
  outOfHoursMessage: true,
  inactivityTimeoutSecs: true,
  inactivityMessage: true,
  closingMessage: true,
  createdAt: true,
  updatedAt: true,
};

const OPTION_SELECT = {
  id: true,
  order: true,
  label: true,
  action: true,
  departmentId: true,
  queueId: true,
  department: { select: { id: true, name: true } },
  queue: { select: { id: true, name: true } },
};

@Injectable()
export class AutoAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  // Toda empresa tem no máximo 1 flow — se ainda não configurou nada, devolve
  // um registro desativado em vez de 404 (a tela de Configurações sempre tem
  // algo pra mostrar/editar, sem precisar de um passo "criar" separado).
  async getFlow(companyId: string) {
    const flow = await this.prisma.autoAttendanceFlow.findUnique({
      where: { companyId },
      select: { ...FLOW_SELECT, menuOptions: { select: OPTION_SELECT, orderBy: { order: 'asc' } } },
    });

    if (flow) return flow;

    return {
      id: null,
      isActive: false,
      greetingMessage: null,
      businessHours: null,
      outOfHoursMessage: null,
      inactivityTimeoutSecs: null,
      inactivityMessage: null,
      closingMessage: null,
      createdAt: null,
      updatedAt: null,
      menuOptions: [],
    };
  }

  async updateFlow(companyId: string, dto: UpdateAutoAttendanceFlowDto) {
    const updated = await this.prisma.autoAttendanceFlow.upsert({
      where: { companyId },
      create: { companyId, ...dto },
      update: dto,
      select: FLOW_SELECT,
    });
    return updated;
  }

  async listMenuOptions(companyId: string) {
    const flow = await this.prisma.autoAttendanceFlow.findUnique({
      where: { companyId },
      select: { id: true },
    });
    if (!flow) return [];

    return this.prisma.autoAttendanceMenuOption.findMany({
      where: { flowId: flow.id },
      select: OPTION_SELECT,
      orderBy: { order: 'asc' },
    });
  }

  async createMenuOption(companyId: string, dto: CreateMenuOptionDto) {
    const flow = await this.prisma.autoAttendanceFlow.upsert({
      where: { companyId },
      create: { companyId },
      update: {},
      select: { id: true },
    });

    await this.validateTarget(companyId, dto.action, dto.departmentId, dto.queueId);

    return this.prisma.autoAttendanceMenuOption.create({
      data: {
        flowId: flow.id,
        order: dto.order,
        label: dto.label,
        action: dto.action,
        departmentId: dto.departmentId,
        queueId: dto.queueId,
      },
      select: OPTION_SELECT,
    });
  }

  async updateMenuOption(companyId: string, optionId: string, dto: UpdateMenuOptionDto) {
    const option = await this.findOwnedOption(companyId, optionId);

    if (dto.action || dto.departmentId || dto.queueId) {
      await this.validateTarget(
        companyId,
        dto.action ?? option.action,
        dto.departmentId,
        dto.queueId,
      );
    }

    return this.prisma.autoAttendanceMenuOption.update({
      where: { id: optionId },
      data: dto,
      select: OPTION_SELECT,
    });
  }

  async removeMenuOption(companyId: string, optionId: string) {
    await this.findOwnedOption(companyId, optionId);
    await this.prisma.autoAttendanceMenuOption.delete({ where: { id: optionId } });
    return { success: true };
  }

  // Reordena todas as opções do flow de uma vez, na ordem de `orderedIds`
  // (usado pelos botões "mover pra cima/baixo" da UI). Passa por uma faixa
  // negativa temporária antes de gravar a posição final — sem isso, trocar a
  // ordem de 2 opções bateria na constraint @@unique([flowId, order]) no meio
  // da transação (ex.: opção A tentando virar "2" enquanto opção B ainda é "2").
  async reorderMenuOptions(companyId: string, orderedIds: string[]) {
    const flow = await this.prisma.autoAttendanceFlow.findUnique({
      where: { companyId },
      select: { id: true },
    });
    if (!flow) throw new NotFoundException('Auto-atendimento ainda não configurado');

    const owned = await this.prisma.autoAttendanceMenuOption.findMany({
      where: { flowId: flow.id },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((o) => o.id));
    if (orderedIds.length !== owned.length || !orderedIds.every((id) => ownedIds.has(id))) {
      throw new BadRequestException('A lista precisa conter exatamente as opções existentes deste fluxo');
    }

    await this.prisma.$transaction([
      ...orderedIds.map((id, index) =>
        this.prisma.autoAttendanceMenuOption.update({
          where: { id },
          data: { order: -(index + 1) },
        }),
      ),
      ...orderedIds.map((id, index) =>
        this.prisma.autoAttendanceMenuOption.update({
          where: { id },
          data: { order: index + 1 },
        }),
      ),
    ]);

    return this.listMenuOptions(companyId);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Confere que a opção pertence a um flow desta empresa antes de editar/excluir
  // — sem isso, um ADMIN de outra empresa poderia mexer numa opção alheia só
  // adivinhando o id (nenhum filtro de companyId direto na tabela de opções).
  private async findOwnedOption(companyId: string, optionId: string) {
    const option = await this.prisma.autoAttendanceMenuOption.findFirst({
      where: { id: optionId, flow: { companyId } },
    });
    if (!option) throw new NotFoundException('Opção de menu não encontrada');
    return option;
  }

  private async validateTarget(
    companyId: string,
    action?: string,
    departmentId?: string,
    queueId?: string,
  ) {
    if (action === 'ROUTE_TO_DEPARTMENT') {
      if (!departmentId) throw new BadRequestException('departmentId é obrigatório para ROUTE_TO_DEPARTMENT');
      const dept = await this.prisma.department.findFirst({ where: { id: departmentId, companyId } });
      if (!dept) throw new BadRequestException('Departamento não encontrado');
    }
    if (action === 'ROUTE_TO_QUEUE') {
      if (!queueId) throw new BadRequestException('queueId é obrigatório para ROUTE_TO_QUEUE');
      const queue = await this.prisma.queue.findFirst({ where: { id: queueId, companyId } });
      if (!queue) throw new BadRequestException('Fila não encontrada');
    }
  }
}
