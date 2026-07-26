import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Channel, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ListContactsDto } from './dto/list-contacts.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { StorageService } from '../../shared/storage/storage.service';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly storage: StorageService,
  ) {}

  // ── Listar contatos com paginação e filtros ───────────────────────────────
  async findAll(companyId: string, query: ListContactsDto) {
    const { search, channel, isBlocked, tagId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      companyId,
      ...(channel && { channel }),
      ...(isBlocked !== undefined && { isBlocked }),
      ...(tagId && { tags: { some: { id: tagId } } }),
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
          tags: { select: { id: true, name: true, color: true } },
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
        anonymizedAt: true,
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
    const contact = await this.findOne(companyId, id);
    if (contact.anonymizedAt) {
      throw new BadRequestException('Contato anonimizado não pode ser editado');
    }

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

  // ── Anonimizar contato (B-17/LGPD — direito de exclusão do titular) ───────
  // Não é hard delete: `Conversation.contact` não tem cascade (uma conversa é
  // histórico de negócio legítimo da empresa, não só do contato) — o hard
  // delete anterior quebrava com violação de FK (erro cru, não tratado) pra
  // qualquer contato com pelo menos uma conversa, e nunca foi pego porque não
  // havia teste contra Postgres real nem consumidor no frontend chamando esta
  // rota (achado pesquisando o mecanismo de atendimento a solicitação de
  // titular de dados para B-17). Em vez de apagar, os campos de PII são
  // substituídos e o registro — com seu histórico de conversas/mensagens —
  // permanece intacto.
  async remove(companyId: string, id: string, requesterId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, companyId },
      select: { name: true, phone: true, email: true, anonymizedAt: true },
    });

    if (!contact) throw new NotFoundException('Contato não encontrado');
    if (contact.anonymizedAt) {
      throw new BadRequestException('Este contato já foi anonimizado');
    }

    const anonymized = await this.prisma.contact.update({
      where: { id },
      data: {
        name: 'Contato removido',
        phone: `anonimizado-${id}`,
        email: null,
        avatarUrl: null,
        metadata: Prisma.DbNull,
        anonymizedAt: new Date(),
      },
      select: { anonymizedAt: true },
    });

    // B-29/LGPD: a PII do Postgres já foi removida acima — a mídia (foto,
    // áudio, documento) das conversas do contato ainda vive no MinIO e
    // precisa ser purgada também, senão o "esquecimento" fica só parcial
    // (a URL pública continua servindo o arquivo). Best-effort de propósito:
    // uma falha aqui (MinIO fora do ar, objeto já ausente) não desfaz a
    // anonimização, que é a parte legalmente obrigatória — fica registrada
    // na auditoria pra follow-up manual.
    const mediaResult = await this.purgeMedia(companyId, id);

    await this.auditLog.record({
      companyId,
      userId: requesterId,
      action: 'contact.anonymized',
      entity: 'Contact',
      entityId: id,
      before: { name: contact.name, phone: contact.phone, email: contact.email },
      after: { mediaPurged: mediaResult.purged, mediaFailed: mediaResult.failed },
    });

    return {
      message: 'Contato anonimizado com sucesso — histórico de conversas preservado',
      anonymizedAt: anonymized.anonymizedAt,
      media: mediaResult,
    };
  }

  // ── Purga mídia do MinIO ao anonimizar (B-29/LGPD) ────────────────────────
  // Apaga o objeto no MinIO e a linha de `Attachment` de cada anexo das
  // conversas do contato. Best-effort por item: uma falha isolada (objeto já
  // removido, MinIO fora do ar) não interrompe as demais.
  private async purgeMedia(companyId: string, contactId: string) {
    const attachments = await this.prisma.attachment.findMany({
      where: { message: { conversation: { contactId, companyId } } },
      select: { id: true, url: true },
    });

    let purged = 0;
    let failed = 0;

    for (const attachment of attachments) {
      try {
        await this.storage.deleteByUrl(attachment.url);
        await this.prisma.attachment.delete({ where: { id: attachment.id } });
        purged += 1;
      } catch (err: any) {
        failed += 1;
        this.logger.error(
          `Falha ao purgar mídia do contato ${contactId} (attachment ${attachment.id}): ${err.message}`,
        );
      }
    }

    return { purged, failed };
  }

  // ── Exportar dados do titular (B-30/LGPD — direito de portabilidade) ──────
  // Reúne tudo que a empresa guarda sobre o contato — dados cadastrais, tags
  // e o histórico completo de conversas com mensagens/anexos — num único
  // JSON estruturado (formato comum, legível por máquina, art. 18 §5º da
  // LGPD). Sem paginação de propósito: é uma exportação pontual sob demanda
  // de um `ADMIN`, não uma listagem de uso corrente.
  async exportData(companyId: string, id: string, requesterId: string) {
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
        anonymizedAt: true,
        createdAt: true,
        updatedAt: true,
        tags: { select: { id: true, name: true, color: true } },
      },
    });

    if (!contact) throw new NotFoundException('Contato não encontrado');
    if (contact.anonymizedAt) {
      throw new BadRequestException(
        'Este contato já foi anonimizado — não há dados pessoais para exportar',
      );
    }

    const conversations = await this.prisma.conversation.findMany({
      where: { contactId: id, companyId },
      select: {
        id: true,
        status: true,
        channel: true,
        createdAt: true,
        resolvedAt: true,
        closedAt: true,
        agent: { select: { id: true, name: true } },
        messages: {
          where: { isDeleted: false },
          select: {
            id: true,
            senderType: true,
            content: true,
            type: true,
            status: true,
            sentAt: true,
            deliveredAt: true,
            readAt: true,
            sender: { select: { id: true, name: true } },
            attachments: {
              select: { id: true, url: true, mimeType: true, fileName: true, size: true },
            },
          },
          orderBy: { sentAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    await this.auditLog.record({
      companyId,
      userId: requesterId,
      action: 'contact.exported',
      entity: 'Contact',
      entityId: id,
    });

    return { contact, conversations, exportedAt: new Date() };
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
