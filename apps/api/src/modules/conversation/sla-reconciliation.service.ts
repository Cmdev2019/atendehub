import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConversationStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ConversationService, SlaReconcileOutcome } from './conversation.service';

// ── B-107 (D3, D5 e D6): reconciliação dos jobs do SLA ──────────────────────
// Os pedidos do painel gravam o ciclo no banco e mandam o job para o Redis
// depois da resposta; o robô e o webhook, na hora. Se o Redis falhou nesse
// instante, o job faltou. A cada minuto, as conversas com um ciclo aberto e
// prazo por vencer (espera ou atendimento) são conferidas contra o Redis, e o
// job que faltar é refeito a partir do banco (ConversationService.reconcileSla)
// — também depois de reiniciar o processo, que perde o que estava em memória.
//
// A consulta usa o índice parcial das conversas ativas (B-49), sem índice
// novo (D6). Uma rodada não se sobrepõe à outra: chamada no meio de uma, devolve
// a que está em andamento, e o agendamento pula o minuto (com aviso). Falhas
// seguidas indicam Redis ou banco fora: a rodada para e a próxima tenta de novo.
export const SLA_RECONCILE_INTERVAL_MS = 60_000;
const MAX_CONSECUTIVE_FAILURES = 3;

export interface SlaReconcileSummary {
  evaluated: number;
  ok: number;
  rescheduled: number;
  skipped: number;
  failed: number;
  aborted: boolean;
  durationMs: number;
  lastError?: string;
}

@Injectable()
export class SlaReconciliationService {
  private readonly logger = new Logger(SlaReconciliationService.name);
  private running: Promise<SlaReconcileSummary> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationService,
  ) {}

  @Interval(SLA_RECONCILE_INTERVAL_MS)
  async reconcileOnSchedule(): Promise<void> {
    if (this.running) {
      this.logger.warn('Reconciliação do SLA: a rodada anterior ainda não terminou; esta foi pulada');
      return;
    }
    await this.reconcile().catch((err: Error) => {
      this.logger.error(`Reconciliação do SLA falhou: ${err.message}`);
    });
  }

  reconcile(): Promise<SlaReconcileSummary> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<SlaReconcileSummary> {
    const started = Date.now();
    const summary: SlaReconcileSummary = {
      evaluated: 0,
      ok: 0,
      rescheduled: 0,
      skipped: 0,
      failed: 0,
      aborted: false,
      durationMs: 0,
    };

    // Todas as empresas, como o processor do SLA: o status no topo deixa o
    // Postgres usar o índice parcial das conversas ativas (WAITING/OPEN)
    const candidates = await this.prisma.conversation.findMany({
      where: {
        status: { in: [ConversationStatus.WAITING, ConversationStatus.OPEN] },
        OR: [
          { status: ConversationStatus.WAITING, waitSlaDueAt: { not: null }, slaBreachedAt: null },
          { status: ConversationStatus.OPEN, serviceSlaDueAt: { not: null }, serviceSlaBreachedAt: null },
        ],
      },
      select: { id: true },
    });
    summary.evaluated = candidates.length;

    let consecutiveFailures = 0;
    for (const { id } of candidates) {
      try {
        const outcome: SlaReconcileOutcome = await this.conversations.reconcileSla(id);
        summary[outcome] += 1;
        consecutiveFailures = 0;
      } catch (err: any) {
        summary.failed += 1;
        summary.lastError = err.message;
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          summary.aborted = true;
          break;
        }
      }
    }

    summary.durationMs = Date.now() - started;
    this.report(summary);
    return summary;
  }

  private report(summary: SlaReconcileSummary): void {
    const line =
      `Reconciliação do SLA: ${summary.evaluated} conversa(s) avaliada(s) em ${summary.durationMs} ms — ` +
      `${summary.ok} em dia, ${summary.rescheduled} job(s) refeito(s), ${summary.skipped} sem job a fazer, ` +
      `${summary.failed} erro(s)`;
    if (summary.failed > 0) {
      this.logger.warn(
        `${line}${summary.aborted ? ' — rodada interrompida' : ''}. Último erro: ${summary.lastError}`,
      );
    } else if (summary.evaluated > 0) {
      this.logger.log(line);
    } else {
      this.logger.debug(line);
    }
  }
}
