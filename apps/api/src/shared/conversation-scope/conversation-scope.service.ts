import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ScopeUser {
  id: string;
  role: Role | string;
}

// Papéis que enxergam todas as conversas da empresa (B-40, decisão do
// responsável em 2026-10-17). Os demais (AGENT) ficam restritos ao escopo.
export const COMPANY_WIDE_ROLES: ReadonlySet<string> = new Set([
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.SUPERVISOR,
]);

export function seesWholeCompany(user: ScopeUser): boolean {
  return COMPANY_WIDE_ROLES.has(user.role);
}

/**
 * C-10/B-40 — quais conversas um usuário pode ver.
 *
 * ADMIN e SUPERVISOR: todas da empresa. AGENT: as atribuídas a ele, as dos
 * departamentos a que pertence e as que ainda não têm departamento (sem isso,
 * conversa sem departamento não apareceria para nenhum atendente até alguém
 * atribuí-la). Antes, qualquer atendente lia, assumia, respondia e encerrava
 * qualquer conversa da empresa — jurídico, financeiro e RH sem separação.
 *
 * Os departamentos vêm do banco a cada chamada (não do token): mudar o
 * departamento de alguém vale na próxima requisição, sem novo login.
 */
@Injectable()
export class ConversationScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async departmentIdsOf(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { departments: { select: { id: true } } },
    });
    return user?.departments.map((d) => d.id) ?? [];
  }

  /** Filtro Prisma de Conversation para o usuário — `{}` quando vê a empresa toda. */
  async conversationWhere(user: ScopeUser): Promise<Prisma.ConversationWhereInput> {
    if (seesWholeCompany(user)) return {};
    const departmentIds = await this.departmentIdsOf(user.id);
    return {
      OR: [
        { agentId: user.id },
        { departmentId: null },
        ...(departmentIds.length ? [{ departmentId: { in: departmentIds } }] : []),
      ],
    };
  }

  /**
   * Garante que a conversa existe na empresa E está no escopo do usuário.
   * Fora do escopo responde 404, igual a uma conversa que não existe — não
   * confirma a existência de conversas de outros departamentos.
   */
  async assertAccess(user: ScopeUser & { companyId: string }, conversationId: string): Promise<void> {
    const scope = await this.conversationWhere(user);
    const found = await this.prisma.conversation.findFirst({
      where: { AND: [{ id: conversationId, companyId: user.companyId }, scope] },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Conversa não encontrada');
  }

  async canAccess(user: ScopeUser & { companyId: string }, conversationId: string): Promise<boolean> {
    try {
      await this.assertAccess(user, conversationId);
      return true;
    } catch {
      return false;
    }
  }
}
