import { ConfigService } from '@nestjs/config';
import { JobOptions } from 'bull';

// ── B-39: política de retry/backoff parametrizada via ENV ──────────────────
// Usada tanto no enqueue original (WebhookController) quanto no
// reprocessamento manual a partir da DLQ (WebhookDlqService) — o mesmo
// contrato de confiabilidade vale nos dois casos.
function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseNonNegativeNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

// Nome da estratégia de backoff customizada registrada em
// `settings.backoffStrategies` no `BullModule.registerQueueAsync` da fila
// `webhook` (webhook.module.ts). O backoff `exponential` nativo do Bull tem
// multiplicador FIXO em 2 — não dá pra parametrizar via `WEBHOOK_BACKOFF_MULTIPLIER`
// sem uma estratégia própria.
export const WEBHOOK_BACKOFF_STRATEGY = 'webhookExponential';

export function buildWebhookBackoffStrategy(config: ConfigService): (attemptsMade: number) => number {
  const initial = parsePositiveNumber(config.get<string>('WEBHOOK_BACKOFF_INITIAL'), 5000);
  const multiplier = parsePositiveNumber(config.get<string>('WEBHOOK_BACKOFF_MULTIPLIER'), 2);

  return (attemptsMade: number) => Math.round(initial * Math.pow(multiplier, attemptsMade));
}

export function buildWebhookJobOptions(config: ConfigService): JobOptions {
  return {
    attempts: parsePositiveNumber(config.get<string>('WEBHOOK_ATTEMPTS'), 8),
    backoff: { type: WEBHOOK_BACKOFF_STRATEGY },
    // Tempo máximo pra UM processamento (não a fila inteira) — passado disso
    // o Bull mata o job com TimeoutError, que o classificador (webhook.errors.ts)
    // trata como transitório e o próprio Bull agenda a próxima tentativa.
    timeout: parsePositiveNumber(config.get<string>('WEBHOOK_TIMEOUT'), 30_000),
    removeOnComplete: parseNonNegativeNumber(config.get<string>('WEBHOOK_REMOVE_ON_COMPLETE'), 500),
    // Baixo de propósito: a falha definitiva já fica retida com todo o
    // contexto na DLQ (webhook-dlq) — não precisa duplicar retenção aqui.
    removeOnFail: parseNonNegativeNumber(config.get<string>('WEBHOOK_REMOVE_ON_FAIL'), 50),
  };
}
