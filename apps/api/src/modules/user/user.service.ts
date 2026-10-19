import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Availability, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { StorageService } from '../../shared/storage/storage.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthService } from '../auth/auth.service';
import { runAsSystem } from '../../shared/tenant/tenant-context';
import { EventsService } from '../events/events.service';
import { AvailabilityService } from '../availability/availability.service';

// Gera senha temporária que já satisfaz a política de senha do produto
// (ChangePasswordDto: mín. 8, 1 maiúscula, 1 minúscula, 1 número) — sem
// caracteres ambíguos (0/O, 1/I/l) pra facilitar digitação manual do reset.
function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (charset: string) => charset[crypto.randomInt(charset.length)];

  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < 12) chars.push(pick(all));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

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
  // B-65: o supervisor vê o estado de todos na lista de usuários
  availability: true,
  availabilityChangedAt: true,
  createdAt: true,
  updatedAt: true,
};

// B-113: setores de cada usuário — a tela de Usuários mostra e edita
const DEPARTMENTS_SELECT = {
  departments: {
    select: { id: true, name: true, color: true },
    orderBy: { name: 'asc' as const },
  },
};

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly storage: StorageService,
    private readonly auth: AuthService,
    private readonly events: EventsService,
    private readonly availability: AvailabilityService,
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
        select: { ...USER_SELECT, ...DEPARTMENTS_SELECT },
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
      select: { ...USER_SELECT, ...DEPARTMENTS_SELECT },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  // ── Setores informados no cadastro/edição (B-113) ─────────────────────────
  // Todos precisam ser desta empresa. Com o RLS (B-83), o setor de outra
  // empresa nem entraria na contagem, mas o filtro explícito é a regra.
  private async assertCompanyDepartments(companyId: string, departmentIds: string[]) {
    if (departmentIds.length === 0) return;
    const found = await this.prisma.department.count({
      where: { companyId, id: { in: departmentIds } },
    });
    if (found !== departmentIds.length) {
      throw new BadRequestException('Setor não encontrado nesta empresa');
    }
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

    // E-mail é único GLOBALMENTE (B-20), não só na empresa — o login busca
    // por e-mail sem companyId, então a checagem precisa ser global também,
    // senão a violação da constraint no create() viraria um 500 cru.
    // B-83: runAsSystem — com o RLS, a consulta na empresa do requisitante não
    // enxergaria o e-mail cadastrado em outra.
    const existing = await runAsSystem(() =>
      this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase().trim() },
        select: { id: true },
      }),
    );

    if (existing) {
      throw new ConflictException('Já existe um usuário com este e-mail');
    }

    // SUPER_ADMIN só pode ser criado por outro SUPER_ADMIN
    if (dto.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Não é permitido criar usuário SUPER_ADMIN');
    }

    const departmentIds = dto.departmentIds ?? [];
    await this.assertCompanyDepartments(companyId, departmentIds);

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
        // B-113 (ADR-0019, regra 22): já nasce nos setores que vai atender
        ...(departmentIds.length > 0 && {
          departments: { connect: departmentIds.map((departmentId) => ({ id: departmentId })) },
        }),
      },
      select: { ...USER_SELECT, ...DEPARTMENTS_SELECT },
    });

    await this.auditLog.record({
      companyId,
      userId: requesterId,
      action: 'user.created',
      entity: 'User',
      entityId: created.id,
      after: { name: created.name, email: created.email, role: created.role, departmentIds },
    });

    return created;
  }

  // ── Atualizar usuário ─────────────────────────────────────────────────────
  async update(companyId: string, id: string, dto: UpdateUserDto, requesterId: string) {
    const before = await this.findOne(companyId, id); // garante que pertence à empresa

    if (dto.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Não é permitido atribuir role SUPER_ADMIN');
    }

    // B-113: a lista substitui os setores do usuário; ausente, não mexe neles
    const { departmentIds, ...fields } = dto;
    if (departmentIds) await this.assertCompanyDepartments(companyId, departmentIds);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...fields,
        ...(departmentIds && {
          departments: { set: departmentIds.map((departmentId) => ({ id: departmentId })) },
        }),
      },
      select: { ...USER_SELECT, ...DEPARTMENTS_SELECT },
    });

    // B-74 (M-09): papel novo muda as salas do socket (empresa inteira ou só
    // departamentos) e desativação tira o acesso — os sockets abertos caem e,
    // na reconexão, o handshake decide de novo. B-113: setores novos também
    // mudam as salas — sem isto, a fila do setor novo só chegaria em tempo
    // real quando o token expirasse.
    const roleChanged = !!dto.role && dto.role !== before.role;
    const deactivated = dto.isActive === false && before.isActive;
    const departmentsChanged =
      !!departmentIds && !sameIds(before.departments.map((d) => d.id), departmentIds);
    if (roleChanged || deactivated || departmentsChanged) {
      this.events.disconnectUser(id);
    }

    // B-65 (ADR-0019): usuário desativado não continua aparecendo Online
    const availability = deactivated
      ? await this.availability.set({ id, companyId }, Availability.OFFLINE, 'deactivated', requesterId)
      : null;

    // Mudança de role é a ação sensível aqui — edições de nome/telefone/avatar
    // não entram na auditoria v1 (decisão B1-4, ver Registro de decisões)
    if (roleChanged) {
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

    return availability ? { ...updated, ...availability } : updated;
  }

  // ── Auto-edição do próprio perfil (B3-1) ──────────────────────────────────
  // Sem checagem de role: qualquer usuário autenticado pode chamar isso pra
  // si mesmo — o DTO já exclui role/isActive, então não há como escalar
  // privilégio por aqui. Sem auditoria (decisão B1-4: edição de
  // nome/telefone/avatar não é ação sensível o suficiente pra v1).
  async updateOwnProfile(companyId: string, userId: string, dto: UpdateOwnProfileDto) {
    await this.findOne(companyId, userId);

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: USER_SELECT,
    });
  }

  // ── Estado do próprio usuário (B-65 / ADR-0019) ───────────────────────────
  // Só o próprio usuário troca o seu estado: a rota não recebe id, então não
  // há como mudar o de outra pessoa por aqui.
  async updateOwnAvailability(companyId: string, userId: string, availability: Availability) {
    return this.availability.set({ id: userId, companyId }, availability, 'self');
  }

  // ── Upload do próprio avatar (B3-2) ───────────────────────────────────────
  async updateAvatar(companyId: string, userId: string, file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo de avatar ausente ou vazio');
    }

    await this.findOne(companyId, userId);

    const uploaded = await this.storage.upload(
      file.buffer,
      file.mimetype,
      companyId,
      file.originalname,
      file.size,
    );

    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: uploaded.url },
      select: USER_SELECT,
    });
  }

  // ── Trocar a própria senha ────────────────────────────────────────────────
  // B-51: só o dono da conta troca a própria senha. A checagem vem antes de
  // qualquer consulta — não revela se o id existe nem gasta bcrypt à toa.
  // Para outro usuário, o caminho é o reset administrativo (resetPassword).
  async changePassword(
    companyId: string,
    id: string,
    dto: ChangePasswordDto,
    requesterId: string,
    sessionId?: string,
  ) {
    if (id !== requesterId) {
      throw new ForbiddenException('Você só pode trocar a sua própria senha');
    }

    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        passwordHash: true,
      },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');

    const match = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!match) throw new BadRequestException('Senha atual incorreta');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    // B-72 (M-08): a senha nova encerra todas as sessões — quem tinha a
    // antiga (outro aparelho, token vazado) sai. Este aparelho recebe um par
    // de tokens novo para continuar logado, e o socket dele não cai (B-74).
    await this.auth.revokeAllSessions(id, { passwordHash }, sessionId);

    await this.auditLog.record({
      companyId,
      userId: requesterId,
      action: 'user.password_changed',
      entity: 'User',
      entityId: id,
    });

    const { passwordHash: _hash, ...authUser } = user;
    const tokens = await this.auth.issueTokens(authUser);

    return { message: 'Senha atualizada com sucesso', ...tokens };
  }

  // ── Reset administrativo de senha (B-26, paliativo sem SMTP) ──────────────
  // ADMIN gera senha temporária pra um usuário travado da própria empresa,
  // sem precisar saber a senha atual. Não resolve o ADMIN único da empresa
  // se trancar sozinho fora dela (precisaria estar autenticado pra chamar
  // isto) — cobre o caso mais comum: AGENT/SUPERVISOR esqueceu a senha e há
  // um ADMIN ativo por perto. A senha só existe em texto puro no retorno
  // desta chamada — nunca é logada nem persistida fora do hash.
  async resetPassword(companyId: string, id: string, requesterId: string) {
    if (id === requesterId) {
      throw new BadRequestException(
        'Para trocar a própria senha, use a troca de senha em Meu perfil',
      );
    }

    await this.findOne(companyId, id); // garante que pertence à empresa

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    // B-72 (M-08): as sessões abertas com a senha antiga caem junto.
    await this.auth.revokeAllSessions(id, { passwordHash });

    await this.auditLog.record({
      companyId,
      userId: requesterId,
      action: 'user.password_reset',
      entity: 'User',
      entityId: id,
    });

    return { temporaryPassword };
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

    // B-74 (M-09): usuário desativado perde o socket aberto na hora.
    this.events.disconnectUser(id);

    await this.auditLog.record({
      companyId,
      userId: requesterId,
      action: 'user.deactivated',
      entity: 'User',
      entityId: id,
      before: { isActive: true },
      after: { isActive: false },
    });

    // B-65 (ADR-0019): e não continua aparecendo Online
    const availability = await this.availability.set(
      { id, companyId },
      Availability.OFFLINE,
      'deactivated',
      requesterId,
    );

    return { ...updated, ...availability };
  }
}
