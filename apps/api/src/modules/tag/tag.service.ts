import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

const SELECT_FIELDS = { id: true, name: true, color: true } as const;

@Injectable()
export class TagService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Listar tags da empresa ─────────────────────────────────────────────────
  async findAll(companyId: string) {
    return this.prisma.tag.findMany({
      where: { companyId },
      select: {
        ...SELECT_FIELDS,
        _count: { select: { conversations: true, contacts: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ── Criar tag ───────────────────────────────────────────────────────────────
  async create(companyId: string, dto: CreateTagDto) {
    const existing = await this.prisma.tag.findFirst({
      where: { companyId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Já existe uma tag com este nome');
    }

    return this.prisma.tag.create({
      data: { companyId, ...dto },
      select: SELECT_FIELDS,
    });
  }

  // ── Atualizar tag ───────────────────────────────────────────────────────────
  async update(companyId: string, id: string, dto: UpdateTagDto) {
    await this.assertBelongsToCompany(companyId, id);

    if (dto.name) {
      const conflict = await this.prisma.tag.findFirst({
        where: { companyId, name: dto.name, NOT: { id } },
      });
      if (conflict) throw new ConflictException('Já existe uma tag com este nome');
    }

    return this.prisma.tag.update({
      where: { id },
      data: dto,
      select: SELECT_FIELDS,
    });
  }

  // ── Remover tag (desvincula automaticamente de conversas/contatos — relação
  // implícita N:N do Prisma, sem FK explícita para bloquear) ───────────────────
  async remove(companyId: string, id: string) {
    await this.assertBelongsToCompany(companyId, id);

    await this.prisma.tag.delete({ where: { id } });
    return { message: 'Tag removida com sucesso' };
  }

  // ── Atribuir / remover tag de uma conversa ────────────────────────────────
  async assignToConversation(companyId: string, conversationId: string, tagId: string) {
    await this.assertBelongsToCompany(companyId, tagId);
    await this.assertConversationBelongsToCompany(companyId, conversationId);

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { tags: { connect: { id: tagId } } },
    });
    return { message: 'Tag atribuída à conversa' };
  }

  async removeFromConversation(companyId: string, conversationId: string, tagId: string) {
    await this.assertBelongsToCompany(companyId, tagId);
    await this.assertConversationBelongsToCompany(companyId, conversationId);

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { tags: { disconnect: { id: tagId } } },
    });
    return { message: 'Tag removida da conversa' };
  }

  // ── Atribuir / remover tag de um contato ──────────────────────────────────
  async assignToContact(companyId: string, contactId: string, tagId: string) {
    await this.assertBelongsToCompany(companyId, tagId);
    await this.assertContactBelongsToCompany(companyId, contactId);

    await this.prisma.contact.update({
      where: { id: contactId },
      data: { tags: { connect: { id: tagId } } },
    });
    return { message: 'Tag atribuída ao contato' };
  }

  async removeFromContact(companyId: string, contactId: string, tagId: string) {
    await this.assertBelongsToCompany(companyId, tagId);
    await this.assertContactBelongsToCompany(companyId, contactId);

    await this.prisma.contact.update({
      where: { id: contactId },
      data: { tags: { disconnect: { id: tagId } } },
    });
    return { message: 'Tag removida do contato' };
  }

  // ── Validações internas ───────────────────────────────────────────────────
  private async assertBelongsToCompany(companyId: string, id: string) {
    const tag = await this.prisma.tag.findFirst({ where: { id, companyId } });
    if (!tag) throw new NotFoundException('Tag não encontrada');
  }

  private async assertConversationBelongsToCompany(companyId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
  }

  private async assertContactBelongsToCompany(companyId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException('Contato não encontrado');
  }
}
