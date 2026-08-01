import { WebhookMetricsService } from './webhook-metrics.service';

describe('WebhookMetricsService (B-39)', () => {
  let metrics: WebhookMetricsService;

  beforeEach(() => {
    metrics = new WebhookMetricsService();
  });

  it('começa zerado, com taxa de sucesso 1 (sem dado, não "0% de sucesso")', () => {
    const snapshot = metrics.snapshot();
    expect(snapshot).toEqual({
      processed: 0,
      failedAttempts: 0,
      retried: 0,
      dlq: 0,
      successRate: 1,
      avgDurationMs: 0,
      failuresByClass: { transient: 0, permanent: 0, unknown: 0 },
    });
  });

  it('calcula tempo médio de processamento sobre os sucessos', () => {
    metrics.recordSuccess(100);
    metrics.recordSuccess(300);

    expect(metrics.snapshot().avgDurationMs).toBe(200);
  });

  it('calcula taxa de sucesso considerando sucessos e tentativas falhas', () => {
    metrics.recordSuccess(10);
    metrics.recordSuccess(10);
    metrics.recordSuccess(10);
    metrics.recordFailedAttempt('transient');

    expect(metrics.snapshot().successRate).toBeCloseTo(0.75);
  });

  it('quebra falhas por classificação', () => {
    metrics.recordFailedAttempt('transient');
    metrics.recordFailedAttempt('transient');
    metrics.recordFailedAttempt('permanent');
    metrics.recordFailedAttempt('unknown');

    expect(metrics.snapshot().failuresByClass).toEqual({ transient: 2, permanent: 1, unknown: 1 });
  });

  it('gera texto no formato de exposição do Prometheus com os contadores e os gauges extras', () => {
    metrics.recordSuccess(50);
    metrics.recordFailedAttempt('transient');
    metrics.recordRetryScheduled();
    metrics.recordMovedToDlq();

    const text = metrics.toPrometheus({ 'webhook-dlq': 3 });

    expect(text).toContain('# TYPE webhook_jobs_processed_total counter');
    expect(text).toContain('webhook_jobs_processed_total 1');
    expect(text).toContain('webhook_jobs_retried_total 1');
    expect(text).toContain('webhook_dlq_moved_total 1');
    expect(text).toContain('webhook_success_rate 0.5000');
    expect(text).toContain('webhook_jobs_failed_by_class_total{class="transient"} 1');
    expect(text).toContain('webhook_queue_depth{queue="webhook-dlq"} 3');
  });

  it('omite a seção de gauges extras quando nenhum é passado', () => {
    const text = metrics.toPrometheus();
    expect(text).not.toContain('webhook_queue_depth');
  });
});
