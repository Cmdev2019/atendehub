import { Injectable } from '@nestjs/common';
import { ConversationStatus, ConversationResolution } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

const DEFAULT_PERIOD_DAYS = 30;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Resumo do dashboard (B-32) — chamados atendidos/não atendidos e ────────
  // soluções resolvidas/não resolvidas, com dados reais do período.
  //
  // "Atendido"/"não atendido" olha pra `createdAt` (chamados que ENTRARAM no
  // período, e se algum agente chegou a assumir) — já "resolvido"/"não
  // resolvido" olha pra `closedAt` (só existe depois que a conversa foi
  // encerrada, quando o atendente informa o motivo). São janelas de tempo
  // diferentes por natureza: um chamado pode ter entrado no período mas só
  // ser encerrado depois dele (ou vice-versa).
  async getSummary(companyId: string, fromInput?: string, toInput?: string) {
    const to = toInput ? new Date(toInput) : new Date();
    const from = fromInput
      ? new Date(fromInput)
      : new Date(to.getTime() - DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const createdInPeriod = { companyId, createdAt: { gte: from, lte: to } };
    const closedInPeriod = {
      companyId,
      status: ConversationStatus.CLOSED,
      closedAt: { gte: from, lte: to },
    };

    const [totalConversations, attended, notAttended, totalClosed, resolved, unresolved, unlabeled] =
      await Promise.all([
        this.prisma.conversation.count({ where: createdInPeriod }),
        this.prisma.conversation.count({ where: { ...createdInPeriod, agentId: { not: null } } }),
        this.prisma.conversation.count({ where: { ...createdInPeriod, agentId: null } }),
        this.prisma.conversation.count({ where: closedInPeriod }),
        this.prisma.conversation.count({
          where: { ...closedInPeriod, resolution: ConversationResolution.RESOLVED },
        }),
        this.prisma.conversation.count({
          where: { ...closedInPeriod, resolution: ConversationResolution.UNRESOLVED },
        }),
        this.prisma.conversation.count({ where: { ...closedInPeriod, resolution: null } }),
      ]);

    return {
      period: { from, to },
      totalConversations,
      attended,
      notAttended,
      totalClosed,
      resolved,
      unresolved,
      // Encerradas antes deste campo existir (ou por algum caminho que ainda
      // não pede o motivo) — contadas à parte pra não inflar nem desinflar
      // "resolvido"/"não resolvido" com um dado que não existe de verdade.
      unlabeled,
    };
  }
}
