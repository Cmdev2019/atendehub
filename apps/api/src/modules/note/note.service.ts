import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateNoteDto } from './dto/create-note.dto';

@Injectable()
export class NoteService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Garante que a conversa pertence à empresa ─────────────────────────────
  private async assertOwnership(companyId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
      select: { id: true },
    });

    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    return conversation;
  }

  // ── Listar notas de uma conversa ──────────────────────────────────────────
  async findAll(companyId: string, conversationId: string) {
    await this.assertOwnership(companyId, conversationId);

    return this.prisma.internalNote.findMany({
      where: { conversationId },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: { id: true, name: true, avatarUrl: true, role: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ── Criar nota ────────────────────────────────────────────────────────────
  async create(
    companyId: string,
    conversationId: string,
    authorId: string,
    dto: CreateNoteDto,
  ) {
    await this.assertOwnership(companyId, conversationId);

    return this.prisma.internalNote.create({
      data: {
        conversationId,
        authorId,
        content: dto.content,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        author: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });
  }

  // ── Atualizar nota ────────────────────────────────────────────────────────
  async update(
    companyId: string,
    conversationId: string,
    noteId: string,
    authorId: string,
    role: Role,
    dto: CreateNoteDto,
  ) {
    await this.assertOwnership(companyId, conversationId);

    const note = await this.prisma.internalNote.findFirst({
      where: { id: noteId, conversationId },
      select: { authorId: true },
    });

    if (!note) throw new NotFoundException('Nota não encontrada');

    // Apenas o autor pode editar, exceto ADMIN/SUPERVISOR
    const canEdit =
      note.authorId === authorId ||
      role === Role.ADMIN ||
      role === Role.SUPERVISOR ||
      role === Role.SUPER_ADMIN;

    if (!canEdit) throw new ForbiddenException('Você não pode editar esta nota');

    return this.prisma.internalNote.update({
      where: { id: noteId },
      data: { content: dto.content },
      select: {
        id: true,
        content: true,
        updatedAt: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  // ── Remover nota ──────────────────────────────────────────────────────────
  async remove(
    companyId: string,
    conversationId: string,
    noteId: string,
    authorId: string,
    role: Role,
  ) {
    await this.assertOwnership(companyId, conversationId);

    const note = await this.prisma.internalNote.findFirst({
      where: { id: noteId, conversationId },
      select: { authorId: true },
    });

    if (!note) throw new NotFoundException('Nota não encontrada');

    const canDelete =
      note.authorId === authorId ||
      role === Role.ADMIN ||
      role === Role.SUPERVISOR ||
      role === Role.SUPER_ADMIN;

    if (!canDelete) throw new ForbiddenException('Você não pode remover esta nota');

    await this.prisma.internalNote.delete({ where: { id: noteId } });
    return { message: 'Nota removida com sucesso' };
  }
}
