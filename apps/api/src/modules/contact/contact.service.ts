import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Channel } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ListContactsDto } from './dto/list-contacts.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ── Listar contatos com paginação e filtros ───────────────────────────────
  async findAll(companyId: string, query: ListContactsDto) {
    const { search, channel, isBlocked, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      companyId,
      ...(channel && { channel }),
      ...(isBlocked !== undefined && { isBlocked }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          avatarUrl: true,
          channel: true,
          isBlocked: true,
          createdAt: true,
          _count: { select: { conversations: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Buscar contato por ID ─────────────────────────────────────────────────
  async findOne(companyId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        avatarUrl: true,
        channel: true,
        isBlocked: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        tags: { select: { id: true, name: true, color: true } },
        conversations: {
          select: {
            id: true,
            status: true,
            channel: true,
            lastMessageAt: true,
            lastMessagePreview: true,
            createdAt: true,
          },
          orderBy: { lastMessageAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!contact) throw new NotFoundException('Contato não encontrado');
    return contact;
  }

  // ── Criar contato ─────────────────────────────────────────────────────────
  async create(companyId: string, dto: CreateContactDto) {
    const existing = await this.prisma.contact.findUnique({
      where: { companyId_phone: { companyId, phone: dto.phone } },
    });

    if (existing) {
      throw new ConflictException('Já existe um contato com este número de telefone');
    }

    return this.prisma.contact.create({
      data: {
        companyId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        avatarUrl: dto.avatarUrl,
        channel: dto.channel ?? Channel.WHATSAPP,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        avatarUrl: true,
        channel: true,
        createdAt: true,
      },
    });
  }

  // ── Atualizar contato ─────────────────────────────────────────────────────
  async update(companyId: string, id: string, dto: UpdateContactDto) {
    await this.findOne(companyId, id);

    return this.prisma.contact.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        avatarUrl: true,
        isBlocked: true,
        updatedAt: true,
      },
    });
  }

  // ── Remover contato ───────────────────────────────────────────────────────
  async remove(companyId: string, id: string, requesterId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, companyId },
      select: { name: true, phone: true },
    });

    if (!contact) throw new NotFoundException('Contato não encontrado');

    await this.prisma.contact.delete({ where: { id } });

    await this.auditLog.record({
      companyId,
      userId: requesterId,
      action: 'contact.deleted',
      entity: 'Contact',
      entityId: id,
      before: { name: contact.name, phone: contact.phone },
    });

    return { message: `Contato "${contact.name}" removido com sucesso` };
  }

  // ── Bloquear / desbloquear ────────────────────────────────────────────────
  async toggleBlock(companyId: string, id: string) {
    const contact = await this.findOne(companyId, id);

    return this.prisma.contact.update({
      where: { id },
      data: { isBlocked: !contact.isBlocked },
      select: { id: true, name: true, isBlocked: true },
    });
  }

  // ── Upsert via webhook (cria ou atualiza pelo telefone) ───────────────────
  async upsertFromWebhook(
    companyId: string,
    phone: string,
    name?: string,
    avatarUrl?: string,
  ) {
    return this.prisma.contact.upsert({
      where: { companyId_phone: { companyId, phone } },
      update: {
        ...(name && { name }),
        ...(avatarUrl && { avatarUrl }),
      },
      create: {
        companyId,
        phone,
        name: name || phone,
        avatarUrl,
        channel: Channel.WHATSAPP,
      },
    });
  }
}
