import { Injectable } from '@nestjs/common';
import { WebhookErrorClass } from './webhook.errors';

// ── B-39: observabilidade ───────────────────────────────────────────────────
// Contadores em memória (por processo/réplica — mesma limitação já registrada
// como B-46, "estado em memória impedindo réplicas"; num deploy com N réplicas
// da API cada uma expõe só a própria contagem). Suficiente pra 1 réplica hoje
// e pra scrape via Prometheus/Grafana amanhã; exposição em texto no formato
// de exposição do Prometheus, sem depender da lib `prom-client` (nenhuma
// dependência nova só pra 6 contadores simples).
@Injectable()
export class WebhookMetricsService {
  private processed = 0;
  private failedAttempts = 0;
  private retried = 0;
  private dlq = 0;
  private durationTotalMs = 0;
  private durationCount = 0;
  private readonly failuresByClass: Record<WebhookErrorClass, number> = {
    transient: 0,
    permanent: 0,
    unknown: 0,
  };

  recordSuccess(elapsedMs: number): void {
    this.processed += 1;
    this.durationTotalMs += elapsedMs;
    this.durationCount += 1;
  }

  recordFailedAttempt(classification: WebhookErrorClass): void {
    this.failedAttempts += 1;
    this.failuresByClass[classification] += 1;
  }

  recordRetryScheduled(): void {
    this.retried += 1;
  }

  recordMovedToDlq(): void {
    this.dlq += 1;
  }

  get successRate(): number {
    const total = this.processed + this.failedAttempts;
    return total === 0 ? 1 : this.processed / total;
  }

  get avgDurationMs(): number {
    return this.durationCount === 0 ? 0 : this.durationTotalMs / this.durationCount;
  }

  // Snapshot plano — usado tanto pelo endpoint Prometheus quanto por testes,
  // sem precisar parsear o texto de volta pra número.
  snapshot() {
    return {
      processed: this.processed,
      failedAttempts: this.failedAttempts,
      retried: this.retried,
      dlq: this.dlq,
      successRate: this.successRate,
      avgDurationMs: this.avgDurationMs,
      failuresByClass: { ...this.failuresByClass },
    };
  }

  // Formato de exposição de texto do Prometheus (https://prometheus.io/docs/instrumenting/exposition_formats/).
  // `extraGauges` recebe métricas que só fazem sentido lidas na hora (ex.:
  // profundidade atual da fila/DLQ, ver WebhookController#metrics).
  toPrometheus(extraGauges: Record<string, number> = {}): string {
    const lines = [
      '# HELP webhook_jobs_processed_total Jobs de webhook concluídos com sucesso',
      '# TYPE webhook_jobs_processed_total counter',
      `webhook_jobs_processed_total ${this.processed}`,
      '',
      '# HELP webhook_jobs_failed_attempts_total Tentativas de processamento de webhook que falharam (cada retry conta 1)',
      '# TYPE webhook_jobs_failed_attempts_total counter',
      `webhook_jobs_failed_attempts_total ${this.failedAttempts}`,
      '',
      '# HELP webhook_jobs_retried_total Novas tentativas agendadas pelo Bull após falha transitória',
      '# TYPE webhook_jobs_retried_total counter',
      `webhook_jobs_retried_total ${this.retried}`,
      '',
      '# HELP webhook_dlq_moved_total Jobs movidos para a dead letter queue (falha definitiva)',
      '# TYPE webhook_dlq_moved_total counter',
      `webhook_dlq_moved_total ${this.dlq}`,
      '',
      '# HELP webhook_job_duration_ms_avg Tempo médio (ms) de um processamento bem-sucedido',
      '# TYPE webhook_job_duration_ms_avg gauge',
      `webhook_job_duration_ms_avg ${this.avgDurationMs.toFixed(2)}`,
      '',
      '# HELP webhook_success_rate Proporção de sucesso sobre o total de tentativas (0-1)',
      '# TYPE webhook_success_rate gauge',
      `webhook_success_rate ${this.successRate.toFixed(4)}`,
      '',
      '# HELP webhook_jobs_failed_by_class_total Tentativas falhas, quebradas por classificação do erro',
      '# TYPE webhook_jobs_failed_by_class_total counter',
      ...Object.entries(this.failuresByClass).map(
        ([cls, count]) => `webhook_jobs_failed_by_class_total{class="${cls}"} ${count}`,
      ),
    ];

    const extraEntries = Object.entries(extraGauges);
    if (extraEntries.length > 0) {
      lines.push('', '# HELP webhook_queue_depth Profundidade atual das filas do webhook (snapshot em tempo real)');
      lines.push('# TYPE webhook_queue_depth gauge');
      for (const [label, value] of extraEntries) {
        lines.push(`webhook_queue_depth{queue="${label}"} ${value}`);
      }
    }

    return lines.join('\n') + '\n';
  }
}
